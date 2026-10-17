// Partículas (visual Arcane): fumaça, poeira, borrifo e pó no ar como nuvens de muitos grãos soltos,
// aleatórios, que sobem, giram no ar e se desfazem (em Arcane a fumaça e o pó são assim, não desenho 2D).
// Um só THREE.Points com shader próprio: cada grão é uma mancha macia de borda irregular, que cresce e
// apaga com a idade. O movimento roda na CPU (vento, turbulência, gravidade, arrasto); são poucos milhares.
// Os grãos não escrevem profundidade nem mexem no alfa da cor (o "peso" do traço no filtro), então não
// ganham contorno.

import * as THREE from 'three'
import { SAIDA_LUZ } from '../materiais.js'
import { criarAleatorio } from '../utils.js'

const MAX = 3000

// tipo: cor do lado da luz e do lado da sombra, opacidade, como cresce
const TIPOS = {
  fumaca: { luz: '#d9d2c8', sombra: '#7d7a84', alfa: 0.58, cresce: 3.2 },
  poeira: { luz: '#ecd6aa', sombra: '#b39572', alfa: 0.6, cresce: 2.2 },
  borrifo: { luz: '#ffffff', sombra: '#b6d3dc', alfa: 0.85, cresce: 1.2 },
  nevoa: { luz: '#f4f8f8', sombra: '#c4d8de', alfa: 0.3, cresce: 2.6 },
  po: { luz: '#fff2d2', sombra: '#d8c4a0', alfa: 0.55, cresce: 1.0 },
}

const vert = /* glsl */ `
attribute float aTam; attribute float aAlfa; attribute vec3 aCorLuz; attribute vec3 aCorSombra; attribute float aSemente;
uniform float uEscalaPx;
varying float vAlfa; varying vec3 vLuz; varying vec3 vSombra; varying float vSemente;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, aTam * uEscalaPx / max(-mv.z, 0.1));
  vAlfa = aAlfa; vLuz = aCorLuz; vSombra = aCorSombra; vSemente = aSemente;
}`

const frag = /* glsl */ `
varying float vAlfa; varying vec3 vLuz; varying vec3 vSombra; varying float vSemente;
${SAIDA_LUZ}
float h(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
void main() {
  vec2 p = gl_PointCoord - 0.5;
  // borda irregular: o raio varia com o ângulo e com a semente do grão (nenhum é um disco perfeito)
  float a = atan(p.y, p.x);
  float borda = 0.42 + 0.08 * (vn(vec2(a * 1.6 + vSemente * 7.0, vSemente * 3.0)) - 0.5) * 2.0;
  float r = length(p);
  float m = 1.0 - smoothstep(borda * 0.55, borda, r);
  if (m * vAlfa < 0.01) discard;
  // luz de cima: a parte de cima do grão mais clara, a de baixo na cor da sombra
  vec3 cor = mix(vSombra, vLuz, smoothstep(0.25, -0.25, p.y));
  gl_FragColor = vec4(cor, m * vAlfa);
  gLuz = vec4(0.9, 0.0, 0.0, m * vAlfa);
}`

export function criarParticulas(cena, renderer, camera) {
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(MAX * 3)
  const tam = new Float32Array(MAX), alfa = new Float32Array(MAX), sem = new Float32Array(MAX)
  const corL = new Float32Array(MAX * 3), corS = new Float32Array(MAX * 3)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aTam', new THREE.BufferAttribute(tam, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aAlfa', new THREE.BufferAttribute(alfa, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aSemente', new THREE.BufferAttribute(sem, 1))
  geo.setAttribute('aCorLuz', new THREE.BufferAttribute(corL, 3))
  geo.setAttribute('aCorSombra', new THREE.BufferAttribute(corS, 3))
  const uEscalaPx = { value: 800 }
  const mat = new THREE.ShaderMaterial({
    uniforms: { uEscalaPx }, vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, depthTest: true,
    // a cor mistura; o alfa de destino (peso do traço no filtro) fica intacto
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  })
  mat.userData.luzMRT = true
  const pontos = new THREE.Points(geo, mat)
  pontos.frustumCulled = false
  pontos.renderOrder = 5
  cena.add(pontos)

  const rnd = criarAleatorio(77)
  // estado de cada grão
  const vel = new Float32Array(MAX * 3)
  const idade = new Float32Array(MAX), vida = new Float32Array(MAX), tam0 = new Float32Array(MAX)
  const tipoDe = new Array(MAX).fill(null)
  const arrasto = new Float32Array(MAX), gravidade = new Float32Array(MAX), alfa0 = new Float32Array(MAX)
  let livre = 0
  let vivos = 0
  const cores = Object.fromEntries(Object.entries(TIPOS).map(([k, t]) => [k, { luz: new THREE.Color(t.luz), sombra: new THREE.Color(t.sombra) }]))
  let t = 0

  function nascer(tipo, x, y, z, vx, vy, vz, { tamanho = 0.1, vidaS = 2, arr = 0.5, grav = 0 } = {}) {
    // procura um lugar livre a partir do último (anel)
    for (let k = 0; k < MAX; k++) {
      const i = (livre + k) % MAX
      if (tipoDe[i]) continue
      livre = (i + 1) % MAX
      tipoDe[i] = tipo
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z
      vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz
      idade[i] = 0; vida[i] = vidaS; tam0[i] = tamanho; arrasto[i] = arr; gravidade[i] = grav
      alfa0[i] = TIPOS[tipo].alfa * (0.6 + rnd.proximo() * 0.4)
      sem[i] = rnd.proximo()
      const c = cores[tipo]
      // cada grão puxa um pouco a cor (a nuvem não é chapada)
      const v = 0.92 + rnd.proximo() * 0.16
      corL[i * 3] = c.luz.r * v; corL[i * 3 + 1] = c.luz.g * v; corL[i * 3 + 2] = c.luz.b * v
      corS[i * 3] = c.sombra.r * v; corS[i * 3 + 1] = c.sombra.g * v; corS[i * 3 + 2] = c.sombra.b * v
      geo.attributes.aSemente.needsUpdate = true
      geo.attributes.aCorLuz.needsUpdate = true
      geo.attributes.aCorSombra.needsUpdate = true
      vivos++
      return
    }
  }

  const ent = (a, b) => rnd.entre(a, b)
  return {
    get vivos() { return vivos },
    // fumaça de um fogareiro: chamar todo quadro com dt (emite ~30 grãos por segundo)
    fumaca(p, dt, vento) {
      const n = Math.floor(dt * 30 + rnd.proximo())
      for (let k = 0; k < n; k++) {
        nascer('fumaca', p.x + ent(-0.06, 0.06), p.y + 0.4, p.z + ent(-0.06, 0.06),
          vento.x * 0.2 + ent(-0.05, 0.05), ent(0.35, 0.6), vento.z * 0.2 + ent(-0.05, 0.05),
          { tamanho: ent(0.07, 0.13), vidaS: ent(2.6, 4.0), arr: 0.25 })
      }
    },
    // poeira de um passo (força 1) ou de um pouso (força ~2.5); dir = velocidade do corpo
    poeira(p, forca = 1, dir = null) {
      const n = Math.round(10 * forca)
      for (let k = 0; k < n; k++) {
        const a = rnd.proximo() * Math.PI * 2
        const s = ent(0.3, 1.1) * forca
        nascer('poeira', p.x + ent(-0.1, 0.1), p.y + 0.05, p.z + ent(-0.1, 0.1),
          Math.cos(a) * s * 0.6 - (dir ? dir.x * 0.12 : 0), ent(0.4, 1.0) * Math.sqrt(forca), Math.sin(a) * s * 0.6 - (dir ? dir.z * 0.12 : 0),
          { tamanho: ent(0.04, 0.1), vidaS: ent(0.7, 1.4), arr: 2.2, grav: 1.4 })
      }
    },
    // uma onda quebrando num ponto: gotas que sobem e caem e névoa que fica
    borrifo(p, forca = 1) {
      for (let k = 0; k < 18 * forca; k++) {
        nascer('borrifo', p.x + ent(-0.6, 0.6), p.y, p.z + ent(-0.3, 0.3),
          ent(-0.6, 0.6), ent(1.2, 2.8) * forca, ent(0.2, 1.0),
          { tamanho: ent(0.025, 0.06), vidaS: ent(0.6, 1.1), arr: 0.6, grav: 6.5 })
      }
      for (let k = 0; k < 7 * forca; k++) {
        nascer('nevoa', p.x + ent(-0.8, 0.8), p.y + ent(0.1, 0.6), p.z + ent(-0.4, 0.4),
          ent(-0.2, 0.2), ent(0.15, 0.45), ent(0.1, 0.5),
          { tamanho: ent(0.18, 0.35), vidaS: ent(1.2, 2.0), arr: 1.0 })
      }
    },
    // pó boiando no ar em volta de um ponto (o jogador): manter ~n grãos vivos
    poNoAr(centro, dt, n = 160) {
      let atuais = 0
      for (let i = 0; i < MAX; i++) if (tipoDe[i] === 'po') atuais++
      const faltam = Math.min(n - atuais, Math.ceil(dt * 60))
      for (let k = 0; k < faltam; k++) {
        nascer('po', centro.x + ent(-9, 9), centro.y + ent(0.2, 3.5), centro.z + ent(-9, 9),
          ent(-0.05, 0.05), ent(-0.02, 0.04), ent(-0.05, 0.05),
          { tamanho: ent(0.012, 0.03), vidaS: ent(5, 9), arr: 0.1 })
      }
    },
    atualizar(dt, { vento = new THREE.Vector3(), forcaVento = 1 } = {}) {
      if (dt <= 0) return
      t += dt
      uEscalaPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
      for (let i = 0; i < MAX; i++) {
        const tp = tipoDe[i]
        if (!tp) { if (alfa[i] !== 0) { alfa[i] = 0; tam[i] = 0 } continue }
        idade[i] += dt
        const v = idade[i] / vida[i]
        if (v >= 1) { tipoDe[i] = null; alfa[i] = 0; tam[i] = 0; vivos--; continue }
        const j = i * 3
        // turbulência: o ar gira (ruído barato que muda com a posição e o tempo) e o vento empurra
        const x = pos[j], y = pos[j + 1], z = pos[j + 2]
        const tx = Math.sin(y * 2.1 + t * 1.3 + sem[i] * 6.3) + Math.sin(z * 1.7 - t * 0.9)
        const tz = Math.cos(x * 1.9 - t * 1.1 + sem[i] * 4.1) + Math.sin(y * 1.3 + t * 0.7)
        const giro = tp === 'fumaca' || tp === 'nevoa' || tp === 'po' ? 0.35 : 0.08
        vel[j] += (tx * giro + vento.x * forcaVento * 0.35) * dt
        vel[j + 2] += (tz * giro + vento.z * forcaVento * 0.35) * dt
        vel[j + 1] -= gravidade[i] * dt
        const k = Math.exp(-arrasto[i] * dt)
        vel[j] *= k; vel[j + 1] *= k; vel[j + 2] *= k
        pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt
        // cresce e apaga: entra rápido, some devagar
        const cresce = TIPOS[tp].cresce
        tam[i] = tam0[i] * (1 + (cresce - 1) * Math.sqrt(v))
        alfa[i] = alfa0[i] * Math.min(1, v * 8) * (1 - v) * (1 - v * 0.3)
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.aTam.needsUpdate = true
      geo.attributes.aAlfa.needsUpdate = true
    },
  }
}
