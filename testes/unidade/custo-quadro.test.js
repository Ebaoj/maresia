// Custo do quadro (27/10/2026, visual/correcoes; src/render/custo-quadro.js): o governador passou a medir o trabalho
// do quadro (CPU e placa), não o intervalo do rAF. Pega: o custo é o maior dos dois; resultado "disjunto" ou absurdo
// do cronômetro da placa não entra; cronometroGpu false desliga.
import { describe, expect, it } from 'vitest'
import { criarCustoQuadro } from '../../src/render/custo-quadro.js'

function glFalso() {
  const fila = []
  const gl = {
    QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2, disjunto: false, proximoNs: 0,
    getExtension: () => ({ TIME_ELAPSED_EXT: 9, GPU_DISJOINT_EXT: 10 }),
    createQuery: () => ({ ns: 0 }),
    beginQuery: () => {},
    endQuery: () => {},
    getQueryParameter: (q, p) => (p === 1 ? true : q.ns),
    getParameter: () => gl.disjunto,
    deleteQuery: () => {},
  }
  gl.beginQuery = (_, q) => { q.ns = gl.proximoNs; fila.push(q) }
  return gl
}

describe('custo do quadro', () => {
  it('WebGL com cronômetro: o maior entre CPU e placa; disjunto ou > 100 ms fica de fora', () => {
    const gl = glFalso()
    const cfg = { desempenho: { cronometroGpu: true } }
    const c = criarCustoQuadro({ getContext: () => gl }, { cfg })
    expect(c.temCronometroGpu).toBe(true)
    gl.proximoNs = 12e6
    c.inicio()
    expect(c.fim()).toBeCloseTo(12, 5)
    gl.proximoNs = 500e6 // absurdo: fica o último bom
    c.inicio()
    expect(c.fim()).toBeCloseTo(12, 5)
    gl.disjunto = true
    gl.proximoNs = 3e6
    c.inicio()
    expect(c.fim()).toBeCloseTo(12, 5)
    cfg.desempenho.cronometroGpu = false
    c.inicio()
    expect(c.fim()).toBeLessThan(5) // só a CPU (quase nada aqui)
  })

  it('sem cronômetro: só a CPU do passo', () => {
    const c = criarCustoQuadro({ getContext: () => ({ getExtension: () => null }) }, {})
    expect(c.temCronometroGpu).toBe(false)
    c.inicio()
    const t = performance.now()
    while (performance.now() - t < 3);
    expect(c.fim()).toBeGreaterThanOrEqual(3)
  })
})
