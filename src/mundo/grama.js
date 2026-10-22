// Grama: centenas de milhares de folhas (triângulos) desenhadas de uma vez na GPU.
// - Só existe num quadrado em volta do jogador; o quadrado "dá a volta" (mod) e
//   as folhas ficam presas no mundo enquanto o jogador anda.
// - Mais folhas finas perto da câmera, menos e mais largas longe (LOD contínuo).
// - As folhas giram em direção à câmera: cobrem mais chão com menos folhas.
// - Largura e altura variam por folha, com alguns tufos mais altos.
// - Usa o mesmo material toon do resto do mundo: recebe a sombra das casas e a mesma luz
//   do chão (antes ficava clara dentro da sombra e o chão escuro parecia buraco).
// - O vento é ruído andando no tempo, no shader de vértice. A grama se afasta do pé do personagem.
// - As folhas são divididas em blocos (BLOCOS x BLOCOS). A cada quadro, na CPU, um bloco só é
//   desenhado se tem grama no chão e aparece na tela; longe, só a fração de folhas que o LOD mantém
//   (as folhas de cada bloco ficam ordenadas pela chave do LOD). Antes, as 200 mil folhas passavam
//   pelo shader até na praia, onde nenhuma aparece.

import * as THREE from 'three'
import { globais } from '../globais.js'
import { criarAleatorio } from '../utils.js'
import { gradienteToon, pintar } from '../materiais.js'
import { resumoRetangulo } from './terreno.js'
import { ref, amostraAlvo, funcoes } from '../render/gpu/comum.js'

const BLOCOS = 8

const GLSL_VERTICE = /* glsl */ `
uniform sampler2D tAltura; uniform vec4 uMapa; uniform vec2 uMapaTam;
uniform vec2 uCentro; uniform float uLado; uniform float uTempoG;
uniform float uAltura; uniform float uLargura; uniform float uVentoForca; uniform float uVentoVel; uniform float uVentoEscala;
uniform vec2 uVentoDirG; uniform float uVentoForcaG; uniform float uVentoRajG; uniform float uVentoRajVelG;
uniform sampler2D tToque; uniform vec2 uToqueCentro; uniform float uToqueArea; uniform float uLodPerto; uniform float uFracaoLonge; uniform float uLargLonge; uniform float uVirarCamera;
attribute vec2 aOffset; attribute float aRand;
varying float vAltG; varying float vTomG;

float hashG(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ruidoG(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hashG(i), hashG(i + vec2(1, 0)), u.x), mix(hashG(i + vec2(0, 1)), hashG(i + vec2(1, 1)), u.x), u.y);
}
vec4 mapaG(vec2 xz) { return texture2D(tAltura, ((xz - uMapa.xy) / uMapa.z + 0.5) / uMapaTam); }
`

const GLSL_POSICAO = /* glsl */ `
  vec2 rel = mod(aOffset - uCentro + uLado * 0.5, uLado) - uLado * 0.5;
  vec2 xz = uCentro + rel;
  vec4 mg = mapaG(xz);

  // LOD: perto da câmera todas as folhas; longe só uma fração, mais largas
  float dCam = length(xz - cameraPosition.xz);
  float lod = smoothstep(uLodPerto, uLado * 0.5, dCam);
  float manter = mix(1.0, uFracaoLonge, lod);
  float vivo = step(aRand, mg.g) * step(fract(aRand * 91.7), manter);
  float borda = 1.0 - smoothstep(0.7, 1.0, length(rel) / (uLado * 0.5));

  // cada folha com seu tamanho; algumas viram tufo alto
  float varA = fract(aRand * 7.31);
  float varL = fract(aRand * 3.17);
  float tufo = step(0.93, fract(aRand * 53.1));
  float alt = uAltura * (0.45 + 1.1 * varA + tufo * 0.6) * vivo * borda;
  float larg = uLargura * (0.5 + 1.1 * varL) * mix(1.0, uLargLonge, lod);

  // direção da folha: sorteada, puxada para ficar de frente para a câmera
  float ang = fract(aRand * 13.7) * 6.2831;
  vec2 dirAleat = vec2(cos(ang), sin(ang));
  vec2 paraCam = normalize(cameraPosition.xz - xz + vec2(1e-4));
  vec2 perpCam = vec2(-paraCam.y, paraCam.x);
  perpCam *= sign(dot(dirAleat, perpCam) + 1e-4);
  vec2 dirLat = normalize(mix(dirAleat, perpCam, uVirarCamera) + vec2(1e-4));
  vec2 lat = dirLat * position.x * larg;

  float h = position.y;
  // o vento das árvores (cfg.vento, vento-arvores.js): a mesma direção, a mesma força e as mesmas rajadas, que andam
  // pelo chão na direção dele; o ruído do campo anda junto com o vento
  vec2 dirV = normalize(uVentoDirG + vec2(1e-5));
  float n = ruidoG(xz * uVentoEscala - dirV * (uTempoG * uVentoVel * 1.2));
  float ondaG = 0.5 + 0.5 * sin(dot(xz, dirV) * 0.045 - uTempoG * uVentoRajVelG);
  float rajG = 1.0 + uVentoRajG * (ondaG * ondaG * ondaG * 1.8 - 0.35);
  vec2 curva = dirV * (n * 0.9 + 0.15) * uVentoForca * uVentoForcaG * rajG;
  // mapa de toque: quem passou por aqui deitou a grama nessa direção (e ela volta devagar)
  vec2 uvT = (xz - uToqueCentro) / uToqueArea + 0.5;
  vec4 tq = vec4(0.0);
  if (uvT.x > 0.0 && uvT.x < 1.0 && uvT.y > 0.0 && uvT.y < 1.0) tq = texture2D(tToque, uvT);
  curva += tq.rg * 1.7;
  alt *= 1.0 - 0.45 * tq.b;
  vec2 deslocar = curva * h * h * alt;

  vec3 transformed = vec3(xz.x + lat.x + deslocar.x, mg.r + h * alt * (1.0 - 0.3 * length(curva) * h), xz.y + lat.y + deslocar.y);
  vAltG = h;
  vTomG = ruidoG(xz * 0.06);
`

// As mesmas contas de GLSL_POSICAO e do fragmento, para o modo webgpu (motor F2, KAN-68)
function gramaTsl(u) {
  let V = null
  const vars = (W) => V || (V = { alt: W.varyingProperty('float', 'vAltG'), tom: W.varyingProperty('float', 'vTomG') })
  return {
    nome: 'grama',
    posicao({ W }) {
      const { Fn, vec2, vec3, vec4, float, floor, fract, length, smoothstep, mix, step, cos, sin, normalize, sign, dot,
        texture, attribute, positionLocal, normalLocal, cameraPosition } = W
      const { ruido } = funcoes()
      const v = vars(W)
      const R = {}
      for (const k in u) if (!k.startsWith('t')) R[k] = ref(u[k])
      // mod do GLSL (x - y * floor(x / y)): o % do WGSL trunca e erra nos negativos
      const modGl = (x, y) => x.sub(y.mul(floor(x.div(y))))
      return Fn(() => {
        const aOffset = attribute('aOffset', 'vec2')
        const aRand = attribute('aRand', 'float')
        const rel = modGl(aOffset.sub(R.uCentro).add(R.uLado.mul(0.5)), R.uLado).sub(R.uLado.mul(0.5))
        const xz = R.uCentro.add(rel)
        const mg = texture(u.tAltura.value, xz.sub(R.uMapa.xy).div(R.uMapa.z).add(0.5).div(R.uMapaTam))
        // LOD: perto da câmera todas as folhas; longe só uma fração, mais largas
        const dCam = length(xz.sub(cameraPosition.xz))
        const lod = smoothstep(R.uLodPerto, R.uLado.mul(0.5), dCam)
        const manter = mix(1.0, R.uFracaoLonge, lod)
        const vivo = step(aRand, mg.y).mul(step(fract(aRand.mul(91.7)), manter))
        const borda = float(1.0).sub(smoothstep(0.7, 1.0, length(rel).div(R.uLado.mul(0.5))))
        const varA = fract(aRand.mul(7.31))
        const varL = fract(aRand.mul(3.17))
        const tufo = step(0.93, fract(aRand.mul(53.1)))
        const alt = R.uAltura.mul(float(0.45).add(varA.mul(1.1)).add(tufo.mul(0.6))).mul(vivo).mul(borda).toVar()
        const larg = R.uLargura.mul(float(0.5).add(varL.mul(1.1))).mul(mix(1.0, R.uLargLonge, lod))
        // direção da folha: sorteada, puxada para ficar de frente para a câmera
        const ang = fract(aRand.mul(13.7)).mul(6.2831)
        const dirAleat = vec2(cos(ang), sin(ang))
        const paraCam = normalize(cameraPosition.xz.sub(xz).add(vec2(1e-4)))
        const perp0 = vec2(paraCam.y.negate(), paraCam.x)
        const perpCam = perp0.mul(sign(dot(dirAleat, perp0).add(1e-4)))
        const dirLat = normalize(mix(dirAleat, perpCam, R.uVirarCamera).add(vec2(1e-4)))
        const lat = dirLat.mul(positionLocal.x).mul(larg)
        const h = positionLocal.y
        const dirV = normalize(R.uVentoDirG.add(vec2(1e-5)))
        const n = ruido(xz.mul(R.uVentoEscala).sub(dirV.mul(R.uTempoG.mul(R.uVentoVel).mul(1.2))))
        const ondaG = sin(dot(xz, dirV).mul(0.045).sub(R.uTempoG.mul(R.uVentoRajVelG))).mul(0.5).add(0.5)
        const rajG = float(1.0).add(R.uVentoRajG.mul(ondaG.mul(ondaG).mul(ondaG).mul(1.8).sub(0.35)))
        const curva = dirV.mul(n.mul(0.9).add(0.15)).mul(R.uVentoForca).mul(R.uVentoForcaG).mul(rajG).toVar()
        // mapa de toque: quem passou por aqui deitou a grama nessa direção
        const uvT = xz.sub(R.uToqueCentro).div(R.uToqueArea).add(0.5)
        const dentro = uvT.x.greaterThan(0.0).and(uvT.x.lessThan(1.0)).and(uvT.y.greaterThan(0.0)).and(uvT.y.lessThan(1.0))
        const tq = dentro.select(amostraAlvo(u.tToque, uvT), vec4(0.0))
        curva.addAssign(tq.xy.mul(1.7))
        alt.mulAssign(float(1.0).sub(tq.z.mul(0.45)))
        const deslocar = curva.mul(h).mul(h).mul(alt)
        // normal para cima: a folha acende igual ao chão em volta
        normalLocal.assign(vec3(0.0, 1.0, 0.0))
        v.alt.assign(h)
        v.tom.assign(ruido(xz.mul(0.06)))
        return vec3(xz.x.add(lat.x).add(deslocar.x), mg.x.add(h.mul(alt).mul(float(1.0).sub(length(curva).mul(0.3).mul(h)))), xz.y.add(lat.y).add(deslocar.y))
      })()
    },
    // as duas faces da folha usam a mesma normal (senão o verso fica escuro)
    normal({ W }) { return W.normalView },
    cor({ W }) {
      const { mix, floor } = W
      const v = vars(W)
      // degradê em 3 faixas chapadas da base escura à ponta clara
      const faixaG = floor(v.alt.mul(3.0).add(0.5)).div(3.0)
      return mix(mix(ref(u.uBase1), ref(u.uBase2), v.tom), mix(ref(u.uPonta1), ref(u.uPonta2), v.tom), faixaG)
    },
  }
}

function geometriaFolha() {
  // 3 níveis + ponta, afinando para cima
  const niveis = [0, 0.35, 0.7]
  const pos = []
  for (const h of niveis) {
    const w = 0.5 * (1 - h * 0.85)
    pos.push(-w, h, 0, w, h, 0)
  }
  pos.push(0, 1, 0)
  return {
    position: new THREE.Float32BufferAttribute(pos, 3),
    normal: new THREE.Float32BufferAttribute(new Array(7).fill(0).flatMap(() => [0, 1, 0]), 3),
    index: new THREE.Uint16BufferAttribute([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6], 1),
  }
}

// chave do LOD de cada folha: a mesma conta do shader (fract(aRand * 91.7) < manter)
const chaveLod = (r) => (r * 91.7) % 1

export function criarGrama(cena, mapaAltura, cfg, toque) {
  const u = {
    tAltura: { value: mapaAltura.textura },
    uMapa: { value: mapaAltura.uMapa },
    uMapaTam: { value: mapaAltura.uMapaTam },
    uCentro: { value: new THREE.Vector2() },
    uLado: { value: cfg.grama.raio * 2 },
    uTempoG: globais.uTempo,
    uAltura: { value: cfg.grama.altura },
    uLargura: { value: cfg.grama.largura },
    uVentoForca: { value: cfg.grama.ventoForca },
    uVentoVel: { value: cfg.grama.ventoVelocidade },
    uVentoEscala: { value: cfg.grama.ventoEscala },
    uVentoDirG: globais.uVentoDir, uVentoForcaG: globais.uVentoForca, uVentoRajG: globais.uVentoRaj, uVentoRajVelG: globais.uVentoRajVel,
    tToque: toque.tToque, uToqueCentro: toque.uToqueCentro, uToqueArea: toque.uToqueArea,
    uLodPerto: { value: cfg.grama.lodPerto },
    uFracaoLonge: { value: cfg.grama.fracaoLonge },
    uLargLonge: { value: cfg.grama.larguraLonge },
    uVirarCamera: { value: cfg.grama.virarCamera },
    // verde de restinga, oliva e meio seco (o verde de antes era o elemento mais saturado da cena, ao lado
    // da roupa desbotada do menino; direção de arte 17/10)
    uBase1: { value: new THREE.Color('#4a5a36') },
    uBase2: { value: new THREE.Color('#58663a') },
    uPonta1: { value: new THREE.Color('#9c9f62') },
    uPonta2: { value: new THREE.Color('#bdb27a') },
  }

  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    gradientMap: gradienteToon(),
    side: THREE.DoubleSide,
    // não escreve profundidade: assim o filtro de nanquim não contorna cada folhinha
    depthWrite: false,
  })
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + GLSL_VERTICE)
      // normal para cima: a folha acende igual ao chão em volta
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', GLSL_POSICAO)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAltG; varying float vTomG;\nuniform vec3 uBase1; uniform vec3 uBase2; uniform vec3 uPonta1; uniform vec3 uPonta2;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // degradê em 3 faixas chapadas da base escura à ponta clara
        float faixaG = floor(vAltG * 3.0 + 0.5) / 3.0;
        diffuseColor.rgb = mix(mix(uBase1, uBase2, vTomG), mix(uPonta1, uPonta2, vTomG), faixaG);`
      )
      // as duas faces da folha usam a mesma normal (senão o verso fica escuro)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
  }
  pintar(material, 'grama-pintada')
  material.userData.tsl = gramaTsl(u)

  const folha = geometriaFolha()
  const grupo = new THREE.Group()
  grupo.name = 'grama'
  cena.add(grupo)
  let blocos = [] // { malha, ox, oz, chaves (ordenadas), total }

  let qtdAtual = 0
  function reconstruir() {
    const n = Math.round(cfg.grama.quantidade)
    const lado = cfg.grama.raio * 2
    const t = lado / BLOCOS
    // com semente: a grama nasce igual toda vez que o jogo abre
    const rnd = criarAleatorio(4242)
    const porBloco = Array.from({ length: BLOCOS * BLOCOS }, () => [])
    for (let i = 0; i < n; i++) {
      const x = rnd.proximo() * lado
      const z = rnd.proximo() * lado
      const r = rnd.proximo()
      const b = Math.min(BLOCOS - 1, Math.floor(z / t)) * BLOCOS + Math.min(BLOCOS - 1, Math.floor(x / t))
      porBloco[b].push(x, z, r)
    }
    for (const b of blocos) { b.malha.geometry.dispose(); grupo.remove(b.malha) }
    blocos = porBloco.map((l, b) => {
      const k = l.length / 3
      const ordem = Array.from({ length: k }, (_, i) => i).sort((a, c) => chaveLod(l[a * 3 + 2]) - chaveLod(l[c * 3 + 2]))
      const offs = new Float32Array(k * 2)
      const rand = new Float32Array(k)
      const chaves = new Float32Array(k)
      ordem.forEach((o, i) => {
        offs[i * 2] = l[o * 3]
        offs[i * 2 + 1] = l[o * 3 + 1]
        rand[i] = l[o * 3 + 2]
        chaves[i] = chaveLod(rand[i])
      })
      const g = new THREE.InstancedBufferGeometry()
      g.setAttribute('position', folha.position)
      g.setAttribute('normal', folha.normal)
      g.setIndex(folha.index)
      g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offs, 2))
      g.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 1))
      g.instanceCount = k
      const malha = new THREE.Mesh(g, material)
      malha.frustumCulled = false // o teste de tela é feito aqui, por bloco
      malha.renderOrder = 2
      malha.receiveShadow = true
      malha.castShadow = false
      grupo.add(malha)
      return { malha, ox: (b % BLOCOS) * t, oz: Math.floor(b / BLOCOS) * t, chaves, total: k }
    })
    qtdAtual = n
    u.uLado.value = lado
  }
  reconstruir()

  // Um intervalo [o, o + t) das folhas, depois da volta (mod) em torno do centro,
  // vira um ou dois intervalos no mundo.
  function pedacos(o, t, c, L, saida) {
    const s = (((o - c + L / 2) % L) + L) % L
    const a = c - L / 2 + s
    saida.length = 0
    if (s + t <= L) saida.push(a, a + t)
    else saida.push(a, c + L / 2, c - L / 2, c - L / 2 + (s + t - L))
    return saida
  }
  const frustum = new THREE.Frustum()
  const matVP = new THREE.Matrix4()
  const caixa = new THREE.Box3()
  const resumo = {}
  const px = []
  const pz = []
  const estat = { blocos: 0, folhas: 0 }

  function selecionar(centro, camera) {
    const g = cfg.grama
    const L = u.uLado.value
    const t = L / BLOCOS
    camera.updateMatrixWorld()
    matVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(matVP)
    const cx = camera.position.x
    const cz = camera.position.z
    estat.blocos = 0
    estat.folhas = 0
    for (const b of blocos) {
      pedacos(b.ox, t, centro.x, L, px)
      pedacos(b.oz, t, centro.z, L, pz)
      let visivel = false
      let dMin = Infinity
      for (let i = 0; i < px.length; i += 2) {
        for (let j = 0; j < pz.length; j += 2) {
          resumoRetangulo(px[i], pz[j], px[i + 1], pz[j + 1], resumo)
          if (resumo.dens <= 0) continue
          // folha alta e vento: folga para cima e para os lados
          caixa.min.set(px[i] - 1, resumo.hMin - 0.5, pz[j] - 1)
          caixa.max.set(px[i + 1] + 1, resumo.hMax + 2.5, pz[j + 1] + 1)
          if (!frustum.intersectsBox(caixa)) continue
          visivel = true
          const dx = Math.max(px[i] - cx, 0, cx - px[i + 1])
          const dz = Math.max(pz[j] - cz, 0, cz - pz[j + 1])
          dMin = Math.min(dMin, Math.hypot(dx, dz))
        }
      }
      b.malha.visible = visivel
      if (!visivel) continue
      // longe: só as folhas que o LOD do shader ainda mantém no ponto mais perto do bloco
      const lod = THREE.MathUtils.smoothstep(dMin, g.lodPerto, L / 2)
      const manter = 1 + (g.fracaoLonge - 1) * lod
      let lo = 0
      let hi = b.total
      while (lo < hi) {
        const m = (lo + hi) >> 1
        if (b.chaves[m] < manter) lo = m + 1
        else hi = m
      }
      b.malha.geometry.instanceCount = lo
      b.malha.visible = lo > 0
      estat.blocos++
      estat.folhas += lo
    }
  }

  return {
    reconstruir,
    estat,
    atualizar(jogador, camera) {
      const g = cfg.grama
      if (Math.round(g.quantidade) !== qtdAtual || g.raio * 2 !== u.uLado.value) reconstruir()
      u.uCentro.value.set(jogador.x, jogador.z)
      u.uAltura.value = g.altura
      u.uLargura.value = g.largura
      u.uVentoForca.value = g.ventoForca
      u.uVentoVel.value = g.ventoVelocidade
      u.uVentoEscala.value = g.ventoEscala
      u.uLodPerto.value = g.lodPerto
      u.uFracaoLonge.value = g.fracaoLonge
      u.uLargLonge.value = g.larguraLonge
      u.uVirarCamera.value = g.virarCamera
      if (camera) selecionar(jogador, camera)
    },
  }
}
