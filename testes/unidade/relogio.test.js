// Relógio do jogo (27/10/2026, docs/relatorio-visual.md 4): o jogo abria às 16,6 h (ou na hora que o painel tinha
// salvo) e andava 1 h de jogo por minuto real: em dois minutos parado na Praça o canteiro ia de verde a
// marrom-violeta e cada abertura mostrava outra cor. Pega: a hora de abrir é a do padrão (15 h) mesmo com outra
// salva, ?hora= escolhe, e o relógio anda devagar (<= 0,2 h por minuto), inclusive para quem salvou o 1,0 antigo.
import { describe, it, expect, beforeEach } from 'vitest'
import { PADRAO, carregarConfig, aplicarHoraDeAbrir } from '../../src/config.js'

describe('relógio do jogo', () => {
  beforeEach(() => {
    const dados = {}
    globalThis.localStorage = { getItem: (k) => dados[k] ?? null, setItem: (k, v) => { dados[k] = String(v) }, removeItem: (k) => { delete dados[k] } }
  })

  it('abre numa hora de tarde clara e o relógio anda devagar', () => {
    expect(PADRAO.tempo.hora).toBeGreaterThanOrEqual(9)
    expect(PADRAO.tempo.hora).toBeLessThanOrEqual(15.5)
    expect(PADRAO.tempo.velocidade).toBeGreaterThan(0)
    expect(PADRAO.tempo.velocidade).toBeLessThanOrEqual(0.2)
  })

  it('a hora salva não vale ao abrir; a velocidade 1,0 antiga salva passa à nova', () => {
    localStorage.setItem('maresia.config.v8', JSON.stringify({ tempo: { hora: 19.3, velocidade: 1.0 } }))
    const cfg = carregarConfig()
    expect(cfg.tempo.hora).toBe(PADRAO.tempo.hora)
    expect(cfg.tempo.velocidade).toBe(PADRAO.tempo.velocidade)
    // velocidade escolhida de propósito no painel fica
    localStorage.setItem('maresia.config.v8', JSON.stringify({ tempo: { velocidade: 3 } }))
    expect(carregarConfig().tempo.velocidade).toBe(3)
  })

  it('?hora= na URL escolhe a hora de abrir', () => {
    const cfg = JSON.parse(JSON.stringify(PADRAO))
    aplicarHoraDeAbrir(cfg, '?hora=9.5')
    expect(cfg.tempo.hora).toBe(9.5)
    aplicarHoraDeAbrir(cfg, '')
    expect(cfg.tempo.hora).toBe(PADRAO.tempo.hora)
  })
})
