import { afterEach, describe, expect, it } from 'vitest'
import { criarTempoGpu, resumoTempos } from '../../src/render/medicao-m1.js'
import { ResolucaoDinamica, sinalGpu } from '../../src/render/resolucao-dinamica.js'

afterEach(() => { sinalGpu.ms = null; sinalGpu.instante = 0 })

describe('medição M1', () => {
  it('resume os intervalos incluindo picos e percentis de posto mais próximo', () => {
    expect(resumoTempos([10, 20, 34, 51, 101])).toEqual({ amostras: 5, media: 43.2,
      p50: 34, p95: 101, p99: 101, acima33: 3, acima50: 2, acima100: 1, pior: 101 })
    expect(resumoTempos([]).p99).toBeNull()
  })
  it('funciona sem extensão', () => {
    const gpu = criarTempoGpu({ getExtension: () => null })
    gpu.iniciar(); gpu.terminar()
    expect(gpu.disponivel).toBe(false)
    expect(gpu.ler()).toEqual([])
  })
  it('só lê consultas prontas e descarta resultados durante disjoint', () => {
    let pronta = false, disjoint = false, removidas = 0
    const gl = { getExtension: () => ({ TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 }),
      CURRENT_QUERY: 3, QUERY_RESULT_AVAILABLE: 4, QUERY_RESULT: 5,
      isContextLost: () => false, getParameter: () => disjoint, getQuery: () => null,
      createQuery: () => ({}), beginQuery() {}, endQuery() {}, deleteQuery() { removidas++ },
      getQueryParameter: (_q, tipo) => tipo === 4 ? pronta : 12000000 }
    const gpu = criarTempoGpu(gl)
    gpu.iniciar(); gpu.terminar()
    expect(gpu.ler()).toEqual([])
    pronta = true
    expect(gpu.ler()).toEqual([12])
    gpu.iniciar(); gpu.terminar(); disjoint = true
    expect(gpu.ler()).toEqual([])
    expect(gpu.descartadas).toBe(1)
    expect(removidas).toBe(2)
    expect(sinalGpu.ms).toBeNull()
  })
  it('prefere GPU recente e volta ao intervalo quando a amostra fica velha', () => {
    const d = new ResolucaoDinamica({ alvo: 1, janela: 2 })
    sinalGpu.ms = 10; sinalGpu.instante = performance.now()
    d.quadro(40); d.quadro(40)
    expect(d.escala).toBe(1)
    sinalGpu.instante = performance.now() - 1000
    d.quadro(40); d.quadro(40)
    expect(d.escala).toBe(.9)
  })
})
