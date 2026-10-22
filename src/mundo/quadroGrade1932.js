// O quadro da grade de Herbster e a escala do mapa de 1932 (o campo de deslocamento).
//
// Desde 22/10/2026 (decisão do Joabe: o centro histórico inteiro e o Campo do Urubu em 1:1, compressão só
// onde há pouca rua) a escala NÃO é mais separável. A de antes comprimia u e v (os eixos da grade) cada um
// com a sua curva, e cada zona 1:1 virava uma FAIXA que atravessava o mapa inteiro: dentro da faixa a mesma
// rua ficava até 3 vezes mais larga que fora, e as casas eram espremidas na borda dela (docs/mapa-1932.md,
// v16). Agora o mapa é um campo contínuo: cada nó de uma malha de 100 m (no quadro da grade, metros de
// verdade) tem a sua posição no jogo, calculada fora do navegador por docs/mapa-1932-escala.py (uma
// otimização sem dobra; as zonas são corpos rígidos, em 1:1 por construção). Aqui a malha é lida e
// interpolada com B-spline cúbica (C2: a escala é contínua, sem quina nem degrau).
//
// O quadro: u corre ao longo da rua lés-sudeste da grade (azimute 107,81) e v de travessia (nor-nordeste),
// em metros de verdade, com a origem na Praça do Ferreira. No jogo, U (ao longo da rua) e V (de travessia,
// crescendo para o sul) voltam para leste/sul: x = U·CU + V·SU, z = -U·SU + V·CU. Dentro das zonas U = u + a
// e V = -v + b: o jogo é a planta de verdade, em metros, com o norte para -z.
//
// A fachada do sistema - ll(), llInverso(), os limites do mundo, as escalas locais - está em
// src/mundo/escala1932.js.

import malha from './escala1932-malha.json'

// A grade de Herbster: as ruas do Centro correm a 107,8 graus de azimute (lés-sudeste) e a 17,8
// (nor-nordeste). O número sai da planta oficial: a média das testadas a menos de 600 m da Praça do
// Ferreira, ponderada pelo comprimento, com as duas famílias dobradas em 90 graus
// (testes/unidade/ruas-reais-retas.test.js confere). O ângulo guardado é o complemento, 90 - 17,81 =
// 72,19 graus, na convenção de sempre do código (rotation.y = -(90 - ANGULO_GRADE) leva o x local para a
// rua lés-sudeste).
export const ANGULO_GRADE = (72.19 * Math.PI) / 180

// metros por grau (a projeção plana local serve)
export const METRO_POR_GRAU_LAT = 110574
export const METRO_POR_GRAU_LON = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

const PRACA_LON = -38.5275014
const PRACA_LAT = -3.7274448
const M_LON = 111320 * Math.cos((PRACA_LAT * Math.PI) / 180)
const M_LAT = METRO_POR_GRAU_LAT

// o eixo u corre ao longo da rua da grade (lés-sudeste); o v, de travessia (nor-nordeste)
const PSI = ANGULO_GRADE - Math.PI / 2
export const CU = Math.cos(PSI)
export const SU = Math.sin(PSI)

const E0 = PRACA_LON * M_LON
const N0 = PRACA_LAT * M_LAT

// (lon, lat) -> (u, v) em metros de verdade, relativos à praça
export function gradeDe(lon, lat) {
  const e = lon * M_LON - E0
  const n = lat * M_LAT - N0
  return [e * CU + n * SU, -e * SU + n * CU]
}

// (u, v) -> (lon, lat)
export function geoDe(u, v) {
  const e = u * CU - v * SU + E0
  const n = u * SU + v * CU + N0
  return [e / M_LON, n / M_LAT]
}

// o mapa inteiro (a caixa de longitude e latitude que o mundo cobre)
export const CANTOS = [
  [-38.612, -3.77], [-38.44, -3.77], [-38.44, -3.688], [-38.612, -3.688],
]

// ---------- a malha (docs/mapa-1932-escala.py) ----------
const { u0: MU0, v0: MV0, passo: H, nu: NU, nv: NV } = malha
const NOS_U = Float64Array.from(malha.U, (c) => c / 100)
const NOS_V = Float64Array.from(malha.V, (c) => c / 100)
export const ZONAS_1A1 = malha.zonas

// Os pesos da malha: B-spline cúbica uniforme (C2, e a derivada é a média ponderada das diferenças entre
// nós vizinhos: onde a malha cresce de nó em nó, a interpolação cresce entre eles, sem a ultrapassagem do
// Catmull-Rom, que dobrava o mapa onde a compressão muda depressa). Ela não passa pelos nós, mas reproduz a
// reta: dentro das zonas 1:1 (4 nós de cada lado na zona) a escala é 1 exata.
function pesos(t, w, dw) {
  const s = 1 - t
  const t2 = t * t
  const t3 = t2 * t
  w[0] = (s * s * s) / 6
  w[1] = (3 * t3 - 6 * t2 + 4) / 6
  w[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6
  w[3] = t3 / 6
  dw[0] = -(s * s) / 2
  dw[1] = (3 * t2 - 4 * t) / 2
  dw[2] = (-3 * t2 + 2 * t + 1) / 2
  dw[3] = t2 / 2
}
// Catmull-Rom (passa pelos nós): só para a tabela da volta, que guarda a resposta exata em cada nó
function pesosCR(t, w, dw) {
  const t2 = t * t
  const t3 = t2 * t
  w[0] = 0.5 * (-t3 + 2 * t2 - t)
  w[1] = 0.5 * (3 * t3 - 5 * t2 + 2)
  w[2] = 0.5 * (-3 * t3 + 4 * t2 + t)
  w[3] = 0.5 * (t3 - t2)
  dw[0] = 0.5 * (-3 * t2 + 4 * t - 1)
  dw[1] = 0.5 * (9 * t2 - 10 * t)
  dw[2] = 0.5 * (-9 * t2 + 8 * t + 1)
  dw[3] = 0.5 * (3 * t2 - 2 * t)
}
const wu = new Float64Array(4)
const dwu = new Float64Array(4)
const wv = new Float64Array(4)
const dwv = new Float64Array(4)
const SAIDA = new Float64Array(6)

// a malha num ponto (u, v): U, V e as quatro derivadas (dU/du, dU/dv, dV/du, dV/dv). Fora da malha, a
// continuação linear pela borda (o mapa jogável fica bem dentro dela)
function amostra(u, v, s = SAIDA) {
  let fu = (u - MU0) / H
  let fv = (v - MV0) / H
  // a borda: o ponto é levado para dentro e o resto anda em linha reta pela derivada de lá
  const fuC = Math.min(NU - 2.000001, Math.max(1, fu))
  const fvC = Math.min(NV - 2.000001, Math.max(1, fv))
  const extraU = (fu - fuC) * H
  const extraV = (fv - fvC) * H
  fu = fuC
  fv = fvC
  const i = Math.floor(fv)
  const j = Math.floor(fu)
  pesos(fu - j, wu, dwu)
  pesos(fv - i, wv, dwv)
  let U = 0, V = 0, Uu = 0, Uv = 0, Vu = 0, Vv = 0
  for (let a = 0; a < 4; a++) {
    const linha = (i - 1 + a) * NU + j - 1
    let su = 0, sv = 0, du = 0, dv = 0
    for (let b = 0; b < 4; b++) {
      const nu = NOS_U[linha + b]
      const nv = NOS_V[linha + b]
      su += wu[b] * nu
      sv += wu[b] * nv
      du += dwu[b] * nu
      dv += dwu[b] * nv
    }
    U += wv[a] * su
    V += wv[a] * sv
    Uu += wv[a] * du
    Vu += wv[a] * dv
    Uv += dwv[a] * su
    Vv += dwv[a] * sv
  }
  Uu /= H; Uv /= H; Vu /= H; Vv /= H
  s[0] = U + Uu * extraU + Uv * extraV
  s[1] = V + Vu * extraU + Vv * extraV
  s[2] = Uu; s[3] = Uv; s[4] = Vu; s[5] = Vv
  return s
}

// ---------- o jogo ----------
// (lon, lat) -> (x, z) do jogo, sem a deslocação do mundo
export function gradeJogo(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  const s = amostra(u, v)
  return [s[0] * CU + s[1] * SU, -s[0] * SU + s[1] * CU]
}

// A derivada da transformada num ponto: a matriz que leva um passo de verdade (leste, norte, em metros)
// para o passo do jogo (dx, dz). [[dx/de, dx/dn], [dz/de, dz/dn]]
export function jacobianoGeo(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  const s = amostra(u, v)
  // (u, v) = R (e, n), com R = [[CU, SU], [-SU, CU]]; (x, z) = R (U, V)
  const a = s[2], b = s[3], c = s[4], d = s[5]
  // M = J R: o passo de verdade levado para (U, V)
  const m00 = a * CU - b * SU
  const m01 = a * SU + b * CU
  const m10 = c * CU - d * SU
  const m11 = c * SU + d * CU
  return [
    [CU * m00 + SU * m10, CU * m01 + SU * m11],
    [-SU * m00 + CU * m10, -SU * m01 + CU * m11],
  ]
}

// a derivada no quadro da grade (para quem pensa em u e v): [[dU/du, dU/dv], [dV/du, dV/dv]]
export function jacobianoGrade(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  const s = amostra(u, v)
  return [[s[2], s[3]], [s[4], s[5]]]
}

// ---------- os limites do mapa no jogo ----------
// A caixa do mapa em coordenadas de jogo (sem a deslocação do mundo): a borda da caixa de longitude e
// latitude é curva no jogo, então ela é amostrada inteira, não só os cantos.
export const CAIXA = (() => {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (let k = 0; k < 4; k++) {
    const [la, aa] = CANTOS[k]
    const [lb, ab] = CANTOS[(k + 1) % 4]
    for (let i = 0; i <= 400; i++) {
      const t = i / 400
      const [x, z] = gradeJogo(la + (lb - la) * t, aa + (ab - aa) * t)
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (z < z0) z0 = z
      if (z > z1) z1 = z
    }
  }
  return { x0, x1, z0, z1 }
})()

// ---------- a volta ----------
// A inversa: do ponto do jogo de volta para (u, v). Uma tabela no quadro (U, V) do jogo, a cada PASSO_INV
// unidades, guarda o (u, v) de cada nó (Newton sobre a malha, uma vez); a consulta interpola a tabela com
// Catmull-Rom. O terreno e a ocupação perguntam isso milhões de vezes ao montar.
const PASSO_INV = 12
let INV = null
function newton(U, V, u, v) {
  for (let k = 0; k < 30; k++) {
    const s = amostra(u, v)
    const ru = s[0] - U
    const rv = s[1] - V
    if (Math.abs(ru) + Math.abs(rv) < 1e-7) break
    const det = s[2] * s[5] - s[3] * s[4]
    let du = (s[5] * ru - s[3] * rv) / det
    let dv = (-s[4] * ru + s[2] * rv) / det
    // passo limitado: longe da raiz a derivada local engana
    const m = Math.hypot(du, dv)
    if (m > 400) { du *= 400 / m; dv *= 400 / m }
    u -= du
    v -= dv
  }
  return [u, v]
}
function tabelaInversa() {
  if (INV) return INV
  // a caixa do mundo, no quadro (U, V): os quatro cantos da caixa de jogo girados de volta
  const cantos = [[CAIXA.x0, CAIXA.z0], [CAIXA.x1, CAIXA.z0], [CAIXA.x1, CAIXA.z1], [CAIXA.x0, CAIXA.z1]]
    .map(([x, z]) => [x * CU - z * SU, x * SU + z * CU])
  const folga = 4 * PASSO_INV
  const A0 = Math.min(...cantos.map((c) => c[0])) - folga
  const A1 = Math.max(...cantos.map((c) => c[0])) + folga
  const B0 = Math.min(...cantos.map((c) => c[1])) - folga
  const B1 = Math.max(...cantos.map((c) => c[1])) + folga
  const na = Math.ceil((A1 - A0) / PASSO_INV) + 1
  const nb = Math.ceil((B1 - B0) / PASSO_INV) + 1
  const tu = new Float64Array(na * nb)
  const tv = new Float64Array(na * nb)
  // o chute de cada nó é a resposta do vizinho (a tabela é varrida em fila)
  let chute = newton(A0, B0, 0, 0)
  let inicioLinha = chute
  for (let ib = 0; ib < nb; ib++) {
    chute = newton(A0, B0 + ib * PASSO_INV, inicioLinha[0], inicioLinha[1])
    inicioLinha = chute
    for (let ia = 0; ia < na; ia++) {
      chute = newton(A0 + ia * PASSO_INV, B0 + ib * PASSO_INV, chute[0], chute[1])
      tu[ib * na + ia] = chute[0]
      tv[ib * na + ia] = chute[1]
    }
  }
  INV = { A0, B0, na, nb, tu, tv, fino: null }
  // onde a compressão é forte (o vazio, o mar longe) a tabela de 12 un não basta: a célula cuja volta erra
  // mais de 2 cm no meio é marcada, e a consulta nela ganha um passo de Newton
  const fino = new Uint8Array(na * nb)
  for (let ib = 1; ib < nb - 2; ib++) {
    for (let ia = 1; ia < na - 2; ia++) {
      const U = A0 + (ia + 0.5) * PASSO_INV
      const V = B0 + (ib + 0.5) * PASSO_INV
      const [u, v] = inversaUV(U, V)
      const s = amostra(u, v)
      if (Math.abs(s[0] - U) + Math.abs(s[1] - V) > 0.02) fino[ib * na + ia] = 1
    }
  }
  INV.fino = fino
  return INV
}
const iwa = new Float64Array(4)
const idwa = new Float64Array(4)
const iwb = new Float64Array(4)
const idwb = new Float64Array(4)
// (U, V) do jogo -> (u, v), pela tabela
function inversaUV(U, V) {
  const t = tabelaInversa()
  const fa = Math.min(t.na - 2.000001, Math.max(1, (U - t.A0) / PASSO_INV))
  const fb = Math.min(t.nb - 2.000001, Math.max(1, (V - t.B0) / PASSO_INV))
  const ia = Math.floor(fa)
  const ib = Math.floor(fb)
  pesosCR(fa - ia, iwa, idwa)
  pesosCR(fb - ib, iwb, idwb)
  let u = 0, v = 0
  for (let a = 0; a < 4; a++) {
    const linha = (ib - 1 + a) * t.na + ia - 1
    let su = 0, sv = 0
    for (let b = 0; b < 4; b++) {
      su += iwa[b] * t.tu[linha + b]
      sv += iwa[b] * t.tv[linha + b]
    }
    u += iwb[a] * su
    v += iwb[a] * sv
  }
  return [u, v]
}

// (x, z) do jogo (sem a deslocação do mundo) -> (lon, lat)
export function jogoGrade(x, z) {
  const U = x * CU - z * SU
  const V = x * SU + z * CU
  const [u, v] = inversaUV(U, V)
  const t = INV
  if (t.fino) {
    const ia = Math.floor((U - t.A0) / PASSO_INV)
    const ib = Math.floor((V - t.B0) / PASSO_INV)
    if (ia >= 0 && ib >= 0 && ia < t.na && ib < t.nb && t.fino[ib * t.na + ia]) return geoDe(...newton(U, V, u, v))
  }
  return geoDe(u, v)
}

// a mesma volta, exata (um passo de Newton sobre a tabela): para quem confere milímetro
export function jogoGradeExato(x, z) {
  const U = x * CU - z * SU
  const V = x * SU + z * CU
  const [u0, v0] = inversaUV(U, V)
  const [u, v] = newton(U, V, u0, v0)
  return geoDe(u, v)
}

// o norte de verdade no jogo, na Praça do Ferreira (dentro do centro em 1:1 é o -z)
export function norteJogo() {
  const a = gradeJogo(PRACA_LON, PRACA_LAT)
  const b = gradeJogo(PRACA_LON, PRACA_LAT + 0.001)
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const c = Math.hypot(dx, dz) || 1
  return [dx / c, dz / c]
}
