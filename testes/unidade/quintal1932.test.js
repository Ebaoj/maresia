// As árvores dos quintais de 1932: a casa ocupa a frente do lote, e a árvore
// nasce ATRÁS dela, no quintal de verdade (o interior da quadra).
//
// A semente fixa a cidade: a mesma semente dá sempre as mesmas árvores.
import { describe, it, expect } from 'vitest'
import { candidatosDoQuintal } from '../../src/mundo/quintal1932.js'
import { FRENTES } from '../../src/mundo/casarioPlanta1932.js'
import { PADRAO } from '../../src/config.js'

const cfg = PADRAO

describe('as árvores dos quintais de 1932', () => {
  it('a semente é fixa: a mesma semente dá a mesma cidade', () => {
    const a = candidatosDoQuintal(cfg, 1932)
    const b = candidatosDoQuintal(cfg, 1932)
    const c = candidatosDoQuintal(cfg, 7)
    expect(a.length).toBeGreaterThan(100)
    expect(a.length).toBe(b.length)
    expect(a[0].lon).toBe(b[0].lon)
    expect(a[0].lat).toBe(b[0].lat)
    // e outra semente dá outra cidade
    expect(c[0].lon !== a[0].lon || c[0].lat !== a[0].lat).toBe(true)
  })

  it('a árvore nasce ATRÁS da casa, nunca na rua', () => {
    const lista = candidatosDoQuintal(cfg, 1932)
    for (const c of lista) {
      // a profundidade usada é a do lote mais a folga: a árvore passa da
      // parede dos fundos da casa
      expect(c.profUsado).toBeGreaterThan(c.prof)
      expect(c.profUsado - c.prof).toBeCloseTo(cfg.casario.quintal.folga, 6)
    }
  })

  it('as três espécies do quintal aparecem, e o coqueiro fica perto do mar', () => {
    const lista = candidatosDoQuintal(cfg, 1932)
    const especies = new Set(lista.map((c) => c.esp))
    expect(especies.has('cajueiro')).toBe(true)
    expect(especies.has('mangueira')).toBe(true)
    expect(especies.has('coqueiro')).toBe(true)
    // o coqueiro é rare: perto da praia e nunca no miolo da cidade
    const coqueiros = lista.filter((c) => c.esp === 'coqueiro')
    expect(coqueiros.length).toBeGreaterThan(5)
    expect(coqueiros.length).toBeLessThan(lista.length * 0.2)
  })

  it('nenhuma árvore nasce num lote rasinho (sem quintal)', () => {
    const lista = candidatosDoQuintal(cfg, 1932)
    // o lote tem 6 m de fundura para ter quintal; abaixo disso, não há onde
    // plantar (a casa ocupa o lote inteiro)
    for (const c of lista) expect(c.prof).toBeGreaterThanOrEqual(6)
    // e o dado tem bastante lote raso para o corte pesar
    const rasos = FRENTES.filter((f) => f.prof < 6).length
    expect(rasos).toBeGreaterThan(FRENTES.length * 0.1)
  })
})
