// A cor da rua de terra de 1932 em grande escala (21/10/2026, segunda rodada da revisão do orquestrador).
//
// "Ainda lê como uma laje lisa de plástico com pontinhos": o quadro 1 do conceito-sertão tem poeira clara por cima da
// terra socada mais escura, em manchas grandes; a poeira acumulada junto das paredes; o meio pisado mais escuro, com
// pegadas; o sulco das rodas ao longo da rua, com a borda pisoteada. Aqui só cor (o relevo é relevo-chao.js e o sulco
// fundo é rodeiro.js), em GLSL e TSL com as mesmas contas. Usa rlN (relevo-chao.js) e a posição na rua (0 no meio,
// 1 na borda, -1 fora), e vale também no quintal (manchas de poeira, sem parede nem pegada).
//
//   uRuaTerra = (manchas de poeira, poeira na parede, pegadas, segundo par de sulcos)

import * as THREE from 'three'
import { ref } from '../render/gpu/comum.js'
import { ruidoRelevo } from './relevo-chao.js'
import { CHAO } from '../paleta.js'

export const uRuaTerra = { uRuaTerra: { value: new THREE.Vector4(1, 1, 1, 1) } }

export function sincronizarRuaTerra(cfg) {
  const c = cfg?.chao
  if (!c) return
  uRuaTerra.uRuaTerra.value.set(c.poeiraManchas ?? 1, c.poeiraParede ?? 1, c.pegadasRua ?? 1, c.sulcoDuplo ?? 1)
}

const lit = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b] }
const POEIRA = lit(CHAO.poeira)
const SOCADA = lit(CHAO.rodeiro)
const v3 = (a) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`

export const GLSL_RUA_TERRA_UNIFORM = 'uniform vec4 uRuaTerra;'

// rgb, p (xz do mundo), u (posição na rua), terra (peso do chão de terra sem paralelepípedo)
export const GLSL_RUA_TERRA = /* glsl */ `
vec3 rlCorTerra(vec3 rgb, vec2 p, float u, float terra) {
  if (terra < 0.01) return rgb;
  // manchas grandes: poeira clara solta por cima da terra socada (12 m e 3 m)
  float m = rlN(p * 0.08 + 41.0) * 0.65 + rlN(p * 0.35 + 43.0) * 0.35;
  float poeira = smoothstep(0.38, 0.72, m) * uRuaTerra.x;
  // a poeira não cobre o sulco das rodas (a roda varre)
  float lS = max(uRota.z, 0.01);
  float sulcos = u >= 0.0 ? max(1.0 - smoothstep(lS * 0.25, lS, abs(u - uRota.y)), (1.0 - smoothstep(lS * 0.3, lS * 0.8, abs(u - uRota.y - 0.13))) * uRuaTerra.w) * uRota.x : 0.0;
  poeira *= 1.0 - 0.85 * clamp(sulcos, 0.0, 1.0);
  float socada = (1.0 - smoothstep(0.2, 0.5, m)) * uRuaTerra.x;
  vec3 c = mix(rgb, ${v3(SOCADA)}, socada * 0.5);
  c = mix(c, ${v3(POEIRA)} * 1.04, poeira * 0.7);
  if (u >= 0.0) {
    // a poeira que o vento junta contra a parede, em montinhos
    float parede = smoothstep(0.5, 0.92, u) * (0.55 + 0.45 * rlN(p * 0.6 + 47.0)) * uRuaTerra.y;
    c = mix(c, ${v3(POEIRA)} * 1.08, parede * 0.85);
    // o meio pisado: mais escuro e socado
    float pisado = (1.0 - smoothstep(0.1, 0.5, u)) * uRuaTerra.z;
    c *= 1.0 - pisado * 0.15;
    // pegadas: ovais escuras soltas no meio da rua (uma por célula de 0,55 m, nem toda célula tem)
    vec2 q = p / 0.55;
    vec2 iq = floor(q);
    vec2 fq = fract(q) - 0.5;
    float a = rlN(iq * 7.3) * 6.2831;
    vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * (fq - (vec2(rlN(iq * 3.1 + 1.0), rlN(iq * 5.7 + 2.0)) - 0.5) * 0.4);
    float pe = 1.0 - smoothstep(0.8, 1.0, length(r / vec2(0.11, 0.24)));
    float temPe = step(0.55, rlN(iq * 1.7 + 9.0));
    c *= 1.0 - pe * temPe * pisado * 0.3;
    // o fundo do sulco, socado e escuro
    c = mix(c, ${v3(SOCADA)} * 0.92, clamp(sulcos, 0.0, 1.0) * 0.18);
    // o segundo par de sulcos (carroças de bitola diferente), mais raso; borda pisoteada clara nos dois
    float l = max(uRota.z, 0.01);
    float t2 = abs(u - uRota.y - 0.13);
    float sulco2 = (1.0 - smoothstep(l * 0.3, l * 0.8, t2)) * uRuaTerra.w * uRota.x;
    c = mix(c, ${v3(SOCADA)}, sulco2 * 0.3 * (0.6 + 0.8 * rlN(p * 0.3 + 5.0)));
    float t1 = abs(u - uRota.y);
    float bordaS = smoothstep(l * 0.9, l * 1.2, min(t1, t2)) * (1.0 - smoothstep(l * 1.2, l * 2.0, min(t1, t2)));
    c = mix(c, ${v3(POEIRA)}, bordaS * 0.3 * uRota.x);
  }
  return mix(rgb, c, terra);
}
`

// O mesmo em TSL. Devolve o nó da cor nova.
export function tslCorTerra(W, rgb, p, u, terra, rotaU) {
  const { Fn, vec2, vec3, float, floor, fract, mix, smoothstep, step, length, max, min, abs, cos, sin, If } = W
  const rlN = ruidoRelevo(W)
  const R = ref(uRuaTerra.uRuaTerra)
  const poeiraC = vec3(...POEIRA), socadaC = vec3(...SOCADA)
  return Fn(() => {
    const c = vec3(rgb).toVar()
    If(terra.greaterThan(0.01), () => {
      const m = rlN(p.mul(0.08).add(41.0)).mul(0.65).add(rlN(p.mul(0.35).add(43.0)).mul(0.35))
      // a poeira não cobre o sulco das rodas (a roda varre)
      const lS = max(rotaU.z, 0.01)
      const sulcos = u.greaterThanEqual(0.0).select(max(float(1.0).sub(smoothstep(lS.mul(0.25), lS, abs(u.sub(rotaU.y)))),
        float(1.0).sub(smoothstep(lS.mul(0.3), lS.mul(0.8), abs(u.sub(rotaU.y).sub(0.13)))).mul(R.w)).mul(rotaU.x), float(0.0)).toVar()
      const poeira = smoothstep(0.38, 0.72, m).mul(R.x).mul(float(1.0).sub(W.clamp(sulcos, 0.0, 1.0).mul(0.85)))
      const socada = float(1.0).sub(smoothstep(0.2, 0.5, m)).mul(R.x)
      c.assign(mix(c, socadaC, socada.mul(0.5)))
      c.assign(mix(c, poeiraC.mul(1.04), poeira.mul(0.7)))
      If(u.greaterThanEqual(0.0), () => {
        const parede = smoothstep(0.5, 0.92, u).mul(rlN(p.mul(0.6).add(47.0)).mul(0.45).add(0.55)).mul(R.y)
        c.assign(mix(c, poeiraC.mul(1.08), parede.mul(0.85)))
        const pisado = float(1.0).sub(smoothstep(0.1, 0.5, u)).mul(R.z)
        c.mulAssign(float(1.0).sub(pisado.mul(0.15)))
        const q = p.div(0.55)
        const iq = floor(q)
        const fq = fract(q).sub(0.5)
        const a = rlN(iq.mul(7.3)).mul(6.2831)
        const d = fq.sub(vec2(rlN(iq.mul(3.1).add(1.0)), rlN(iq.mul(5.7).add(2.0))).sub(0.5).mul(0.4))
        // mat2(cos, -sin, sin, cos) * d do GLSL (matriz por colunas)
        const rr = vec2(cos(a).mul(d.x).add(sin(a).mul(d.y)), sin(a).negate().mul(d.x).add(cos(a).mul(d.y)))
        const pe = float(1.0).sub(smoothstep(0.8, 1.0, length(rr.div(vec2(0.11, 0.24)))))
        const temPe = step(0.55, rlN(iq.mul(1.7).add(9.0)))
        c.mulAssign(float(1.0).sub(pe.mul(temPe).mul(pisado).mul(0.3)))
        // o fundo do sulco, socado e escuro
        c.assign(mix(c, socadaC.mul(0.92), W.clamp(sulcos, 0.0, 1.0).mul(0.18)))
        const l = max(rotaU.z, 0.01)
        const t2 = abs(u.sub(rotaU.y).sub(0.13))
        const sulco2 = float(1.0).sub(smoothstep(l.mul(0.3), l.mul(0.8), t2)).mul(R.w).mul(rotaU.x)
        c.assign(mix(c, socadaC, sulco2.mul(0.3).mul(rlN(p.mul(0.3).add(5.0)).mul(0.8).add(0.6))))
        const t1 = abs(u.sub(rotaU.y))
        const mt = min(t1, t2)
        const bordaS = smoothstep(l.mul(0.9), l.mul(1.2), mt).mul(float(1.0).sub(smoothstep(l.mul(1.2), l.mul(2.0), mt)))
        c.assign(mix(c, poeiraC, bordaS.mul(0.3).mul(rotaU.x)))
      })
      c.assign(mix(vec3(rgb), c, terra))
    })
    return c
  })()
}
