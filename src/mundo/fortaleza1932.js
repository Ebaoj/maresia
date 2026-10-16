// Fortaleza de 1932 como DADO (docs/mapa-1932.md). Tudo entra em coordenadas reais (longitude,
// latitude) e passa por uma compressão suave e variável: ~3,4 vezes no centro, ~8 nas pontas.
// No jogo: x cresce para leste, z cresce para o sul (o mar fica em z negativo), 1 unidade = 1 m.
// O que é documentado e o que é hipótese está marcado no documento; aqui ficam só os números.

import lotesBrutos from './lotes1932.json'

// interpolação cúbica monótona (sem ondas nem quinas entre os pontos)
function pchip(xs, ys) {
  const n = xs.length
  const h = []
  const d = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    d.push((ys[i + 1] - ys[i]) / h[i])
  }
  const m = new Array(n).fill(0)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i])
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0])
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1])
    let i = 0
    while (i < n - 2 && xs[i + 1] < x) i++
    const t = (x - xs[i]) / h[i]
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]
  }
}

// compressão: longitude -> x e latitude -> z (mesmos nós do desenho docs/mapa-1932-gerar.py)
const fx = pchip([-38.612, -38.548, -38.535, -38.512, -38.495, -38.4745, -38.452, -38.44], [0, 700, 1000, 1760, 1960, 2180, 2440, 2560])
const fy = pchip([-3.77, -3.752, -3.736, -3.716, -3.705, -3.688], [1420, 1220, 1000, 340, 150, 0])
export const DESLOC = { x: 1220, z: 420 }
export function ll(lon, lat) {
  return [fx(lon) - DESLOC.x, fy(lat) - DESLOC.z]
}

// costa de 1932 (hipótese guiada pela borda norte dos lotes; refinar sobre a planta de 1931-1932)
const COSTA = [
  [-38.64, -3.682], [-38.612, -3.688], [-38.603, -3.6915], [-38.5995, -3.6945], [-38.597, -3.693], [-38.591, -3.6955],
  [-38.584, -3.6985], [-38.576, -3.7015], [-38.568, -3.7045], [-38.561, -3.7072], [-38.554, -3.7102], [-38.547, -3.7128],
  [-38.541, -3.715], [-38.536, -3.7165], [-38.531, -3.7182], [-38.5275, -3.7186], [-38.5262, -3.7172], [-38.5248, -3.718],
  [-38.521, -3.7178], [-38.517, -3.7176], [-38.512, -3.7188], [-38.506, -3.72], [-38.499, -3.7212], [-38.492, -3.7216],
  [-38.486, -3.7208], [-38.481, -3.7186], [-38.4775, -3.7158], [-38.4745, -3.7136], [-38.471, -3.714], [-38.466, -3.7168],
  [-38.459, -3.721], [-38.452, -3.726], [-38.444, -3.732], [-38.436, -3.739],
]
// largura da faixa de areia (m de jogo) ao longo da costa, de oeste para leste
const PRAIA = [[-38.62, 34], [-38.595, 30], [-38.57, 28], [-38.545, 22], [-38.532, 22], [-38.527, 10], [-38.522, 34], [-38.515, 40], [-38.5, 44], [-38.48, 38], [-38.46, 52], [-38.44, 52]]
// rio Ceará (com meandros), da foz para o sul
const RIO_CEARA = [[-38.5975, -3.6935], [-38.6005, -3.7], [-38.596, -3.707], [-38.603, -3.714], [-38.5965, -3.722], [-38.6045, -3.731], [-38.598, -3.74], [-38.606, -3.75], [-38.6, -3.762], [-38.605, -3.772]]
// riacho Pajeú: corre pelo lado leste do centro e desemboca no Poço da Draga
export const PAJEU = [[-38.512, -3.746], [-38.5165, -3.74], [-38.5185, -3.734], [-38.5215, -3.729], [-38.5235, -3.7245], [-38.5255, -3.7212], [-38.527, -3.7192]]
// lagoas: [nome, lon, lat, raio x, raio z (m de jogo)]
export const LAGOAS = [
  ['Poço da Draga', -38.5278, -3.7196, 22, 10],
  ['Lagoa de Porangabussu', -38.5465, -3.7455, 36, 24],
  ['Lagoa do Tauape', -38.5225, -3.7505, 30, 22],
  ['Açude João Lopes', -38.5565, -3.7275, 24, 9],
]

// lugares da história (posição real; o que eram em 1932 está em docs/mapa-1932.md)
export const LUGARES = {
  pracaFerreira: [-38.5268, -3.7276],
  passeioPublico: [-38.5303, -3.7216],
  forte: [-38.5245, -3.7228],
  se: [-38.5262, -3.7236],
  santaCasa: [-38.5322, -3.7219],
  pracaLeoes: [-38.5265, -3.7252],
  mercadoFerro: [-38.53, -3.7258],
  theatro: [-38.5315, -3.7305],
  estacao: [-38.5355, -3.7245],
  cemiterio: [-38.541, -3.721],
  pocoDraga: [-38.5278, -3.7196],
  ponteMetalica: [-38.5258, -3.7185],
  ponteIngleses: [-38.5195, -3.7176],
  vilaMorena: [-38.5185, -3.7192],
  seminario: [-38.5205, -3.724],
  farol: [-38.4775, -3.716],
  oficinas: [-38.566, -3.715],
  campoUrubu: [-38.5625, -3.7135],
  campoOtavioBonfim: [-38.5485, -3.7345],
  barraCeara: [-38.598, -3.695],
}

// bairros (para o nome na tela): o mais perto vence
const BAIRROS = [
  ['Barra do Ceará', -38.595, -3.705], ['Pirambu', -38.565, -3.71], ['Floresta', -38.575, -3.72], ['Jacarecanga', -38.548, -3.722],
  ['Moura Brasil', -38.538, -3.719], ['Centro', -38.528, -3.728], ['Praia Formosa', -38.532, -3.7175], ['Poço da Draga', -38.5275, -3.7192],
  ['Praia de Iracema', -38.517, -3.7185], ['Prainha', -38.52, -3.724], ['Outeiro', -38.515, -3.73], ['Aldeota', -38.505, -3.735],
  ['Meireles', -38.495, -3.725], ['Mucuripe', -38.478, -3.718], ['Alagadiço', -38.556, -3.737], ['Otávio Bonfim', -38.548, -3.733],
  ['Benfica', -38.537, -3.742], ['Joaquim Távora', -38.515, -3.745], ['Tauape', -38.522, -3.752],
]

// ---------- pontos já no jogo ----------
function catmull(pts, n = 10) {
  const p = [pts[0], ...pts, pts[pts.length - 1]]
  const out = []
  for (let i = 1; i < p.length - 2; i++) {
    for (let k = 0; k < n; k++) {
      const t = k / n
      const t2 = t * t
      const t3 = t2 * t
      out.push([0, 1].map((j) => 0.5 * (2 * p[i][j] + (-p[i - 1][j] + p[i + 1][j]) * t + (2 * p[i - 1][j] - 5 * p[i][j] + 4 * p[i + 1][j] - p[i + 2][j]) * t2 + (-p[i - 1][j] + 3 * p[i][j] - 3 * p[i + 1][j] + p[i + 2][j]) * t3)))
    }
  }
  out.push(p[p.length - 2])
  return out
}
const costaJogo = catmull(COSTA.map(([a, b]) => ll(a, b)), 12)
const praiaX = PRAIA.map(([lon]) => ll(lon, -3.72)[0])
const praiaL = pchip(praiaX, PRAIA.map(([, l]) => l))
const rioJogo = catmull(RIO_CEARA.map(([a, b]) => ll(a, b)), 10)
export const pajeuJogo = catmull(PAJEU.map(([a, b]) => ll(a, b)), 10)

// z da costa para um x (a costa de 1932 é uma função de x de ponta a ponta)
function costaZBusca(x) {
  const c = costaJogo
  if (x <= c[0][0]) return c[0][1]
  if (x >= c[c.length - 1][0]) return c[c.length - 1][1]
  let lo = 0
  let hi = c.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (c[m][0] <= x) lo = m
    else hi = m
  }
  const t = (x - c[lo][0]) / Math.max(1e-6, c[hi][0] - c[lo][0])
  return c[lo][1] + (c[hi][1] - c[lo][1]) * t
}
export const larguraPraiaX = (x) => Math.max(8, praiaL(x))

// x do eixo do rio Ceará para um z
function rioCearaXBusca(z) {
  const c = rioJogo
  if (z <= c[0][1]) return c[0][0]
  if (z >= c[c.length - 1][1]) return c[c.length - 1][0]
  let i = 0
  while (i < c.length - 2 && c[i + 1][1] < z) i++
  const t = (z - c[i][1]) / Math.max(1e-6, c[i + 1][1] - c[i][1])
  return c[i][0] + (c[i + 1][0] - c[i][0]) * t
}

// tabelas a cada 1 m (o mapa pergunta isso centenas de milhares de vezes ao montar o terreno)
function tabela(f, ini, fim) {
  const t = new Float32Array(Math.ceil(fim - ini) + 2)
  for (let i = 0; i < t.length; i++) t[i] = f(ini + i)
  return (v) => {
    const fi = Math.min(t.length - 1.001, Math.max(0, v - ini))
    const i = Math.floor(fi)
    return t[i] + (t[i + 1] - t[i]) * (fi - i)
  }
}
export const costaZ = tabela(costaZBusca, -1400, 1500)
export const rioCearaX = tabela(rioCearaXBusca, -700, 1300)

// distância de um ponto a uma polilinha
export function distPolilinha(x, z, pts) {
  let melhor = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i]
    const [bx, bz] = pts[i + 1]
    const vx = bx - ax
    const vz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)))
    melhor = Math.min(melhor, Math.hypot(x - ax - vx * t, z - az - vz * t))
  }
  return melhor
}

export const lagoasJogo = LAGOAS.map(([nome, lon, lat, rx, rz]) => {
  const [x, z] = ll(lon, lat)
  return { nome, x, z, rx, rz }
})
export const lugaresJogo = Object.fromEntries(Object.entries(LUGARES).map(([k, [lon, lat]]) => [k, ll(lon, lat)]))
const bairrosJogo = BAIRROS.map(([nome, lon, lat]) => [nome, ...ll(lon, lat)])
export function nomeBairro(x, z) {
  let melhor = null
  let d = Infinity
  for (const [nome, bx, bz] of bairrosJogo) {
    const dd = (x - bx) ** 2 + (z - bz) ** 2
    if (dd < d) { d = dd; melhor = nome }
  }
  return melhor
}

// lotes ocupados em 1932, já em coordenadas do jogo
export const lotesJogo = (() => {
  const { base, escala, xy } = lotesBrutos
  const out = new Float32Array(xy.length)
  for (let i = 0; i < xy.length; i += 2) {
    const [x, z] = ll(base[0] + xy[i] * escala, base[1] + xy[i + 1] * escala)
    out[i] = x
    out[i + 1] = z
  }
  return out
})()

// grade de Herbster: as ruas do centro correm a 72,5 graus do leste (medido nos lotes de 1932).
// No jogo (z para o sul) a direção da rua "norte-nordeste" é (cos, -sin).
export const ANGULO_GRADE = (72.5 * Math.PI) / 180

// densidade de lotes de 1932 (0 a 1), em células de 6 m e suavizada: onde havia cidade
const CEL = 6
const DX0 = -1240
const DZ0 = -480
const DW = Math.ceil(2500 / CEL)
const DH = Math.ceil(1520 / CEL)
const densidade = (() => {
  const conta = new Float32Array(DW * DH)
  for (let i = 0; i < lotesJogo.length; i += 2) {
    const ci = Math.floor((lotesJogo[i] - DX0) / CEL)
    const cj = Math.floor((lotesJogo[i + 1] - DZ0) / CEL)
    if (ci >= 0 && cj >= 0 && ci < DW && cj < DH) conta[cj * DW + ci]++
  }
  // desfoque em caixa, duas passadas (raio 2 células)
  const tmp = new Float32Array(DW * DH)
  const R = 2
  for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
    let s = 0
    for (let k = -R; k <= R; k++) { const ii = Math.min(DW - 1, Math.max(0, i + k)); s += conta[j * DW + ii] }
    tmp[j * DW + i] = s / (2 * R + 1)
  }
  const out = new Float32Array(DW * DH)
  for (let j = 0; j < DH; j++) for (let i = 0; i < DW; i++) {
    let s = 0
    for (let k = -R; k <= R; k++) { const jj = Math.min(DH - 1, Math.max(0, j + k)); s += tmp[jj * DW + i] }
    out[j * DW + i] = Math.min(1, s / (2 * R + 1) / 1.2)
  }
  return out
})()
export function densidadeLotes(x, z) {
  const fi = (x - DX0) / CEL - 0.5
  const fj = (z - DZ0) / CEL - 0.5
  const i = Math.floor(fi)
  const j = Math.floor(fj)
  if (i < 0 || j < 0 || i >= DW - 1 || j >= DH - 1) return 0
  const tx = fi - i
  const tz = fj - j
  const v = (a, b) => densidade[b * DW + a]
  return (v(i, j) * (1 - tx) + v(i + 1, j) * tx) * (1 - tz) + (v(i, j + 1) * (1 - tx) + v(i + 1, j + 1) * tx) * tz
}

// trechos da praia por longitude: onde ficavam as vilas de pescadores e as jangadas
const TRECHOS = {
  barra: [-38.594, -38.58],
  pirambu: [-38.575, -38.548],
  praiaFormosa: [-38.536, -38.5285],
  praiaDoPeixe: [-38.5245, -38.511], // Praia de Iracema: os jangadeiros e a greve de 1881
  meireles: [-38.506, -38.49],
  mucuripe: [-38.4845, -38.4745],
}
export const trechosJogo = Object.fromEntries(Object.entries(TRECHOS).map(([k, [a, b]]) => [k, [ll(a, -3.72)[0], ll(b, -3.72)[0]]]))
export const VILAS = ['pirambu', 'praiaDoPeixe', 'mucuripe'] // vilas de jangadeiros (casas de palha, jangadas)
