// Troca de nível de detalhe por pontilhado preso ao mundo (27/10/2026, visual/correcoes; docs/relatorio-visual.md 1.6).
// Antes a casa detalhada virava a caixa de fachada pintada (e a árvore cheia virava a copa simples) num quadro: um
// "pop" de uma fileira inteira. Agora, numa faixa da distância [D - w, D + w], as duas versões são desenhadas e cada
// fragmento fica numa ou na outra por um sorteio preso à célula do mundo (cfg.mundo.dissolveCelula, 5 cm),
// complementar: a versão de perto fica onde h >= a, a de longe onde h < a, com a = suavização da distância dentro da
// faixa. A distância é a mesma que o jogo já usava para trocar, medida da ÂNCORA do objeto, não do fragmento:
//   modo 'copia' (árvores): da câmera ao centro da cópia (a árvore inteira se dissolve junto);
//   modo 'bloco' (casas): da câmera ao retângulo do bloco de TAM m em que a âncora cai (o bloco inteiro junto; a
//     casa detalhada tem a malha centrada no bloco, a caixa é uma cópia com o centro na casa).
// A faixa anda com a câmera: a troca acontece aos poucos enquanto se anda (2w metros), e a estabilização no tempo
// transforma o pontilhado fino em transparência. Preso ao mundo e não à tela: pontilhado de tela vira "porta de box"
// quando a câmera anda. Só o passe de cor recorta: a sombra (em cache, parada) fica com as duas versões na faixa.
//
// Uso: material.userData.dissolver = { lado: -1 (perto) | 1 (longe), faixa, modo } antes de compilar; pintar()
// (materiais.js) põe o GLSL e o MaterialPintado (render/arcane-tsl.js) o TSL.

import * as THREE from 'three'

// uma faixa por sistema: (D, w, célula do pontilhado, tamanho do bloco)
export const faixasDissolver = {
  arvores: { value: new THREE.Vector4(90, 8, 0.05, 96) },
  casas: { value: new THREE.Vector4(70, 6, 0.05, 96) },
}

export function marcarDissolver(mat, lado, faixa, modo = 'copia') {
  mat.userData.dissolver = { lado, faixa, modo }
  return mat
}

export const GLSL_DISSOLVER_VERT = /* glsl */ `
flat varying vec3 vAncoraD;
`
export const GLSL_ANCORA = /* glsl */ `
  #if defined(USE_INSTANCING)
    vAncoraD = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #elif defined(USE_BATCHING)
    vAncoraD = (modelMatrix * batchingMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #else
    vAncoraD = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  #endif
`
// hash13 de Dave Hoskins (sem seno: a célula do mundo passa de 80 mil e o sin perde precisão na placa)
export const GLSL_DISSOLVER = /* glsl */ `
uniform vec4 uDissolveFaixa;
flat varying vec3 vAncoraD;
float hashDissolve(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
`
// lado: -1 a versão de perto, 1 a de longe
export const glslRecorte = (lado, modo) => /* glsl */ `
  {
    ${modo === 'bloco'
    ? `vec2 b0D = floor(vAncoraD.xz / uDissolveFaixa.w) * uDissolveFaixa.w;
    float dD = length(max(max(b0D - cameraPosition.xz, vec2(0.0)), cameraPosition.xz - (b0D + uDissolveFaixa.w)));`
    : 'float dD = distance(cameraPosition, vAncoraD);'}
    float aD = smoothstep(uDissolveFaixa.x - uDissolveFaixa.y, uDissolveFaixa.x + uDissolveFaixa.y, dD);
    float hD = hashDissolve(floor(vPMundo / max(uDissolveFaixa.z, 0.005)));
    if (${lado > 0 ? 'hD >= aD' : 'hD < aD'}) discard;
  }
`

// TSL: o mesmo recorte; devolve o nó booleano "fica". ancora: vec3 do mundo (varying), posicaoMundo: do fragmento
export function tslFica(W, ref, dissolver, ancora, posicaoMundo) {
  const { vec2, vec3, floor, fract, dot, max, smoothstep, distance, length, cameraPosition } = W
  const f = ref(dissolver.faixa)
  let d
  if (dissolver.modo === 'bloco') {
    const b0 = floor(ancora.xz.div(f.w)).mul(f.w)
    const c = cameraPosition.xz
    d = length(max(max(b0.sub(c), vec2(0.0)), c.sub(b0.add(f.w))))
  } else d = distance(cameraPosition, ancora)
  const a = smoothstep(f.x.sub(f.y), f.x.add(f.y), d)
  let p3 = fract(floor(posicaoMundo.div(max(f.z, 0.005))).mul(0.1031))
  p3 = p3.add(dot(p3, vec3(p3.z, p3.y, p3.x).add(31.32)))
  const h = fract(p3.x.add(p3.y).mul(p3.z))
  return dissolver.lado > 0 ? h.lessThan(a) : h.greaterThanEqual(a)
}

// a mesma conta em JavaScript (testes): a fração a da faixa para uma distância d, e o sorteio da célula
export function fracaoFaixa(faixa, d) {
  const [D, w] = faixa
  const x = Math.min(1, Math.max(0, (d - (D - w)) / (2 * w)))
  return x * x * (3 - 2 * x)
}
export function sorteioCelula(p, cel) {
  const fr = (v) => v - Math.floor(v)
  let q = p.map((v) => fr(Math.floor(v / Math.max(cel, 0.005)) * 0.1031))
  const d = q[0] * (q[2] + 31.32) + q[1] * (q[1] + 31.32) + q[2] * (q[0] + 31.32)
  q = q.map((v) => v + d)
  return fr((q[0] + q[1]) * q[2])
}
// distância do modo 'bloco': da câmera (x, z) ao retângulo do bloco da âncora
export function distanciaBloco(tam, ancora, cam) {
  const bx = Math.floor(ancora[0] / tam) * tam, bz = Math.floor(ancora[2] / tam) * tam
  return Math.hypot(Math.max(bx - cam[0], 0, cam[0] - (bx + tam)), Math.max(bz - cam[2], 0, cam[2] - (bz + tam)))
}
