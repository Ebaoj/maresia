// O chão da cidade de 1932: o que o chão é em cada ponto.
//
// A planta oficial (a camada "Evolucao Urbana 1932" da Prefeitura) diz onde
// era rua e onde era lote. O jogo usa isso para pintar o chão como era: a
// rua e terra batida, com o rodeiro da carroça no meio; o quintal atrás das
// casas e terra com mato ralo; e a areia fica só na praia e nas dunas.
//
// Este arquivo e o sistema: a classificação do ponto (rua, quintal, mato), o
// campo da rua (a posição na rua, que dá o rodeiro) e a distância real até a
// praça (que dá o calçamento do Centro).
//
// O campo da rua sai de uma transformada de distância sobre a grade de
// ocupação: para cada célula de rua, quão longe ela está da borda da rua.
// A crista (os pontos mais distantes da borda) é o meio da rua; a distância
// até ela, dividida pela meia-largura, dá a posição normalizada: 0 no meio
// da rua, 1 na borda. E o shader usa essa posição para desenhar o rodeiro
// da carroça e a poeira do meio da rua.
//
// A escala do mapa muda (a Praça do Ferreira está em 1:1, o resto do mapa
// está comprimido), então a posição normalizada é o que vale: ela é a mesma
// perto e longe, e o rodeiro aparece do mesmo jeito na rua larga e na
// comprida.

import { LON_POR_X, LAT_POR_Z } from './fortaleza1932.js'
import { gradeOcupacao1932, OCUPA_RUA, OCUPA_LOTE } from './ocupacao1932.js'

export const CHAO_RUA = 1
export const CHAO_QUINTAL = 2
export const CHAO_MATO = 3

// A Praça do Ferreira: o centro calçado de 1932 é a distância real até ela.
const PRACA_LON = -38.5276
const PRACA_LAT = -3.7275
const METRO_POR_GRAU_LAT = 110574
const METRO_POR_GRAU_LON = 111320 * Math.cos((PRACA_LAT * Math.PI) / 180)

const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

// os campos montados por calcularChao1932()
let classe = null
let rota = null // a posição na rua: 0 no meio, 1 na borda; -1 fora da rua
let nx = 0
let nz = 0
let x0 = 0
let z0 = 0
let cel = 3
let resumo = null

function indice(x, z) {
  const i = Math.floor((x - x0) / cel)
  const j = Math.floor((z - z0) / cel)
  if (i < 0 || j < 0 || i >= nx || j >= nz) return -1
  return j * nx + i
}

// ---------------------------------------------------------------- distancia
// A transformada de distância exata (Felzenszwalb e Huttenlocher): a distancia
// de cada célula até a mais próxima que está fora da máscara. Uma passada em
// cada linha e uma em cada coluna.
function edt1d(f, n, d, v, z) {
  let k = 0
  v[0] = 0
  z[0] = -1e20
  z[1] = 1e20
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    while (s <= z[k]) {
      k--
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
    }
    k++
    v[k] = q
    z[k] = s
    z[k + 1] = 1e20
  }
  k = 0
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++
    const dq = q - v[k]
    d[q] = dq * dq + f[v[k]]
  }
}

// a distância (ao quadrado) de cada célula até a mais próxima fora da máscara
function distanciaExata(mascara, largura, altura) {
  const maior = Math.max(largura, altura)
  const f = new Float64Array(maior)
  const d = new Float64Array(maior)
  const v = new Int32Array(maior)
  const z = new Float64Array(maior + 1)
  const saida = new Float64Array(largura * altura)
  for (let j = 0; j < altura; j++) {
    for (let i = 0; i < largura; i++) f[i] = mascara[j * largura + i] ? 0 : 1e20
    edt1d(f, largura, d, v, z)
    for (let i = 0; i < largura; i++) saida[j * largura + i] = d[i]
  }
  for (let i = 0; i < largura; i++) {
    for (let j = 0; j < altura; j++) f[j] = saida[j * largura + i]
    edt1d(f, altura, d, v, z)
    for (let j = 0; j < altura; j++) saida[j * largura + i] = d[j]
  }
  return saida
}

// ------------------------------------------------------------------- o chão
// Monta os campos do chão. Chamar depois de carregarOcupacao1932 (a planta de
// 1932 diz onde era rua).
export function calcularChao1932() {
  const grade = gradeOcupacao1932()
  if (!grade) return null
  return montarChao1932(grade.classe, grade.nx, grade.nz, grade.x0, grade.z0, grade.passo)
}

// O mesmo, a partir de uma grade de ocupação qualquer (o teste monta uma rua
// de mentira e confere a posição na rua).
export function montarChao1932(gradeClasse, gradeNx, gradeNz, gradeX0, gradeZ0, gradeCel) {
  classe = gradeClasse
  nx = gradeNx
  nz = gradeNz
  x0 = gradeX0
  z0 = gradeZ0
  cel = gradeCel
  const n = nx * nz

  const ruas = new Uint8Array(n)
  let nRuas = 0
  let nLotes = 0
  for (let k = 0; k < n; k++) {
    if (classe[k] === OCUPA_RUA) { ruas[k] = 1; nRuas++ } else if (classe[k] >= OCUPA_LOTE) nLotes++
  }

  // a distância de cada célula de rua até a borda da rua (em células de jogo):
  // a transformada mede a distância até a célula mais próxima que NÃO é rua
  const foraDaRua = new Uint8Array(n)
  for (let k = 0; k < n; k++) foraDaRua[k] = ruas[k] ? 0 : 1
  const d2 = distanciaExata(foraDaRua, nx, nz)
  const dBorda = new Float32Array(n)
  for (let k = 0; k < n; k++) dBorda[k] = Math.sqrt(d2[k])

  // a crista da rua: as células mais distantes da borda (o meio da rua)
  const crista = new Uint8Array(n)
  for (let j = 1; j < nz - 1; j++) {
    for (let i = 1; i < nx - 1; i++) {
      const k = j * nx + i
      if (!ruas[k]) continue
      const d = dBorda[k]
      let maior = true
      for (let b = 0; b < 8; b++) {
        const di = [1, -1, 0, 0, 1, 1, -1, -1][b]
        const dj = [0, 0, 1, -1, 1, -1, 1, -1][b]
        if (dBorda[(j + dj) * nx + (i + di)] > d + 1e-6) { maior = false; break }
      }
      if (maior) crista[k] = 1
    }
  }

  // a distância de cada célula até a crista (chamfer 3-4, duas passadas)
  const r2 = 1
  const rd = Math.SQRT2
  const rho = new Float32Array(n).fill(Infinity)
  for (let k = 0; k < n; k++) if (crista[k]) rho[k] = 0
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i
      let r = rho[k]
      if (i > 0) r = Math.min(r, rho[k - 1] + r2)
      if (j > 0) r = Math.min(r, rho[k - nx] + r2)
      if (i > 0 && j > 0) r = Math.min(r, rho[k - nx - 1] + rd)
      if (i < nx - 1 && j > 0) r = Math.min(r, rho[k - nx + 1] + rd)
      rho[k] = r
    }
  }
  for (let j = nz - 1; j >= 0; j--) {
    for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i
      let r = rho[k]
      if (i < nx - 1) r = Math.min(r, rho[k + 1] + r2)
      if (j < nz - 1) r = Math.min(r, rho[k + nx] + r2)
      if (i < nx - 1 && j < nz - 1) r = Math.min(r, rho[k + nx + 1] + rd)
      if (i > 0 && j < nz - 1) r = Math.min(r, rho[k + nx - 1] + rd)
      rho[k] = r
    }
  }

  // a posição na rua: 0 no meio, 1 na borda; -1 fora da rua
  // (a transformada de distância conta em células: a borda da rua está a
  // meia célula do centro da célula da borda, por isso o -0.5)
  rota = new Float32Array(n).fill(-1)
  for (let k = 0; k < n; k++) {
    if (!ruas[k]) continue
    const meia = rho[k] + dBorda[k] - 0.5
    rota[k] = meia > 0.05 ? Math.min(1, rho[k] / meia) : 0
  }

  resumo = { celulas: n, ruas: nRuas, lotes: nLotes, largura: nx, altura: nz, passo: cel }
  return resumo
}

// o que o chão é aqui: rua, quintal (lote) ou mato (terreno vazio)
export function tipoChao1932(x, z) {
  const k = indice(x, z)
  if (k < 0 || !classe) return CHAO_MATO
  const c = classe[k]
  if (c === OCUPA_RUA) return CHAO_RUA
  if (c >= OCUPA_LOTE) return CHAO_QUINTAL
  return CHAO_MATO
}

// a posição na rua (0 no meio, 1 na borda); -1 fora da rua
export function posicaoNaRua1932(x, z) {
  const k = indice(x, z)
  if (k < 0 || !rota) return -1
  return rota[k]
}

// a distância real (em metros) até a Praça do Ferreira
export function distRealDaPraca(x, z) {
  const lon = LON_POR_X(x)
  const lat = LAT_POR_Z(z)
  return Math.hypot((lon - PRACA_LON) * METRO_POR_GRAU_LON, (lat - PRACA_LAT) * METRO_POR_GRAU_LAT)
}

// o quanto o Centro é calçado: 1 no miolo, 0 fora do raio
export function maskCentro1932(x, z, raio, borda) {
  return 1 - suave(raio - borda, raio, distRealDaPraca(x, z))
}

// os números do chão (para o console e para os testes)
export function resumoChao1932() {
  return resumo
}

// a grade inteira do chão: a classe de cada célula e a posição na rua
export function gradeChao1932() {
  if (!classe || !rota) return null
  return { classe, rota, nx, nz, x0, z0, passo: cel }
}
