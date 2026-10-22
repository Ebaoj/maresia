// Conferência do quadro da grade: a compressão no quadro (u, v) da grade de
// Herbster, em vez de (lon, lat). Mede o que muda no jogo:
//   npx vite-node scripts/diagnostico/grade-conferencia.mjs
//
// Perguntas:
//   1. a rua da grade continua reta no jogo?
//   2. a praça continua 1:1?
//   3. quanto o mundo cresce?
//   4. a costa (que o terreno do jogo monta como função de x) continua função de x?
//   5. o rio (função de z) continua função de z?
//   6. quanto a costa entorta no jogo? (o terreno mede a distancia na vertical)

import { readFileSync } from 'node:fs'
import { pchip } from '../../src/mundo/escala1932.js'

const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180)
const M_LAT = 110574
const PRACA_LON = -38.5275014
const PRACA_LAT = -3.7274448
const ANG = (72.5 * Math.PI) / 180
const PSI = Math.PI / 2 - ANG
const CU = Math.cos(PSI)
const SU = Math.sin(PSI)
const E0 = PRACA_LON * M_LON
const N0 = PRACA_LAT * M_LAT

const gradeDe = (lon, lat) => {
  const e = lon * M_LON - E0
  const n = lat * M_LAT - N0
  return [e * CU + n * SU, -e * SU + n * CU]
}

function perfil(u, nucleo, rampa) {
  const a = Math.abs(u)
  if (a <= nucleo) return 1
  if (a >= rampa) return 0
  const t = (a - nucleo) / (rampa - nucleo)
  return 0.5 * (1 + Math.cos(Math.PI * t))
}

function comprimir(base, dominio, perfilS, k) {
  const passos = 8000
  const h = (dominio[1] - dominio[0]) / passos
  const dh = 1e-6
  const derivada = (u) => (base(u + dh) - base(u - dh)) / (2 * dh)
  const xs = new Float64Array(passos + 1)
  const ys = new Float64Array(passos + 1)
  let acc = base(dominio[0])
  xs[0] = dominio[0]
  ys[0] = acc
  for (let i = 1; i <= passos; i++) {
    const meio = dominio[0] + (i - 0.5) * h
    acc += derivada(meio) * (1 + (k - 1) * perfilS(meio)) * h
    xs[i] = dominio[0] + i * h
    ys[i] = acc
  }
  if (dominio[1] < dominio[0]) { xs.reverse(); ys.reverse() }
  return { f: pchip(xs, ys), fim: acc }
}

const NOS_X = [[-38.612, 0], [-38.548, 700], [-38.535, 1000], [-38.512, 1760], [-38.495, 1960], [-38.4745, 2180], [-38.452, 2440], [-38.44, 2560]]
const NOS_Y = [[-3.77, 1420], [-3.752, 1220], [-3.736, 1000], [-3.716, 340], [-3.705, 150], [-3.688, 0]]

const nosU = NOS_X.map(([lon]) => gradeDe(lon, PRACA_LAT)[0]).map((u, i) => [u, NOS_X[i][1]]).sort((a, b) => a[0] - b[0])
const nosV = NOS_Y.map(([lat]) => gradeDe(PRACA_LON, lat)[1]).map((v, i) => [v, NOS_Y[i][1]]).sort((a, b) => a[0] - b[0])
const baseU = pchip(nosU.map(([u]) => u), nosU.map(([, v]) => v))
const baseV = pchip(nosV.map(([v]) => v), nosV.map(([, v]) => v))

const cantos = [[-38.612, -3.77], [-38.44, -3.77], [-38.44, -3.688], [-38.612, -3.688]]
let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
for (const [lon, lat] of cantos) {
  const [u, v] = gradeDe(lon, lat)
  u0 = Math.min(u0, u); u1 = Math.max(u1, u)
  v0 = Math.min(v0, v); v1 = Math.max(v1, v)
}
console.log(`o mapa no quadro da grade: u ${(u0 / 1000).toFixed(2)} .. ${(u1 / 1000).toFixed(2)} km, v ${(v0 / 1000).toFixed(2)} .. ${(v1 / 1000).toFixed(2)} km`)

const escalaBase = (f, u, metro) => {
  const dh = 1e-4
  return Math.abs((f(u + dh) - f(u - dh)) / (2 * dh)) / metro
}
// o fator 1:1 no miolo da praça
const K_U = 1 / escalaBase(baseU, 0, 1)
const K_V = 1 / escalaBase(baseV, 0, 1)
console.log(`K_u = ${K_U.toFixed(3)}, K_v = ${K_V.toFixed(3)}`)

// as rampas como faixas ao longo de u e de v (as mesmas medidas de hoje, em metros)
const NUCLEO_U = 0.0009 * M_LON
const RAMPA_U = 0.004 * M_LON
const NUCLEO_V = 0.0011 * M_LAT
const RAMPA_V = 0.0038 * M_LAT
const descU = comprimir(baseU, [u0, u1], (u) => perfil(u, NUCLEO_U, RAMPA_U), K_U)
const descV = comprimir(baseV, [v0, v1], (v) => perfil(v, NUCLEO_V, RAMPA_V), K_V)

function jogo(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  const X = descU.f(u)
  const Y = descV.f(v)
  return [X * CU + Y * SU, -X * SU + Y * CU]
}

// ---------- 1. a rua da grade continua reta?
function reta(lon, lat, comp = 400, passo = 20) {
  const pontos = []
  const dLon = (passo * Math.sin(ANG)) / M_LON
  const dLat = (passo * Math.cos(ANG)) / M_LAT
  const n = Math.round(comp / passo)
  for (let i = -Math.floor(n / 2); i <= Math.floor(n / 2); i++) pontos.push([lon + i * dLon, lat + i * dLat])
  return pontos
}
function barriga(pontos) {
  const [a, b] = [pontos[0], pontos[pontos.length - 1]]
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz)
  let max = 0
  for (const p of pontos) {
    const d = Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len
    if (d > max) max = d
  }
  return max
}
console.log('\n1. a rua da grade no quadro novo (o angulo de verdade no jogo e -17,5 graus):')
for (const [nome, lon, lat] of [['a praca', -38.5276, -3.7275], ['250 m a leste', -38.52535, -3.7275], ['400 m a leste', -38.52403, -3.7275], ['o oeste', -38.56, -3.7275], ['o bairro', -38.5485, -3.7345]]) {
  const pontos = reta(lon, lat, 400).map(([lo, la]) => jogo(lo, la))
  const dx = pontos[pontos.length - 1][0] - pontos[0][0]
  const dz = pontos[pontos.length - 1][1] - pontos[0][1]
  const ang = (Math.atan2(dz, dx) * 180) / Math.PI
  console.log(`  ${nome.padEnd(14)} angulo ${ang.toFixed(2).padStart(7)}  barriga ${barriga(pontos).toFixed(2).padStart(7)} un  medida ${Math.hypot(dx, dz).toFixed(0)} un`)
}

// ---------- 2. a praça continua 1:1?
const praca = JSON.parse(readFileSync(new URL('../../src/mundo/praca1932.json', import.meta.url), 'utf8'))
const area = (pts) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p[0] * q[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}
const noJogo = praca.contorno.map(([lon, lat]) => jogo(lon, lat))
const real = praca.contorno.map(([lon, lat]) => [(lon - praca.centro[0]) * M_LON, (lat - praca.centro[1]) * M_LAT])
console.log(`\n2. a praca: area jogo ${area(noJogo).toFixed(0)} un2, real ${area(real).toFixed(0)} m2 -> erro ${(Math.abs(area(noJogo) / area(real) - 1) * 100).toFixed(2)}%`)

// ---------- 3. o mundo
const mundo = cantos.map(([lon, lat]) => jogo(lon, lat))
const xs = mundo.map((p) => p[0])
const zs = mundo.map((p) => p[1])
console.log(`\n3. o mapa no jogo: x ${Math.min(...xs).toFixed(0)} .. ${Math.max(...xs).toFixed(0)} (${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} un), z ${Math.min(...zs).toFixed(0)} .. ${Math.max(...zs).toFixed(0)} (${(Math.max(...zs) - Math.min(...zs)).toFixed(0)} un)`)
console.log('   (hoje: 2560 x 1420 un)')

// ---------- 4/5/6. a costa e o rio
const COSTA = [
  [-38.64, -3.682], [-38.612, -3.688], [-38.603, -3.6915], [-38.5995, -3.6945], [-38.597, -3.693], [-38.591, -3.6955],
  [-38.584, -3.6985], [-38.576, -3.7015], [-38.568, -3.7045], [-38.561, -3.7072], [-38.554, -3.7102], [-38.547, -3.7128],
  [-38.541, -3.715], [-38.536, -3.7165], [-38.531, -3.7182], [-38.5275, -3.7186], [-38.5262, -3.7172], [-38.5248, -3.718],
  [-38.521, -3.7178], [-38.517, -3.7176], [-38.512, -3.7188], [-38.506, -3.72], [-38.499, -3.7212], [-38.492, -3.7216],
  [-38.486, -3.7208], [-38.481, -3.7186], [-38.4775, -3.7158], [-38.4745, -3.7136], [-38.471, -3.714], [-38.466, -3.7168],
  [-38.459, -3.721], [-38.452, -3.726], [-38.444, -3.732], [-38.436, -3.739],
]
const costa = COSTA.map(([lo, la]) => jogo(lo, la))
let monoX = true
for (let i = 1; i < costa.length; i++) if (costa[i][0] <= costa[i - 1][0]) monoX = false
const angCosta = ((Math.atan2(costa[costa.length - 1][1] - costa[0][1], costa[costa.length - 1][0] - costa[0][0]) * 180) / Math.PI).toFixed(1)
console.log(`\n4. a costa no jogo: x cresce sempre? ${monoX ? 'sim' : 'NAO'}  (o terreno precisa disso)`)
console.log(`   a costa toda: angulo ${angCosta} graus (no jogo de hoje e quase 0, a costa e a linha do horizonte)`)
console.log(`   barriga da costa: ${barriga(costa).toFixed(1)} un`)
// a distancia da praia: a faixa de areia e medida na vertical (z), como o terreno faz
let erro = 0
for (let i = 1; i < costa.length; i++) {
  const dxz = costa[i][0] - costa[i - 1][0]
  const dzz = costa[i][1] - costa[i - 1][1]
  erro = Math.max(erro, Math.abs(dxz))
}
console.log(`   o maior salto de x entre dois pontos da costa: ${erro.toFixed(1)} un (a costa e lisa o bastante para ser funcao de x)`)

const RIO = [[-38.5975, -3.6935], [-38.6005, -3.7], [-38.596, -3.707], [-38.603, -3.714], [-38.5965, -3.722], [-38.6045, -3.731], [-38.598, -3.74], [-38.606, -3.75], [-38.6, -3.762], [-38.605, -3.772]]
const rio = RIO.map(([lo, la]) => jogo(lo, la))
let monoZ = true
for (let i = 1; i < rio.length; i++) if (rio[i][1] <= rio[i - 1][1]) monoZ = false
console.log(`5. o rio no jogo: z cresce sempre? ${monoZ ? 'sim' : 'NAO'} (o terreno precisa disso)`)

// ---------- 7. a胖a da decompressao: quanto o miolo estica
console.log(`\n7. o esticamento no miolo: u ${(1 + (K_U - 1)).toFixed(2)}, v ${(1 + (K_V - 1)).toFixed(2)} (hoje: 2,9 e 2,9)`)
console.log(`   a compressao base no miolo: ${(1 / escalaBase(baseU, 0, 1)).toFixed(2)} m/un em u, ${(1 / escalaBase(baseV, 0, 1)).toFixed(2)} m/un em v`)

// ---------- 8. o Urubu e a fatia da praia
const urubu = jogo(-38.57, -3.7176)
console.log(`\n8. o Urubu: ${urubu[0].toFixed(1)}, ${urubu[1].toFixed(1)}  (hoje: -804,0, -11,3)`)
const fatia = jogo(-38.5194, -3.7177)
console.log(`   a fatia da Praia do Peixe: ${fatia[0].toFixed(1)}, ${fatia[1].toFixed(1)}`)
