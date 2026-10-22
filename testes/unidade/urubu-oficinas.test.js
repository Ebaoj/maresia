// O Campo do Urubu ao lado das Oficinas da RVC, não em cima delas (docs/mapa-1932.md, v17; branch cidade-ajustes).
//
// Pega o conflito registrado em v16: o polígono do campo (reconstituição, H) cobria o recinto das Oficinas da Rede
// de Viação Cearense que a Planta de 1931-1932 desenha (src/mundo/ferrovia1932.json, "patios"). As fontes (dossiê
// marcos-1932, seção 23): o campo ficava "na praia não muito próximo do mar", perto das oficinas, isolado da cidade
// pela linha do trem. Falha em f6bf9e6 (o recinto inteiro dentro da cerca); passa com o campo movido (commit
// "Campo do Urubu ao lado das Oficinas da RVC").
//
// Tudo em metros de verdade (lon/lat), sem a escala do jogo.
import { describe, it, expect } from 'vitest'
import dados from '../../src/mundo/mapa1932-dados.json'
import ferrovia from '../../src/mundo/ferrovia1932.json'
import { latCostaReal } from '../../src/mundo/fortaleza1932.js'

const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180)
const M_LAT = 110574
const m = ([lon, lat]) => [lon * M_LON, lat * M_LAT]
const CERCA = dados.campoUrubu.poligono.map(m)
const RECINTO = ferrovia.patios.find((p) => p.id === 'oficinas_urubu').poligono.map(m)
const NORTE = ferrovia.linhas.find((l) => l.id === 'norte').tracado

function dentro([x, z], p) {
  let d = false
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, zi] = p[i]
    const [xj, zj] = p[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) d = !d
  }
  return d
}
// os pontos da borda a cada ~5 m
function borda(p) {
  const out = []
  for (let i = 0; i < p.length; i++) {
    const [a, b] = [p[i], p[(i + 1) % p.length]]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  return out
}
const dist = (A, B) => Math.min(...A.map((a) => Math.min(...B.map((b) => Math.hypot(a[0] - b[0], a[1] - b[1])))))

describe('o Campo do Urubu e as Oficinas da RVC', () => {
  it('o campo não cobre o recinto das oficinas da planta de 1931-1932 (e fica ao lado dele)', () => {
    const bc = borda(CERCA)
    const br = borda(RECINTO)
    expect(br.filter((p) => dentro(p, CERCA)).length, 'pontos do recinto dentro da cerca').toBe(0)
    expect(bc.filter((p) => dentro(p, RECINTO)).length, 'pontos da cerca dentro do recinto').toBe(0)
    const d = dist(bc, br)
    expect(d, 'folga entre a cerca e o recinto (m)').toBeGreaterThan(30)
    expect(d, 'o campo fica perto das oficinas (m)').toBeLessThan(150)
  })

  it('o campo fica do lado do mar da Linha Norte, perto dela, e não muito próximo do mar', () => {
    // a Linha Norte, onde ela corre para oeste (antes de dobrar para o sul, na junção das oficinas): a latitude da
    // linha numa longitude
    const trecho = NORTE.filter(([lon]) => lon > -38.5695)
    const latLinha = (lon) => {
      for (let i = 0; i < trecho.length - 1; i++) {
        const [a, la] = trecho[i]
        const [b, lb] = trecho[i + 1]
        if ((lon - a) * (lon - b) <= 0 && a !== b) return la + ((lon - a) / (b - a)) * (lb - la)
      }
      return null
    }
    let pertoDaLinha = Infinity
    let pertoDoMar = Infinity
    for (const [lon, lat] of borda(dados.campoUrubu.poligono)) {
      const ll = latLinha(lon)
      expect(ll, `a linha passa ao sul do campo em ${lon}`).not.toBeNull()
      expect(lat, `cerca ao norte da linha em ${lon}`).toBeGreaterThan(ll)
      pertoDaLinha = Math.min(pertoDaLinha, (lat - ll) * M_LAT)
      pertoDoMar = Math.min(pertoDoMar, (latCostaReal(lon) - lat) * M_LAT)
    }
    expect(pertoDaLinha, 'a cerca perto da linha (m)').toBeLessThan(100)
    expect(pertoDoMar, 'a cerca longe da beira do mar (m)').toBeGreaterThan(250)
  })
})
