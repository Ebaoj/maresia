// Areia que afunda. Duas peças:
//
// 1. Mapa de afundamento: imagem de 1024x1024 cobrindo 24 m em volta do jogador (2,3 cm por pixel).
//    Cada pé carimba um buraco com a forma da sola e uma bordinha de areia levantada em volta.
//    Na areia seca a marca dura muito; na molhada (perto da água) o mar alisa em segundos.
//    Fica presa ao mundo: quando o jogador anda, a imagem é reamostrada com o deslocamento.
//
// 2. Malha fina de areia: 385x385 pontos (um a cada 6 cm) no mesmo quadrado. Ela pega a altura
//    da praia no mapa de alturas, afunda onde o mapa de afundamento manda e calcula a normal pela
//    inclinação: a parede do buraco recebe luz e sombra de verdade (e a hachura entra sozinha).
//    Nesse quadrado o chão grosso some (terreno.js descarta a praia ali dentro).
//
// Bônus: poeirinha em nuvenzinhas quando se corre na areia seca, animada "em 2".

import * as THREE from 'three'
import { gradienteToon, pintar, toon } from '../materiais.js'
import { uAreiaTerreno } from './terreno.js'
import { distCosta, larguraPraia } from './mapa.js'

const LONGE = new THREE.Vector2(1e6, 1e6)

const TAM = 1024
export const AREA_AREIA = 24
const SEG = 384
const MAX = 16

const vertQuad = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const fragAfunda = /* glsl */ `
uniform sampler2D tAnterior; uniform sampler2D tAltura; uniform vec4 uMapa; uniform vec2 uMapaTam;
uniform vec2 uCentro; uniform vec2 uDesloc; uniform float uArea; uniform float uDt;
uniform float uSecaRecupera; uniform float uMolhadaRecupera;
uniform vec4 uMarcas[${MAX}]; uniform vec4 uForma[${MAX}]; uniform int uN;
varying vec2 vUv;
void main() {
  vec2 xz = uCentro + (vUv - 0.5) * uArea;
  vec2 uvAnt = vUv + uDesloc;
  vec4 v = vec4(0.0);
  if (uvAnt.x > 0.0 && uvAnt.x < 1.0 && uvAnt.y > 0.0 && uvAnt.y < 1.0) v = texture2D(tAnterior, uvAnt);
  // perto da água a areia está molhada e o mar alisa as marcas rápido
  float h = texture2D(tAltura, ((xz - uMapa.xy) / uMapa.z + 0.5) / uMapaTam).r;
  float molhada = 1.0 - smoothstep(0.08, 0.35, h);
  v.rg *= exp(-uDt * mix(uSecaRecupera, uMolhadaRecupera, molhada));
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uN) break;
    // uMarcas: x, z, giro, profundidade   uForma: 0 = pé, 1 = redondo; raio do redondo; lado do pé
    vec4 mk = uMarcas[i];
    vec4 fo = uForma[i];
    vec2 d = xz - mk.xy;
    float c = cos(mk.z), s = sin(mk.z);
    vec2 p = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
    float dist;
    if (fo.x < 0.5) {
      p.x *= fo.z; // pé esquerdo espelhado
      // sola: frente mais larga + calcanhar
      // um pouco maior que um pé real: em quadrinho a marca precisa ler de longe
      float frente = length(vec2((p.x - 0.012) / 0.085, (p.y - 0.06) / 0.135));
      float calc = length(vec2(p.x / 0.065, (p.y + 0.11) / 0.072));
      dist = min(frente, calc);
    } else {
      dist = length(d) / fo.y;
    }
    // menos fundo na areia molhada (mais firme), mais esfarelado na seca
    float prof = mk.w * mix(1.0, 0.45, molhada);
    float buraco = (1.0 - smoothstep(0.65, 1.0, dist)) * prof;
    float borda = smoothstep(0.95, 1.25, dist) * (1.0 - smoothstep(1.25, 1.9, dist)) * prof * 0.35;
    v.r = max(v.r, buraco);
    v.g = max(v.g * (1.0 - step(0.001, buraco)), borda);
  }
  gl_FragColor = v;
}`

// Malha fina: posição, normal e cor calculadas no shader.
// Mesmas contas, no fragmento: a luz da parede da pegada sai do mapa (2,3 cm), não da malha.
const GLSL_FRAGMENTO = /* glsl */ `
uniform sampler2D tAlturaF; uniform vec4 uMapaF; uniform vec2 uMapaTamF;
uniform sampler2D tAfundaF; uniform vec2 uCentroF; uniform float uAreaF;
float superficieF(vec2 xz) {
  float h = texture2D(tAlturaF, ((xz - uMapaF.xy) / uMapaF.z + 0.5) / uMapaTamF).r;
  vec2 uv = (xz - uCentroF) / uAreaF + 0.5;
  vec2 a = (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) ? vec2(0.0) : texture2D(tAfundaF, uv).rg;
  return h - a.r + a.g;
}
`

const GLSL_VERTICE = /* glsl */ `
uniform sampler2D tAltura; uniform vec4 uMapa; uniform vec2 uMapaTam;
uniform sampler2D tAfunda; uniform vec2 uCentroA; uniform float uAreaA;
varying float vAlturaA; varying float vPraia; varying float vFundo;
float alturaPraia(vec2 xz) { return texture2D(tAltura, ((xz - uMapa.xy) / uMapa.z + 0.5) / uMapaTam).r; }
float praiaEm(vec2 xz) { return texture2D(tAltura, ((xz - uMapa.xy) / uMapa.z + 0.5) / uMapaTam).b; }
vec2 afunda(vec2 xz) {
  vec2 uv = (xz - uCentroA) / uAreaA + 0.5;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return vec2(0.0);
  return texture2D(tAfunda, uv).rg;
}
float superficie(vec2 xz) { vec2 a = afunda(xz); return alturaPraia(xz) + 0.02 - a.r + a.g; }
`

export function criarAreia(cena, renderer, mapaAltura, cfg) {
  const opc = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }
  const rts = [new THREE.WebGLRenderTarget(TAM, TAM, opc), new THREE.WebGLRenderTarget(TAM, TAM, opc)]
  let ia = 0
  const marcas = Array.from({ length: MAX }, () => new THREE.Vector4())
  const formas = Array.from({ length: MAX }, () => new THREE.Vector4())
  const uA = {
    tAnterior: { value: null }, tAltura: { value: mapaAltura.textura }, uMapa: { value: mapaAltura.uMapa }, uMapaTam: { value: mapaAltura.uMapaTam },
    uCentro: { value: new THREE.Vector2() }, uDesloc: { value: new THREE.Vector2() }, uArea: { value: AREA_AREIA }, uDt: { value: 0 },
    uSecaRecupera: { value: 0.01 }, uMolhadaRecupera: { value: 0.6 }, uMarcas: { value: marcas }, uForma: { value: formas }, uN: { value: 0 },
  }
  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ uniforms: uA, vertexShader: vertQuad, fragmentShader: fragAfunda, depthTest: false, depthWrite: false })
  )
  quad.frustumCulled = false
  const cenaQuad = new THREE.Scene()
  cenaQuad.add(quad)
  const camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)

  // malha fina de areia
  const uM = {
    tAltura: { value: mapaAltura.textura }, uMapa: { value: mapaAltura.uMapa }, uMapaTam: { value: mapaAltura.uMapaTam },
    tAfunda: { value: rts[0].texture }, uCentroA: { value: new THREE.Vector2() }, uAreaA: { value: AREA_AREIA },
    uPasso: { value: AREA_AREIA / SEG },
    tAlturaF: { value: mapaAltura.textura }, uMapaF: { value: mapaAltura.uMapa }, uMapaTamF: { value: mapaAltura.uMapaTam },
    tAfundaF: { value: rts[0].texture }, uCentroF: { value: new THREE.Vector2() }, uAreaF: { value: AREA_AREIA },
    uSeca: { value: new THREE.Color('#f6d9a0') }, uMolhada: { value: new THREE.Color('#d6ab72') }, uFundo: { value: new THREE.Color('#b8874f') },
  }
  const geo = new THREE.PlaneGeometry(AREA_AREIA, AREA_AREIA, SEG, SEG).rotateX(-Math.PI / 2)
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradienteToon() })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uM)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPasso;\n' + GLSL_VERTICE)
      .replace('#include <beginnormal_vertex>', `
        vec2 xzN = position.xz + uCentroA;
        float e = uPasso * 0.5;
        float hx = superficie(xzN + vec2(e, 0.0)) - superficie(xzN - vec2(e, 0.0));
        float hz = superficie(xzN + vec2(0.0, e)) - superficie(xzN - vec2(0.0, e));
        vec3 objectNormal = normalize(vec3(-hx, 2.0 * e, -hz));`)
      .replace('#include <begin_vertex>', `
        vec2 xzA = position.xz + uCentroA;
        vec2 aA = afunda(xzA);
        vec3 transformed = vec3(xzA.x, superficie(xzA), xzA.y);
        vAlturaA = alturaPraia(xzA);
        vPraia = praiaEm(xzA);
        vFundo = aA.r;`)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlturaA; varying float vPraia; varying float vFundo;\nuniform vec3 uSeca; uniform vec3 uMolhada; uniform vec3 uFundo;\n' + GLSL_FRAGMENTO)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        {
          float eF = uAreaF / ${TAM}.0;
          vec2 xzF = vPMundo.xz;
          float hxF = superficieF(xzF + vec2(eF, 0.0)) - superficieF(xzF - vec2(eF, 0.0));
          float hzF = superficieF(xzF + vec2(0.0, eF)) - superficieF(xzF - vec2(0.0, eF));
          normal = normalize((viewMatrix * vec4(normalize(vec3(-hxF, 2.0 * eF, -hzF)), 0.0)).xyz);
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // só onde é praia; fora dela o chão de sempre aparece
        if (vPraia < 0.3) discard;
        diffuseColor.rgb = mix(uMolhada, uSeca, smoothstep(0.0, 0.22, vAlturaA));
        // dentro da pegada a areia está compactada e um pouco mais escura
        diffuseColor.rgb = mix(diffuseColor.rgb, uFundo, smoothstep(0.004, 0.04, vFundo) * 0.55);`)
  }
  pintar(mat, 'areia-pintada')
  const malha = new THREE.Mesh(geo, mat)
  malha.frustumCulled = false
  malha.receiveShadow = true
  malha.name = 'areia-fina'
  cena.add(malha)

  // poeirinha
  const MAXP = 60
  const matPo = toon('#fff3dc', { semCache: true })
  const poeira = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.22, 1), matPo, MAXP)
  poeira.count = 0
  poeira.frustumCulled = false
  poeira.userData.peso = 0.45
  cena.add(poeira)
  const nuvens = []
  const mtx = new THREE.Matrix4()
  let acPo = 0

  let fila = []
  const centro = new THREE.Vector2()
  const passo = AREA_AREIA / SEG // a malha anda em passos de 1 vértice

  return {
    _buffer: () => rts[ia],
    // pegada: posição, giro do personagem, lado (1 direito, -1 esquerdo), força (0 a 1)
    pisar(x, z, yaw, lado, forca = 1) {
      if (!cfg.interacao.pegadas) return
      fila.push([x, z, yaw, 0.06 * forca, 0, 0, lado])
    },
    // marca redonda (bola rolando, coco caindo)
    marcar(x, z, raio, prof) {
      fila.push([x, z, 0, prof, 1, raio, 1])
    },
    poeira(x, y, z, qtd = 3) {
      for (let i = 0; i < qtd; i++) {
        if (nuvens.length >= MAXP) nuvens.shift()
        const a = Math.random() * Math.PI * 2
        nuvens.push({ x: x + Math.cos(a) * 0.15, y: y + 0.08, z: z + Math.sin(a) * 0.15, vx: Math.cos(a) * 0.6, vz: Math.sin(a) * 0.6, idade: 0, vida: 0.55 + Math.random() * 0.25 })
      }
    },
    atualizar(dt, jogador) {
      const novoX = Math.round(jogador.x / passo) * passo
      const novoZ = Math.round(jogador.z / passo) * passo
      const dx = (novoX - centro.x) / AREA_AREIA
      const dz = (novoZ - centro.y) / AREA_AREIA
      centro.set(novoX, novoZ)

      const n = Math.min(MAX, fila.length)
      for (let i = 0; i < n; i++) {
        const f = fila[i]
        // o shader gira o ponto para o espaço do pé: giro inverso do personagem
        marcas[i].set(f[0], f[1], f[2], f[3])
        formas[i].set(f[4], f[5], f[6], 0)
      }
      fila = fila.slice(n)
      uA.uN.value = n
      uA.uCentro.value.copy(centro)
      uA.uDesloc.value.set(dx, dz)
      uA.uDt.value = dt
      // em "duracaoPegada" segundos sobra só uns 5% da marca na areia seca
      uA.uSecaRecupera.value = 3 / Math.max(1, cfg.interacao.duracaoPegada)
      uA.tAnterior.value = rts[ia].texture
      const r = renderer
      const alvo = r.getRenderTarget()
      r.setRenderTarget(rts[1 - ia])
      r.render(cenaQuad, camQuad)
      r.setRenderTarget(alvo)
      ia = 1 - ia

      uM.tAfunda.value = rts[ia].texture
      uM.tAfundaF.value = rts[ia].texture
      uM.uCentroA.value.copy(centro)
      uM.uCentroF.value.copy(centro)
      // longe da praia a malha fina (~300 mil triângulos) nem é desenhada; o terreno volta a cobrir tudo
      const perto = distCosta(centro.x, centro.y) < larguraPraia(centro.x) + AREA_AREIA
      malha.visible = perto
      uAreiaTerreno.uAreiaCentro.value.copy(perto ? centro : LONGE)
      uAreiaTerreno.uAreiaMeia.value = AREA_AREIA / 2 - 0.5

      // poeira: física contínua, desenho "em 2" (12 vezes por segundo)
      for (const p of nuvens) {
        p.idade += dt
        p.x += p.vx * dt
        p.z += p.vz * dt
        p.y += 0.35 * dt
        p.vx *= 0.92
        p.vz *= 0.92
      }
      while (nuvens.length && nuvens[0].idade > nuvens[0].vida) nuvens.shift()
      acPo += dt
      if (acPo >= 1 / 12) {
        acPo = 0
        nuvens.forEach((p, i) => {
          const t = p.idade / p.vida
          const esc = (0.6 + t * 1.4) * (1 - t * t)
          mtx.makeScale(esc, esc * 0.8, esc).setPosition(p.x, p.y, p.z)
          poeira.setMatrixAt(i, mtx)
        })
        poeira.count = nuvens.length
        poeira.instanceMatrix.needsUpdate = true
      }
    },
  }
}
