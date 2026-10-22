// As curvas que o mapa põe onde a planta é reta, fora das zonas 1:1 (docs/mapa-1932.md, v17; branch cidade-ajustes).
//
// Pega o que v16 registrou em "o que pode dar errado": na borda oeste do centro (Moura Brasil) as ruas da grade
// viravam até 46 graus em 400 m, e a linha da costa e o tronco da via férrea faziam curva onde a planta é reta
// (costa: 68 graus em 400 m; tronco: 22). Correção: as retas na energia do gerador (docs/mapa-1932-escala.py,
// peso_reta_*), commit "Escala: retas da planta retas no mapa". Falha em d831390 (o campo já movido, sem as retas).
//
// A medida é a de scripts/diagnostico/cidade-ajustes.mjs: a linha de verdade andada a cada 10 m; o rumo de cada
// pedaço no jogo menos o de verdade; numa janela de 400 m só de trecho reto na planta, a variação desse desvio.
import { describe, it, expect } from 'vitest'
import { ll, geoDe, gradeDe, ZONAS_1A1 } from '../../src/mundo/escala1932.js'
import { latCostaReal } from '../../src/mundo/fortaleza1932.js'
import dados from '../../src/mundo/mapa1932-dados.json'
import ferrovia from '../../src/mundo/ferrovia1932.json'

const M_LON = 111320 * Math.cos((-3.7274448 * Math.PI) / 180)
const M_LAT = 110574
const GRAU = 180 / Math.PI
const ang = (a) => Math.atan2(Math.sin(a), Math.cos(a))
const naZona = (u, v) => ZONAS_1A1.some((z) => z.caixas.some(([a, b, c, d]) => u >= a && u <= b && v >= c && v <= d) || z.circulos.some(([cu, cv, r]) => Math.hypot(u - cu, v - cv) <= r))
const naCaixa = ([lon, lat]) => lon > -38.612 && lon < -38.44 && lat > -3.77 && lat < -3.688

function andar(pts, passo = 10) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]]
    const n = Math.max(1, Math.round(Math.hypot((b[0] - a[0]) * M_LON, (b[1] - a[1]) * M_LAT) / passo))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  out.push(pts[pts.length - 1])
  return out
}
// as curvas a mais (graus) em janelas de 40 pedaços (400 m) retas na planta (o rumo de verdade varia menos que tol)
function curvas(geo, { emTerra = false, tol = 2 } = {}) {
  const jogo = geo.map(([lon, lat]) => ll(lon, lat))
  const desvio = []
  const real = []
  const fora = []
  const ok = []
  for (let i = 0; i < geo.length - 1; i++) {
    const rj = Math.atan2(jogo[i + 1][1] - jogo[i][1], jogo[i + 1][0] - jogo[i][0])
    const rv = Math.atan2(-(geo[i + 1][1] - geo[i][1]) * M_LAT, (geo[i + 1][0] - geo[i][0]) * M_LON)
    desvio.push(i ? desvio[i - 1] + ang(ang(rj - rv) - desvio[i - 1]) : ang(rj - rv))
    real.push(i ? real[i - 1] + ang(rv - real[i - 1]) : rv)
    fora.push(!naZona(...gradeDe((geo[i][0] + geo[i + 1][0]) / 2, (geo[i][1] + geo[i + 1][1]) / 2)))
    ok.push(naCaixa(geo[i]) && naCaixa(geo[i + 1]) && (!emTerra || geo[i][1] < latCostaReal(geo[i][0]) - 60 / M_LAT))
  }
  const res = []
  for (let i = 0; i + 40 <= desvio.length; i++) {
    const d = desvio.slice(i, i + 40)
    const r = real.slice(i, i + 40)
    if ((Math.max(...r) - Math.min(...r)) * GRAU > tol) continue
    if (!fora.slice(i, i + 40).some(Boolean) || !ok.slice(i, i + 40).every(Boolean)) continue
    res.push((Math.max(...d) - Math.min(...d)) * GRAU)
  }
  return res.sort((a, b) => a - b)
}
const p95 = (a) => a[Math.floor(a.length * 0.95)]

describe('fora das zonas 1:1, o que a planta tem reto continua quase reto', () => {
  it('Moura Brasil: as ruas da grade na borda oeste do centro viram no máximo 20 graus em 400 m (antes 46)', () => {
    const todas = []
    for (const [du, dv] of [[1, 0], [0, 1]]) {
      for (let u = -1900; u <= -1000; u += 50) {
        for (let v = -300; v <= 1200; v += 50) {
          const geo = []
          for (let s = 0; s <= 400; s += 10) geo.push(geoDe(u + du * s, v + dv * s))
          todas.push(...curvas(geo, { emTerra: true }))
        }
      }
    }
    todas.sort((a, b) => a - b)
    expect(todas.length).toBeGreaterThan(500)
    expect(todas[todas.length - 1], 'a pior').toBeLessThan(20)
    expect(p95(todas), 'p95').toBeLessThan(15)
  })
  it('a costa de 1932 vira no máximo 30 graus em 400 m de trecho reto (antes 68)', () => {
    const c = curvas(andar(dados.costa))
    expect(c.length).toBeGreaterThan(500)
    expect(c[c.length - 1]).toBeLessThan(30)
  })
  it('o tronco e a Linha Norte viram no máximo 12 graus em 400 m de trecho reto (antes 22 e 8)', () => {
    for (const id of ['tronco', 'norte']) {
      const l = ferrovia.linhas.find((x) => x.id === id)
      const c = curvas(andar(l.tracado), { tol: 5 })
      expect([id, c.length > 0]).toEqual([id, true])
      expect(c[c.length - 1], id).toBeLessThan(12)
    }
  })
})
