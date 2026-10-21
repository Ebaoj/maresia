// A escala do mapa de 1932: a compressão suave da longitude/latitude para o
// jogo, com a Praça do Ferreira em tamanho real (1:1) e o resto do mapa
// comprimido como sempre.
//
// A compressão acontece no QUADRO DA GRADE (src/mundo/quadroGrade1932.js), e
// não em longitude/latitude: é isso que mantém as ruas da grade de Herbster
// retas no jogo. A compressão de sempre, separável em longitude e latitude,
// torcia a rua (0,4 grau na praça, 52 graus no oeste) e abria um leque.
//
// Este arquivo é a fachada do sistema: ll(), llInverso(), os limites do mundo
// e as consultas de escala local que o resto do motor usa.

import {
  ANGULO_GRADE, CAIXA, CU, SU, escalaBaseGrade, escalaGrade, esticamentoGrade,
  geoDe, gradeDe, gradeJogo, jogoGrade, K_U, K_V, METRO_POR_GRAU_LAT, METRO_POR_GRAU_LON,
  norteJogo,
} from './quadroGrade1932.js'
import { pchip } from './pchip1932.js'

export { pchip, ANGULO_GRADE, METRO_POR_GRAU_LAT, METRO_POR_GRAU_LON, norteJogo, geoDe, gradeDe }

// O deslocamento do mundo: a caixa do mapa começa em (0, 0).
export const DESLOC = { x: CAIXA.x0, z: CAIXA.z0 }

// lon/lat -> coordenada de jogo
export function ll(lon, lat) {
  const [x, z] = gradeJogo(lon, lat)
  return [x - DESLOC.x, z - DESLOC.z]
}

// coordenada de jogo -> lon/lat (a volta da transformada)
export function llInverso(x, z) {
  return jogoGrade(x + DESLOC.x, z + DESLOC.z)
}

// os limites do mundo em coordenadas de jogo: a caixa do mapa (a compressão
// vai de -38,612 a -38,44 de longitude e de -3,77 a -3,688 de latitude) mais
// o que a descompressão da praça ganhou. A grade do terreno tem 3 m de passo.
export const LIMITES = {
  x0: 0,
  x1: CAIXA.x1 - CAIXA.x0,
  z0: 0,
  z1: CAIXA.z1 - CAIXA.z0,
  passo: 3,
}

// o fator da praça (a escala da compressão no miolo, invertida): o miolo fica
// em 1:1 por construção, e não por número redondo
export const K_PRACA_X = K_U
export const K_PRACA_Z = K_V
export const FATOR_PRACA = Math.sqrt(K_U * K_V)

// A inversa rápida: uma tabela com o lon/lat de cada célula da caixa do mundo,
// interpolada nos cantos. A ocupacao e o minimapa perguntam a transformada
// milhões de vezes (uma por pixel), e a tabela sozinha custa menos que a busca
// binária das curvas.
const PASSO_INV = 4
let INVERSA = null
function tabelaInversa2D() {
  if (INVERSA) return INVERSA
  const nx = Math.ceil((LIMITES.x1 - LIMITES.x0) / PASSO_INV) + 2
  const nz = Math.ceil((LIMITES.z1 - LIMITES.z0) / PASSO_INV) + 2
  const lon = new Float32Array(nx * nz)
  const lat = new Float32Array(nx * nz)
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const [lo, la] = llInverso(LIMITES.x0 + i * PASSO_INV, LIMITES.z0 + j * PASSO_INV)
      lon[j * nx + i] = lo
      lat[j * nx + i] = la
    }
  }
  INVERSA = { nx, nz, lon, lat }
  return INVERSA
}

// o lon/lat de um ponto do jogo, pela tabela (erro de poucos centimetros)
export function llInversoRapido(x, z) {
  const t = tabelaInversa2D()
  const fx = (x - LIMITES.x0) / PASSO_INV
  const fz = (z - LIMITES.z0) / PASSO_INV
  if (fx < 0 || fz < 0 || fx > t.nx - 1.001 || fz > t.nz - 1.001) return llInverso(x, z)
  const i = fx | 0
  const j = fz | 0
  const rx = fx - i
  const rz = fz - j
  const k = j * t.nx + i
  const k2 = k + t.nx
  const l1 = t.lon[k] * (1 - rx) + t.lon[k + 1] * rx
  const l2 = t.lon[k2] * (1 - rx) + t.lon[k2 + 1] * rx
  const a1 = t.lat[k] * (1 - rx) + t.lat[k + 1] * rx
  const a2 = t.lat[k2] * (1 - rx) + t.lat[k2 + 1] * rx
  return [l1 * (1 - rz) + l2 * rz, a1 * (1 - rz) + a2 * rz]
}

// o quanto a praça descomprimiu a escala em um ponto (1 = fora da região
// descomprimida, o valor máximo é o próprio fator da praça)
export function esticamento(lon, lat) {
  return esticamentoGrade(lon, lat)
}

// o mesmo, em coordenada de jogo
export function esticamentoJogo(x, z) {
  const [lon, lat] = llInverso(x, z)
  return esticamentoGrade(lon, lat)
}

// a escala da compressão (unidades de jogo por metro), por eixo do quadro da
// grade, em coordenada de jogo
export function escalaJogo(x, z) {
  const [lon, lat] = llInverso(x, z)
  return escalaGrade(lon, lat)
}

// a escala da compressão de sempre (sem a descompressão da praça)
export function escalaBaseJogo(x, z) {
  const [lon, lat] = llInverso(x, z)
  return escalaBaseGrade(lon, lat)
}

// quantos metros de verdade vale uma unidade de jogo em um ponto: 1 no centro
// descomprimido (a praça esta em 1:1), ~0,125 na ponta do mapa, onde a
// compressao e de 8 vezes
export function metrosPorUn(x, z) {
  const e = escalaJogo(x, z)
  return 1 / Math.sqrt(Math.abs(e.u * e.v))
}

// a direção de verdade (leste/norte) levada para o jogo, em um ponto: uma
// normal da planta (medida em metros de verdade) vira a normal da tela
export function direcaoJogo(de, dn, x, z) {
  const [lon, lat] = llInverso(x, z)
  const e = escalaGrade(lon, lat)
  const du = de * CU + dn * SU
  const dv = -de * SU + dn * CU
  const dU = e.u * du
  const dV = e.v * dv
  return [dU * CU + dV * SU, -dU * SU + dV * CU]
}

// quantas unidades de jogo vale um metro de verdade, na direção de verdade
// (de, dn) - a profundidade de um lote, por exemplo
export function comprimentoJogo(de, dn, x, z) {
  const [gx, gz] = direcaoJogo(de, dn, x, z)
  return Math.hypot(gx, gz)
}

// quantos metros de verdade vale um passo do jogo (dx, dz) em um ponto
function metroDoPasso(dx, dz, du, dv) {
  // o passo do jogo, lido no quadro da grade
  const dU = dx * CU - dz * SU
  const dV = dx * SU + dz * CU
  // e de volta para o leste/norte, em metros
  const de = (dU / du) * CU - (dV / dv) * SU
  const dn = (dU / du) * SU + (dV / dv) * CU
  return Math.hypot(de, dn)
}

// o comprimento de verdade (em metros) de um trecho de jogo
export function metrosDoVao(dx, dz, x, z) {
  const [lon, lat] = llInverso(x, z)
  const e = escalaGrade(lon, lat)
  return metroDoPasso(dx, dz, e.u, e.v)
}

// o quanto o vao estica no caminho: perto da praca o x e o z escalam diferente,
// entao um vao na diagonal estica no meio do caminho
export function esticamentoNoVao(dx, dz, x, z) {
  const [lon, lat] = llInverso(x, z)
  const e = escalaGrade(lon, lat)
  const b = escalaBaseGrade(lon, lat)
  return (1 / metroDoPasso(dx, dz, e.u, e.v)) / (1 / metroDoPasso(dx, dz, b.u, b.v))
}
