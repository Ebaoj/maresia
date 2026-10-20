// R1 (robustez no M1): resolução dinâmica guiada pelo tempo de quadro. Lógica pura: a gente entrega os dt, sem relógio.
// Janela de 30 quadros, orçamento 16,7 ms: desce com p75 > 18,37 ms, sobe com p75 < 12,5 ms por 2 s.
import { describe, expect, it } from 'vitest'
import { ResolucaoDinamica } from '../../src/render/resolucao-dinamica.js'

// alimenta n quadros de dt ms e devolve o que cada um respondeu (índice 1 = primeiro quadro)
function alimentar(d, n, dt) {
  const mudancas = []
  for (let k = 1; k <= n; k++) {
    const nova = d.quadro(dt)
    if (nova !== null) mudancas.push({ k, nova })
  }
  return mudancas
}

describe('ResolucaoDinamica', () => {
  it('desce 0,1 no primeiro julgamento e só desce de novo depois de 0,5 s de quadros', () => {
    const d = new ResolucaoDinamica({ alvo: 1.25, minimo: 0.6, orcamentoMs: 16.7, janela: 30 })
    const mudancas = alimentar(d, 60, 25)
    // a janela enche no quadro 30 (0,75 s): primeiro julgamento. Depois, 20 quadros de 25 ms = 0,5 s
    expect(mudancas.map((m) => m.k)).toEqual([30, 50])
    expect(mudancas[0].nova).toBeCloseTo(1.15, 6)
    expect(mudancas[1].nova).toBeCloseTo(1.05, 6)
    expect(d.escala).toBeCloseTo(1.05, 6)
  })

  it('não julga antes de a janela encher', () => {
    const d = new ResolucaoDinamica({ janela: 30 })
    expect(alimentar(d, 29, 40)).toEqual([])
    expect(d.escala).toBe(1.25)
  })

  it('pico isolado não derruba a resolução (p75, não o máximo)', () => {
    const d = new ResolucaoDinamica({ janela: 30 })
    for (let rodada = 0; rodada < 10; rodada++) {
      for (let k = 0; k < 9; k++) expect(d.quadro(10)).toBeNull()
      expect(d.quadro(200)).toBeNull() // 1 pico em cada 10 quadros: p75 continua 10 ms
    }
    expect(d.escala).toBe(1.25)
  })

  it('quadros dentro da faixa morta (entre 12,5 e 18,4 ms) não mexem na escala', () => {
    const d = new ResolucaoDinamica()
    expect(alimentar(d, 500, 16.7)).toEqual([])
    expect(d.escala).toBe(1.25)
  })

  it('sobe 0,05 a cada 2 s de folga até o alvo, e para nele', () => {
    const d = new ResolucaoDinamica({ alvo: 1.25, minimo: 0.6 })
    alimentar(d, 50, 25) // 1.15 e 1.05
    expect(d.escala).toBeCloseTo(1.05, 6)

    const sobe = alimentar(d, 1200, 10) // 12 s de quadros de 10 ms
    expect(sobe.map((m) => m.nova)).toEqual([1.1, 1.15, 1.2, 1.25])
    // a primeira espera a janela esvaziar dos quadros lentos; as seguintes vêm de 2 em 2 s (200 quadros de 10 ms)
    expect(sobe[0].k).toBeGreaterThanOrEqual(200)
    expect(sobe[0].k).toBeLessThan(260)
    for (let j = 1; j < sobe.length; j++) expect(sobe[j].k - sobe[j - 1].k).toBe(200)
    expect(d.escala).toBe(1.25)
  })

  it('depois de subir, não desce por 1 s (evita oscilar)', () => {
    const d = new ResolucaoDinamica({ alvo: 1.25 })
    alimentar(d, 50, 25) // 1.05
    let subiu = null
    for (let k = 0; k < 400 && subiu === null; k++) subiu = d.quadro(10) // quadro a quadro, até a primeira subida
    expect(subiu).toBeCloseTo(1.1, 6)
    // quadros lentos logo em seguida: a janela já pediria descida em 8 quadros, mas a espera segura até 1 s
    const lentos = alimentar(d, 60, 25)
    expect(lentos[0].nova).toBeCloseTo(1.0, 6)
    expect(lentos[0].k * 25).toBeGreaterThanOrEqual(1000)
  })

  it('nunca passa do mínimo nem do alvo', () => {
    const d = new ResolucaoDinamica({ alvo: 1.25, minimo: 0.6 })
    const descidas = alimentar(d, 2000, 100)
    for (const m of descidas) expect(m.nova).toBeGreaterThanOrEqual(0.6)
    expect(d.escala).toBeCloseTo(0.6, 6)
    expect(descidas.at(-1).nova).toBeCloseTo(0.6, 6) // e no mínimo não devolve mais nada
    expect(d.quadro(100)).toBeNull()

    const subidas = alimentar(d, 20000, 8)
    for (const m of subidas) expect(m.nova).toBeLessThanOrEqual(1.25)
    expect(d.escala).toBeCloseTo(1.25, 6)
  })

  it('alvo abaixo do mínimo vale o alvo; mínimo subido por cima da escala atual a empurra', () => {
    const baixo = new ResolucaoDinamica({ alvo: 0.5, minimo: 0.6 })
    expect(alimentar(baixo, 300, 100)).toEqual([])
    expect(baixo.escala).toBe(0.5)

    const d = new ResolucaoDinamica({ alvo: 1.25, minimo: 0.6 })
    alimentar(d, 100, 25) // algumas descidas
    d.minimo = 1.2
    expect(d.quadro(25)).toBe(1.2)
  })

  it('dt acima de 250 ms (troca de aba, pausa) é ignorado e zera a janela', () => {
    const d = new ResolucaoDinamica({ janela: 30 })
    expect(alimentar(d, 29, 25)).toEqual([])
    expect(d.quadro(300)).toBeNull()
    // sem o zeramento, o próximo quadro lento completaria a janela e desceria; com ele, tem de encher 30 de novo
    expect(alimentar(d, 29, 25)).toEqual([])
    expect(d.quadro(25)).toBeCloseTo(1.15, 6)
  })

  it('dt inválido (0, negativo, NaN) é ignorado', () => {
    const d = new ResolucaoDinamica({ janela: 30 })
    expect(d.quadro(0)).toBeNull()
    expect(d.quadro(-5)).toBeNull()
    expect(d.quadro(NaN)).toBeNull()
    expect(d.n).toBe(0)
  })

  it('redefinir muda o alvo, volta a escala para ele e esquece o histórico', () => {
    const d = new ResolucaoDinamica({ alvo: 1.25 })
    alimentar(d, 50, 25) // 1.05
    d.redefinir(1.0)
    expect(d.alvo).toBe(1.0)
    expect(d.escala).toBe(1.0)
    // histórico apagado: precisa encher a janela de novo antes de julgar
    expect(alimentar(d, 29, 25)).toEqual([])
    expect(d.quadro(25)).toBeCloseTo(0.9, 6)
    // e a subida respeita o alvo novo
    const sobe = alimentar(d, 3000, 10)
    expect(sobe.at(-1).nova).toBe(1.0)
    expect(d.escala).toBe(1.0)
  })
})
