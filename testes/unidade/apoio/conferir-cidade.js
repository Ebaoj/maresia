// A conferência da cidade inteira (docs/mapa-1932.md, v16): monta o casario como o jogo monta (criarCidade,
// com a planta de 1932 lida do PNG) e procura, no mapa todo, casa sobre casa, casa na rua, na praça ou num
// marco, casa sobre o trilho e casa fora de todo lote construído da planta.
//
// Usado por testes/unidade/cidade-conferida.test.js e, para os números de antes e depois, pelo mesmo teste
// rodado no worktree de a764f60.
import * as THREE from 'three'
import { fileURLToPath } from 'node:url'
import { lerPng } from './png.js'

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url))

// o canvas de mentira para quem desenha letreiro (o Node não tem)
function canvasDeMentira() {
  if (!globalThis.document) globalThis.document = {}
  if (!globalThis.document.createElement) {
    const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true })
    globalThis.document.createElement = () => ({ getContext: () => ctx, width: 0, height: 0, style: {}, addEventListener() {} })
  }
  if (!globalThis.document.createElementNS) globalThis.document.createElementNS = (_, n) => globalThis.document.createElement(n)
}

// os cantos de um retângulo do jogo (x, z, w, d, giro como em cidade.js)
function cantos(p) {
  const c = Math.cos(p.rot)
  const s = Math.sin(p.rot)
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
    const lx = (a * p.w) / 2
    const lz = (b * p.d) / 2
    return [p.x + lx * c + lz * s, p.z - lx * s + lz * c]
  })
}
// a área da interseção de dois polígonos convexos (Sutherland-Hodgman)
function areaPoligono(P) {
  let a = 0
  for (let i = 0; i < P.length; i++) { const p = P[i]; const q = P[(i + 1) % P.length]; a += p[0] * q[1] - q[0] * p[1] }
  return Math.abs(a) / 2
}
function recortar(sujeito, recorte) {
  let saida = sujeito
  const orient = Math.sign((recorte[1][0] - recorte[0][0]) * (recorte[2][1] - recorte[0][1]) - (recorte[1][1] - recorte[0][1]) * (recorte[2][0] - recorte[0][0])) || 1
  for (let i = 0; i < recorte.length && saida.length; i++) {
    const a = recorte[i]
    const b = recorte[(i + 1) % recorte.length]
    const dentro = (p) => orient * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0
    const entrada = saida
    saida = []
    for (let k = 0; k < entrada.length; k++) {
      const p = entrada[k]
      const q = entrada[(k + 1) % entrada.length]
      const ip = dentro(p)
      const iq = dentro(q)
      if (ip) saida.push(p)
      if (ip !== iq) {
        const dx = q[0] - p[0], dz = q[1] - p[1]
        const ex = b[0] - a[0], ez = b[1] - a[1]
        const den = dx * ez - dz * ex
        if (Math.abs(den) > 1e-12) {
          const t = ((a[0] - p[0]) * ez - (a[1] - p[1]) * ex) / den
          saida.push([p[0] + dx * t, p[1] + dz * t])
        }
      }
    }
  }
  return saida.length >= 3 ? areaPoligono(saida) : 0
}

// amostras do chão da casa: uma grade de pontos dentro do retângulo, a cada ~1 un
function amostras(p) {
  const c = Math.cos(p.rot)
  const s = Math.sin(p.rot)
  const nw = Math.max(2, Math.ceil(p.w))
  const nd = Math.max(2, Math.ceil(p.d))
  const out = []
  for (let i = 0; i < nw; i++) {
    for (let j = 0; j < nd; j++) {
      const lx = ((i + 0.5) / nw - 0.5) * p.w
      const lz = ((j + 0.5) / nd - 0.5) * p.d
      out.push([p.x + lx * c + lz * s, p.z - lx * s + lz * c])
    }
  }
  return out
}

export async function conferirCidade() {
  canvasDeMentira()
  const ocup = await import('../../../src/mundo/ocupacao1932.js')
  const png = lerPng(`${RAIZ}src/mundo/mapa1932-malha.png`)
  ocup.montarOcupacao1932(png.dados, png.w, png.h)
  const { calcularAlturas } = await import('../../../src/mundo/terreno.js')
  calcularAlturas()
  const { criarCidade } = await import('../../../src/mundo/cidade.js')
  const { PADRAO } = await import('../../../src/config.js')
  const { dentroDaPraca } = await import('../../../src/mundo/praca1932.js')
  const { marcoSob } = await import('../../../src/mundo/lotes-marcos.js')
  const { casaNoMarco } = await import('../../../src/mundo/marcos1932/pegadas.js')
  const { metrosPorUn } = await import('../../../src/mundo/fortaleza1932.js')
  let ferrovia = null
  try { ferrovia = await import('../../../src/mundo/ferrovia1932.js') } catch { /* antes de 22/10/2026 não havia */ }
  const { OCUPA_RUA, OCUPA_LOTE, ocupacao1932 } = ocup

  const cena = new THREE.Scene()
  const cfg = JSON.parse(JSON.stringify(PADRAO))
  const { predios } = criarCidade(cena, cfg)

  const casas = predios.map((p, i) => ({ ...p, i, cantos: cantos(p) }))
  // 1. casa sobre casa: a interseção de dois retângulos com mais de 1 m² de verdade
  const CEL = 24
  const grade = new Map()
  for (const c of casas) {
    const xs = c.cantos.map((q) => q[0])
    const zs = c.cantos.map((q) => q[1])
    for (let a = Math.floor(Math.min(...xs) / CEL); a <= Math.floor(Math.max(...xs) / CEL); a++) {
      for (let b = Math.floor(Math.min(...zs) / CEL); b <= Math.floor(Math.max(...zs) / CEL); b++) {
        const k = `${a},${b}`
        if (!grade.has(k)) grade.set(k, [])
        grade.get(k).push(c)
      }
    }
  }
  const sobrepostas = []
  const vistos = new Set()
  for (const lista of grade.values()) {
    for (let a = 0; a < lista.length; a++) {
      for (let b = a + 1; b < lista.length; b++) {
        const p = lista[a]
        const q = lista[b]
        const chave = p.i < q.i ? `${p.i},${q.i}` : `${q.i},${p.i}`
        if (vistos.has(chave)) continue
        vistos.add(chave)
        if (Math.hypot(p.x - q.x, p.z - q.z) > (Math.hypot(p.w, p.d) + Math.hypot(q.w, q.d)) / 2) continue
        const area = recortar(p.cantos, q.cantos)
        const m = metrosPorUn(p.x, p.z)
        if (area * m * m > 1) sobrepostas.push({ a: p.i, b: q.i, x: Math.round(p.x), z: Math.round(p.z), m2: +(area * m * m).toFixed(1) })
      }
    }
  }
  // 2. o chão de cada casa contra a planta: na rua, fora de lote, na praça, num marco, no trilho
  const naRua = []
  const foraDeLote = []
  const naPraca = []
  const noMarco = []
  const noTrilho = []
  for (const c of casas) {
    const pts = amostras(c)
    let rua = 0
    let lote = 0
    for (const [x, z] of pts) {
      const k = ocupacao1932(x, z)
      if (k === OCUPA_RUA) rua++
      else if (k >= OCUPA_LOTE) lote++
    }
    const info = { i: c.i, x: Math.round(c.x), z: Math.round(c.z), tipo: c.tipo }
    if (rua / pts.length > 0.5) naRua.push(info)
    if (lote / pts.length < 0.15) foraDeLote.push(info)
    if (c.cantos.some(([x, z]) => dentroDaPraca(x, z))) naPraca.push(info)
    if (marcoSob(c.x, c.z, 0) || casaNoMarco(c.x, c.z, c.w * 0.9, c.d * 0.9, c.rot)) noMarco.push(info)
    if (ferrovia && ferrovia.casaNaFerrovia(c.x, c.z, Math.max(0.1, c.w - 2), Math.max(0.1, c.d - 2), c.rot)) noTrilho.push(info)
  }
  return { casas: casas.length, sobrepostas, naRua, foraDeLote, naPraca, noMarco, noTrilho, temFerrovia: !!ferrovia }
}
