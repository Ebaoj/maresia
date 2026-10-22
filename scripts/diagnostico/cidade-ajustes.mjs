// As curvas fora das zonas 1:1 e a caminhada do campo (docs/mapa-1932.md, v17; branch cidade-ajustes).
//
//   node scripts/diagnostico/rodar-modulo.mjs scripts/diagnostico/cidade-ajustes.mjs [SAIDA.json]
//   RAIZ=/worktree/de/antes node scripts/diagnostico/rodar-modulo.mjs scripts/diagnostico/cidade-ajustes.mjs
//
// Tudo é medido por ll() (a transformada que o jogo usa), então roda igual no código de antes. As medidas:
//   - "curva a mais": uma linha de verdade (reta da grade, a costa, a via férrea) andada a cada 10 m; o rumo de cada
//     pedaço no jogo menos o rumo do mesmo pedaço de verdade. Em 400 m de linha, o quanto esse giro varia é a curva
//     que o mapa pôs onde a planta não tem (graus); em 20 m, a quina.
//   - Moura Brasil: as retas da grade (ao longo da rua e de travessia) que começam na borda oeste do centro
//     (u de -1.900 a -1.000, v de -300 a 1.200, no quadro da grade), fora da zona 1:1 e em terra (60 m ao sul da costa).
//   - a costa de 1932 (a polilinha de fortaleza1932.js) e a via férrea da planta (ferrovia1932.json), inteiras.
//   - a anisotropia (a escala na direção que mais estica sobre a que menos estica): nas fachadas de 1932 fora das
//     zonas, ao longo da costa e no corredor do campo ao centro (a faixa de 700 m em volta do caminho).
//   - a caminhada: do portão do campo (a planta do campo) à Praça do Ferreira e à borda oeste do centro, em linha
//     reta no mapa do jogo.
import { writeFileSync } from 'node:fs'
import { ll, geoDe, gradeDe, ZONAS_1A1 } from '/src/mundo/escala1932.js'
import { latCostaReal } from '/src/mundo/fortaleza1932.js'
import lotes from '/src/mundo/mapa1932-lotes.json'
import ferrovia from '/src/mundo/ferrovia1932.json'
import malha from '/src/mundo/escala1932-malha.json'
import { PLANTA } from '/src/mundo/urubu-planta.js'

const M_LON = 111320 * Math.cos((-3.7274448 * Math.PI) / 180)
const M_LAT = 110574
const COSTA = [
  [-38.64, -3.682], [-38.612, -3.688], [-38.603, -3.6915], [-38.5995, -3.6945], [-38.597, -3.693], [-38.591, -3.6955],
  [-38.584, -3.6985], [-38.576, -3.7015], [-38.568, -3.7045], [-38.561, -3.7072], [-38.554, -3.7102], [-38.547, -3.7128],
  [-38.541, -3.715], [-38.536, -3.7165], [-38.531, -3.7182], [-38.5275, -3.7186], [-38.5262, -3.7172], [-38.5248, -3.718],
  [-38.521, -3.7178], [-38.517, -3.7176], [-38.512, -3.7188], [-38.506, -3.72], [-38.499, -3.7212], [-38.492, -3.7216],
  [-38.486, -3.7208], [-38.481, -3.7186], [-38.4775, -3.7158], [-38.4745, -3.7136], [-38.471, -3.714], [-38.466, -3.7168],
  [-38.459, -3.721], [-38.452, -3.726], [-38.444, -3.732], [-38.436, -3.739],
]

function naZona(u, v) {
  for (const z of ZONAS_1A1) {
    for (const [a, b, c, d] of z.caixas) if (u >= a && u <= b && v >= c && v <= d) return true
    for (const [cu, cv, r] of z.circulos) if (Math.hypot(u - cu, v - cv) <= r) return true
  }
  return false
}
const pct = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : NaN }
const ang = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }
const GRAU = 180 / Math.PI

// a polilinha de verdade (lon/lat) andada a cada passo metros
function andar(pts, passo = 10) {
  const out = []
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]]
    const m = Math.hypot((b[0] - a[0]) * M_LON, (b[1] - a[1]) * M_LAT)
    const n = Math.max(1, Math.round(m / passo))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  }
  out.push(pts[pts.length - 1])
  return out
}

// o giro a mais (graus) da linha no jogo, em janelas de "janela" pedaços: para cada pedaço, o rumo no jogo menos o de
// verdade (o z do jogo cresce para o sul: o rumo de verdade é medido com o norte para baixo); a curva a mais numa
// janela é o maior menos o menor desse desvio. Só entram janelas com algum ponto fora das zonas 1:1 e com todos
// os pontos dentro da caixa do mapa (fora dela a malha não vale) e, se emTerra, em terra (ao sul da costa); e só
// os trechos que são retos na planta: a curva que o mapa pôs onde a linha de verdade é reta
const naCaixa = ([lon, lat]) => lon > -38.612 && lon < -38.44 && lat > -3.77 && lat < -3.688
function curvaAMais(geo, janela, emTerra = false, tolReal = 2) {
  const jogo = geo.map(([lon, lat]) => ll(lon, lat))
  const desvio = []
  const fora = []
  const valido = []
  const real = []
  for (let i = 0; i < geo.length - 1; i++) {
    const rj = Math.atan2(jogo[i + 1][1] - jogo[i][1], jogo[i + 1][0] - jogo[i][0])
    const rv = Math.atan2(-(geo[i + 1][1] - geo[i][1]) * M_LAT, (geo[i + 1][0] - geo[i][0]) * M_LON)
    desvio.push(ang(rj - rv))
    real.push(rv)
    const [u, v] = gradeDe((geo[i][0] + geo[i + 1][0]) / 2, (geo[i][1] + geo[i + 1][1]) / 2)
    fora.push(!naZona(u, v))
    valido.push(naCaixa(geo[i]) && naCaixa(geo[i + 1]) && (!emTerra || geo[i][1] < latCostaReal(geo[i][0]) - 60 / M_LAT))
  }
  // desenrola o desvio (sem salto de 2 pi)
  for (let i = 1; i < desvio.length; i++) desvio[i] = desvio[i - 1] + ang(desvio[i] - desvio[i - 1])
  for (let i = 1; i < real.length; i++) real[i] = real[i - 1] + ang(real[i] - real[i - 1])
  const res = []
  for (let i = 0; i + janela <= desvio.length; i++) {
    let algum = false
    let ok = true
    let mn = Infinity
    let mx = -Infinity
    let rmn = Infinity
    let rmx = -Infinity
    for (let k = i; k < i + janela; k++) { rmn = Math.min(rmn, real[k]); rmx = Math.max(rmx, real[k]) }
    // só os trechos retos na planta (o rumo de verdade varia menos de 2 graus na janela)
    if ((rmx - rmn) * GRAU > tolReal) continue
    for (let k = i; k < i + janela; k++) { if (fora[k]) algum = true; if (!valido[k]) ok = false; mn = Math.min(mn, desvio[k]); mx = Math.max(mx, desvio[k]) }
    if (algum && ok) res.push({ graus: (mx - mn) * GRAU, onde: gradeDe(...geo[i + (janela >> 1)]).map(Math.round) })
  }
  return res
}
function resumoCurva(lista) {
  if (!lista.length) return { n: 0 }
  let pior = lista[0]
  for (const r of lista) if (r.graus > pior.graus) pior = r
  return { n: lista.length, p50: +pct(lista.map((r) => r.graus), 50).toFixed(2), p95: +pct(lista.map((r) => r.graus), 95).toFixed(2), pior: +pior.graus.toFixed(2), ondePior: pior.onde }
}

// anisotropia da transformada num lugar (diferença finita de ll)
function aniso(lon, lat, h = 4) {
  const p = ll(lon, lat)
  const e = ll(lon + h / M_LON, lat)
  const n = ll(lon, lat + h / M_LAT)
  const a = (e[0] - p[0]) / h, b = (n[0] - p[0]) / h, c = (e[1] - p[1]) / h, d = (n[1] - p[1]) / h
  const s1 = a * a + b * b + c * c + d * d
  const det = Math.abs(a * d - b * c)
  const r = Math.sqrt(Math.max(0, s1 * s1 - 4 * det * det))
  return Math.sqrt((s1 + r) / 2) / Math.sqrt(Math.max(1e-12, (s1 - r) / 2))
}
const resumoAni = (arr) => ({ n: arr.length, p50: +pct(arr, 50).toFixed(3), p99: +pct(arr, 99).toFixed(3), pior: +Math.max(...arr).toFixed(3) })

export default function ([saida]) {
  const r = {}
  // ---- Moura Brasil: as retas da grade na borda oeste do centro ----
  const ruas400 = []
  const ruas20 = []
  for (const [du, dv] of [[1, 0], [0, 1]]) {
    for (let u = -1900; u <= -1000; u += 50) {
      for (let v = -300; v <= 1200; v += 50) {
        const geo = []
        for (let s = 0; s <= 400; s += 10) geo.push(geoDe(u + du * s, v + dv * s))
        ruas400.push(...curvaAMais(geo, 40, true))
        ruas20.push(...curvaAMais(geo, 2, true))
      }
    }
  }
  r.mouraBrasil = { 'curva a mais em 400 m (graus)': resumoCurva(ruas400), 'quina em 20 m (graus)': resumoCurva(ruas20) }
  // ---- a costa ----
  const costa = andar(COSTA)
  r.costa = { 'curva a mais em 400 m (graus)': resumoCurva(curvaAMais(costa, 40)), 'quina em 20 m (graus)': resumoCurva(curvaAMais(costa, 2)) }
  // ---- a via férrea ----
  r.ferrovia = {}
  for (const l of ferrovia.linhas) {
    const g = andar(l.tracado)
    if (g.length < 42) continue
    // a linha lida no scan tem a tremura do traço: reta na planta é o rumo variando menos de 5 graus em 400 m
    r.ferrovia[l.id] = { 'curva a mais em 400 m (graus)': resumoCurva(curvaAMais(g, 40, false, 5)), 'quina em 20 m (graus)': resumoCurva(curvaAMais(g, 2, false, 5)) }
  }
  // ---- anisotropia ----
  const fach = []
  for (const f of lotes.fachadas) {
    const lon = (f[1] + f[3]) / 2
    const lat = (f[2] + f[4]) / 2
    const [u, v] = gradeDe(lon, lat)
    if (naZona(u, v)) continue
    fach.push(aniso(lon, lat))
  }
  const naCosta = []
  for (const [lon, lat] of costa) {
    const [u, v] = gradeDe(lon, lat)
    if (naZona(u, v) || lon < -38.61 || lon > -38.44) continue
    naCosta.push(aniso(lon, lat))
  }
  const corredor = []
  const [[ax, ay], [bx, by]] = malha.caminho
  for (let u = -6000; u <= -1000; u += 25) {
    for (let v = -1200; v <= 1200; v += 25) {
      if (naZona(u, v)) continue
      const t = Math.max(0, Math.min(1, ((u - ax) * (bx - ax) + (v - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
      if (Math.hypot(u - ax - t * (bx - ax), v - ay - t * (by - ay)) > 350) continue
      corredor.push(aniso(...geoDe(u, v)))
    }
  }
  r.anisotropia = { 'fachadas fora das zonas': resumoAni(fach), costa: resumoAni(naCosta), 'corredor do campo (350 m do caminho)': resumoAni(corredor) }
  // ---- a caminhada ----
  const pr = ll(-38.5275014, -3.7274448)
  const borda = ll(...geoDe(-1000, -20))
  const pt = PLANTA.portao
  r.caminhada = {
    'portão -> Praça do Ferreira (un)': Math.round(Math.hypot(pt.x - pr[0], pt.z - pr[1])),
    'portão -> borda oeste do centro, u = -1000 (un)': Math.round(Math.hypot(pt.x - borda[0], pt.z - borda[1])),
  }
  console.log(JSON.stringify(r, null, 1))
  if (saida) writeFileSync(saida, JSON.stringify(r, null, 1))
}
