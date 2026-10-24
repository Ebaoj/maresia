// Perfis de qualidade (24/10/2026, src/qualidade.js): ?qualidade= na URL escolhe o perfil do jogo inteiro
// (resolução, sombra, grama, profundidade de campo) só nesta abertura, por cima do que está salvo no painel.
//
// O que estes testes pegam:
//  - perfil que mexe na chave errada (ou não mexe): a máquina fraca continua pesada;
//  - ?qualidade= sem perfil (ou com um nome desconhecido) mudando o jogo sem querer;
//  - o perfil automático escolhendo um nível fora dos três (e o painel recebendo um valor que não existe).
import { describe, expect, it } from 'vitest'
import { aplicarQualidade, aplicarQualidadeDaUrl, detectarQualidade, PERFIS, NIVEIS } from '../../src/qualidade.js'
import { PADRAO } from '../../src/config.js'

const cfgLimpa = () => JSON.parse(JSON.stringify(PADRAO))

describe('perfis de qualidade', () => {
  it('o perfil baixo alivia a máquina: resolução menor, sombra mais leve, sem dof e sem grama pesada', () => {
    const cfg = cfgLimpa()
    expect(aplicarQualidade(cfg, 'baixo')).toBe(true)
    expect(cfg.desempenho.resolucao).toBe(0.75)
    expect(cfg.desempenho.resolucaoMin).toBe(0.5)
    expect(cfg.mundo.resolucaoSombra).toBe(1024)
    expect(cfg.mundo.sombraPerto).toBe(false)
    expect(cfg.estilo.dof).toBe(false)
    expect(cfg.estilo.estabilizar).toBe(0)
    expect(cfg.grama.quantidade).toBe(25000)
  })

  it('o perfil médio é o padrão do jogo: resolução 1,0 e sombra 2048', () => {
    const cfg = cfgLimpa()
    expect(aplicarQualidade(cfg, 'medio')).toBe(true)
    expect(cfg.desempenho.resolucao).toBe(1.0)
    expect(cfg.mundo.resolucaoSombra).toBe(2048)
    expect(cfg.mundo.sombraPertoResolucao).toBe(1024)
    expect(cfg.grama.quantidade).toBe(50000)
  })

  it('o perfil alto é o de antes: resolução 1,25, sombra 4096 e sombra de perto em 2048', () => {
    const cfg = cfgLimpa()
    expect(aplicarQualidade(cfg, 'alto')).toBe(true)
    expect(cfg.desempenho.resolucao).toBe(1.25)
    expect(cfg.mundo.resolucaoSombra).toBe(4096)
    expect(cfg.mundo.sombraPertoResolucao).toBe(2048)
    expect(cfg.grama.quantidade).toBe(200000)
  })

  it('nível desconhecido não muda nada', () => {
    const cfg = cfgLimpa()
    expect(aplicarQualidade(cfg, 'altissimo')).toBe(false)
    expect(cfg).toEqual(PADRAO)
  })

  it('todo perfil só mexe nas chaves que ele lista (o resto do painel fica como a pessoa deixou)', () => {
    for (const nivel of NIVEIS) {
      const cfg = cfgLimpa()
      const antes = JSON.stringify(cfg)
      aplicarQualidade(cfg, nivel)
      const depois = JSON.stringify(cfg)
      const mudou = (a, b) => a !== b
      // só as chaves do perfil podem ter mudado
      for (const caminho of Object.keys(PERFIS[nivel])) {
        const partes = caminho.split('.')
        const ultima = partes.pop()
        const dono = partes.reduce((o, k) => o[k], cfg)
        expect(dono[ultima]).toBe(PERFIS[nivel][caminho])
      }
      expect(mudou(antes, depois)).toBe(typeof PERFIS[nivel] === 'object')
    }
  })
})

describe('?qualidade= na URL', () => {
  it('sem ?qualidade= nada muda (vale o que está salvo)', () => {
    const cfg = cfgLimpa()
    expect(aplicarQualidadeDaUrl(cfg, '')).toBe(false)
    expect(cfg).toEqual(PADRAO)
  })

  it('?qualidade=baixo aplica o perfil baixo', () => {
    const cfg = cfgLimpa()
    expect(aplicarQualidadeDaUrl(cfg, '?qualidade=baixo')).toBe(true)
    expect(cfg.desempenho.resolucao).toBe(0.75)
    expect(cfg.grama.quantidade).toBe(25000)
  })

  it('?qualidade=auto aplica o perfil que o navegador permite', () => {
    const cfg = cfgLimpa()
    expect(aplicarQualidadeDaUrl(cfg, '?qualidade=auto')).toBe(true)
    expect(NIVEIS).toContain(detectarQualidade())
    expect(cfg.desempenho.resolucao).toBe(PERFIS[detectarQualidade()]['desempenho.resolucao'])
  })

  it('?qualidade= com nome valendo nada não mexe no jogo', () => {
    const cfg = cfgLimpa()
    expect(aplicarQualidadeDaUrl(cfg, '?qualidade=meio')).toBe(false)
    expect(cfg).toEqual(PADRAO)
  })
})

describe('detecção automática', () => {
  it('devolve sempre um dos três níveis', () => {
    expect(NIVEIS).toContain(detectarQualidade())
  })
})
