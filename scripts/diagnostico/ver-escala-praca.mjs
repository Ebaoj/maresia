// Diagnóstico da escala: a Praça do Ferreira em tamanho real (1:1) e o resto do
// mapa comprimido, com transição suave.
//
//   npx vite-node scripts/diagnostico/ver-escala-praca.mjs
//
// Confere: área da praça no jogo x área real, escala local (un por metro),
// monotonicidade da transformação (sem dobra) e se o Campo do Urubu ficou onde
// estava (comparado com a transformação de antes, no commit anterior).

import { ll, LIMITES } from '../../src/mundo/fortaleza1932.js'
import { ll as llAntes } from '/tmp/fortaleza1932-antes.js'
import dados from '../../src/mundo/praca1932.json'

const METRO_POR_GRAU_LAT = 110574
const METRO_POR_GRAU_LON = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

function areaShoelace(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}

function perimetro(pts) {
  let p = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    p += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return p
}

// --- a praça em coordenada de jogo
const jogo = dados.contorno.map(([lon, lat]) => ll(lon, lat))
const jogoAntes = dados.contorno.map(([lon, lat]) => llAntes(lon, lat))
// --- a mesma praça em metros reais (para a área de verdade)
const mPorLon = METRO_POR_GRAU_LON(dados.centro[1])
const mPorLat = METRO_POR_GRAU_LAT
const reais = dados.contorno.map(([lon, lat]) => [(lon - dados.centro[0]) * mPorLon, (lat - dados.centro[1]) * mPorLat])

const areaJogo = areaShoelace(jogo)
const areaAntes = areaShoelace(jogoAntes)
const areaReal = areaShoelace(reais)
const perJogo = perimetro(jogo)
const perReal = perimetro(reais)

console.log('=== Praça do Ferreira ===')
console.log('área no jogo :', areaJogo.toFixed(0), 'un2  (antes:', areaAntes.toFixed(0), 'un2)')
console.log('área real     :', areaReal.toFixed(0), 'm2')
console.log('erro         :', ((areaJogo / areaReal - 1) * 100).toFixed(2), '%')
console.log('perímetro    :', perJogo.toFixed(1), 'un /', perReal.toFixed(1), 'm =', (perJogo / perReal).toFixed(4), 'un/m')

// --- escala local: quantos un por metro no centro e nos cantos da praça
const centro = ll(...dados.centro)
const e = 1e-5
const escalaX = (ll(dados.centro[0] + e, dados.centro[1])[0] - ll(dados.centro[0] - e, dados.centro[1])[0]) / (2 * e * mPorLon)
const escalaZ = (ll(dados.centro[0], dados.centro[1] + e)[1] - ll(dados.centro[0], dados.centro[1] - e)[1]) / (2 * e * mPorLat)
console.log('escala no centro:', escalaX.toFixed(4), 'un/m (x) |', escalaZ.toFixed(4), 'un/m (z)')
// nos quatro cantos do polígono
let minS = Infinity
let maxS = 0
for (const [lon, lat] of dados.contorno) {
  const sx = (ll(lon + e, lat)[0] - ll(lon - e, lat)[0]) / (2 * e * mPorLon)
  const sz = Math.abs((ll(lon, lat + e)[1] - ll(lon, lat - e)[1]) / (2 * e * mPorLat))
  minS = Math.min(minS, sx, sz)
  maxS = Math.max(maxS, sx, sz)
}
console.log('escala na praça :', minS.toFixed(4), 'a', maxS.toFixed(4), 'un/m')

// --- os angulos do contorno em torno do centro: para o raioEm() funcionar, os
// pontos precisam andar em angulo (a transformacao e suave e quase isotropa)
let anguloFora = 0
let anterior = Math.atan2(jogo[0][1] - centro[1], jogo[0][0] - centro[0])
for (let i = 1; i <= jogo.length; i++) {
  const p = jogo[i % jogo.length]
  const a = Math.atan2(p[1] - centro[1], p[0] - centro[0])
  let d = a - anterior
  while (d < -Math.PI) d += Math.PI * 2
  while (d > Math.PI) d -= Math.PI * 2
  if (d < 0) anguloFora++
  anterior = a
}
console.log('=== Contorno ===')
console.log('pontos com angulo fora de ordem:', anguloFora, 'de', jogo.length)

// --- monotonicidade: a transformacao pode dobrar?
const LON_A = -38.612
const LON_B = -38.44
const LAT_A = -3.688
const LAT_B = -3.77
const N = 4000
let dobraX = 0
let minDx = Infinity
let maxDx = 0
for (let i = 0; i < N; i++) {
  const a = LON_A + ((LON_B - LON_A) * i) / N
  const b = LON_A + ((LON_B - LON_A) * (i + 1)) / N
  const dx = ll(b, -3.7275)[0] - ll(a, -3.7275)[0]
  if (dx <= 0) dobraX++
  minDx = Math.min(minDx, dx)
  maxDx = Math.max(maxDx, dx)
}
let dobraZ = 0
let minDz = Infinity
for (let i = 0; i < N; i++) {
  const a = LAT_A + ((LAT_B - LAT_A) * i) / N
  const b = LAT_A + ((LAT_B - LAT_A) * (i + 1)) / N
  const dz = ll(-38.5275, b)[1] - ll(-38.5275, a)[1]
  if (dz <= 0) dobraZ++
  minDz = Math.min(minDz, dz)
}
console.log('=== Monotonicidade ===')
console.log('x: dobras', dobraX, '| passo min', minDx.toFixed(4), 'un | max', maxDx.toFixed(4), 'un')
console.log('z: dobras', dobraZ, '| passo min', minDz.toFixed(4), 'un')

// --- o Campo do Urubu: nao pode mudar de lugar
const PONTOS_URUBU = [
  ['centro do campo', -38.57, -3.7176],
  ['tarefa 0', -38.5669, -3.7174],
  ['galpao 0', -38.5695, -3.7157],
  ['construcao 0', -38.5673, -3.7184],
]
console.log('=== Campo do Urubu (antes -> depois) ===')
for (const [nome, lon, lat] of PONTOS_URUBU) {
  const a = llAntes(lon, lat)
  const b = ll(lon, lat)
  console.log(nome.padEnd(16), `(${a[0].toFixed(4)}, ${a[1].toFixed(4)}) -> (${b[0].toFixed(4)}, ${b[1].toFixed(4)})`, '| move', Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(4), 'un')
}

// --- a praça e os lugares marcados: como se moveram
console.log('=== Praça e lugares ===')
const LUGARES = [
  ['pracaFerreira', -38.5276, -3.7275],
  ['theatro', -38.5317, -3.7278],
  ['pracaLeoes', -38.5263, -3.7269],
  ['mercado', -38.5243, -3.7233],
  ['passeioPublico', -38.5263, -3.7226],
]
for (const [nome, lon, lat] of LUGARES) {
  const a = llAntes(lon, lat)
  const b = ll(lon, lat)
  console.log(nome.padEnd(16), `(${a[0].toFixed(2)}, ${a[1].toFixed(2)}) -> (${b[0].toFixed(2)}, ${b[1].toFixed(2)})`)
}

// --- os limites do mundo
console.log('=== Limites ===')
console.log(LIMITES)
console.log('tamanho da grade:', ((LIMITES.x1 - LIMITES.x0) / LIMITES.passo) * ((LIMITES.z1 - LIMITES.z0) / LIMITES.passo), 'vértices')
