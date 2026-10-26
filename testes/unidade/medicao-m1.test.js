import { afterEach, describe, expect, it, vi } from 'vitest'
import { criarTempoGpu, instalarMedicaoM1, resumoTempos } from '../../src/render/medicao-m1.js'
import { ResolucaoDinamica, sinalGpu } from '../../src/render/resolucao-dinamica.js'

afterEach(() => { sinalGpu.ms = null; sinalGpu.instante = 0; vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('medição M1', () => {
  it('mede a rota quando o timestamp do primeiro quadro precede performance.now()', async () => {
    const quadros = []
    const elementos = []
    const criarElemento = () => {
      const elemento = { style: {}, append: vi.fn(), remove: vi.fn(), click: vi.fn() }
      elementos.push(elemento)
      return elemento
    }
    vi.stubGlobal('document', { createElement: criarElemento, body: { append: vi.fn() },
      head: { append: vi.fn() }, hidden: false,
      addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.stubGlobal('requestAnimationFrame', callback => quadros.push(callback))
    vi.stubGlobal('navigator', { userAgent: 'teste' })
    vi.stubGlobal('location', { search: '?medirM1' })
    vi.stubGlobal('innerWidth', 800)
    vi.stubGlobal('innerHeight', 600)
    vi.stubGlobal('devicePixelRatio', 2)
    vi.stubGlobal('PerformanceObserver', undefined)
    vi.spyOn(performance, 'now').mockReturnValue(100)
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:medicao')
    const canvas = { width: 800, height: 600 }
    const renderer = { setPixelRatio: vi.fn(), getPixelRatio: () => 1,
      getContext: () => ({ getExtension: () => null }), domElement: canvas }
    const m = { renderer, canvas, pronto: Promise.resolve(), pixelRatio: () => 1,
      cfg: { desempenho: {}, estilo: {}, fatia: { travar: true } },
      teclas: { frente: false }, controle: { pausado: true }, irPara: vi.fn(),
      pos: { tamanho: vi.fn(), desenhar: vi.fn() } }
    vi.stubGlobal('window', { maresia: m })
    instalarMedicaoM1(renderer, m.cfg)
    quadros.shift()(99) // Instala e inicia automaticamente com ?medirM1.
    await Promise.resolve() // Aguarda maresia.pronto.
    expect(() => quadros.shift()(99)).not.toThrow()
    expect(elementos[0].textContent).toContain('partida')
    quadros.shift()(15099)
    quadros.shift()(30099)
    vi.mocked(performance.now).mockReturnValue(45099)
    quadros.shift()(45099)
    await Promise.resolve()
    expect(m.ultimaMedicaoM1.etapas).toEqual([
      { nome: 'partida', ms: 0 }, { nome: 'colunaHora', ms: 15000 },
      { nome: 'urubuRegistro', ms: 30000 },
    ])
    expect(m.ultimaMedicaoM1.duracaoMs).toBe(45000)
    expect(m.ultimaMedicaoM1.quadros.amostras).toBe(3)
    expect(m.irPara).toHaveBeenCalledTimes(2)
    expect(m.medicaoM1Ativa).toBe(false)
    expect(m.cfg.fatia.travar).toBe(true)
    expect(m.teclas.frente).toBe(false)
    expect(m.controle.pausado).toBe(true)
  })
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
