// A escala do mapa de 1932: a longitude/latitude vira coordenada de jogo por um campo contínuo
// (src/mundo/quadroGrade1932.js, calculado por docs/mapa-1932-escala.py), com o centro histórico e o Campo
// do Urubu em tamanho real (1:1) e o resto comprimido onde há pouca rua para entortar.
//
// Este arquivo é a fachada do sistema: ll(), llInverso(), os limites do mundo e as consultas de escala local
// que o resto do motor usa. Toda escala local sai da derivada da transformada (a matriz J que leva um passo de
// verdade, em metros leste/norte, para o passo do jogo): fora das zonas ela não é mais diagonal num eixo fixo,
// então nada aqui supõe "x é longitude" ou "u é rua".

import {
  ANGULO_GRADE, CAIXA, geoDe, gradeDe, gradeJogo, jacobianoGeo, jacobianoGrade, jogoGrade, jogoGradeExato,
  METRO_POR_GRAU_LAT, METRO_POR_GRAU_LON, norteJogo, ZONAS_1A1,
} from './quadroGrade1932.js'
import { pchip } from './pchip1932.js'

export { pchip, ANGULO_GRADE, METRO_POR_GRAU_LAT, METRO_POR_GRAU_LON, norteJogo, geoDe, gradeDe, ZONAS_1A1 }

// O deslocamento do mundo: a caixa do mapa começa em (0, 0).
export const DESLOC = { x: CAIXA.x0, z: CAIXA.z0 }

// lon/lat -> coordenada de jogo
export function ll(lon, lat) {
  const [x, z] = gradeJogo(lon, lat)
  return [x - DESLOC.x, z - DESLOC.z]
}

// coordenada de jogo -> lon/lat (a volta da transformada, pela tabela: erro de milímetros)
export function llInverso(x, z) {
  return jogoGrade(x + DESLOC.x, z + DESLOC.z)
}

// a mesma volta, com um passo de Newton a mais (para os testes que conferem milímetro)
export function llInversoExato(x, z) {
  return jogoGradeExato(x + DESLOC.x, z + DESLOC.z)
}

// a inversa das perguntas em massa (o raster do minimapa): a mesma tabela
export const llInversoRapido = llInverso

// os limites do mundo em coordenadas de jogo: a caixa do mapa (-38,612 a -38,44 de longitude, -3,77 a
// -3,688 de latitude) levada para o jogo. A grade do terreno tem 3 m de passo.
export const LIMITES = {
  x0: 0,
  x1: CAIXA.x1 - CAIXA.x0,
  z0: 0,
  z1: CAIXA.z1 - CAIXA.z0,
  passo: 3,
}

// O fator da praça de antes: quantas unidades de jogo valia um metro de verdade no centro, na compressão de
// 2,74 vezes que vigorou até 21/10/2026 (K_X = 2,7605 ao longo da rua da grade, K_Z = 2,7260 de travessia).
// Ele ficou como a unidade das medidas que foram ajustadas no mundo comprimido (o passo do poste, o raio de
// um largo, a quadra da grade legada): "26 un" de lá são 26 × 2,74 metros de verdade.
export const K_PRACA_X = 2.7604818648844973
export const K_PRACA_Z = 2.7259614390298044
export const FATOR_PRACA = Math.sqrt(K_PRACA_X * K_PRACA_Z)

// a matriz J (passo de verdade em metros leste/norte -> passo do jogo) num ponto do jogo
function jacobianoJogo(x, z) {
  const [lon, lat] = llInverso(x, z)
  return jacobianoGeo(lon, lat)
}

// quantas unidades de jogo vale um metro de verdade (a média geométrica das duas direções)
function unPorMetro(J) {
  return Math.sqrt(Math.abs(J[0][0] * J[1][1] - J[0][1] * J[1][0]))
}

// quantos metros de verdade vale uma unidade de jogo em um ponto: 1 no centro histórico e no Campo do Urubu
// (1:1), mais nos bairros e no vazio comprimidos
export function metrosPorUn(x, z) {
  return 1 / unPorMetro(jacobianoJogo(x, z))
}

// O esticamento: quanto uma medida ajustada no mundo comprimido de antes (em "unidades da praça de antes")
// vale aqui, em unidades de jogo. 1 metro de verdade = 1/FATOR_PRACA dessas unidades; aqui, 1 metro vale
// unPorMetro unidades. Nas zonas 1:1 dá FATOR_PRACA (o mesmo de antes no miolo da praça); nos bairros
// comprimidos ~2,7 vezes, ~1; no vazio, menos que 1. Uma medida que vale metros de verdade continua valendo os
// mesmos metros em qualquer lugar do mapa (antes, fora da praça, ela valia mais metros quanto mais comprimido).
export function esticamento(lon, lat) {
  return FATOR_PRACA * unPorMetro(jacobianoGeo(lon, lat))
}

// o mesmo, em coordenada de jogo
export function esticamentoJogo(x, z) {
  return FATOR_PRACA * unPorMetro(jacobianoJogo(x, z))
}

// a escala local nos eixos do quadro da grade: quantas unidades de jogo vale um metro ao longo da rua (u) e
// de travessia (v, com o sinal: o v da grade cresce para o norte, o jogo para o sul)
export function escalaJogo(x, z) {
  const [lon, lat] = llInverso(x, z)
  const g = jacobianoGrade(lon, lat)
  return { u: Math.hypot(g[0][0], g[1][0]), v: -Math.hypot(g[0][1], g[1][1]) }
}

// a direção de verdade (leste/norte) levada para o jogo, em um ponto: uma normal da planta (medida em metros
// de verdade) vira a normal da tela
export function direcaoJogo(de, dn, x, z) {
  const J = jacobianoJogo(x, z)
  return [J[0][0] * de + J[0][1] * dn, J[1][0] * de + J[1][1] * dn]
}

// quantas unidades de jogo vale um metro de verdade, na direção de verdade (de, dn) - a profundidade de um
// lote, por exemplo
export function comprimentoJogo(de, dn, x, z) {
  const [gx, gz] = direcaoJogo(de, dn, x, z)
  return Math.hypot(gx, gz)
}

// o comprimento de verdade (em metros) de um trecho de jogo (dx, dz) em um ponto
export function metrosDoVao(dx, dz, x, z) {
  const J = jacobianoJogo(x, z)
  const det = J[0][0] * J[1][1] - J[0][1] * J[1][0]
  const de = (J[1][1] * dx - J[0][1] * dz) / det
  const dn = (-J[1][0] * dx + J[0][0] * dz) / det
  return Math.hypot(de, dn)
}

// o esticamento na direção de um vão (dx, dz do jogo): o mesmo esticamento, medido só ao longo do vão
export function esticamentoNoVao(dx, dz, x, z) {
  const c = Math.hypot(dx, dz) || 1
  return (FATOR_PRACA * c) / metrosDoVao(dx, dz, x, z)
}

// a anisotropia local: a razão entre a maior e a menor escala de um ponto (1 = a rua de verdade em qualquer
// direção tem a mesma escala; 2 = uma direção vale o dobro da outra)
export function anisotropiaJogo(x, z) {
  const J = jacobianoJogo(x, z)
  return anisotropiaDe(J)
}
export function anisotropiaGeo(lon, lat) {
  return anisotropiaDe(jacobianoGeo(lon, lat))
}
function anisotropiaDe(J) {
  const a = J[0][0], b = J[0][1], c = J[1][0], d = J[1][1]
  const s1 = a * a + b * b + c * c + d * d
  const det = Math.abs(a * d - b * c)
  const raiz = Math.sqrt(Math.max(0, s1 * s1 - 4 * det * det))
  const maior = Math.sqrt((s1 + raiz) / 2)
  const menor = Math.sqrt(Math.max(1e-30, (s1 - raiz) / 2))
  return maior / menor
}
export { jacobianoGeo }

// o ponto (lon, lat) cai numa zona em tamanho real? Devolve o nome da zona ou null (a zona exata, caixas e
// círculos: dentro dela a escala é 1 nos dois eixos)
export function zonaDe(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  for (const z of ZONAS_1A1) {
    for (const [a, b, c, d] of z.caixas) if (u >= a && u <= b && v >= c && v <= d) return z.nome
    for (const [cu, cv, r] of z.circulos || []) if (Math.hypot(u - cu, v - cv) <= r) return z.nome
  }
  return null
}
