// Diagnostico: parametros do encadeamento das ruas (rede viaria do jogo)
import dados from '../../src/mundo/mapa1932-lotes.json' with { type: 'json' }

const LON0 = -38.5280, LAT0 = -3.7250
const MX = 111320 * Math.cos((LAT0 * Math.PI) / 180)
const MZ = 110574
const m = (lon, lat) => [(lon - LON0) * MX, -(lat - LAT0) * MZ]

const F = dados.fachadas.map((f, i) => {
  const a = m(f[1], f[2]), b = m(f[3], f[4]), c = m(f[5], f[6])
  const ux = b[0] - a[0], uz = b[1] - a[1]
  const L = Math.hypot(ux, uz)
  let nx = uz / L, nz = -ux / L
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2
  if ((mx - c[0]) * nx + (mz - c[1]) * nz < 0) { nx = -nx; nz = -nz }
  return { i, a, b, n: [nx, nz], u: [ux / L, uz / L], L }
})

// celula espacial das pontas
function montar(cel) {
  const m2 = new Map()
  for (const f of F) for (const p of ['a', 'b']) {
    const [x, z] = f[p]
    const k = `${Math.floor(x / cel)},${Math.floor(z / cel)}`
    if (!m2.has(k)) m2.set(k, [])
    m2.get(k).push({ f, p, x, z })
  }
  return m2
}

// a melhor continuacao de uma ponta: mesma rua (normal parecida), perto, e a frente
// da outra continuando a linha (o desvio da reta e pequeno)
function continuar(f, ponta, opcoes) {
  const [x, z] = f[ponta]
  const cel = opcoes.cel
  const ci = Math.floor(x / cel), cj = Math.floor(z / cel)
  const raio = Math.ceil(opcoes.dist / cel)
  let melhor = null
  for (let dj = -raio; dj <= raio; dj++) {
    for (let di = -raio; di <= raio; di++) {
      for (const o of celulas.get(`${ci + di},${cj + dj}`) || []) {
        if (o.f.i === f.i) continue
        const g = o.f
        if (g.n[0] * f.n[0] + g.n[1] * f.n[1] < opcoes.cos) continue
        // o ponto da outra frente mais proximo da minha ponta
        const vx = g.b[0] - g.a[0], vy = g.b[1] - g.a[1]
        const wx = g.a[0] - x, wy = g.a[1] - z
        const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy || 1)))
        const px = g.a[0] + t * vx, py = g.a[1] + t * vy
        const d = Math.hypot(px - x, py - z)
        if (d > opcoes.dist) continue
        // o desvio da linha da minha frente
        const desv = Math.abs((px - x) * f.n[0] + (py - z) * f.n[1])
        if (desv > opcoes.desvio) continue
        if (!melhor || d < melhor.d) melhor = { d, g, ponta: o.p, px, py, desvio: desv }
      }
    }
  }
  return melhor
}

function testar(opcoes) {
  celulas = montar(opcoes.cel)
  const prox = new Map()
  for (const f of F) for (const p of ['a', 'b']) {
    const c = continuar(f, p, opcoes)
    if (c) prox.set(`${f.i}|${p}`, c)
  }
  // caminha a cadeia
  const visitados = new Set()
  const cadeias = []
  for (const f of F) {
    if (visitados.has(f.i)) continue
    const cadeia = [f.i]
    visitados.add(f.i)
    let atual = f
    let entrada = null
    while (true) {
      const saida = entrada === null ? (prox.has(`${atual.i}|a`) ? 'a' : (prox.has(`${atual.i}|b`) ? 'b' : null)) : (entrada === 'a' ? 'b' : 'a')
      if (saida === null) break
      const c = prox.get(`${atual.i}|${saida}`)
      if (!c) break
      if (visitados.has(c.g.i)) break
      visitados.add(c.g.i)
      cadeia.push(c.g.i)
      entrada = c.ponta
      atual = c.g
    }
    if (cadeia.length) cadeias.push(cadeia)
  }
  // o comprimento da rua (em metros) e a soma das frentes + as folgas
  let total = 0
  let max = 0
  for (const c of cadeias) {
    let comp = 0
    for (let k = 0; k < c.length; k++) {
      const f = F[c[k]]
      comp += f.L
      if (k > 0) {
        const ant = F[c[k - 1]]
        const c2 = prox.get(`${ant.i}|b`) || prox.get(`${ant.i}|a`)
        if (c2) comp += c2.d
      }
    }
    total += comp
    max = Math.max(max, comp)
  }
  const sozinhas = cadeias.filter((c) => c.length === 1).length
  return { cadeias: cadeias.length, sozinhas, media: (total / cadeias.length).toFixed(0), max: max.toFixed(0), total: (total / 1000).toFixed(1) + ' km', opcoes }
}

let celulas
for (const opcoes of [
  { dist: 7, cos: 0.5, desvio: 8, cel: 8 },
  { dist: 15, cos: 0.9, desvio: 8, cel: 16 },
  { dist: 25, cos: 0.94, desvio: 8, cel: 26 },
  { dist: 35, cos: 0.95, desvio: 8, cel: 36 },
  { dist: 50, cos: 0.96, desvio: 8, cel: 51 },
  { dist: 50, cos: 0.96, desvio: 15, cel: 51 },
  { dist: 80, cos: 0.97, desvio: 12, cel: 81 },
]) {
  const r = testar(opcoes)
  console.log(`dist=${opcoes.dist} cos=${opcoes.cos} desvio=${opcoes.desvio} -> ruas: ${r.cadeias}, sozinhas: ${r.sozinhas}, media: ${r.media} m, maior: ${r.max} m, total: ${r.total}`)
}
