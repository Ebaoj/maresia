// Diagnóstico da escala do centro em 1:1 (docs/mapa-1932.md, v16): o mapa da escala local e a conferência
// da largura das ruas em todas as ruas da planta de 1932.
//
//   node scripts/diagnostico/rodar-modulo.mjs scripts/diagnostico/escala-centro.mjs PASTA [rotulo]
//   RAIZ=/worktree/de/antes node scripts/diagnostico/rodar-modulo.mjs scripts/diagnostico/escala-centro.mjs PASTA antes
//
// Escreve em PASTA:
//   escala-<rotulo>.json + .esc + .ani   a escala local (un por metro, média das duas direções) e a anisotropia
//                                        num recorte do quadro da grade, 10 m por pixel (o desenho é do
//                                        scripts/diagnostico/escala-centro-mapa.py)
//   ruas-<rotulo>.json                   por rua (cadeia de testadas da planta): a escala de travessia (a que
//                                        dá a largura da rua no jogo) e a de ao longo, em cada testada
// e imprime o resumo. Tudo por diferença finita de ll(): roda igual no código de antes.
import { writeFileSync } from 'node:fs'
import { ll, geoDe, gradeDe } from '/src/mundo/fortaleza1932.js'
import lotes from '/src/mundo/mapa1932-lotes.json'

const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180)
const M_LAT = 110574

// o passo do jogo para h metros de verdade na direção (de, dn)
function escalaNaDirecao(lon, lat, de, dn, h = 4) {
  const a = ll(lon - (de * h) / 2 / M_LON, lat - (dn * h) / 2 / M_LAT)
  const b = ll(lon + (de * h) / 2 / M_LON, lat + (dn * h) / 2 / M_LAT)
  return Math.hypot(b[0] - a[0], b[1] - a[1]) / h
}
function principais(lon, lat) {
  const h = 4
  const p = ll(lon, lat)
  const e = ll(lon + h / M_LON, lat)
  const n = ll(lon, lat + h / M_LAT)
  const a = (e[0] - p[0]) / h, b = (n[0] - p[0]) / h, c = (e[1] - p[1]) / h, d = (n[1] - p[1]) / h
  const s1 = a * a + b * b + c * c + d * d
  const det = Math.abs(a * d - b * c)
  const r = Math.sqrt(Math.max(0, s1 * s1 - 4 * det * det))
  return [Math.sqrt((s1 + r) / 2), Math.sqrt(Math.max(1e-12, (s1 - r) / 2))]
}
const pct = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] }

export default function ([pasta = '/tmp', rotulo = 'agora']) {
  // 1. o mapa da escala, no quadro da grade
  const R = { u0: -6000, u1: 3000, v0: -3600, v1: 2400, px: 10 }
  const W = Math.round((R.u1 - R.u0) / R.px)
  const H = Math.round((R.v1 - R.v0) / R.px)
  const esc = new Float32Array(W * H)
  const ani = new Float32Array(W * H)
  for (let i = 0; i < H; i++) {
    for (let j = 0; j < W; j++) {
      const [lon, lat] = geoDe(R.u0 + (j + 0.5) * R.px, R.v1 - (i + 0.5) * R.px)
      const [s1, s2] = principais(lon, lat)
      esc[i * W + j] = Math.sqrt(s1 * s2)
      ani[i * W + j] = s1 / s2
    }
  }
  writeFileSync(`${pasta}/escala-${rotulo}.json`, JSON.stringify({ ...R, W, H }))
  writeFileSync(`${pasta}/escala-${rotulo}.esc`, Buffer.from(esc.buffer))
  writeFileSync(`${pasta}/escala-${rotulo}.ani`, Buffer.from(ani.buffer))

  // 2. a largura das ruas: cada rua da planta (uma cadeia de testadas que se encaram ao longo da mesma rua) e,
  // em cada testada, a escala de travessia (normal à testada: é ela que dá a largura da rua no jogo) e a de ao
  // longo. A rua "proporcional" tem as duas iguais (razão 1) e a travessia não salta de uma testada para a
  // vizinha. Com as faixas de antes, a mesma rua tinha a travessia até 3 vezes maior dentro da faixa
  const ruas = []
  const razoes = []
  const saltos = []
  const variacao = []
  for (const cadeia of lotes.cadeias) {
    const pts = []
    for (const [k] of cadeia) {
      const f = lotes.fachadas[k]
      const de = (f[3] - f[1]) * M_LON
      const dn = (f[4] - f[2]) * M_LAT
      const L = Math.hypot(de, dn)
      if (L < 3) continue
      const lon = (f[1] + f[3]) / 2
      const lat = (f[2] + f[4]) / 2
      const ao = escalaNaDirecao(lon, lat, de / L, dn / L)
      const trav = escalaNaDirecao(lon, lat, -dn / L, de / L)
      const [u, v] = gradeDe(lon, lat)
      pts.push({ u: Math.round(u), v: Math.round(v), ao: +ao.toFixed(4), trav: +trav.toFixed(4) })
      razoes.push(trav / ao)
    }
    if (pts.length < 2) continue
    let maxSalto = 1
    for (let i = 1; i < pts.length; i++) {
      const r = pts[i].trav / pts[i - 1].trav
      maxSalto = Math.max(maxSalto, r, 1 / r)
    }
    const travs = pts.map((p) => p.trav)
    const v = Math.max(...travs) / Math.min(...travs)
    saltos.push(maxSalto)
    variacao.push(v)
    ruas.push({ testadas: pts.length, maiorSalto: +maxSalto.toFixed(3), variacao: +v.toFixed(3), pontos: pts })
  }
  writeFileSync(`${pasta}/ruas-${rotulo}.json`, JSON.stringify({ ruas }))
  const resumo = {
    rotulo,
    ruas: ruas.length,
    testadas: razoes.length,
    'travessia/ao longo (p1, p50, p99, pior)': [pct(razoes, 1), pct(razoes, 50), pct(razoes, 99), Math.max(...razoes, ...razoes.map((r) => 1 / r))].map((x) => +x.toFixed(3)),
    'maior salto da travessia entre testadas vizinhas da mesma rua (p50, p99, pior)': [pct(saltos, 50), pct(saltos, 99), Math.max(...saltos)].map((x) => +x.toFixed(3)),
    'a travessia mais larga sobre a mais estreita na mesma rua (p50, p99, pior)': [pct(variacao, 50), pct(variacao, 99), Math.max(...variacao)].map((x) => +x.toFixed(3)),
    'ruas cuja travessia varia mais de 2 vezes': variacao.filter((x) => x > 2).length,
  }
  writeFileSync(`${pasta}/ruas-${rotulo}-resumo.json`, JSON.stringify(resumo, null, 1))
  console.log(JSON.stringify(resumo, null, 1))
}
