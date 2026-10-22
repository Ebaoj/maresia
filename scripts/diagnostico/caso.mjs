// Um caso so, medido: a casa do jogo e o lote oficial que a planta desenhou.
//   npx vite-node scripts/diagnostico/caso.mjs
import fs from 'node:fs'
import { ll, llInverso } from '../../src/mundo/fortaleza1932.js'
import { FACHADAS } from '../../src/mundo/casario1932.js'
import dadosLotes from '../../src/mundo/mapa1932-lotes.json'

const geo = JSON.parse(fs.readFileSync('/tmp/lotes1932.geojson', 'utf8'))
const lotes = []
for (const feat of geo.features) {
  const g = feat.geometry
  if (!g) continue
  for (const aneis of g.coordinates) for (const anel of aneis) if (anel.length > 2) lotes.push(anel)
}

function dentro(pts, x, y) {
  let d = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) d = !d
  }
  return d
}

function normal(f) { return [Math.sin(f.rot), Math.cos(f.rot)] }
function cantos(f) {
  const c = Math.cos(f.rot)
  const s = Math.sin(f.rot)
  const out = []
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    out.push([f.x + lx * (f.w / 2) * c + lz * (f.d / 2) * s, f.z - lx * (f.w / 2) * s + lz * (f.d / 2) * c])
  }
  return out
}

const [px, pz] = ll(-38.5276, -3.7275)
const perto = FACHADAS.filter((f) => Math.hypot(f.x - px, f.z - pz) < 90).slice(0, 6)
for (const f of perto) {
  const n = normal(f)
  const c = cantos(f)
  const meioFrente = [f.x + n[0] * (f.d / 2), f.z + n[1] * (f.d / 2)]
  const [lon, lat] = llInverso(meioFrente[0], meioFrente[1])
  const lote = lotes.find((l) => dentro(l, lon, lat))
  console.log(`\n=== casa ${f.x.toFixed(1)},${f.z.toFixed(1)} rot=${(f.rot * 180 / Math.PI).toFixed(1)} w=${f.w.toFixed(1)} d=${f.d.toFixed(1)} uso=${f.nome}`)
  console.log(`  frente da casa (lon/lat): ${lon.toFixed(6)}, ${lat.toFixed(6)}`)
  console.log(`  as ${f.frentes.length} testadas do grupo (de -> para), em jogo:`)
  for (const t of f.frentes) {
    const dx = t[2] - t[0]
    const dz = t[3] - t[1]
    console.log(`     de (${t[0].toFixed(1)},${t[1].toFixed(1)}) para (${t[2].toFixed(1)},${t[3].toFixed(1)})  angulo ${(Math.atan2(dz, dx) * 180 / Math.PI).toFixed(1)}  comp ${Math.hypot(dx, dz).toFixed(1)}`)
  }
  console.log(`  angulo da frente da casa: ${(Math.atan2(c[3][1] - c[2][1], c[3][0] - c[2][0]) * 180 / Math.PI).toFixed(1)}`)
  if (!lote) { console.log('  SEM LOTE'); continue }
  console.log(`  lote oficial (${lote.length} vertices), em lon/lat e em jogo:`)
  for (const p of lote) {
    const [gx, gz] = ll(p[0], p[1])
    console.log(`     ${p[0].toFixed(6)}, ${p[1].toFixed(6)}   ->   ${gx.toFixed(1)}, ${gz.toFixed(1)}`)
  }
  // a testada da planta que formou a casa
  for (const t of f.frentes) {
    for (const fa of dadosLotes.fachadas) {
      const [ax, az] = ll(fa[1], fa[2])
      const [bx2, bz2] = ll(fa[3], fa[4])
      if (Math.hypot(ax - t[0], az - t[1]) < 0.5 && Math.hypot(bx2 - t[2], bz2 - t[3]) < 0.5) {
        const [cx2, cz2] = ll(fa[5], fa[6])
        console.log(`  a testada crua da planta: a=(${fa[1]}, ${fa[2]}) b=(${fa[3]}, ${fa[4]}) fundo=(${fa[5]}, ${fa[6]})`)
        console.log(`     a->jogo (${ax.toFixed(1)}, ${az.toFixed(1)})  b->jogo (${bx2.toFixed(1)}, ${bz2.toFixed(1)})  fundo->jogo (${cx2.toFixed(1)}, ${cz2.toFixed(1)})`)
      }
    }
  }
  // a distancia da frente da casa ate cada aresta do lote
  const dist = (p, q) => {
    const ex = q[0] - p[0]
    const ey = q[1] - p[1]
    const t = Math.max(0, Math.min(1, ((lon - p[0]) * ex + (lat - p[1]) * ey) / (ex * ex + ey * ey)))
    const dx = (lon - (p[0] + ex * t)) * 101000
    const dy = (lat - (p[1] + ey * t)) * 110574
    return Math.hypot(dx, dy)
  }
  for (let i = 0; i < lote.length; i++) {
    const p = lote[i]
    const q = lote[(i + 1) % lote.length]
    const d = dist(p, q)
    const comp = Math.hypot((q[0] - p[0]) * 101000, (q[1] - p[1]) * 110574)
    if (d < 25) console.log(`  aresta ${i}->${(i + 1) % lote.length} (${comp.toFixed(1)} m) a ${d.toFixed(1)} m da frente da casa`)
  }
  // os cantos da casa, dentro do lote?
  for (const [i, p] of c.entries()) {
    const [lo, la] = llInverso(p[0], p[1])
    console.log(`  canto ${i} (${lo.toFixed(6)}, ${la.toFixed(6)}): ${dentro(lote, lo, la) ? 'dentro' : 'FORA'}`)
  }
}
