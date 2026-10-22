// As linhas do bonde da Light no traçado de verdade (src/mundo/bondes1932.json, lido na Planta de 1936).
//
// Pega o que o Joabe viu em a764f60: "tem muito poste de energia". O poste e o fio aéreo do bonde (vida1932.js)
// seguem o trilho (bondes.js), e o trilho era o caminho mais curto no grafo das testadas: ia e voltava entre as
// duas faces da rua e passava por ruas sem bonde, com poste e fio por toda parte. Correção: commit "Bonde nas
// linhas de verdade: trilho, poste e fio só onde a Light tinha linha".
// O trilho de cada linha desenhada fica sobre uma linha lida na planta (a menos de 3 m), nada de rota inventada,
// não passa por dentro de casa da planta de 1932, e o trecho dividido por duas linhas é um trilho só.
import { describe, it, expect } from 'vitest'
import { rotasDosBondes } from '../../src/mundo/bondes.js'
import { ll } from '../../src/mundo/fortaleza1932.js'
import { FACHADAS } from '../../src/mundo/casario1932.js'
import reais from '../../src/mundo/bondes1932.json'

const segmentos = []
for (const l of reais.linhas) {
  if (l.confianca !== 'D') continue
  // a linha da planta adensada em lon/lat (a reta de verdade entre dois pontos vira curva onde a escala muda)
  const p = []
  for (let i = 0; i < l.tracado.length - 1; i++) {
    const [a, b] = [l.tracado[i], l.tracado[i + 1]]
    for (let k = 0; k < 20; k++) p.push(ll(a[0] + ((b[0] - a[0]) * k) / 20, a[1] + ((b[1] - a[1]) * k) / 20))
  }
  p.push(ll(...l.tracado[l.tracado.length - 1]))
  for (let i = 0; i < p.length - 1; i++) segmentos.push([...p[i], ...p[i + 1]])
}
const distLinha = (x, z) => {
  let d = Infinity
  for (const [ax, az, bx, bz] of segmentos) {
    const vx = bx - ax
    const vz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)))
    d = Math.min(d, Math.hypot(x - ax - vx * t, z - az - vz * t))
  }
  return d
}
const CEL = 40
const grade = new Map()
for (const f of FACHADAS) {
  const k = `${Math.floor(f.x / CEL)},${Math.floor(f.z / CEL)}`
  if (!grade.has(k)) grade.set(k, [])
  grade.get(k).push(f)
}
const emCasa = (x, z) => {
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const f of grade.get(`${Math.floor(x / CEL) + i},${Math.floor(z / CEL) + j}`) || []) {
      const c = Math.cos(f.rot), s = Math.sin(f.rot), dx = x - f.x, dz = z - f.z
      if (Math.abs(dx * c - dz * s) < f.w / 2 && Math.abs(dx * s + dz * c) < f.d / 2) return true
    }
  }
  return false
}

describe('o bonde nas linhas de verdade', () => {
  const { linhas } = rotasDosBondes()
  const pontos = linhas.flat()
  it('todo trilho desenhado fica sobre uma linha lida na planta', () => {
    expect(pontos.length).toBeGreaterThan(1000)
    let longe = 0
    for (const [x, z] of pontos) if (distLinha(x, z) > 3) longe++
    expect(longe, 'pontos do trilho a mais de 3 m de uma linha da planta').toBe(0)
  })
  it('o trilho corre na rua: menos de 1% dele por dentro das casas de 1932', () => {
    let dentro = 0
    for (const [x, z] of pontos) if (emCasa(x, z)) dentro++
    expect(dentro / pontos.length).toBeLessThan(0.01)
  })
  it('o trecho que duas linhas dividem é um trilho só (sem trilho dobrado lado a lado)', () => {
    // dois pontos de linhas diferentes a menos de 1,5 m um do outro, fora das emendas, seriam trilho dobrado
    const CEL2 = 6
    const g = new Map()
    linhas.forEach((l, li) => l.forEach(([x, z], i) => {
      const k = `${Math.floor(x / CEL2)},${Math.floor(z / CEL2)}`
      if (!g.has(k)) g.set(k, [])
      g.get(k).push([x, z, li, i, l.length])
    }))
    let dobrados = 0
    for (const lista of g.values()) {
      for (const a of lista) for (const b of lista) {
        if (a[2] >= b[2]) continue
        const ponta = (p) => p[3] < 3 || p[3] > p[4] - 4
        if (ponta(a) || ponta(b)) continue
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.5) dobrados++
      }
    }
    expect(dobrados).toBe(0)
  })
})
