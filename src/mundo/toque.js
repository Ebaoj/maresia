// Camada 1 da interação: o "mapa de toque" e a "água que ondula".
//
// Mapa de toque: uma imagem de 256x256 vista de cima, cobrindo 64 m em volta do jogador.
// Tudo que se mexe (pés, pessoas, objetos rolando) carimba ali a direção do empurrão e o
// quanto amassou. A imagem esmaece devagar: a grama fica deitada por onde se passou e
// levanta em alguns segundos. Fica presa ao mundo: quando o jogador anda, a imagem é
// reamostrada com o deslocamento, então o rastro não "anda junto".
//
// Água que ondula: na mesma área, uma simulação simples de onda (equação da onda numa
// grade). Quem entra, nada ou cai na água solta uma gota; o anel se espalha e some.

import * as THREE from 'three'
import { modulo, ref, amostraAlvo, uvTela, criarAlvo, criarPasse } from '../render/gpu/comum.js'

const TAM = 256
export const AREA_TOQUE = 64
const MAX = 32

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const fragToque = /* glsl */ `
uniform sampler2D tAnterior; uniform sampler2D tAltura; uniform vec4 uMapa; uniform vec2 uMapaTam;
uniform vec2 uCentro; uniform vec2 uDesloc; uniform float uArea; uniform float uDt; uniform float uRecupera;
uniform vec4 uPts[${MAX}]; uniform vec4 uVel[${MAX}]; uniform int uN;
varying vec2 vUv;
void main() {
  vec2 xz = uCentro + (vUv - 0.5) * uArea;
  vec2 uvAnt = vUv + uDesloc;
  vec4 v = vec4(0.0);
  if (uvAnt.x > 0.0 && uvAnt.x < 1.0 && uvAnt.y > 0.0 && uvAnt.y < 1.0) v = texture2D(tAnterior, uvAnt);
  // a grama volta a ficar de pé aos poucos
  v *= exp(-uDt * uRecupera);
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uN) break;
    vec4 p = uPts[i];
    vec2 d = xz - p.xy;
    float dist = length(d);
    float k = (1.0 - smoothstep(p.z * 0.4, p.z, dist)) * p.w;
    if (k <= 0.001) continue;
    // empurra para longe do centro, puxando um pouco na direção do movimento
    vec2 fora = d / max(dist, 1e-3);
    vec2 mov = uVel[i].xy;
    vec2 dir = normalize(fora + mov * 0.35 + vec2(1e-4));
    vec2 novo = dir * k;
    if (length(novo) > length(v.rg)) v.rg = mix(v.rg, novo, 0.6);
    v.b = max(v.b, k);
  }
  gl_FragColor = v;
}`

const fragOnda = /* glsl */ `
uniform sampler2D tAnterior; uniform vec2 uDesloc; uniform vec2 uCentro; uniform float uArea; uniform vec2 uTexel;
uniform vec4 uGotas[${MAX}]; uniform int uNG; uniform float uAmortece;
varying vec2 vUv;
vec2 ler(vec2 uv) {
  uv += uDesloc;
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return vec2(0.0);
  return texture2D(tAnterior, uv).rg;
}
void main() {
  // r = altura agora, g = altura no quadro anterior
  vec2 c = ler(vUv);
  float viz = ler(vUv + vec2(uTexel.x, 0.0)).r + ler(vUv - vec2(uTexel.x, 0.0)).r
            + ler(vUv + vec2(0.0, uTexel.y)).r + ler(vUv - vec2(0.0, uTexel.y)).r;
  float h = (viz * 0.5 - c.g) * uAmortece;
  vec2 xz = uCentro + (vUv - 0.5) * uArea;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= uNG) break;
    float d = length(xz - uGotas[i].xy);
    h += (1.0 - smoothstep(0.0, uGotas[i].z, d)) * uGotas[i].w;
  }
  gl_FragColor = vec4(clamp(h, -2.0, 2.0), c.r, 0.0, 1.0);
}`

// Os mesmos dois passes em TSL, para o modo webgpu (motor F2, KAN-68): contas linha a linha do GLSL acima
function toqueTsl(uT) {
  const W = modulo()
  const { Fn, vec2, vec4, float, exp, length, smoothstep, max, mix, normalize, Loop, If, Break, Continue, uniformArray } = W
  const pts = uniformArray(uT.uPts.value, 'vec4')
  const vel = uniformArray(uT.uVel.value, 'vec4')
  return Fn(() => {
    const vUv = uvTela()
    const xz = ref(uT.uCentro).add(vUv.sub(0.5).mul(ref(uT.uArea)))
    const uvAnt = vUv.add(ref(uT.uDesloc))
    const dentro = uvAnt.x.greaterThan(0.0).and(uvAnt.x.lessThan(1.0)).and(uvAnt.y.greaterThan(0.0)).and(uvAnt.y.lessThan(1.0))
    const v = dentro.select(amostraAlvo(uT.tAnterior, uvAnt), vec4(0.0)).toVar()
    // a grama volta a ficar de pé aos poucos
    v.mulAssign(exp(ref(uT.uDt).negate().mul(ref(uT.uRecupera))))
    Loop(MAX, ({ i }) => {
      If(i.toFloat().greaterThanEqual(ref(uT.uN)), () => { Break() })
      const p = pts.element(i)
      const d = xz.sub(p.xy)
      const dist = length(d)
      const k = float(1.0).sub(smoothstep(p.z.mul(0.4), p.z, dist)).mul(p.w)
      If(k.lessThanEqual(0.001), () => { Continue() })
      // empurra para longe do centro, puxando um pouco na direção do movimento
      const fora = d.div(max(dist, 1e-3))
      const mov = vel.element(i).xy
      const dir = normalize(fora.add(mov.mul(0.35)).add(vec2(1e-4)))
      const novo = dir.mul(k)
      If(length(novo).greaterThan(length(v.xy)), () => { v.assign(vec4(mix(v.xy, novo, 0.6), v.z, v.w)) })
      v.assign(vec4(v.xy, max(v.z, k), v.w))
    })
    return v
  })()
}

function ondaTsl(uO) {
  const W = modulo()
  const { Fn, vec2, vec4, float, length, smoothstep, clamp, Loop, If, Break, uniformArray } = W
  const gotas = uniformArray(uO.uGotas.value, 'vec4')
  const ler = (uv0) => {
    const uv = uv0.add(ref(uO.uDesloc))
    const fora = uv.x.lessThanEqual(0.0).or(uv.x.greaterThanEqual(1.0)).or(uv.y.lessThanEqual(0.0)).or(uv.y.greaterThanEqual(1.0))
    return fora.select(vec2(0.0), amostraAlvo(uO.tAnterior, uv).xy)
  }
  return Fn(() => {
    const vUv = uvTela()
    const texel = ref(uO.uTexel)
    // r = altura agora, g = altura no quadro anterior
    const c = ler(vUv)
    const viz = ler(vUv.add(vec2(texel.x, 0.0))).x.add(ler(vUv.sub(vec2(texel.x, 0.0))).x)
      .add(ler(vUv.add(vec2(0.0, texel.y))).x).add(ler(vUv.sub(vec2(0.0, texel.y))).x)
    const h = viz.mul(0.5).sub(c.y).mul(ref(uO.uAmortece)).toVar()
    const xz = ref(uO.uCentro).add(vUv.sub(0.5).mul(ref(uO.uArea)))
    Loop(MAX, ({ i }) => {
      If(i.toFloat().greaterThanEqual(ref(uO.uNG)), () => { Break() })
      const g = gotas.element(i)
      const d = length(xz.sub(g.xy))
      h.addAssign(float(1.0).sub(smoothstep(0.0, g.z, d)).mul(g.w))
    })
    return vec4(clamp(h, -2.0, 2.0), c.x, 0.0, 1.0)
  })()
}

export function criarToque(renderer, mapaAltura, cfg) {
  const opc = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false }
  const toque = [criarAlvo(THREE, TAM, TAM, opc), criarAlvo(THREE, TAM, TAM, opc)]
  const onda = [criarAlvo(THREE, TAM, TAM, opc), criarAlvo(THREE, TAM, TAM, opc)]
  let it = 0
  let io = 0

  const pts = Array.from({ length: MAX }, () => new THREE.Vector4())
  const vel = Array.from({ length: MAX }, () => new THREE.Vector4())
  const gotas = Array.from({ length: MAX }, () => new THREE.Vector4())
  const uT = {
    tAnterior: { value: null }, tAltura: { value: mapaAltura.textura }, uMapa: { value: mapaAltura.uMapa }, uMapaTam: { value: mapaAltura.uMapaTam },
    uCentro: { value: new THREE.Vector2() }, uDesloc: { value: new THREE.Vector2() }, uArea: { value: AREA_TOQUE },
    uDt: { value: 0 }, uRecupera: { value: 0.5 }, uPts: { value: pts }, uVel: { value: vel }, uN: { value: 0 },
  }
  const uO = {
    tAnterior: { value: null }, uDesloc: { value: new THREE.Vector2() }, uCentro: { value: new THREE.Vector2() }, uArea: { value: AREA_TOQUE },
    uTexel: { value: new THREE.Vector2(1 / TAM, 1 / TAM) }, uGotas: { value: gotas }, uNG: { value: 0 }, uAmortece: { value: 0.985 },
  }
  const passeToque = criarPasse(THREE, { uniforms: uT, vertexShader: vert, fragmentShader: fragToque, tsl: () => toqueTsl(uT) })
  const passeOnda = criarPasse(THREE, { uniforms: uO, vertexShader: vert, fragmentShader: fragOnda, tsl: () => ondaTsl(uO) })

  // o que os outros shaders leem
  const publico = {
    tToque: { value: toque[0].texture },
    tOnda: { value: onda[0].texture },
    uToqueCentro: { value: new THREE.Vector2() },
    uToqueArea: { value: AREA_TOQUE },
  }

  const centro = new THREE.Vector2()
  const texel = AREA_TOQUE / TAM
  let fila = []
  let filaGotas = []
  let acOnda = 0

  return {
    publico,
    // para depurar: os buffers atuais
    _buffers: () => ({ toque: toque[it], onda: onda[io] }),
    // quem toca: x, z, raio (m), força (0 a 1), velocidade x, z
    tocar(x, z, raio, forca, vx = 0, vz = 0) {
      fila.push([x, z, raio, forca, vx, vz])
    },
    // gota na água: x, z, raio (m), força (pode ser negativa: afunda)
    gota(x, z, raio, forca) {
      filaGotas.push([x, z, raio, forca])
    },
    atualizar(dt, jogador) {
      // o centro anda em passos de 1 texel: a imagem não "escorrega"
      const novoX = Math.round(jogador.x / texel) * texel
      const novoZ = Math.round(jogador.z / texel) * texel
      const dx = (novoX - centro.x) / AREA_TOQUE
      const dz = (novoZ - centro.y) / AREA_TOQUE
      centro.set(novoX, novoZ)
      const r = renderer
      const alvoAnterior = r.getRenderTarget()

      // mapa de toque
      fila.sort((a, b) => (a[0] - jogador.x) ** 2 + (a[1] - jogador.z) ** 2 - ((b[0] - jogador.x) ** 2 + (b[1] - jogador.z) ** 2))
      const n = Math.min(MAX, fila.length)
      for (let i = 0; i < n; i++) {
        const f = fila[i]
        pts[i].set(f[0], f[1], f[2], f[3])
        vel[i].set(f[4], f[5], 0, 0)
      }
      uT.uN.value = n
      uT.uCentro.value.copy(centro)
      uT.uDesloc.value.set(dx, dz)
      uT.uDt.value = dt
      uT.uRecupera.value = cfg.interacao.recuperaGrama
      uT.tAnterior.value = toque[it].texture
      passeToque.desenhar(r, toque[1 - it])
      it = 1 - it
      publico.tToque.value = toque[it].texture
      fila = []

      // água: passo fixo de 1/60 s para a onda andar sempre na mesma velocidade
      acOnda += dt
      let primeiro = true
      while (acOnda >= 1 / 60) {
        acOnda -= 1 / 60
        const ng = primeiro ? Math.min(MAX, filaGotas.length) : 0
        for (let i = 0; i < ng; i++) gotas[i].set(...filaGotas[i])
        uO.uNG.value = ng
        uO.uDesloc.value.set(primeiro ? dx : 0, primeiro ? dz : 0)
        uO.uCentro.value.copy(centro)
        uO.uAmortece.value = cfg.interacao.amorteceOnda
        uO.tAnterior.value = onda[io].texture
        passeOnda.desenhar(r, onda[1 - io])
        io = 1 - io
        primeiro = false
      }
      if (!primeiro) filaGotas = []
      publico.tOnda.value = onda[io].texture
      publico.uToqueCentro.value.copy(centro)
      r.setRenderTarget(alvoAnterior)
    },
  }
}
