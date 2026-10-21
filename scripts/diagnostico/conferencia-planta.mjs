// A conferencia com a planta oficial de 1932: as casas do jogo sobre os lotes
// oficiais da Prefeitura.
//
//   npx vite-node scripts/diagnostico/conferencia-planta.mjs
//
// O que este script confere, em tres recortes (o Centro na Praca do Ferreira,
// um bairro e a borda da rampa de escala):
//
//   1. quantas casas do jogo estao dentro do lote oficial;
//   2. quantas tem a fachada virada para a rua;
//   3. quantas tem parede lateral ou de fundo atravessando a rua (o defeito
//      que o Joabe viu: uma parede cega no meio da rua);
//   4. quanto da testada esta construida;
//   5. o angulo medio das casas do Centro contra a grade de Herbster
//      (ANGULO_GRADE, 72,5 graus).
//
// As medidas sao feitas em lon/lat (o espaco da planta oficial), com as casas
// do jogo convertidas para la: e assim que se descobre se a casa cabe no lote
// que a propria planta desenhou. O desenho (a vista de cima ortografica) sai
// do script Python ao lado, que le o JSON escrito aqui.

import fs from 'node:fs'
import { ll, ANGULO_GRADE, lugaresJogo, metrosPorUn } from '../../src/mundo/fortaleza1932.js'
import { llInverso } from '../../src/mundo/mapa1932.js'
import { FACHADAS } from '../../src/mundo/casario1932.js'
import dadosLotes from '../../src/mundo/mapa1932-lotes.json'

const GEOJSON = process.env.LOTES_GEOJSON || '/tmp/lotes1932.geojson'
const SAIDA = process.env.CONFERENCIA_JSON || '/tmp/conferencia-planta.json'

// --------------------------------------------------------------- geometria
// os cantos de uma casa: o x local e a fachada (a largura), o z local e a
// profundidade (a frente fica no lado +z)
function cantosCasa(f) {
  const c = Math.cos(f.rot)
  const s = Math.sin(f.rot)
  const pts = []
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    pts.push([f.x + lx * (f.w / 2) * c + lz * (f.d / 2) * s, f.z - lx * (f.w / 2) * s + lz * (f.d / 2) * c])
  }
  return pts
}

// a normal da fachada (para onde a casa olha) e o tangente da testada
function normalCasa(f) {
  return [Math.sin(f.rot), Math.cos(f.rot)]
}

function dentroDoPoligono(pts, x, z) {
  let dentro = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0]
    const zi = pts[i][1]
    const xj = pts[j][0]
    const zj = pts[j][1]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dentro = !dentro
  }
  return dentro
}

// a distancia de um ponto ate o anel (em metros de verdade). O ponto esta
// dentro (ou na borda) quando essa distancia e pequena.
const METRO_LON = 101000
const METRO_LAT = 110574
function distanciaAteAnel(anel, lon, lat) {
  let d = Infinity
  for (let i = 0; i < anel.length; i++) {
    const p = anel[i]
    const q = anel[(i + 1) % anel.length]
    const ex = (q[0] - p[0]) * METRO_LON
    const ey = (q[1] - p[1]) * METRO_LAT
    const px = (lon - p[0]) * METRO_LON
    const py = (lat - p[1]) * METRO_LAT
    const den = ex * ex + ey * ey
    let t = den > 0 ? (px * ex + py * ey) / den : 0
    t = Math.max(0, Math.min(1, t))
    d = Math.min(d, Math.hypot(px - ex * t, py - ey * t))
  }
  return d
}

// dentro do lote, com a borda contando como dentro
function dentroDoLoteComBorda(anel, lon, lat, tol = 0.5) {
  if (dentroDoPoligono(anel, lon, lat)) return true
  return distanciaAteAnel(anel, lon, lat) <= tol
}

// cruza dois segmentos (ponta a ponta)
function cruzaSeg(a1, a2, b1, b2) {
  const d = (a2[0] - a1[0]) * (b2[1] - b1[1]) - (a2[1] - a1[1]) * (b2[0] - b1[0])
  if (Math.abs(d) < 1e-12) return false
  const t = ((b1[0] - a1[0]) * (b2[1] - b1[1]) - (b1[1] - a1[1]) * (b2[0] - b1[0])) / d
  const u = ((b1[0] - a1[0]) * (a2[1] - a1[1]) - (b1[1] - a1[1]) * (a2[0] - a1[0])) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

// ------------------------------------------------------------- os lotes
if (!fs.existsSync(GEOJSON)) {
  console.error(`falta o geojson oficial (${GEOJSON}); rode docs/mapa-1932-lotes.py para baixar`)
  process.exit(1)
}
const geo = JSON.parse(fs.readFileSync(GEOJSON, 'utf8'))
const lotes = []
for (const feat of geo.features) {
  const g = feat.geometry
  if (!g) continue
  const partes = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  for (const aneis of partes) {
    for (const anel of aneis) {
      if (anel.length < 3) continue
      lotes.push(anel.map(([lon, lat]) => [lon, lat]))
    }
  }
}
console.log(`lotes oficiais: ${lotes.length}`)

// indice espacial dos lotes: uma grade de 24 un no mundo do jogo.
// O anel fica em lon/lat (a planta oficial e medida em lon/lat) e a busca
// acontece no espaco do jogo, onde o indice e uma grade simples.
const CEL = 24
const indice = new Map()
const chave = (x, z) => `${Math.floor(x / CEL)},${Math.floor(z / CEL)}`
for (let i = 0; i < lotes.length; i++) {
  let x0 = Infinity
  let x1 = -Infinity
  let z0 = Infinity
  let z1 = -Infinity
  for (const [lon, lat] of lotes[i]) {
    const [x, z] = ll(lon, lat)
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  for (let j = Math.floor(z0 / CEL); j <= Math.floor(z1 / CEL); j++) {
    for (let k = Math.floor(x0 / CEL); k <= Math.floor(x1 / CEL); k++) {
      const key = `${k},${j}`
      if (!indice.has(key)) indice.set(key, [])
      indice.get(key).push(i)
    }
  }
}

// o ponto (em coordenadas de jogo) esta dentro de algum lote? A borda conta
// como dentro (tolerancia de 0,5 m): o centro da casa cai exatamente na linha
// do lote em boa parte das testadas, e o teste de ponto-em-poligono falha
// justo na borda.
function temLote(x, z) {
  const lista = indice.get(chave(x, z))
  if (!lista) return false
  const [lon, lat] = llInverso(x, z)
  for (const i of lista) if (dentroDoLoteComBorda(lotes[i], lon, lat)) return true
  return false
}

// o indice do lote que contem o ponto (para saber de qual lote a casa veio)
function indiceDoLote(x, z) {
  const lista = indice.get(chave(x, z))
  if (!lista) return -1
  const [lon, lat] = llInverso(x, z)
  for (const i of lista) if (dentroDoPoligono(lotes[i], lon, lat)) return i
  return -1
}

// ------------------------------------------------- as testadas da planta
// A rede viaria da planta oficial: a linha da frente de cada lote. O jogo
// agrupou essas testadas em cadeias (ruas) e em casas; aqui elas sao a
// referencia: uma parede que cruza uma testada que nao e a dela atravessou a
// rua.
const testadas = dadosLotes.fachadas.map((f) => ({
  a: [f[1], f[2]],
  b: [f[3], f[4]],
}))
// indice espacial das testadas (em coordenadas de lon/lat, numa grade de 0,002 grau)
const CEL_LL = 0.002
const idxT = new Map()
const chaveLL = (lon, lat) => `${Math.floor(lon / CEL_LL)},${Math.floor(lat / CEL_LL)}`
for (let i = 0; i < testadas.length; i++) {
  const { a, b } = testadas[i]
  const i0 = Math.floor(Math.min(a[0], b[0]) / CEL_LL)
  const i1 = Math.floor(Math.max(a[0], b[0]) / CEL_LL)
  const j0 = Math.floor(Math.min(a[1], b[1]) / CEL_LL)
  const j1 = Math.floor(Math.max(a[1], b[1]) / CEL_LL)
  for (let j = j0; j <= j1; j++) {
    for (let k = i0; k <= i1; k++) {
      const key = `${k},${j}`
      if (!idxT.has(key)) idxT.set(key, [])
      idxT.get(key).push(i)
    }
  }
}

// as testadas perto de um ponto (em lon/lat)
function testadasPerto(lon, lat, raioGraus = 0.006) {
  const achadas = new Set()
  const i0 = Math.floor((lon - raioGraus) / CEL_LL)
  const i1 = Math.floor((lon + raioGraus) / CEL_LL)
  const j0 = Math.floor((lat - raioGraus) / CEL_LL)
  const j1 = Math.floor((lat + raioGraus) / CEL_LL)
  for (let j = j0; j <= j1; j++) {
    for (let k = i0; k <= i1; k++) {
      const l = idxT.get(`${k},${j}`)
      if (l) for (const i of l) achadas.add(i)
    }
  }
  return [...achadas]
}

// -------------------------------------------------------------- os recortes
const [pfX, pfZ] = lugaresJogo.pracaFerreira
// O raio do recorte e em METROS DE VERDADE (o mesmo pedaco de cidade na
// compressao antiga e na nova), convertido para a unidade do jogo no centro.
const RAIO_REAL = 320
const recorte = (nome, titulo, lon, lat, raioReal = RAIO_REAL) => {
  const [cx, cz] = ll(lon, lat)
  const raio = raioReal / metrosPorUn(cx, cz)
  return { nome, titulo, cx, cz, raio, raioReal }
}
const RECORTES = [
  recorte('centro', 'Centro (Praca do Ferreira)', -38.5276, -3.7275),
  recorte('bairro', 'Bairro (Campo do Otavio Bonfim)', -38.5485, -3.7345),
  recorte('rampa', 'Borda da rampa de escala', -38.5315014, -3.7274448),
  recorte('detalhe', 'Detalhe (a volta da Praca do Ferreira)', -38.5276, -3.7275, 70),
]

// as testadas da planta dentro do recorte (em coordenadas de jogo)
function testadasDoRecorte(rec, naRecorte) {
  return testadas
    .map((t) => {
      const [gx, gz] = ll(t.a[0], t.a[1])
      const [hx, hz] = ll(t.b[0], t.b[1])
      return [gx, gz, hx, hz]
    })
    .filter((t) => naRecorte(t[0], t[1]) || naRecorte(t[2], t[3]))
}

// o angulo da grade no mundo do jogo: as testadas da planta perto da praca
// dizem em que direcao a rua corre de verdade depois da compressao
function anguloDaGrade(testadasDoRecorte) {
  const angs = []
  for (const t of testadasDoRecorte) {
    const dx = t[2] - t[0]
    const dz = t[3] - t[1]
    if (Math.hypot(dx, dz) < 2) continue
    let a = (Math.atan2(dz, dx) * 180) / Math.PI
    if (a < 0) a += 180
    angs.push(a)
  }
  angs.sort((a, b) => a - b)
  // o angulo que mais testadas seguem (a moda, em faixas de 5 graus)
  const faixas = new Map()
  for (const a of angs) {
    const k = Math.round(a / 5) * 5
    faixas.set(k, (faixas.get(k) || 0) + 1)
  }
  let melhor = 0
  let n = 0
  for (const [k, v] of faixas) if (v > n) { n = v; melhor = k }
  return { angulo: melhor, cobertura: angs.length ? n / angs.length : 0, testadas: angs.length }
}

// o angulo da testada de uma casa contra a grade de Herbster
function anguloTestada(f) {
  const n = normalCasa(f)
  // a direcao da testada e a perpendicular da normal
  const ang = Math.atan2(-n[0], n[1]) * 180 / Math.PI
  return ang
}
function diferencaParaGrade(ang, alvo) {
  // a casa esta na grade se a testada (ou a sua oposta) bate com a direcao
  // da rua: a diferenca para o angulo que a grade corre no mundo do jogo
  let d = Math.abs(((ang % 180) + 180) % 180 - alvo)
  if (d > 90) d = 180 - d
  return Math.min(d, Math.abs(d - 90)) // a testada e a normal: as duas valem
}

// o meio da fachada: o ponto que fica na linha da frente
function meioFachada(c) {
  return [c.x + c.normal[0] * (c.d / 2), c.z + c.normal[1] * (c.d / 2)]
}

const casas = FACHADAS.map((f) => {
  const n = normalCasa(f)
  return {
    x: f.x, z: f.z, w: f.w, d: f.d, rot: f.rot,
    tipo: f.tipo, uso: f.nome,
    pontos: cantosCasa(f),
    normal: n,
    frentes: f.frentes || [],
    lonlat: null,
  }
})

// as casas em lon/lat (a planta oficial e medida em lon/lat)
for (const c of casas) {
  c.lonlat = c.pontos.map(([x, z]) => llInverso(x, z))
  const m = meioFachada(c)
  c.lonlatFachada = llInverso(m[0], m[1])
}

// A rua da grade que passa pelo centro do recorte: a compressao do mapa e
// separavel em lon/lat (a antiga), e a rua da grade - que corre a 72,5 graus -
// sao entao uma curva: ela torcia 0,4 grau na praca e 52 graus no oeste, e as
// ruas abriam leque. Com a compressao no quadro da grade a rua fica reta.
// Aqui: o quanto ela curva (a barriga, em unidades do jogo) e o quanto o angulo
// dela muda de uma ponta do recorte a outra (o leque, em graus).
const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180)
const M_LAT = 110574
function ruaDaGrade(rec) {
  const ux = Math.sin(ANGULO_GRADE)
  const uy = Math.cos(ANGULO_GRADE)
  const [lon, lat] = llInverso(rec.cx, rec.cz)
  const pts = []
  for (let i = -10; i <= 10; i++) pts.push(ll(lon + (i * 20 * ux) / M_LON, lat + (i * 20 * uy) / M_LAT))
  const [a, b] = [pts[0], pts[pts.length - 1]]
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const len = Math.hypot(dx, dz) || 1
  let barriga = 0
  for (const p of pts) {
    const d = Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len
    if (d > barriga) barriga = d
  }
  const angulo = (Math.atan2(dz, dx) * 180) / Math.PI
  // o leque: o angulo da mesma rua em cada ponta do recorte
  // a direcao da reta (sem sentido: a rua e a mesma nos dois sentidos)
  const ponta = (t) => {
    const [lo, la] = llInverso(rec.cx + t, rec.cz)
    const p2 = ll(lo + (20 * ux) / M_LON, la + (20 * uy) / M_LAT)
    const a = (Math.atan2(p2[1] - rec.cz, p2[0] - rec.cx) * 180) / Math.PI
    return ((a % 180) + 180) % 180
  }
  let leque = Math.abs(ponta(rec.raio) - ponta(-rec.raio))
  if (leque > 90) leque = 180 - leque
  return { barriga, angulo, leque }
}

const numeros = []
const desenhos = []
for (const rec of RECORTES) {
  const naRecorte = (x, z) => Math.abs(x - rec.cx) < rec.raio && Math.abs(z - rec.cz) < rec.raio
  const dentro = casas.filter((c) => naRecorte(c.x, c.z))
  const cropTestadas = testadasDoRecorte(rec, naRecorte)
  const grade = anguloDaGrade(cropTestadas)
  const cont = {
    casas: dentro.length,
    centroDentro: 0,
    cantosDentro: 0,
    fachadaNaRua: 0,
    paredeNaRua: 0,
    fundoNaRua: 0,
    paredeCruzaRua: 0,
    naGrade: 0,
    gradeAngulo: grade.angulo,
    somaAngulo: 0,
    estouro: [],
    cobertura: [],
    foraPorCanto: [0, 0, 0, 0],
    larguraCasa: [],
    larguraLote: [],
  }
  for (const c of dentro) {
    const centro = temLote(c.x, c.z)
    if (centro) cont.centroDentro++
    // os 4 cantos dentro do lote do centro da casa (com a borda contando)
    const iLoteC = indiceDoLote(c.x, c.z)
    const cantos2 = iLoteC >= 0
      ? c.lonlat.filter(([lon, lat]) => dentroDoLoteComBorda(lotes[iLoteC], lon, lat)).length
      : 0
    if (cantos2 === 4) cont.cantosDentro++
    // quanto o canto da casa sai do lote (em metros de verdade)
    const iLote = indiceDoLote(c.x, c.z)
    if (iLote >= 0) {
      let pior = 0
      for (const [lon, lat] of c.lonlat) {
        const d = distanciaAteAnel(lotes[iLote], lon, lat)
        if (d > 0.5) pior = Math.max(pior, d)
      }
      cont.estouro.push(pior)
      // qual canto sai do lote (0-1: fundo, 2-3: frente)
      for (let k = 0; k < 4; k++) {
        const [lon, lat] = c.lonlat[k]
        if (!dentroDoLoteComBorda(lotes[iLote], lon, lat)) cont.foraPorCanto[k]++
      }
    }
    // a largura da casa contra a largura real da testada do grupo
    let totalReal = 0
    for (const t of c.frentes) totalReal += Math.hypot(t[2] - t[0], t[3] - t[1])
    cont.larguraCasa.push(c.w)
    cont.larguraLote.push(totalReal)
    // a frente: o meio da fachada, 3 METROS para fora (a calcada)
    const tres = 3 / metrosPorUn(c.x, c.z)
    const fx = c.x + c.normal[0] * (c.d / 2 + tres)
    const fz = c.z + c.normal[1] * (c.d / 2 + tres)
    if (!temLote(fx, fz)) cont.fachadaNaRua++
    // as laterais: 3 un para fora de cada lado da fachada
    const tx = c.normal[1]
    const tz = -c.normal[0]
    const l1 = temLote(c.x + tx * (c.w / 2 + tres), c.z + tz * (c.w / 2 + tres))
    const l2 = temLote(c.x - tx * (c.w / 2 + tres), c.z - tz * (c.w / 2 + tres))
    if (!l1 || !l2) cont.paredeNaRua++
    // o fundo: 3 un para tras da casa
    if (!temLote(c.x - c.normal[0] * (c.d / 2 + tres), c.z - c.normal[1] * (c.d / 2 + tres))) cont.fundoNaRua++
    // a parede atravessando a rua: os 4 lados da casa cruzam alguma testada
    // que nao e a da propria casa?
    const perto = testadasPerto(c.lonlatFachada[0], c.lonlatFachada[1])
    const proprias = new Set()
    for (const i of perto) {
      const t = testadas[i]
      // a testada e a da casa se ela passa pelo meio da fachada
      if (dentroDoPoligono([t.a, t.b, [t.b[0], t.b[1]]], c.lonlatFachada[0], c.lonlatFachada[1])) continue
      proprias.add(i)
    }
    let cruzou = false
    for (let e = 0; e < 4 && !cruzou; e++) {
      const p1 = c.lonlat[e]
      const p2 = c.lonlat[(e + 1) % 4]
      for (const i of perto) {
        if (proprias.has(i)) continue
        const t = testadas[i]
        if (cruzaSeg(p1, p2, t.a, t.b)) { cruzou = true; break }
      }
    }
    if (cruzou) cont.paredeCruzaRua++
    // quanto da testada do grupo a casa cobre (a casa grande demais deixa buraco)
    let totalFrente = 0
    for (const t of c.frentes) totalFrente += Math.hypot(t[2] - t[0], t[3] - t[1])
    if (totalFrente > 0) cont.cobertura.push(c.w / totalFrente)
    const dif = diferencaParaGrade(anguloTestada(c), grade.angulo)
    if (dif < 12) cont.naGrade++
    cont.somaAngulo += dif
  }
  // quanto da testada das ruas esta construida
  const ruas = dadosLotes.cadeias
  let total = 0
  let construida = 0
  for (const cadeia of ruas) {
    for (const [k] of cadeia) {
      const f = testadas[k]
      const [ax, az] = f.a
      const [bx, bz] = f.b
      const [gx, gz] = ll(ax, az)
      const [hx, hz] = ll(bx, bz)
      if (!naRecorte((gx + hx) / 2, (gz + hz) / 2)) continue
      const comp = Math.hypot(hx - gx, hz - gz)
      const passos = Math.max(1, Math.round(comp / 1.5))
      for (let k2 = 0; k2 < passos; k2++) {
        const t = (k2 + 0.5) / passos
        const px = gx + (hx - gx) * t
        const pz = gz + (hz - gz) * t
        total++
        // ha uma casa com a fachada neste ponto?
        const tem = dentro.some((c) => {
          const dx = px - (c.x + c.normal[0] * (c.d / 2))
          const dz = pz - (c.z + c.normal[1] * (c.d / 2))
          const along = dx * c.normal[1] + dz * -c.normal[0]
          const fora = dx * c.normal[0] + dz * c.normal[1]
          return Math.abs(along) < c.w / 2 + 0.5 && Math.abs(fora) < 2.5
        })
        if (tem) construida++
      }
    }
  }
  const pct = (n) => (cont.casas ? (100 * n) / cont.casas : 0)
  const estouro = cont.estouro.slice().sort((a, b) => a - b)
  const med = (a) => (a.length ? a[Math.floor(a.length / 2)] : 0)
  const p90 = (a) => (a.length ? a[Math.floor(a.length * 0.9)] : 0)
  numeros.push({
    nome: rec.nome,
    titulo: rec.titulo,
    centro: [rec.cx, rec.cz],
    raio: rec.raio,
    casas: cont.casas,
    pctCentroDentro: +pct(cont.centroDentro).toFixed(1),
    pctCantosDentro: +pct(cont.cantosDentro).toFixed(1),
    pctFachadaParaRua: +pct(cont.fachadaNaRua).toFixed(1),
    pctParedeLateralParaRua: +pct(cont.paredeNaRua).toFixed(1),
    pctFundoParaRua: +pct(cont.fundoNaRua).toFixed(1),
    pctParedeCruzaRua: +pct(cont.paredeCruzaRua).toFixed(1),
    pctNaGrade: +pct(cont.naGrade).toFixed(1),
    anguloMedioForaDaGrade: +(cont.casas ? cont.somaAngulo / cont.casas : 0).toFixed(1),
    gradeAngulo: grade.angulo,
    gradeCobertura: +grade.cobertura.toFixed(2),
    testadaConstruida: total ? +((100 * construida) / total).toFixed(1) : 0,
    estouroMedio: +med(estouro).toFixed(1),
    estouroP90: +p90(estouro).toFixed(1),
    coberturaMedia: +(cont.cobertura.length ? cont.cobertura.reduce((a, b) => a + b, 0) / cont.cobertura.length : 0).toFixed(2),
    coberturaP10: +(cont.cobertura.length ? cont.cobertura.slice().sort((a, b) => a - b)[Math.floor(cont.cobertura.length * 0.1)] : 0).toFixed(2),
    foraPorCanto: cont.foraPorCanto,
    larguraCasaMed: +med(cont.larguraCasa).toFixed(1),
    larguraLoteMed: +med(cont.larguraLote).toFixed(1),
    metrosPorUn: +metrosPorUn(rec.cx, rec.cz).toFixed(3),
    ...(() => { const r = ruaDaGrade(rec); return { barrigaGrade: +r.barriga.toFixed(2), anguloGrade: +r.angulo.toFixed(2), lequeGrade: +r.leque.toFixed(2) } })(),
  })
  desenhos.push({
    nome: rec.nome,
    titulo: rec.titulo,
    centro: [rec.cx, rec.cz],
    raio: rec.raio,
    casas: dentro.map((c) => ({ pontos: c.pontos, lonlat: c.lonlat, normal: c.normal, tipo: c.tipo })),
    testadas: cropTestadas,
  })
}

console.log('\n=== a conferencia com a planta oficial ===')
for (const n of numeros) {
  console.log(`\n[${n.nome}] ${n.titulo} (${n.casas} casas, ${n.metrosPorUn} m/un)`)
  console.log(`  centro dentro do lote:  ${n.pctCentroDentro}%   (os 4 cantos dentro: ${n.pctCantosDentro}%)`)
  console.log(`  fachada para a rua:     ${n.pctFachadaParaRua}%`)
  console.log(`  parede lateral na rua:  ${n.pctParedeLateralParaRua}%`)
  console.log(`  fundo na rua:           ${n.pctFundoParaRua}%`)
  console.log(`  parede cruzando a rua:  ${n.pctParedeCruzaRua}%`)
  console.log(`  testada construida:     ${n.testadaConstruida}%`)
  console.log(`  na grade (angulo ${n.gradeAngulo} graus, ${(n.gradeCobertura * 100).toFixed(0)}% das testadas): ${n.pctNaGrade}% (angulo medio fora: ${n.anguloMedioForaDaGrade} graus)`)
  console.log(`  estouro do lote (m):    medio ${n.estouroMedio}, p90 ${n.estouroP90}`)
  console.log(`  cobertura da testada:   media ${n.coberturaMedia}, p10 ${n.coberturaP10}`)
  console.log(`  cantos fora do lote:     fundo-esq ${n.foraPorCanto[0]}, fundo-dir ${n.foraPorCanto[1]}, frente-dir ${n.foraPorCanto[2]}, frente-esq ${n.foraPorCanto[3]}`)
  console.log(`  largura da casa/lote:    ${n.larguraCasaMed} un / ${n.larguraLoteMed} un (o jogo e a planta)`)
  console.log(`  a rua da grade:          barriga ${n.barrigaGrade} un, angulo ${n.anguloGrade} graus, leque no recorte ${n.lequeGrade} graus`)
}

// os lotes de cada recorte (em coordenadas de jogo e em lon/lat, para o desenho)
const lotesRecorte = []
for (const rec of RECORTES) {
  const dentro = []
  const dentroLL = []
  for (let i = 0; i < lotes.length; i++) {
    const l = lotes[i]
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const [lon, lat] of l) {
      const [x, z] = ll(lon, lat)
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (z < z0) z0 = z
      if (z > z1) z1 = z
    }
    if (x1 < rec.cx - rec.raio || x0 > rec.cx + rec.raio) continue
    if (z1 < rec.cz - rec.raio || z0 > rec.cz + rec.raio) continue
    dentro.push(l.map(([lon, lat]) => ll(lon, lat)))
    dentroLL.push(l)
  }
  lotesRecorte.push({ nome: rec.nome, aneis: dentro, aneisLL: dentroLL })
}

// os limites geograficos do recorte (para a planta ao lado)
for (const d of desenhos) {
  const [x0, x1] = [d.centro[0] - d.raio, d.centro[0] + d.raio]
  const [z0, z1] = [d.centro[1] - d.raio, d.centro[1] + d.raio]
  d.lonlat = {
    lon_min: llInverso(x0, z1)[0], lon_max: llInverso(x1, z0)[0],
    lat_min: llInverso(x0, z1)[1], lat_max: llInverso(x1, z0)[1],
  }
}

fs.writeFileSync(SAIDA, JSON.stringify({
  recortes: desenhos,
  lotes: lotesRecorte,
  numeros,
  grade: ANGULO_GRADE * 180 / Math.PI,
}))
console.log(`\n(dados para o desenho em ${SAIDA})`)
