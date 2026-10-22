// Vento das árvores (21/10/2026) e os dois materiais das árvores pintadas (arvore-forma.js).
// Um vento só para todas, o alísio de leste (cfg.vento): direção, força e rajadas que andam pelo chão na direção do
// vento. Movimento em três níveis, barato (só contas no vértice, nenhuma textura):
//   1. a árvore inteira inclina a favor do vento e balança devagar, mais quanto mais alto (aVento.x)
//   2. galhos e cachos balançam cada um na sua fase (aVento.z), presos ao galho pelo peso (aVento.y)
//   3. as folhas dos cartões tremulam rápido (aVento.w)
// Os cartões viram para a câmera (aCentro + canto no plano da tela) e encolhem até sumir entre cfg.arvores.lodPerto e
// lodLonge; a posição guardada na malha (fixa) é a da sombra, que não balança (a sombra dos parados fica em cache).
// O mesmo código em GLSL (WebGL) e em TSL (WebGPU), com os mesmos uniforms (ref).

import * as THREE from 'three'
import { globais } from '../globais.js'
import { ref } from '../render/gpu/comum.js'
import { gradienteToon, pintar, texturizar, texturaCanvas } from '../materiais.js'
import { desenharAtlasFolhas } from './folha-textura.js'


// de onde o vento vem, em graus (0 norte, 90 leste, 180 sul) -> para onde ele sopra no chão do jogo (x leste, z sul)
export function direcaoVento(deGraus, alvo = new THREE.Vector2()) {
  const a = (deGraus * Math.PI) / 180
  return alvo.set(-Math.sin(a), Math.cos(a))
}

// a cada quadro: o painel muda o vento ao vivo
export function atualizarVento(cfg) {
  const v = cfg.vento
  const a = cfg.arvores
  direcaoVento(v.de, globais.uVentoDir.value)
  globais.uVentoForca.value = v.forca
  globais.uVentoRaj.value = v.rajada
  globais.uVentoRajVel.value = v.rajadaVel
  globais.uVentoTronco.value = v.tronco
  globais.uVentoGalhos.value = v.galhos
  globais.uVentoFolhas.value = v.folhas
  globais.uArvLod.value.set(a.lodPerto, Math.max(a.lodLonge, a.lodPerto + 1))
  globais.uArvBorda.value = a.borda
  globais.uArvBordaCor.value.set(a.bordaCor)
  globais.uArvTransluz.value = a.transluz
}

const U = ['uVentoDir', 'uVentoForca', 'uVentoRaj', 'uVentoRajVel', 'uVentoTronco', 'uVentoGalhos', 'uVentoFolhas', 'uArvLod', 'uArvBorda', 'uArvBordaCor', 'uArvTransluz']

// a parte comum: onde está a cópia, a matriz dela, o vento no espaço da forma, a rajada e o balanço lento
const GLSL_BASE = /* glsl */ `
  vec3 baseA = modelMatrix[3].xyz;
  mat3 mA = mat3(modelMatrix);
  #ifdef USE_INSTANCING
    baseA = (modelMatrix * instanceMatrix[3]).xyz;
    mA = mA * mat3(instanceMatrix);
  #endif
  float sA = max(length(mA[0]), 1e-4);
  mat3 tA = transpose(mA);
  vec3 wL = tA * vec3(uVentoDir.x, 0.0, uVentoDir.y) / sA;
  float faseA = dot(baseA.xz, vec2(0.13, 0.071));
  // rajada: frentes de vento que andam pelo chão na direção dele
  float ondaA = 0.5 + 0.5 * sin(dot(baseA.xz, uVentoDir) * 0.045 - uTempoA * uVentoRajVel);
  float forcaA = uVentoForca * (1.0 + uVentoRaj * (ondaA * ondaA * ondaA * 1.8 - 0.35));
  float balA = 0.5 + 0.5 * sin(uTempoA * 0.85 + faseA);`

const GLSL_VERTICE = /* glsl */ `
{` + GLSL_BASE + `
  #ifdef ARV_CARTAO
  {
    // cartão virado para a câmera, do tamanho da árvore; some de longe
    vec3 dX = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 dY = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    float encolhe = 1.0 - smoothstep(uArvLod.x, uArvLod.y, distance(cameraPosition, baseA));
    vec3 bb = tA * (dX * aCanto.x + dY * aCanto.y) / sA * encolhe;
    transformed = mix(transformed, aCentro + bb, aCanto.z);
  }
  #endif
  vec3 ladoL = tA * vec3(-uVentoDir.y, 0.0, uVentoDir.x) / sA;
  vec3 desA = wL * aVento.x * uVentoTronco * forcaA * (0.3 + 0.7 * balA) * 0.3;
  float phA = aVento.z + faseA;
  float gA = aVento.y * uVentoGalhos * forcaA;
  desA += (wL * (0.55 + 0.45 * sin(uTempoA * 1.9 + phA)) + ladoL * (sin(uTempoA * 1.37 + phA * 1.3) * 0.55) + vec3(0.0, sin(uTempoA * 2.3 + phA * 0.7) * 0.35, 0.0)) * gA * 0.1;
  float fA = aVento.w * uVentoFolhas * forcaA;
  vec3 qA = transformed * 3.1 + phA;
  desA += vec3(sin(uTempoA * 8.3 + qA.y), cos(uTempoA * 9.7 + qA.x), sin(uTempoA * 7.1 + qA.z)) * fA * 0.035;
  transformed += desA;
}`

// luz do céu na borda de cima da copa: o halo claro que separa a massa do céu nos conceitos
const GLSL_BORDA = /* glsl */ `
{
  vec3 nR = normalize(vNMundo);
  vec3 vR = normalize(cameraPosition - vPMundo);
  float bR = pow(1.0 - clamp(abs(dot(nR, vR)), 0.0, 1.0), 2.5) * smoothstep(-0.2, 0.7, nR.y);
  diffuseColor.rgb += uArvBordaCor * bR * uArvBorda;
  // contraluz: com o sol atrás da copa, a folha deixa a luz passar e acende quente (o Passeio do conceito às 16h)
  vec3 sT = normalize(uSolDirA);
  float cT = smoothstep(0.2, 0.95, dot(-vR, sT)) * smoothstep(0.0, 0.15, sT.y) * (0.35 + 0.65 * pow(1.0 - clamp(abs(dot(nR, vR)), 0.0, 1.0), 1.5));
  diffuseColor.rgb *= 1.0 + uArvTransluz * cT * vec3(1.5, 1.25, 0.45);
}`

// a mesma parte comum em TSL
function baseTsl(W, instancia, u) {
  const { vec2, vec3, float, sin, dot, transpose, mat3, max, length, modelWorldMatrix } = W
  const R = (k) => ref(u[k])
  const t = R('uTempoA')
  const m3 = (m) => mat3(m.element(0).xyz, m.element(1).xyz, m.element(2).xyz)
  const mA = instancia ? m3(modelWorldMatrix).mul(m3(instancia)) : m3(modelWorldMatrix)
  const baseA = instancia ? modelWorldMatrix.mul(instancia.element(3)).xyz : modelWorldMatrix.element(3).xyz
  const sA = max(length(mA.element(0)), 1e-4)
  const tA = transpose(mA)
  const dir = R('uVentoDir')
  const wL = tA.mul(vec3(dir.x, 0.0, dir.y)).div(sA)
  const faseA = dot(baseA.xz, vec2(0.13, 0.071))
  const onda = sin(dot(baseA.xz, dir).mul(0.045).sub(t.mul(R('uVentoRajVel')))).mul(0.5).add(0.5)
  const forca = R('uVentoForca').mul(float(1).add(R('uVentoRaj').mul(onda.mul(onda).mul(onda).mul(1.8).sub(0.35))))
  const bal = sin(t.mul(0.85).add(faseA)).mul(0.5).add(0.5)
  return { t, baseA, sA, tA, wL, faseA, forca, bal }
}

const DECL_VENTO = 'uniform float uTempoA; uniform vec2 uVentoDir; uniform float uVentoForca; uniform float uVentoRaj; uniform float uVentoRajVel; uniform float uVentoTronco; uniform float uVentoGalhos; uniform float uVentoFolhas; uniform vec2 uArvLod;'

// O coqueiro (vegetacao.js) já balança as folhas; faltava o tronco: o estipe inteiro inclina e balança no mesmo
// vento das árvores, mais na ponta, e a copa vai junto (a mesma conta pela altura, alturaRef = altura da copa).
// Soma ao código que o material já tenha (chamar antes do pintar).
export function ventoPalmeira(mat, alturaRef = 8.2) {
  const u = Object.fromEntries(U.map((k) => [k, globais[k]]))
  u.uTempoA = globais.uTempo
  u.uVentoPalmA = globais.uVentoPalm
  const anterior = mat.onBeforeCompile
  const glsl = `
{` + GLSL_BASE + `
  float hP = clamp(transformed.y / ${alturaRef.toFixed(2)}, 0.0, 1.2);
  transformed += wL * pow(hP, 1.5) * ${(Math.min(alturaRef, 14) / 8).toFixed(3)} * uVentoTronco * forcaA * (0.3 + 0.7 * balA) * 0.3 * uVentoPalmA;
}`
  mat.onBeforeCompile = (sh, r) => {
    anterior.call(mat, sh, r)
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${DECL_VENTO} uniform float uVentoPalmA;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + glsl)
  }
  const antes = mat.userData.tsl
  mat.userData.tsl = {
    ...(antes || {}),
    nome: (antes?.nome || 'palmeira') + '+vento',
    posicao(ctx) {
      const { W } = ctx
      const { pow, clamp, positionLocal } = W
      const p = antes?.posicao ? antes.posicao(ctx) : positionLocal
      const { wL, forca, bal } = baseTsl(W, ctx.instancia, u)
      const h = clamp(positionLocal.y.div(alturaRef), 0.0, 1.2)
      return p.add(wL.mul(pow(h, 1.5)).mul(Math.min(alturaRef, 14) / 8).mul(ref(u.uVentoTronco)).mul(forca).mul(bal.mul(0.7).add(0.3)).mul(0.3).mul(ref(u.uVentoPalmA)))
    },
  }
  return mat
}

function aplicarVento(mat, cartao) {
  const u = Object.fromEntries(U.map((k) => [k, globais[k]]))
  u.uTempoA = globais.uTempo
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    const decl = DECL_VENTO
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${decl}\nattribute vec4 aVento;\n#ifdef ARV_CARTAO\nattribute vec3 aCentro; attribute vec3 aCanto;\n#endif`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GLSL_VERTICE)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uArvBorda; uniform vec3 uArvBordaCor; uniform float uArvTransluz;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + GLSL_BORDA)
  }
  mat.userData.tsl = {
    nome: cartao ? 'arvore-cartao' : 'arvore-corpo',
    posicao({ W, instancia }) {
      const { vec3, float, attribute, positionLocal, sin, cos, mix, smoothstep, distance, cameraPosition, cameraViewMatrix } = W
      const R = (k) => ref(u[k])
      const { t, baseA, sA, tA, wL, faseA, forca, bal } = baseTsl(W, instancia, u)
      let p = positionLocal
      if (cartao) {
        const vm = cameraViewMatrix
        const dX = vec3(vm.element(0).x, vm.element(1).x, vm.element(2).x)
        const dY = vec3(vm.element(0).y, vm.element(1).y, vm.element(2).y)
        const canto = attribute('aCanto', 'vec3')
        const lod = R('uArvLod')
        const enc = float(1).sub(smoothstep(lod.x, lod.y, distance(cameraPosition, baseA)))
        const bb = tA.mul(dX.mul(canto.x).add(dY.mul(canto.y))).div(sA).mul(enc)
        p = mix(p, attribute('aCentro', 'vec3').add(bb), canto.z)
      }
      const dir = R('uVentoDir')
      const av = attribute('aVento', 'vec4')
      const ladoL = tA.mul(vec3(dir.y.negate(), 0.0, dir.x)).div(sA)
      let des = wL.mul(av.x).mul(R('uVentoTronco')).mul(forca).mul(bal.mul(0.7).add(0.3)).mul(0.3)
      const ph = av.z.add(faseA)
      const g = av.y.mul(R('uVentoGalhos')).mul(forca)
      des = des.add(wL.mul(sin(t.mul(1.9).add(ph)).mul(0.45).add(0.55))
        .add(ladoL.mul(sin(t.mul(1.37).add(ph.mul(1.3))).mul(0.55)))
        .add(vec3(0.0, sin(t.mul(2.3).add(ph.mul(0.7))).mul(0.35), 0.0)).mul(g).mul(0.1))
      const f = av.w.mul(R('uVentoFolhas')).mul(forca)
      const q = p.mul(3.1).add(ph)
      des = des.add(vec3(sin(t.mul(8.3).add(q.y)), cos(t.mul(9.7).add(q.x)), sin(t.mul(7.1).add(q.z))).mul(f).mul(0.035))
      return p.add(des)
    },
    cor({ W }, rgb) {
      const { normalize, normalWorld, positionWorld, cameraPosition, pow, clamp, abs, dot, smoothstep, float } = W
      const n = normalize(normalWorld)
      const v = normalize(cameraPosition.sub(positionWorld))
      const raso = float(1).sub(clamp(abs(dot(n, v)), 0.0, 1.0))
      const b = pow(raso, 2.5).mul(smoothstep(-0.2, 0.7, n.y))
      const s = normalize(ref(globais.uSolDir))
      const cT = smoothstep(0.2, 0.95, dot(v.negate(), s)).mul(smoothstep(0.0, 0.15, s.y)).mul(pow(raso, 1.5).mul(0.65).add(0.35))
      return rgb.add(ref(u.uArvBordaCor).mul(b).mul(ref(u.uArvBorda))).mul(W.vec3(1.5, 1.25, 0.45).mul(cT).mul(ref(u.uArvTransluz)).add(1.0))
    },
  }
  return mat
}

let _mats = null
let _atlas = null
export function atlasFolhas() {
  _atlas ??= texturaCanvas(512, 512, (ctx, T) => desenharAtlasFolhas(ctx, T), { repetir: false, cor: false })
  return _atlas
}

// { corpo, cartoes }: os mesmos para todas as árvores (o vento e a cor por cópia vêm da malha e da cópia)
export function materiaisArvores() {
  if (_mats) return _mats
  const corpo = aplicarVento(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() }), false)
  pintar(corpo, 'arvore-corpo')
  // casca na textura do tronco; a folhagem (aTexAlt = 1) na textura de folha, miúda
  texturizar(corpo, { topo: 'tronco', lado: 'tronco', tam: 1.4, contraste: 1.1, massa: 0.3, alt: 'folha', tamAlt: 1.1 })
  const cartoes = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon(), map: atlasFolhas(), alphaTest: 0.5, side: THREE.FrontSide })
  cartoes.shadowSide = THREE.DoubleSide
  cartoes.defines = { ARV_CARTAO: '' }
  aplicarVento(cartoes, true)
  pintar(cartoes, 'arvore-cartao')
  _mats = { corpo, cartoes }
  return _mats
}
