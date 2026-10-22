// Modo leve (22/10/2026): ?leve na URL deixa o jogo mais leve para o Joabe jogar enquanto os agentes
// trabalham (WebGPU, resolução menor, sem a profundidade de campo se existir), sem mudar o padrão.
import { describe, it, expect } from 'vitest'
import { aplicarModoLeve, PADRAO } from '../../src/config.js'

describe('modo leve (?leve)', () => {
  it('sem ?leve não muda nada', () => {
    const cfg = JSON.parse(JSON.stringify(PADRAO))
    expect(aplicarModoLeve(cfg, '')).toBe(false)
    expect(cfg).toEqual(PADRAO)
  })
  it('com ?leve usa WebGPU e resolução menor que a padrão', () => {
    const cfg = JSON.parse(JSON.stringify(PADRAO))
    expect(aplicarModoLeve(cfg, '?leve')).toBe(true)
    expect(cfg.desempenho.renderizador).toBe('webgpu')
    expect(cfg.desempenho.resolucao).toBeLessThan(PADRAO.desempenho.resolucao)
    expect(cfg.desempenho.resolucao).toBeGreaterThanOrEqual(0.6)
  })
  it('?leve=0.7 escolhe a resolução', () => {
    const cfg = JSON.parse(JSON.stringify(PADRAO))
    aplicarModoLeve(cfg, '?leve=0.7')
    expect(cfg.desempenho.resolucao).toBe(0.7)
  })
})
