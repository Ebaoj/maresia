// Diagnóstico da rede viária de 1932: tamanho da planta, comprimento das
// testadas, quanto disso cabe dentro do mundo jogável e como a escala local
// transforma isso em unidades de jogo.
//
//   npx vite-node scripts/diagnostico/ver-ruas-1932.mjs

import { ll, LIMITES, metrosPorUn } from '../../src/mundo/fortaleza1932.js'
import dados from '../../src/mundo/mapa1932-lotes.json'

console.log('janela da planta:', JSON.stringify(dados.janela))
console.log('fonte:', dados.fonte)

const METRO_POR_GRAU_LAT = 110574
const METRO_POR_GRAU_LON = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)
function m(lon, lat) { return [lon * METRO_POR_GRAU_LON(lat), lat * METRO_POR_GRAU_LAT] }

console.log('\n=== as testadas ===')
let total = 0
let dentro = 0
let dentroJogo = 0
const larguras = []
for (const f of dados.fachadas) {
  const a = m(f[1], f[2])
  const b = m(f[3], f[4])
  const L = Math.hypot(b[0] - a[0], b[1] - a[1])
  total += L
  larguras.push(L)
  const ja = ll(f[1], f[2])
  const jb = ll(f[3], f[4])
  if (ja[0] >= LIMITES.x0 && ja[0] <= LIMITES.x1 && ja[1] >= LIMITES.z0 && ja[1] <= LIMITES.z1) dentro++
  // o mesmo, medindo em unidades de jogo
  const Lj = Math.hypot(jb[0] - ja[0], jb[1] - ja[1])
  dentroJogo += Lj
}
larguras.sort((a, b) => a - b)
console.log('frentes:', dados.fachadas.length, 'comprimento total:', (total / 1000).toFixed(1), 'km reais')
console.log('largura da frente (m): mediana', larguras[Math.floor(larguras.length / 2)].toFixed(1),
  'p10', larguras[Math.floor(larguras.length * 0.1)].toFixed(1),
  'p90', larguras[Math.floor(larguras.length * 0.9)].toFixed(1))
console.log('frentes dentro do mundo:', dentro, '=', (100 * dentro / dados.fachadas.length).toFixed(0) + '%')
console.log('soma em unidades de jogo:', dentroJogo.toFixed(0), 'un (o mundo tem', (LIMITES.x1 - LIMITES.x0).toFixed(0), 'un de largura)')

// quanto do total esta perto da praca (a zona 1:1)
const [plon, plat] = [-38.5276, -3.7275]
const pm = m(plon, plat)
let perto = 0
let pertoJogo = 0
for (const f of dados.fachadas) {
  const a = m(f[1], f[2])
  const d = Math.hypot(a[0] - pm[0], a[1] - pm[1])
  if (d < 400) {
    perto++
    const ja = ll(f[1], f[2])
    const jb = ll(f[3], f[4])
    pertoJogo += Math.hypot(jb[0] - ja[0], jb[1] - ja[1])
  }
}
console.log('frentes a menos de 400 m da praca:', perto, '=', (pertoJogo).toFixed(0), 'un de jogo')

console.log('\n=== quanto a compressao encolhe as ruas ===')
for (const [lon, lat, nome] of [[-38.5276, -3.7275, 'praca'], [-38.545, -3.7255, 'oeste 200 m'], [-38.545, -3.705, 'oeste 2,5 km'], [-38.49, -3.72, 'leste 4 km'], [-38.60, -3.74, 'oeste 8 km']]) {
  const j = ll(lon, lat)
  console.log(`${nome.padEnd(12)} jogo ${j[0].toFixed(0)},${j[1].toFixed(0)}  ${metrosPorUn(j[0], j[1]).toFixed(3)} m/un`)
}

console.log('\n=== a janela da planta em unidades de jogo ===')
const j0 = ll(dados.janela.lon_min, dados.janela.lat_max)
const j1 = ll(dados.janela.lon_max, dados.janela.lat_min)
console.log('canto NO:', j0.map((v) => v.toFixed(0)).join(','), ' canto SE:', j1.map((v) => v.toFixed(0)).join(','))
console.log('mundo:', LIMITES.x0.toFixed(0), LIMITES.z0.toFixed(0), '->', LIMITES.x1.toFixed(0), LIMITES.z1.toFixed(0))
