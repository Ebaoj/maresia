// Diagnóstico do chão de 1932: escala local, onde fica o Centro, e a geometria
// das ruas (largura em metros reais, distância do eixo, para o rodeiro).
//
//   npx vite-node scripts/diagnostico/ver-chao-1932.mjs

import { ll, LIMITES, lugaresJogo, metrosPorUn, escalaJogo } from '../../src/mundo/fortaleza1932.js'
import dados from '../../src/mundo/mapa1932-lotes.json'

const METRO_POR_GRAU_LAT = 110574
const METRO_POR_GRAU_LON = (lat) => 111320 * Math.cos((lat * Math.PI) / 180)

// metros de longitude/latitude -> jogo: o inverso de ll() em metros
function metrosReais(lon, lat) {
  return [lon * METRO_POR_GRAU_LON(lat), lat * METRO_POR_GRAU_LAT]
}

console.log('=== a praça no jogo ===')
const [px, pz] = ll(-38.5276, -3.7275)
console.log('pracaFerreira jogo:', px.toFixed(1), pz.toFixed(1))
console.log('lugaresJogo.pracaFerreira:', lugaresJogo.pracaFerreira)
console.log('o ponto da foto (x=195 z=498): metrosPorUn =', metrosPorUn(195, 498).toFixed(3))
console.log('distancia da praca:', Math.hypot(195 - px, 498 - pz).toFixed(1), 'un')

console.log('\n=== perfil da escala (metros de verdade por unidade de jogo) ===')
for (const d of [0, 100, 200, 300, 400, 600, 800, 1200, 1600, 2000]) {
  const e = escalaJogo(px + d, pz)
  console.log(`${String(d).padStart(5)} un a leste da praca: ${metrosPorUn(px + d, pz).toFixed(3)} m/un  (escala x=${e.x.toFixed(4)} z=${e.z.toFixed(4)})`)
}

console.log('\n=== as cadeias (rede viária) ===')
console.log('cadeias:', dados.cadeias.length, 'fachadas:', dados.fachadas.length)

// a linha da testada de cada cadeia, em metros reais (lon/lat -> m local)
function testadaDeCadeia(cadeia) {
  const pts = []
  for (const [k, entrada] of cadeia) {
    const f = dados.fachadas[k]
    pts.push({ de: metrosReais(f[1], f[2]), para: metrosReais(f[3], f[4]), fundo: metrosReais(f[5], f[6]), uso: f[0] })
  }
  return pts
}

const cadeias = dados.cadeias.map((c, i) => {
  const pts = testadaDeCadeia(c)
  const a = pts[0].de
  const b = pts[pts.length - 1].para
  const larg = Math.hypot(b[0] - a[0], b[1] - a[1])
  // normal media (aponta para a rua): a perpendicular que fica longe do fundo do lote
  const f = pts[0]
  let nx = -(f.para[1] - f.de[1])
  let nz = f.para[0] - f.de[0]
  const nl = Math.hypot(nx, nz) || 1
  nx /= nl; nz /= nl
  const mx = (f.de[0] + f.para[0]) / 2
  const mz = (f.de[1] + f.para[1]) / 2
  if ((mx - f.fundo[0]) * nx + (mz - f.fundo[1]) * nz < 0) { nx = -nx; nz = -nz }
  return { i, pts, meio: [mx, mz], normal: [nx, nz], larg }
})

// a largura da rua: a distancia entre a testada de uma cadeia e a testada da
// cadeia vizinha que fica do outro lado da rua
const CEL = 5 // busca grosseira: 5 m
const grade = new Map()
for (const c of cadeias) {
  const [mx, mz] = c.meio
  const key = `${Math.floor(mx / CEL)},${Math.floor(mz / CEL)}`
  if (!grade.has(key)) grade.set(key, [])
  grade.get(key).push(c)
}
function vizinhas(c) {
  const out = []
  const [mx, mz] = c.meio
  const i0 = Math.floor(mx / CEL)
  const j0 = Math.floor(mz / CEL)
  for (let j = j0 - 3; j <= j0 + 3; j++) {
    for (let i = i0 - 3; i <= i0 + 3; i++) {
      const l = grade.get(`${i},${j}`)
      if (l) out.push(...l)
    }
  }
  return out
}

const larguras = []
for (const c of cadeias) {
  let melhor = Infinity
  for (const o of vizinhas(c)) {
    if (o === c) continue
    // o outra cadeia esta do outro lado da rua?
    const dot = o.normal[0] * c.normal[0] + o.normal[1] * c.normal[1]
    if (dot > -0.6) continue // mesma direcao: nao estao frente a frente
    const d = (o.meio[0] - c.meio[0]) * c.normal[0] + (o.meio[1] - c.meio[1]) * c.normal[1]
    if (d <= 0) continue
    // desvio lateral: quanto o outro meio esta fora da reta da testada
    const lat = Math.abs((o.meio[0] - c.meio[0]) * c.normal[1] - (o.meio[1] - c.meio[1]) * c.normal[0])
    if (lat > 25) continue
    if (d < melhor) melhor = d
  }
  larguras.push({ i: c.i, d: melhor, centro: c.meio })
}
const comLargura = larguras.filter((l) => Number.isFinite(l.d)).sort((a, b) => a.d - b.d)
const meds = (arr) => {
  if (!arr.length) return NaN
  const m = arr.slice().sort((a, b) => a - b)
  return m[Math.floor(m.length / 2)]
}
console.log('cadeias com par oposto:', comLargura.length, 'de', cadeias.length)
console.log('largura da rua (m reais): mediana', meds(comLargura.map((l) => l.d)).toFixed(1),
  'p10', comLargura[Math.floor(comLargura.length * 0.1)]?.d.toFixed(1),
  'p90', comLargura[Math.floor(comLargura.length * 0.9)]?.d.toFixed(1))
console.log('5 menores:', comLargura.slice(0, 5).map((l) => l.d.toFixed(1)).join(', '))

// as larguras perto da praca (onde o jogo esta em 1:1)
const perto = comLargura.filter((l) => Math.hypot(l.centro[0] - metrosReais(-38.5276, -3.7275)[0], l.centro[1] - metrosReais(-38.5276, -3.7275)[1]) < 400)
console.log('perto da praca (<400 m):', perto.length, 'mediana', meds(perto.map((l) => l.d)).toFixed(1))

console.log('\n=== o ponto da foto ===')
const alvo = ll(-38.5276, -3.7275)
// procura a cadeia mais proxima do ponto (x=195 z=498) em metros reais
let melhor = null
for (const c of cadeias) {
  const d = Math.hypot(c.meio[0] - alvo[0], c.meio[1] - alvo[1])
  if (!melhor || d < melhor.d) melhor = { d, c }
}
console.log('(a foto usa coordenadas de jogo; a cadeia mais proxima do centro da praca esta a', melhor.d.toFixed(0), 'm reais)')

console.log('\n=== limites do mundo ===')
console.log(LIMITES)
const largUn = (LIMITES.x1 - LIMITES.x0)
console.log('mundo em unidades:', largUn.toFixed(0), 'x', (LIMITES.z1 - LIMITES.z0).toFixed(0),
  '=> grade de 3 m:', Math.round(largUn / 3) + 1, 'x', Math.round((LIMITES.z1 - LIMITES.z0) / 3) + 1)
