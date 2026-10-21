// Fortaleza de 1932 como DADO (docs/mapa-1932.md). Tudo entra em coordenadas reais (longitude,
// latitude) e passa por uma compressão suave e variável: ~3,4 vezes no centro, ~8 nas pontas.
// No jogo: x cresce para leste, z cresce para o sul (o mar fica em z negativo), 1 unidade = 1 m.
// O que é documentado e o que é hipótese está marcado no documento; aqui ficam só os números.
//
// A ESCALA (a compressão e a descompressão da praça) é o sistema de
// src/mundo/escala1932.js; aqui ficam os dados do mapa: costa, rio, lagoas,
// lugares, bairros e as peças de praia.

import {
  DESLOC, ll, LON_POR_X, LAT_POR_Z, LIMITES, pchip,
  K_PRACA_X, K_PRACA_Z, FATOR_PRACA,
  esticamento, esticamentoJogo, esticamentoNoVao, escalaJogo, escalaBaseJogo, metrosPorUn,
  METRO_POR_GRAU_LAT, METRO_POR_GRAU_LON,
} from './escala1932.js'

export {
  DESLOC, ll, LON_POR_X, LAT_POR_Z, LIMITES,
  K_PRACA_X, K_PRACA_Z, FATOR_PRACA,
  esticamento, esticamentoJogo, esticamentoNoVao, escalaJogo, escalaBaseJogo, metrosPorUn,
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
// posições revisadas em 20/10/2026 pela reconstrução histórica (docs/mapa-1932.md, seção v2);
// as chaves seguem src/mundo/mapa1932-dados.json, que é a fonte dos dados
export const LUGARES = {
  pracaFerreira: [-38.5276, -3.7275],
  passeioPublico: [-38.5263, -3.7226],
  forte: [-38.5245, -3.7228],
  se: [-38.525, -3.724],
  santaCasa: [-38.5276, -3.7222],
  pracaLeoes: [-38.5263, -3.7269],
  mercado: [-38.5243, -3.7233],
  theatro: [-38.5317, -3.7278],
  estacao: [-38.5302, -3.7219],
  pracaEstacao: [-38.53, -3.7222],
  cemiterio: [-38.5386, -3.7201],
  pocoDraga: [-38.521, -3.7195],
  ponteVelha: [-38.52, -3.7166],
  ponteIngleses: [-38.5168, -3.7181],
  vilaMorena: [-38.5185, -3.7192],
  seminario: [-38.5205, -3.724],
  farol: [-38.4775, -3.716],
  oficinasUrubu: [-38.5646, -3.7156],
  vilaFerroviaria: [-38.5678, -3.7141],
  campoUrubu: [-38.57, -3.7176],
  campoOtavioBonfim: [-38.5485, -3.7345],
  estacaoOtavio: [-38.5437, -3.7314],
  pracaMestres: [-38.5257, -3.7215],
  parqueLiberdade: [-38.5258, -3.7315],
  'colégioMilitar': [-38.5177, -3.7301],
  favela1932: [-38.5261, -3.7296],
  barraCeara: [-38.598, -3.695],
}

// Os lugares que a cidade de 1932 nao pode cobrir: a reconstituicao de cada um
// entra por cima (a estacao, as pracas, o forte). O numero e o raio em unidades
// de jogo; o mesmo raio serve para o chao: dentro dele e cidade (rua de pedra),
// nao mato, mesmo que a planta oficial nao tenha lote ali.
// O raio foi medido no mundo comprimido, entao ele acompanha o esticamento: onde
// a praca foi descomprimida, o mesmo lugar ocupa mais unidades de jogo.
export const LUGARES_RESERVADOS = [
  ['pracaFerreira', 26], ['passeioPublico', 20], ['forte', 10], ['se', 12], ['santaCasa', 12],
  ['pracaLeoes', 10], ['mercado', 16], ['theatro', 12], ['estacao', 20], ['pracaEstacao', 12],
  ['cemiterio', 22], ['seminario', 12], ['campoOtavioBonfim', 16], ['pracaMestres', 10],
  ['parqueLiberdade', 16], ['favela1932', 8],
].map(([chave, raio]) => [chave, raio * esticamento(...LUGARES[chave])])

// bairros (para o nome na tela): o mais perto vence. O 4º número (opcional) encurta o alcance de um
// lugar pequeno: a distância até ele conta multiplicada (o Poço da Draga é a vila junto da Ponte Velha,
// não pode tomar o Passeio Público do Centro: testes/unidade/bairros.test.js).
const BAIRROS = [
  ['Barra do Ceará', -38.595, -3.705], ['Pirambu', -38.565, -3.71], ['Floresta', -38.575, -3.72], ['Jacarecanga', -38.548, -3.722],
  ['Moura Brasil', -38.538, -3.719], ['Centro', -38.528, -3.7255], ['Praia Formosa', -38.532, -3.7175], ['Poço da Draga', -38.521, -3.7195, 1.5],
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
export const costaJogo = catmull(COSTA.map(([a, b]) => ll(a, b)), 12)
const praiaX = PRAIA.map(([lon]) => ll(lon, -3.72)[0])
const praiaL = pchip(praiaX, PRAIA.map(([, l]) => l))
export const rioJogo = catmull(RIO_CEARA.map(([a, b]) => ll(a, b)), 10)
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
export const bairrosJogo = BAIRROS.map(([nome, lon, lat]) => [nome, ...ll(lon, lat)])
const METROS_LAT = 110574
const METROS_LON = 111320 * Math.cos((3.72 * Math.PI) / 180)
export function nomeBairro(x, z) {
  // a comparação é em metros reais (lon/lat), não em unidades do jogo: a escala do mapa varia (a Praça do
  // Ferreira é 1:1, o resto comprimido) e, no jogo, o Centro esticado perdia os próprios marcos
  const lon = LON_POR_X(x), lat = LAT_POR_Z(z)
  const kx = METROS_LON, ky = METROS_LAT
  let melhor = null
  let d = Infinity
  for (const [nome, blon, blat, alcance = 1] of BAIRROS) {
    const dd = (((lon - blon) * kx) ** 2 + ((lat - blat) * ky) ** 2) * alcance * alcance
    if (dd < d) { d = dd; melhor = nome }
  }
  return melhor
}

// grade de Herbster: as ruas do centro correm a 72,5 graus do leste (medido nos lotes de 1932).
// No jogo (z para o sul) a direção da rua "norte-nordeste" é (cos, -sin).
export const ANGULO_GRADE = (72.5 * Math.PI) / 180

// trechos da praia por longitude: onde ficavam as vilas de pescadores e as jangadas
const TRECHOS = {
  barra: [-38.594, -38.58],
  pirambu: [-38.575, -38.548],
  praiaFormosa: [-38.536, -38.5285],
  praiaIracema: [-38.5245, -38.511], // a praia do Peixe virou Praia de Iracema em 1925: em 1932 já era Iracema
  meireles: [-38.506, -38.49],
  mucuripe: [-38.4845, -38.4745],
}
export const trechosJogo = Object.fromEntries(Object.entries(TRECHOS).map(([k, [a, b]]) => [k, [ll(a, -3.72)[0], ll(b, -3.72)[0]]]))
export const VILAS = ['pirambu', 'praiaIracema', 'mucuripe'] // vilas de jangadeiros (casas de palha, jangadas)
