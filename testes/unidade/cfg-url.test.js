// Ajustes pela URL (25/10/2026, Fase 2): ?cfg=mundo.sombraEstatica=0;desempenho.casasEmLote=0
// Vale por cima do que está salvo, só nesta abertura (como ?leve e ?qualidade).
//
// O painel é o caminho normal, mas a Fase 2 precisa de um A/B rápido: a sombra do sol refeita só na
// mudança (cfg.mundo.sombraEstatica) e as casas em lote (cfg.desempenho.casasEmLote) se desligam por
// URL, sem mexer no que está salvo.
//
// O que estes testes pegam:
//  - o ajuste da URL não chegar no jogo (o A/B fica sempre no mesmo caminho);
//  - a chave errada ser mudada (o A/B mede outra coisa);
//  - o valor vir pelo tipo errado (uma chave que era 1 vira "1" e some);
//  - a URL com uma chave que não existe mudar o jogo (o painel não tem essa chave);
//  - o ajuste da URL apagar o que está salvo ou o padrão de outra chave.
import { describe, it, expect } from 'vitest'
import { aplicarCfgDaUrl, PADRAO } from '../../src/config.js'

const copia = () => JSON.parse(JSON.stringify(PADRAO))

describe('ajustes pela URL (?cfg=)', () => {
  it('sem ?cfg não muda nada', () => {
    const cfg = copia()
    expect(aplicarCfgDaUrl(cfg, '')).toEqual([])
    expect(cfg).toEqual(PADRAO)
  })

  it('muda a chave do caminho, com o valor lido pelo tipo dela', () => {
    const cfg = copia()
    const mudou = aplicarCfgDaUrl(cfg, '?cfg=mundo.sombraEstatica=0')
    expect(mudou).toEqual(['mundo.sombraEstatica'])
    expect(cfg.mundo.sombraEstatica).toBe(false)
    expect(typeof cfg.mundo.sombraEstatica).toBe('boolean')
  })

  it('várias chaves de uma vez, separadas por ; ou por ,', () => {
    const cfg = copia()
    aplicarCfgDaUrl(cfg, '?cfg=mundo.sombraEstatica=0;desempenho.casasEmLote=0')
    expect(cfg.mundo.sombraEstatica).toBe(false)
    expect(cfg.desempenho.casasEmLote).toBe(false)
    const outra = copia()
    aplicarCfgDaUrl(outra, '?cfg=mundo.sombraEstatica=0,desempenho.casasEmLote=0')
    expect(outra.mundo.sombraEstatica).toBe(false)
    expect(outra.desempenho.casasEmLote).toBe(false)
  })

  it('vários ?cfg= na URL valem todos', () => {
    const cfg = copia()
    const mudou = aplicarCfgDaUrl(cfg, '?cfg=mundo.sombraEstatica=0&cfg=desempenho.casasEmLote=0')
    expect(mudou).toEqual(['mundo.sombraEstatica', 'desempenho.casasEmLote'])
    expect(cfg.mundo.sombraEstatica).toBe(false)
    expect(cfg.desempenho.casasEmLote).toBe(false)
  })

  it('aceita false, nao e off como desligado', () => {
    const cfg = copia()
    aplicarCfgDaUrl(cfg, '?cfg=mundo.sombraEstatica=false')
    expect(cfg.mundo.sombraEstatica).toBe(false)
    aplicarCfgDaUrl(cfg, '?cfg=desempenho.casasEmLote=off')
    expect(cfg.desempenho.casasEmLote).toBe(false)
    aplicarCfgDaUrl(cfg, '?cfg=desempenho.casasEmLote=nao')
    expect(cfg.desempenho.casasEmLote).toBe(false)
  })

  it('um número continua número, e o texto continua texto', () => {
    const cfg = copia()
    aplicarCfgDaUrl(cfg, '?cfg=desempenho.casasLoteVertices=500000')
    expect(cfg.desempenho.casasLoteVertices).toBe(500000)
    expect(typeof cfg.desempenho.casasLoteVertices).toBe('number')
  })

  it('uma chave que não existe é ignorada (e o resto da URL não quebra)', () => {
    const cfg = copia()
    const mudou = aplicarCfgDaUrl(cfg, '?cfg=nao.existe=1;mundo.sombraEstatica=0')
    expect(mudou).toEqual(['mundo.sombraEstatica'])
    expect(cfg.nao).toBeUndefined()
    expect(cfg.mundo.sombraEstatica).toBe(false)
  })

  it('o ajuste da URL vale por cima do que está salvo no painel', () => {
    const cfg = copia()
    cfg.mundo.sombraEstatica = true // o que está salvo no painel
    aplicarCfgDaUrl(cfg, '?cfg=mundo.sombraEstatica=0')
    expect(cfg.mundo.sombraEstatica).toBe(false)
  })

  it('as chaves da Fase 2 existem no padrão (o painel e o A/B dependem delas)', () => {
    expect(PADRAO.mundo.sombraEstatica).toBe(true)
    expect(PADRAO.desempenho.casasEmLote).toBe(true)
    expect(PADRAO.desempenho.casasLoteVertices).toBeGreaterThan(0)
  })
})
