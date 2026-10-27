// O governador de qualidade (src/render/governador.js; escada desde 27/10/2026): corta sombra, pós, distância e LOD
// antes da resolução, pelo p95 sustentado, piso de pixel 0,75 fora de emergência, não oscila, e o teto de pixel da tela Retina (qualidade.js: tetoPixel).
import { describe, it, expect } from 'vitest'
import { GovernadorQualidade, aplicarDegrau } from '../../src/render/governador.js'
import { tetoPixel, aplicarNivelVivo, aplicarQualidadeDaUrl } from '../../src/qualidade.js'

const rodar = (g, dt, ms) => { const trocas = []; for (let t = 0; t < ms; t += dt) { const n = g.quadro(dt); if (n) trocas.push(n) } return trocas }

describe('governador de qualidade (escada, 27/10/2026)', () => {
  // gerador de quadros com p50 / p95 / picos (semente fixa)
  const quadros = ({ p50, p95, pico = 0, cadaPico = 0 }) => {
    let s = 7
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    let k = 0
    return () => { k++; if (cadaPico && k % cadaPico === 0) return pico; return rnd() < 0.9 ? p50 + (rnd() - 0.5) : p95 + rnd() }
  }
  const correr = (g, gerar, ms) => { const trocas = []; for (let t = 0; t < ms;) { const dt = gerar(); t += dt; const d = g.quadro(dt); if (d !== null) trocas.push(g.nome) } return trocas }

  it('telemetria do M1 (p50 13, p95 15-20, travadas de 45-200 ms): nada cai, nem a resolução', () => {
    const g = new GovernadorQualidade()
    expect(correr(g, quadros({ p50: 13, p95: 19.5, pico: 45, cadaPico: 70 }), 240000)).toEqual([])
    expect(correr(g, quadros({ p50: 13, p95: 18, pico: 180, cadaPico: 300 }), 120000)).toEqual([])
    expect(g.capPixel()).toBe(Infinity)
  })

  it('p95 caro com p50 folgado: corta sombra, pós, distância e LOD, mas nunca a resolução', () => {
    const g = new GovernadorQualidade()
    const trocas = correr(g, quadros({ p50: 13, p95: 30 }), 120000)
    expect(trocas[0]).toBe('sombra-perto-leve')
    expect(trocas).toContain('sem-estabilizar')
    expect(trocas.some((n) => n.startsWith('pixel'))).toBe(false)
    expect(g.capPixel()).toBe(Infinity)
    expect(g.ajustes()['estilo.dof']).toBe(false)
  })

  it('quadro caro de verdade (p50 20): a resolução é a última e para em 0,75', () => {
    const g = new GovernadorQualidade()
    const trocas = correr(g, quadros({ p50: 20, p95: 26 }), 200000)
    const iPix = trocas.findIndex((n) => n.startsWith('pixel'))
    expect(iPix).toBeGreaterThan(trocas.indexOf('sem-estabilizar'))
    expect(g.capPixel()).toBe(0.75)
  })

  it('só com o orçamento estourado (p50 30) desce abaixo de 0,75', () => {
    const g = new GovernadorQualidade()
    correr(g, quadros({ p50: 30, p95: 40 }), 300000)
    expect(g.capPixel()).toBe(0.5)
  })

  it('sobe com folga sustentada, a resolução primeiro, e a espera dobra quando a subida não se sustenta', () => {
    const g = new GovernadorQualidade()
    correr(g, quadros({ p50: 20, p95: 26 }), 200000)
    expect(g.capPixel()).toBe(0.75)
    const subidas = correr(g, quadros({ p50: 9, p95: 12 }), 12000)
    expect(subidas[0]).toBe('pixel-0.8')
    correr(g, quadros({ p50: 20, p95: 26 }), 8000)
    expect(g.esperaAtual).toBe(16000)
    correr(g, quadros({ p50: 9, p95: 12 }), 400000)
    expect(g.degrau).toBe(0)
  })

  it('troca de aba (dt enorme) zera a janela e não conta como caro', () => {
    const g = new GovernadorQualidade()
    expect(correr(g, () => 1000, 60000)).toEqual([])
  })

  it('aplicarDegrau escreve as chaves por cima da base e volta a ela ao subir', () => {
    const cfg = { mundo: { sombraPertoResolucao: 1024, sombraPerto: true, palhaPerto: 220 }, estilo: { arcPinturaMeia: false, dof: true, estabilizar: 0.85 }, desempenho: { cortePx: 3 }, pessoas: { ate: 400 }, marcos: { distDetalhe: 170 }, arvores: { lodPerto: 65, lodLonge: 85, lodBloco: 90 } }
    const g = new GovernadorQualidade()
    const base = {}
    aplicarDegrau(cfg, g, base)
    g.degrau = 4
    aplicarDegrau(cfg, g, base)
    expect(cfg.mundo.sombraPertoResolucao).toBe(512)
    expect(cfg.estilo.dof).toBe(false)
    expect(cfg.desempenho.cortePx).toBe(6)
    g.degrau = 0
    aplicarDegrau(cfg, g, base)
    expect(cfg).toEqual({ mundo: { sombraPertoResolucao: 1024, sombraPerto: true, palhaPerto: 220 }, estilo: { arcPinturaMeia: false, dof: true, estabilizar: 0.85 }, desempenho: { cortePx: 3 }, pessoas: { ate: 400 }, marcos: { distDetalhe: 170 }, arvores: { lodPerto: 65, lodLonge: 85, lodBloco: 90 } })
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
