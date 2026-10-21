// Prototipo: a compressao no quadro da grade (u, v) em vez de em (lon, lat).
//   npx vite-node scripts/diagnostico/prototipo-grade.mjs
//
// A transformada de hoje e separavel em lon/lat: o x sai so da longitude e o z
// so da latitude. Por isso uma rua da grade de Herbster (72,5 graus) vira
// curva no jogo: a compressao mexe num eixo e nao no outro.
//
// A ideia: girar o ponto para o quadro da grade (u ao longo da rua, v de
// travessia), comprimir em u e em v (a escala de cada eixo, com a zona 1:1 e
// as rampas como faixas ao longo de u e de v) e voltar. A compressao e
// separavel no quadro da grade, entao uma rua (v constante) continua reta.
//
// Este script mede a coisa antes de mexer no motor: quanto o mundo cresce,
// se a praca continua 1:1, se o Urubu anda e se a rua fica reta.
import { readFileSync } from 'node:fs'
import { pchip } from '../../src/mundo/escala1932.js'

const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180)
const M_LAT = 110574
const PRACA_LON = -38.5275014
const PRACA_LAT = -3.7274448
const ANG = (72.5 * Math.PI) / 180
// o eixo u corre ao longo da rua (a grade esta 17,5 graus fora do eixo x)
const PSI = Math.PI / 2 - ANG
const CU = Math.cos(PSI)
const SU = Math.sin(PSI)
const E0 = PRACA_LON * M_LON
const N0 = PRACA_LAT * M_LAT

// o ponto em lon/lat vira (u, v) em metros: u ao longo da rua, v de travessia
function gradeDe(lon, lat) {
  const e = lon * M_LON - E0
  const n = lat * M_LAT - N0
  return [e * CU + n * SU, -e * SU + n * CU]
}

// o perfil da descompressao: 1 no nucleo, 0 fora da rampa
function perfil(u, nucleo, rampa) {
  const a = Math.abs(u)
  if (a <= nucleo) return 1
  if (a >= rampa) return 0
  const t = (a - nucleo) / (rampa - nucleo)
  return 0.5 * (1 + Math.cos(Math.PI * t))
}

// a compressao nova: X(u) = f(a) + ∫ f'(t)·s(t) dt (o mesmo desenho de hoje)
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

// os nos da compressao base de hoje (docs/mapa-1932-gerar.py)
const NOS_X = [[-38.612, 0], [-38.548, 700], [-38.535, 1000], [-38.512, 1760], [-38.495, 1960], [-38.4745, 2180], [-38.452, 2440], [-38.44, 2560]]
const NOS_Y = [[-3.77, 1420], [-3.752, 1220], [-3.736, 1000], [-3.716, 340], [-3.705, 150], [-3.688, 0]]

// os mesmos nos, mas lidos no quadro da grade: a posicao de cada no e a
// projecao da sua longitude (na latitude da praca) sobre o eixo u. O pchip
// exige os nos em ordem crescente, entao o eixo v (que anda ao contrario)
// e ordenado.
const nosU = NOS_X.map(([lon]) => gradeDe(lon, PRACA_LAT)[0] / M_LON).map((u, i) => [u, NOS_X[i][1]]).sort((a, b) => a[0] - b[0])
const nosV = NOS_Y.map(([lat]) => gradeDe(PRACA_LON, lat)[1] / M_LAT).map((v, i) => [v, NOS_Y[i][1]]).sort((a, b) => a[0] - b[0])
console.log('nos u:', nosU.map(([u, v]) => `${u.toFixed(4)}->${v}`).join(' '))
console.log('nos v:', nosV.map(([v, x]) => `${v.toFixed(4)}->${x}`).join(' '))
const baseU = pchip(nosU.map(([u]) => u), nosU.map(([, v]) => v))
const baseV = pchip(nosV.map(([v]) => v), nosV.map(([, v]) => v))

// o dominio: o mapa inteiro projetado no quadro da grade
const cantos = [[-38.612, -3.77], [-38.44, -3.77], [-38.44, -3.688], [-38.612, -3.688]]
let u0 = Infinity
let u1 = -Infinity
let v0 = Infinity
let v1 = -Infinity
for (const [lon, lat] of cantos) {
  const [u, v] = gradeDe(lon, lat)
  u0 = Math.min(u0, u)
  u1 = Math.max(u1, u)
  v0 = Math.min(v0, v)
  v1 = Math.max(v1, v)
}
const domU = [u0 / M_LON, u1 / M_LON]
const domV = [v0 / M_LAT, v1 / M_LAT]
console.log('o mapa no quadro da grade (metros):')
console.log(`  u: ${u0.toFixed(0)} .. ${u1.toFixed(0)} (${(u1 - u0).toFixed(0)} m)   v: ${v0.toFixed(0)} .. ${v1.toFixed(0)} (${(v1 - v0).toFixed(0)} m)`)
console.log('  o mapa de hoje, em lon/lat: 19108 m x 9067 m')

// o fator 1:1: a escala da base no ponto e o inverso do que a praca quer
const escalaBase = (f, u, metro) => {
  const dh = 1e-4
  return Math.abs((f(u + dh) - f(u - dh)) / (2 * dh)) / metro
}
const K_U = 1 / escalaBase(baseU, 0, M_LON)
const K_V = 1 / escalaBase(baseV, 0, M_LAT)
console.log(`\nos fatores 1:1: K_u = ${K_U.toFixed(2)}, K_v = ${K_V.toFixed(2)}`)

// a descompressao: as rampas como faixas ao longo de u e de v (em metros de
// verdade, como as de hoje: 100/444 m no eixo x, 122/420 m no eixo z)
const NUCLEO_U = 0.0009 * M_LON
const RAMPA_U = 0.004 * M_LON
const NUCLEO_V = 0.0011 * M_LAT
const RAMPA_V = 0.0038 * M_LAT
const descU = comprimir(baseU, domU, (u) => perfil(u, NUCLEO_U / M_LON, RAMPA_U / M_LON), K_U)
const descV = comprimir(baseV, domV, (u) => perfil(u, NUCLEO_V / M_LAT, RAMPA_V / M_LAT), K_V)

// a escala de cada eixo: unidades de jogo por metro de verdade
const ESC_X = (descU.f(domU[1]) - descU.f(domU[0])) / ((domU[1] - domU[0]) * M_LON)
const ESC_Z = (descV.f(domV[0]) - descV.f(domV[1])) / ((domV[0] - domV[1]) * M_LAT)
console.log(`a compressao base: ${(1 / ESC_X).toFixed(2)} m/un em u, ${(1 / Math.abs(ESC_Z)).toFixed(2)} m/un em v`)
console.log(`a escala no miolo da praca: ${(1 / Math.abs(escalaBase(descU.f, 0, M_LON))).toFixed(3)} m/un em u, ${(1 / Math.abs(escalaBase(descV.f, 0, M_LAT))).toFixed(3)} m/un em v`)

// o jogo: (u, v) -> (x, z). o x cresce para leste, o z para o sul.
// X e Y ja sao unidades de jogo (a curva comprimida); so falta voltar do
// quadro da grade para o leste/norte.
function jogo(lon, lat) {
  const [u, v] = gradeDe(lon, lat)
  const X = descU.f(u / M_LON)
  const Y = descV.f(v / M_LAT)
  // Y cresce para o sul do quadro da grade (a curva de v e decrescente), entao
  // o eixo v comprimido e -Y: a volta para o leste/norte usa esse sinal
  const e = X * CU + Y * SU
  const n = X * SU - Y * CU
  return [e, -n]
}

// a praca em 1:1?
const [px0, pz0] = jogo(PRACA_LON, PRACA_LAT)
const eps = 0.00002
const [pxE, pzE] = jogo(PRACA_LON + eps, PRACA_LAT)
const [pxS, pzS] = jogo(PRACA_LON, PRACA_LAT - eps)
console.log(`\na praca: 1 unidade = ${(Math.abs(pxE - px0) / (eps * M_LON)).toFixed(3)} m em x (lon), ${(Math.abs(pzS - pz0) / (eps * M_LAT)).toFixed(3)} m em z (lat)`)
// a area da mancha da praca, como o teste de escala faz
const praca = JSON.parse(readFileSync(new URL('../../src/mundo/praca1932.json', import.meta.url), 'utf8'))
const area = (pts) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p[0] * p[1] - q[0] * p[1]
  }
  return Math.abs(a) / 2
}
const noJogo = praca.contorno.map(([lon, lat]) => jogo(lon, lat))
const real = praca.contorno.map(([lon, lat]) => [(lon - praca.centro[0]) * M_LON, (lat - praca.centro[1]) * M_LAT])
const aj = area(noJogo)
const ar = area(real)
console.log(`a area da praca: jogo ${aj.toFixed(0)} un2, real ${ar.toFixed(0)} m2 -> erro ${(Math.abs(aj / ar - 1) * 100).toFixed(2)}%`)

// o mundo
const mundo = cantos.map(([lon, lat]) => jogo(lon, lat))
const xs = mundo.map((p) => p[0])
const zs = mundo.map((p) => p[1])
console.log(`\no mapa no jogo: x ${Math.min(...xs).toFixed(0)} .. ${Math.max(...xs).toFixed(0)} (${(Math.max(...xs) - Math.min(...xs)).toFixed(0)} un), z ${Math.min(...zs).toFixed(0)} .. ${Math.max(...zs).toFixed(0)} (${(Math.max(...zs) - Math.min(...zs)).toFixed(0)} un)`)
console.log('  (hoje: o mapa ocupa 2560 x 1420 un; o mundo e 2442 x 1764)')

const urubu = jogo(-38.57, -3.7176)
console.log(`\no Urubu: ${urubu[0].toFixed(1)}, ${urubu[1].toFixed(1)}  (hoje: -804.0, -11.3)`)

// a rua da grade: ela continua reta?
function reta(lon, lat, comp = 400) {
  const pontos = []
  const passo = 20
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
console.log('\na rua da grade no quadro novo:')
for (const [nome, lon, lat] of [['a praca', -38.5276, -3.7275], ['250 m a leste', -38.52535, -3.7275], ['400 m a leste', -38.52403, -3.7275], ['o oeste', -38.56, -3.7275], ['o bairro', -38.5485, -3.7345]]) {
  const pontos = reta(lon, lat, 400).map(([lo, la]) => jogo(lo, la))
  const dx = pontos[pontos.length - 1][0] - pontos[0][0]
  const dz = pontos[pontos.length - 1][1] - pontos[0][1]
  const ang = (Math.atan2(dz, dx) * 180) / Math.PI
  console.log(`  ${nome.padEnd(14)} angulo ${ang.toFixed(1).padStart(6)}  barriga ${barriga(pontos).toFixed(2).padStart(7)} m  medida ${Math.hypot(dx, dz).toFixed(0)} m`)
}
