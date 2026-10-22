// A compressao do mapa: ela curva ou vira as ruas da grade?
//   npx vite-node scripts/diagnostico/curva-ruas.mjs
//
// A transformada de escala (src/mundo/escala1932.js) e separavel: o x sai so
// da longitude e o z so da latitude. Uma linha reta em lon/lat vira uma reta
// so se ficar paralela a um dos eixos; nas outras direcoes, ela pode curvar.
//
// O teste e direto: uma reta de verdade (72,5 graus, a direcao da grade de
// Herbster) e mapped pelo ll() e medida no mundo do jogo: quantos graus ela
// virou e quantos metros ela saiu da reta.
//
//lembre: no espaco do jogo o z cresce para o SUL (e nao para o norte), entao
// os angulos do espaco de verdade sao medidos com o z para baixo.
import { ll, ANGULO_GRADE, lugaresJogo } from '../../src/mundo/fortaleza1932.js'

const METRO_LON = 111092
const METRO_LAT = 110574
const RAD = 180 / Math.PI

// uma reta no espaco de verdade: comeca em (lon, lat) e anda 72,5 graus
// (a direcao da grade de Herbster)
function retaHerbster(lon, lat, comp = 400) {
  const pontos = []
  const passo = 20 // metros de cada pedaco da reta
  // 72,5 graus do norte, para o leste
  const dLon = (passo * Math.sin(ANGULO_GRADE)) / METRO_LON
  const dLat = (passo * Math.cos(ANGULO_GRADE)) / METRO_LAT
  const n = Math.round(comp / passo)
  for (let i = -Math.floor(n / 2); i <= Math.floor(n / 2); i++) {
    pontos.push([lon + i * dLon, lat + i * dLat])
  }
  return pontos
}

// quanto a linha do jogo se afasta de uma reta (a altura do "barriga": o
// maior desvio do meio ate a corda)
function barriga(pontos) {
  if (pontos.length < 3) return 0
  const [a, b] = [pontos[0], pontos[pontos.length - 1]]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return 0
  let max = 0
  for (const p of pontos) {
    const d = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len
    if (d > max) max = d
  }
  return max
}

// o angulo da linha, no jogo (do eixo x, com o z para baixo)
function anguloJogo(pontos) {
  const dx = pontos[pontos.length - 1][0] - pontos[0][0]
  const dz = pontos[pontos.length - 1][1] - pontos[0][1]
  return Math.atan2(dz, dx) * RAD
}

const [px, pz] = lugaresJogo.pracaFerreira
const pracaLL = ll(-38.5276, -3.7275)

console.log('A grade de Herbster (72,5 graus) mapped pelo jogo:')
console.log('  ponto de partida        angulo no jogo  quanto virou  a barriga (m)  a medida (m)')
const pontos = [
  ['a praca', -38.5276, -3.7275],
  ['100 m a leste', -38.52668, -3.7275],
  ['250 m a leste', -38.52535, -3.7275],
  ['400 m a leste', -38.52403, -3.7275],
  ['250 m ao sul', -38.5276, -3.72524],
  ['400 m ao sul', -38.5276, -3.72385],
  ['o oeste (o Urubu)', -38.5600, -3.7275],
  ['o bairro (Otavio)', -38.5485, -3.7345],
]
for (const [nome, lon, lat] of pontos) {
  const reta = retaHerbster(lon, lat, 400)
  const jogo = reta.map((p) => ll(p[0], p[1]))
  const ang = anguloJogo(jogo)
  // o angulo da grade no jogo: a frente corre a -17,5 graus do eixo x
  // (o codigo do jogo: ROT = -(90 - 72,5))
  const alvo = -(90 - ANGULO_GRADE * RAD)
  let d = ang - alvo
  while (d > 90) d -= 180
  while (d < -90) d += 180
  const comp = Math.hypot(jogo[jogo.length - 1][0] - jogo[0][0], jogo[jogo.length - 1][1] - jogo[0][1])
  console.log(
    `  ${nome.padEnd(22)} ${ang.toFixed(1).padStart(8)}    ${d.toFixed(1).padStart(8)}    ${barriga(jogo).toFixed(2).padStart(8)}    ${comp.toFixed(0).padStart(8)}`,
  )
}

console.log('\nA mesma reta, em varias partes da cidade (1000 m cada):')
let piorAng = 0
let piorBarriga = 0
for (let i = 0; i < 12; i++) {
  const lon = -38.57 + i * 0.005
  for (let j = 0; j < 8; j++) {
    const lat = -3.755 + j * 0.007
    const reta = retaHerbster(lon, lat, 1000)
    const jogo = reta.map((p) => ll(p[0], p[1]))
    const ang = anguloJogo(jogo)
    const alvo = -(90 - ANGULO_GRADE * RAD)
    let d = ang - alvo
    while (d > 90) d -= 180
    while (d < -90) d += 180
    if (Math.abs(d) > Math.abs(piorAng)) piorAng = d
    if (Math.abs(barriga(jogo)) > Math.abs(piorBarriga)) piorBarriga = barriga(jogo)
  }
}
console.log(`  a maior virada: ${piorAng.toFixed(1)} graus`)
console.log(`  a maior barriga: ${piorBarriga.toFixed(2)} m (numa reta de 1000 m)`)
