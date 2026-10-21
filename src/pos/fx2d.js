// Camada 2D esparsa por cima da imagem (luz-arcane, item 7; assinatura Arcane da referência forte-1932-joabe:
// traços de tinta verde e amarela tipo grafite e um spray de pontos de retícula). Desligada por padrão
// (cfg.estilo.arcFx2d = 0): é efeito de composição, para usar com parcimônia, num momento e não no jogo todo.
// Os traços ficam presos à tela, como um quadro composto; as posições saem de semente (criarAleatorio), então
// a composição é sempre a mesma. Cores da paleta: verde-coqueiro e amarelo-caju (paleta.js, ACENTO) e o spray
// num azul claro. GLSL e TSL com as mesmas contas.

import * as THREE from 'three'
import { criarAleatorio } from '../utils.js'
import { ACENTO } from '../paleta.js'

// três traços em zigue-zague no alto da tela (uv: x da esquerda, y de baixo) e um spray perto do primeiro
export function uniformsFx2d() {
  const rnd = criarAleatorio(1932)
  const seg = () => {
    const x0 = rnd.entre(0.3, 0.75), y0 = rnd.entre(0.68, 0.9)
    const a = rnd.entre(0.35, 0.75) * (rnd.proximo() < 0.5 ? 1 : -1)
    const l = rnd.entre(0.16, 0.28)
    return new THREE.Vector4(x0, y0, x0 + Math.cos(a) * l, y0 + Math.sin(a) * l)
  }
  const a = seg(), b = seg(), c = seg()
  const srgb = (hex) => { const n = parseInt(hex.slice(1), 16); return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255) }
  return {
    uFx: { value: 0 },
    uFxA: { value: a }, uFxB: { value: b }, uFxC: { value: c },
    uFxCor1: { value: srgb(ACENTO.coqueiro) }, uFxCor2: { value: srgb(ACENTO.caju) },
    uFxSpray: { value: new THREE.Vector3((a.x + a.z) / 2 + 0.05, (a.y + a.w) / 2 - 0.06, 0.16) },
  }
}

export const GLSL_FX2D = /* glsl */ `
// um traço de pincel seco: distância ao segmento, falhas ao longo dele, verde que vira amarelo
vec4 tracoFx(vec2 q, vec4 s, float asp, float semente) {
  vec2 a = s.xy, b = s.zw;
  vec2 ab = (b - a) * vec2(asp, 1.0);
  vec2 aq = (q - a) * vec2(asp, 1.0);
  float t = clamp(dot(aq, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  float dist = length(aq - ab * t);
  float larg = 0.024 * (0.5 + 0.7 * sin(t * 3.1416)); // afina nas pontas
  float corpo = 1.0 - smoothstep(larg * 0.6, larg, dist);
  float falha = smoothstep(0.25, 0.5, ruido(vec2(t * 60.0 + semente, dist * 500.0)));
  return vec4(vec3(t), corpo * falha);
}
vec3 aplicarFx2d(vec3 cor, vec2 uv, vec2 pg, float asp, float ceu) {
  if (uFx <= 0.001) return cor;
  float peso = uFx * (0.55 + 0.45 * ceu);
  vec4 t1 = tracoFx(uv, uFxA, asp, 1.0), t2 = tracoFx(uv, uFxB, asp, 7.0), t3 = tracoFx(uv, uFxC, asp, 13.0);
  cor = mix(cor, mix(uFxCor1, uFxCor2, t1.x), t1.a * 0.85 * peso);
  cor = mix(cor, mix(uFxCor1, uFxCor2, t2.x), t2.a * 0.85 * peso);
  cor = mix(cor, mix(uFxCor2, uFxCor1, t3.x), t3.a * 0.85 * peso);
  // spray de retícula: pontos que crescem no miolo da nuvem de tinta e somem na borda
  float r = length((uv - uFxSpray.xy) * vec2(asp, 1.0)) / uFxSpray.z;
  float nuvem = exp(-r * r * 2.0) * smoothstep(0.2, 0.6, ruido(uv * 30.0));
  float ponto = pontoGrade(pg, 0.5, 6.0, nuvem);
  cor = mix(cor, vec3(0.62, 0.86, 0.95), ponto * 0.8 * peso);
  return cor;
}`

// TSL: pontoGrade e ruido vêm do fragTela (as mesmas funções do GLSL)
export function aplicarFx2dTsl(W, U, { ruido, pontoGrade }, cor, uv, pg, asp, ceu) {
  const { vec2, vec3, float, clamp, dot, max, length, sin, smoothstep, mix, exp } = W
  const traco = (s, semente) => {
    const ab = s.zw.sub(s.xy).mul(vec2(asp, 1.0))
    const aq = uv.sub(s.xy).mul(vec2(asp, 1.0))
    const t = clamp(dot(aq, ab).div(max(dot(ab, ab), 1e-6)), 0.0, 1.0)
    const dist = length(aq.sub(ab.mul(t)))
    const larg = sin(t.mul(3.1416)).mul(0.7).add(0.5).mul(0.024)
    const corpo = float(1.0).sub(smoothstep(larg.mul(0.6), larg, dist))
    const falha = smoothstep(0.25, 0.5, ruido(vec2(t.mul(60.0).add(semente), dist.mul(500.0))))
    return { t, a: corpo.mul(falha) }
  }
  const peso = U.uFx.mul(ceu.mul(0.45).add(0.55))
  const t1 = traco(U.uFxA, 1.0), t2 = traco(U.uFxB, 7.0), t3 = traco(U.uFxC, 13.0)
  let c = mix(cor, mix(U.uFxCor1, U.uFxCor2, t1.t), t1.a.mul(0.85).mul(peso))
  c = mix(c, mix(U.uFxCor1, U.uFxCor2, t2.t), t2.a.mul(0.85).mul(peso))
  c = mix(c, mix(U.uFxCor2, U.uFxCor1, t3.t), t3.a.mul(0.85).mul(peso))
  const r = length(uv.sub(U.uFxSpray.xy).mul(vec2(asp, 1.0))).div(U.uFxSpray.z)
  const nuvem = exp(r.mul(r).mul(-2.0)).mul(smoothstep(0.2, 0.6, ruido(uv.mul(30.0))))
  const ponto = pontoGrade(pg, 0.5, 6.0, nuvem)
  return mix(c, vec3(0.62, 0.86, 0.95), ponto.mul(0.8).mul(peso))
}
