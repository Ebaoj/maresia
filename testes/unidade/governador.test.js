// O governador de qualidade (src/render/governador.js; escada desde 27/10/2026): corta sombra, distância e LOD
// antes da resolução, pelo p95 sustentado do custo, piso de pixel 0,75 fora de emergência, não oscila, e o teto de pixel da tela Retina (qualidade.js: tetoPixel).
// Régua de custo (27/10/2026, visual/correcoes; docs/relatorio-visual.md 1.1): o governador media o intervalo do rAF,
// que a 60 Hz nunca fica abaixo de 16,7 ms, e não subia mais (catraca); a escada desligava a estabilização, o desfoque e
// passava a pincelada a meia resolução. Os testes "a 60 Hz ... volta ao cheio", "a escada não troca o caráter da
// imagem" e "transição" pegam isso (falham no 3b2b4cf).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { GovernadorQualidade, aplicarDegrau, Transicao, DEGRAUS } from '../../src/render/governador.js'
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

  it('p95 caro com p50 folgado: corta sombra, distância e LOD, mas nunca a resolução', () => {
    const g = new GovernadorQualidade()
    const trocas = correr(g, quadros({ p50: 13, p95: 30 }), 120000)
    expect(trocas[0]).toBe('sombra-perto-leve')
    expect(trocas).toContain('sem-sombra-perto')
    expect(trocas.some((n) => n.startsWith('pixel'))).toBe(false)
    expect(g.capPixel()).toBe(Infinity)
  })

  it('a escada não troca o caráter da imagem: estabilização, desfoque e pincelada ficam fora', () => {
    const chaves = DEGRAUS.flatMap((d) => Object.keys(d.chaves))
    expect(chaves).not.toContain('estilo.estabilizar')
    expect(chaves).not.toContain('estilo.dof')
    expect(chaves).not.toContain('estilo.arcPinturaMeia')
    const g = new GovernadorQualidade()
    g.degrau = DEGRAUS.length - 1
    expect(Object.keys(g.ajustes()).filter((k) => k.startsWith('estilo.'))).toEqual([])
  })

  it('a 60 Hz (intervalo do rAF sempre 16,7 ms) com custo de 9 ms, volta ao cheio depois de um trecho caro', () => {
    const g = new GovernadorQualidade()
    // trecho caro: custo 24-30 ms, um quadro a cada 2 vsyncs
    for (let t = 0; t < 60000; t += 33.3) g.quadro(24 + (t % 7), 33.3)
    expect(g.degrau).toBeGreaterThan(0)
    // folga: custo 9 ms, o rAF entrega 16,7 ms. A janela e as esperas andam no relógio (o intervalo), não no custo:
    // a primeira subida sai em ~13 s (resfriar 3 + janela 2 + espera 8)
    const d0 = g.degrau
    let tSubir = null
    for (let t = 0; t < 300000; t += 16.7) { g.quadro(9, 16.7); if (tSubir === null && g.degrau < d0) tSubir = t }
    expect(tSubir).toBeLessThan(14000)
    expect(g.degrau).toBe(0)
  })

  it('o jogo passa ao governador o custo do quadro, não o intervalo do requestAnimationFrame', () => {
    const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8')
    const chamadas = main.split('\n').filter((l) => l.includes('governador.quadro('))
    expect(chamadas.length).toBe(1)
    expect(chamadas[0]).toMatch(/governador\.quadro\(custoQuadroMs, real \* 1000\)/)
  })

  it('a 60 Hz com o custo perto do orçamento (15 ms), não fica subindo e descendo', () => {
    const g = new GovernadorQualidade()
    const trocas = []
    for (let t = 0; t < 300000; t += 16.7) if (g.quadro(14 + (t % 3), 16.7) !== null) trocas.push(g.nome)
    expect(trocas).toEqual([])
  })

  it('sobe pela mesma régua: só quando o custo previsto no degrau de cima (o de agora + o que a descida poupou) cabe', () => {
    const g = new GovernadorQualidade()
    // no cheio custa 26 ms; no degrau 1, 13: a descida "poupou" 13 ms
    const custo = () => (g.degrau === 0 ? 26 : 13)
    for (let t = 0; t < 20000 && g.degrau === 0; t += 16.7) g.quadro(custo(), 16.7)
    expect(g.degrau).toBe(1)
    for (let t = 0; t < 8000; t += 16.7) g.quadro(custo(), 16.7)
    expect(g.ganho[1]).toBeGreaterThan(10)
    // 13 + 13 = 26 não cabe em 16,7: não volta logo; o ganho é esquecido devagar (a cena muda) e a subida que não se
    // sustenta dobra a espera: em 5 minutos, no máximo 3 tentativas
    let subidas = 0
    for (let t = 0; t < 300000; t += 16.7) { const d = g.quadro(custo(), 16.7); if (d === 0) subidas++ }
    expect(subidas).toBeLessThanOrEqual(3)
  })

  it('quadro caro de verdade (p50 20): a resolução é a última e para em 0,75', () => {
    const g = new GovernadorQualidade()
    const trocas = correr(g, quadros({ p50: 20, p95: 26 }), 200000)
    const iPix = trocas.findIndex((n) => n.startsWith('pixel'))
    expect(iPix).toBeGreaterThan(trocas.indexOf('sem-sombra-perto'))
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
    expect(cfg.mundo.sombraPerto).toBe(false)
    expect(cfg.estilo.dof).toBe(true)
    expect(cfg.estilo.estabilizar).toBe(0.85)
    expect(cfg.desempenho.cortePx).toBe(6)
    g.degrau = 0
    aplicarDegrau(cfg, g, base)
    expect(cfg).toEqual({ mundo: { sombraPertoResolucao: 1024, sombraPerto: true, palhaPerto: 220 }, estilo: { arcPinturaMeia: false, dof: true, estabilizar: 0.85 }, desempenho: { cortePx: 3 }, pessoas: { ate: 400 }, marcos: { distDetalhe: 170 }, arvores: { lodPerto: 65, lodLonge: 85, lodBloco: 90 } })
  })
})

describe('transição dos números da escada (0,5 s)', () => {
  it('distâncias e corte vão ao valor novo em 0,5 s, em 5 degraus; liga/desliga e textura trocam na hora', () => {
    const cfg = { mundo: { sombraPertoResolucao: 1024, sombraPerto: true, palhaPerto: 220 }, desempenho: { cortePx: 3 }, pessoas: { ate: 400 }, marcos: { distDetalhe: 170 }, arvores: { lodPerto: 65, lodLonge: 85, lodBloco: 90 } }
    const g = new GovernadorQualidade()
    const base = {}, tr = new Transicao()
    aplicarDegrau(cfg, g, base, tr)
    g.degrau = 4
    aplicarDegrau(cfg, g, base, tr)
    expect(cfg.mundo.sombraPertoResolucao).toBe(512)
    expect(cfg.mundo.sombraPerto).toBe(false)
    expect(cfg.desempenho.cortePx).toBe(3) // ainda não andou
    const vistos = new Set()
    for (let k = 0; k < 30; k++) { tr.avancar(cfg, 1 / 60); vistos.add(cfg.arvores.lodBloco) }
    expect(cfg.arvores.lodBloco).toBe(60)
    expect(cfg.desempenho.cortePx).toBe(6)
    expect(tr.ativa).toBe(false)
    expect([...vistos].sort((a, b) => b - a)).toEqual([90, 84, 78, 72, 66, 60])
    // subir no meio de uma transição parte do valor de agora
    g.degrau = 0
    aplicarDegrau(cfg, g, base, tr)
    tr.avancar(cfg, 0.25)
    expect(cfg.arvores.lodBloco).toBeGreaterThan(60)
    expect(cfg.arvores.lodBloco).toBeLessThan(90)
    tr.avancar(cfg, 0.3)
    expect(cfg.arvores.lodBloco).toBe(90)
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
