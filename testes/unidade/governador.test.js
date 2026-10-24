// O governador de qualidade (24/10/2026, src/render/governador.js): troca o perfil quando o quadro fica caro por
// segundos, volta com folga longa, não oscila, e o teto de pixel da tela Retina (qualidade.js: tetoPixel).
import { describe, it, expect } from 'vitest'
import { GovernadorQualidade } from '../../src/render/governador.js'
import { tetoPixel, aplicarNivelVivo, aplicarQualidadeDaUrl } from '../../src/qualidade.js'

const rodar = (g, dt, ms) => { const trocas = []; for (let t = 0; t < ms; t += dt) { const n = g.quadro(dt); if (n) trocas.push(n) } return trocas }

describe('governador de qualidade', () => {
  it('quadro caro sustentado desce um nível por vez, com resfriamento entre as descidas', () => {
    const g = new GovernadorQualidade({ nivel: 'alto' })
    expect(rodar(g, 40, 3000)).toEqual([]) // janela enchendo + sustentar: ainda não
    expect(rodar(g, 40, 3000)).toEqual(['medio'])
    expect(rodar(g, 40, 2000)).toEqual([]) // resfriando
    expect(rodar(g, 40, 10000)).toEqual(['baixo'])
    expect(rodar(g, 40, 20000)).toEqual([]) // já está no piso
  })

  it('um pico isolado não derruba o nível', () => {
    const g = new GovernadorQualidade({ nivel: 'medio' })
    const trocas = []
    for (let i = 0; i < 2000; i++) { const n = g.quadro(i % 50 === 0 ? 300 : 16); if (n) trocas.push(n) }
    expect(trocas).toEqual([])
  })

  it('sobe só com folga longa, e a espera dobra quando a subida não se sustenta (sem oscilar)', () => {
    const g = new GovernadorQualidade({ nivel: 'baixo', esperaSubirMs: 10000 })
    expect(rodar(g, 8, 9000)).toEqual([])
    expect(rodar(g, 8, 8000)).toEqual(['medio'])
    expect(rodar(g, 40, 8000)).toEqual(['baixo']) // não aguentou: volta
    expect(g.esperaAtual).toBe(20000)
    expect(rodar(g, 8, 15000)).toEqual([]) // agora precisa de 20 s de folga
    expect(rodar(g, 8, 12000)).toEqual(['medio'])
  })

  it('troca de aba (dt enorme) zera a janela e não conta como caro', () => {
    const g = new GovernadorQualidade({ nivel: 'alto' })
    expect(rodar(g, 1000, 60000)).toEqual([])
  })
})

describe('teto de pixel e perfis vivos', () => {
  it('em tela Retina o pixel ratio fica no teto do perfil; em monitor comum, o dpr', () => {
    const cfg = { desempenho: { tetoRetina: 1 } }
    expect(tetoPixel(cfg, 2)).toBe(1)
    expect(tetoPixel(cfg, 1)).toBe(1)
    expect(tetoPixel({ desempenho: { tetoRetina: 1.25 } }, 2)).toBe(1.25)
  })

  it('o nível vivo mexe só no que muda com o jogo rodando (a grama e a sombra de longe ficam)', () => {
    const cfg = { desempenho: { resolucao: 1.25, resolucaoMin: 0.9, tetoRetina: 1.25 }, mundo: { sombraPerto: true, sombraPertoResolucao: 2048, resolucaoSombra: 4096 }, estilo: { dof: true, estabilizar: 0.85 }, grama: { quantidade: 200000 } }
    aplicarNivelVivo(cfg, 'baixo')
    expect(cfg.desempenho.resolucao).toBe(0.75)
    expect(cfg.mundo.sombraPerto).toBe(false)
    expect(cfg.estilo.dof).toBe(false)
    expect(cfg.grama.quantidade).toBe(200000)
    expect(cfg.mundo.resolucaoSombra).toBe(4096)
    aplicarNivelVivo(cfg, 'medio')
    expect(cfg.mundo.sombraPerto).toBe(true)
    expect(cfg.estilo.dof).toBe(true)
    expect(cfg.estilo.estabilizar).toBe(0.85)
  })

  it('?qualidade explícita fixa o perfil (o governador não roda); auto deixa ele trabalhar', () => {
    const cfg = { desempenho: { resolucao: 1 }, mundo: {}, estilo: {}, grama: {} }
    aplicarQualidadeDaUrl(cfg, '?qualidade=alto')
    expect(cfg.desempenho.qualidadeFixa).toBe(true)
    aplicarQualidadeDaUrl(cfg, '?qualidade=auto')
    expect(cfg.desempenho.qualidadeFixa).toBe(false)
  })
})
