// Os terrenos dos marcos de 1932 do norte do centro (src/mundo/lotes-marcos.js): o casario de 1932 não pode
// nascer dentro da Sé, da Estação Central ou do Passeio Público, que ficam em tamanho real num mapa comprimido.
// Pega: casa da planta oficial atravessando a parede de um marco (a Estação de 130 m caía sobre o
// quarteirão vizinho), e um marco que saísse do lugar do dossiê.
import { describe, it, expect } from 'vitest'
import { PEGADAS, marcoSob, localDaPegada } from '../../src/mundo/lotes-marcos.js'
import { FACHADAS } from '../../src/mundo/casario1932.js'
import { ll, lugaresJogo } from '../../src/mundo/fortaleza1932.js'

const dentro = (p, x, z) => {
  const [lx, lz] = localDaPegada(p, x, z)
  return lx > p.x0 && lx < p.x1 && lz > p.z0 && lz < p.z1
}

describe('terrenos dos marcos de 1932', () => {
  it('cada marco cobre o ponto do dossiê', () => {
    expect(dentro(PEGADAS.estacao, ...ll(-38.5299, -3.7217))).toBe(true)
  })
  it('a Estação olha para a Praça da Estação (a praça fica ao sul da malha, na frente)', () => {
    const [lx, lz] = localDaPegada(PEGADAS.estacao, ...lugaresJogo.pracaEstacao)
    expect(lz).toBeGreaterThan(10)
    expect(Math.abs(lx)).toBeLessThan(25)
  })
  it('nenhuma casa que o casario mantém tem quina dentro de um marco', () => {
    let pulam = 0
    for (const f of FACHADAS) {
      if (marcoSob(f.x, f.z, Math.hypot(f.w, f.d) / 2)) { pulam++; continue }
      const c = Math.cos(f.rot)
      const s = Math.sin(f.rot)
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const lx = (a * f.w) / 2
        const lz = (b * f.d) / 2
        const x = f.x + lx * c + lz * s
        const z = f.z - lx * s + lz * c
        for (const p of Object.values(PEGADAS)) expect(dentro(p, x, z)).toBe(false)
      }
    }
    // e a exclusão é pequena: só o terreno dos marcos, não um bairro
    expect(pulam).toBeGreaterThan(0)
    expect(pulam).toBeLessThan(60)
  })
})
