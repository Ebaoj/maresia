// O calçamento de 1932: paralelepípedo em fiadas desencontradas.
//
// O chão da cidade é uma malha grande; o paralelepípedo é desenhado no shader do
// terreno (fazer isso com geometria custaria caro). A mesma conta aparece em GLSL
// (WebGL) e em TSL (WebGPU), e os parâmetros vêm de config.js e do painel.
//
//   uBloco = (comprimento do bloco, altura da fiada, junta, desencontro)
//     comprimento e altura da fiada em unidades de jogo (1 unidade = 1 m no jogo)
//     junta: a fresta de areia entre dois blocos
//     desencontro: quanto a fiada seguinte desliza (0 = fiadas alinhadas)
//
// De longe o padrão vira a cor média da pedra, para não virar chiado.

import * as THREE from 'three'
import { ref } from '../render/gpu/comum.js'

export const uCalamento = {
  uBloco: { value: new THREE.Vector4(0.3, 0.15, 0.03, 0.5) },
}

// leva o que está no config para o uniform (o painel mexe no config ao vivo)
export function sincronizarCalamento(cfg) {
  const c = cfg?.calamento
  if (!c) return
  uCalamento.uBloco.value.set(c.bloco, c.largura, c.junta, c.desencontro)
}

// A declaracao do uniform vai no escopo global do shader: dentro de um bloco o GLSL
// recusa ('uniform' : only allowed at global scope) e o terreno inteiro deixa de compilar.
export const GLSL_CALAMENTO_UNIFORM = 'uniform vec4 uBloco;'
// o tamanho do pixel no chão (m), calculado antes do if do calçamento: derivada de tela não vale dentro de condição
export const GLSL_CALAMENTO_PIXEL = 'float fwCal = max(length(dFdx(vPMundo.xz)), length(dFdy(vPMundo.xz)));'

// O trecho GLSL. Precisa de hPav (o hash do terreno) e de vPMundo/cameraPosition.
export const GLSL_CALAMENTO = `
  {
    float lc = max(uBloco.x, 0.02);
    float ac = max(uBloco.y, 0.02);
    float jc = uBloco.z;
    float dc = uBloco.w;
    vec2 pc = vPMundo.xz;
    float fiada = floor(pc.y / ac);
    float alt = fract(fiada * 0.5) * 2.0;   // 0 ou 1: a cada fiada, desloca meio bloco
    vec2 qc = vec2(pc.x / lc + alt * dc, pc.y / ac);
    vec2 iqc = floor(qc), fqc = fract(qc);
    // distancia do centro do bloco ate a junta, em unidades de jogo
    float borda = min(min(fqc.x, 1.0 - fqc.x) * lc, min(fqc.y, 1.0 - fqc.y) * ac);
    float pedra = smoothstep(jc * 0.5, jc * 0.5 + 0.012, borda);
    float tomc = hPav(iqc + 3.1);
    // pedra do Mucuripe: acinzentada, com algumas mais quentes. A pedra e
    // pedra: a cor da terra de baixo so aparece na sombra da junta.
    vec3 baseP = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(1.02, 0.98, 0.93), 0.92);
    vec3 c = baseP * mix(0.80, 1.12, tomc) * mix(vec3(1.0), vec3(1.06, 0.97, 0.88), step(0.80, hPav(iqc + 9.7)));
    c *= 1.0 + 0.08 * smoothstep(jc, jc * 3.0, borda) - 0.05; // face do bloco abaulada
    vec3 junta = mix(c * 0.45, vec3(0.70, 0.60, 0.46), 0.45);
    c = mix(junta, c, pedra);
    // o bloco tem 30 cm: a mais de ~60 m ele vira chiado, e o chão passa a ser
    // a cor média da pedra (calçada cinza), não areia. Também quando o pixel fica do tamanho da fiada
    // (câmera rasante): sem isso as fiadas davam moiré em arco a 15 m (21/10/2026; fwCal vem de fora do if)
    // (a média do desenho, não o cinza claro de longe: o cinza no lugar das fiadas estourava de branco ao meio-dia)
    float longe = 1.0 - smoothstep(60.0, 200.0, distance(cameraPosition, vPMundo));
    float nitida = 1.0 - smoothstep(0.25, 0.6, fwCal / min(lc, ac));
    vec3 mediaDesenho = mix(baseP * 0.93, mix(baseP * 0.42, vec3(0.70, 0.60, 0.46), 0.45), clamp(jc * 2.0 / min(lc, ac), 0.0, 0.6));
    vec3 media = mix(baseP, vec3(0.60, 0.58, 0.54), 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(media, mix(mediaDesenho, c, nitida), longe), vPiso);
  }`

// O mesmo trecho em TSL, para o modo webgpu (motor F2, KAN-68).
export function tslCalamento(W, rgb, vPiso) {
  const { Fn, vec2, vec3, float, floor, fract, min, max, smoothstep, mix, step, sin, dot, distance, If, cameraPosition, positionWorld, dFdx, dFdy, length } = W
  const hPav = (p) => fract(sin(dot(p, vec2(41.3, 289.1))).mul(43758.5453))
  const b = ref(uCalamento.uBloco)
  const lc = max(b.x, float(0.02))
  const ac = max(b.y, float(0.02))
  const jc = b.z
  const dc = b.w
  const pc = positionWorld.xz
  const fiada = floor(pc.y.div(ac))
  const alt = fract(fiada.mul(0.5)).mul(2.0)
  const qc = vec2(pc.x.div(lc).add(alt.mul(dc)), pc.y.div(ac))
  const iqc = floor(qc)
  const fqc = fract(qc)
  const borda = min(min(fqc.x, fqc.oneMinus()).mul(lc), min(fqc.y, fqc.oneMinus()).mul(ac))
  const pedra = smoothstep(jc.mul(0.5), jc.mul(0.5).add(0.012), borda)
  const tomc = hPav(iqc.add(3.1))
  const baseP = mix(rgb, vec3(dot(rgb, vec3(0.3, 0.59, 0.11))).mul(vec3(1.02, 0.98, 0.93)), 0.92)
  const c = baseP.mul(mix(0.80, 1.12, tomc)).mul(mix(vec3(1.0), vec3(1.06, 0.97, 0.88), step(0.80, hPav(iqc.add(9.7)))))
  c.mulAssign(float(1.0).add(smoothstep(jc, jc.mul(3.0), borda).mul(0.08)).sub(0.05))
  const junta = mix(c.mul(0.45), vec3(0.70, 0.60, 0.46), 0.45)
  c.assign(mix(junta, c, pedra))
  const media = mix(baseP, vec3(0.60, 0.58, 0.54), 0.6)
  return Fn(() => {
    // o tamanho do pixel no chão fica fora do If (o WGSL recusa derivada dentro de condição)
    const fwCal = max(length(dFdx(positionWorld.xz)), length(dFdy(positionWorld.xz))).toVar()
    // (a média do desenho, não o cinza claro de longe: o cinza no lugar das fiadas estourava de branco ao meio-dia)
    const longe = float(1.0).sub(smoothstep(60.0, 200.0, distance(cameraPosition, positionWorld)))
    const nitida = float(1.0).sub(smoothstep(0.25, 0.6, fwCal.div(min(lc, ac))))
    const mediaDesenho = mix(baseP.mul(0.93), mix(baseP.mul(0.42), vec3(0.70, 0.60, 0.46), 0.45), W.clamp(jc.mul(2.0).div(min(lc, ac)), 0.0, 0.6))
    If(vPiso.greaterThan(0.01), () => {
      rgb.assign(mix(rgb, mix(media, mix(mediaDesenho, c, nitida), longe), vPiso))
    })
    return rgb
  })()
}
