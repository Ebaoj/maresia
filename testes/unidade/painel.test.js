// Painel de ajustes reorganizado (branch painel-organizado): as seções mudaram de lugar e de nome, mas cada
// controle tem de continuar ligado à mesma chave do cfg, com a mesma faixa. A ficha base
// (apoio/painel-base.json) foi tirada do painel antigo, de 03d7bb1, com 208 controles.
// Controle novo pode entrar à vontade: o teste só reprova se algum da base sumir ou mudar de faixa.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PADRAO } from '../../src/config.js'
import { montarSecoes } from '../../src/ui/painel/secoes.js'
import { decidirBusca, contarAchados } from '../../src/ui/painel/busca.js'
import { caminhoPasta, lerPastas, aplicarPastas } from '../../src/ui/painel/estado.js'
import { normalizar, RECARREGA } from '../../src/ui/painel/comum.js'
import { guiFalsa, fichas } from './apoio/gui-falsa.js'

const BASE = JSON.parse(readFileSync(new URL('./apoio/painel-base.json', import.meta.url), 'utf8'))
// os dois botões do alto (restaurar, copiar) moram em src/ui/painel.js, que precisa do DOM
const DO_TOPO = new Set(['botao:copiar', 'botao:restaurar'])

function montar() {
  const cfg = JSON.parse(JSON.stringify(PADRAO))
  const raiz = guiFalsa('raiz')
  const secoes = montarSecoes(raiz, cfg)
  return { cfg, raiz, secoes, novas: fichas(raiz, cfg) }
}

describe('painel: nenhum controle perdido', () => {
  it('cada controle da base continua ligado à mesma chave, com a mesma faixa', () => {
    const { novas } = montar()
    const porLigacao = new Map(novas.map((f) => [f.ligacao, f]))
    const faltando = []
    for (const b of BASE) {
      if (DO_TOPO.has(b.ligacao)) continue
      const n = porLigacao.get(b.ligacao)
      if (!n) { faltando.push(b.ligacao); continue }
      expect({ ligacao: b.ligacao, extra: n.extra, ouvindo: n.ouvindo, aoMudar: n.aoMudar }).toEqual(b)
    }
    expect(faltando).toEqual([])
  })

  it('nenhuma chave aparece duas vezes e toda chave existe no PADRAO', () => {
    const { novas } = montar()
    const ligacoes = novas.map((f) => f.ligacao)
    expect(ligacoes.length).toBe(new Set(ligacoes).size)
    for (const l of ligacoes) {
      if (l.startsWith('botao:')) continue
      const valor = l.split('.').reduce((o, k) => (o == null ? undefined : o[k]), PADRAO)
      expect(valor, l).not.toBeUndefined()
    }
  })

  it('as seções do alto são seis, nesta ordem', () => {
    const { secoes } = montar()
    expect(secoes.map((s) => s._title)).toEqual(['Jogo', 'Visual', 'Mundo', 'Personagem', 'Desempenho', 'Laboratório'])
  })

  it('a marca de recarregar é uma só: nome terminado em " ⟳", nada de "(recarregar)"', () => {
    const { raiz } = montar()
    const nomes = raiz.controllersRecursive().map((c) => c._name)
    const titulos = raiz.foldersRecursive().map((f) => f._title)
    for (const n of [...nomes, ...titulos]) expect(n, n).not.toMatch(/recarreg/i)
    for (const n of nomes) if (n.includes(RECARREGA)) expect(n.endsWith(` ${RECARREGA}`), n).toBe(true)
    // os que pediam recarregar no painel antigo continuam marcados
    expect(nomes.filter((n) => n.endsWith(RECARREGA)).length).toBeGreaterThanOrEqual(30 + 13)
  })
})

describe('painel: busca', () => {
  it('ignora maiúscula e acento', () => {
    expect(normalizar('Névoa Começa')).toBe('nevoa comeca')
  })

  it('acha pelo nome e abre só o caminho até o achado', () => {
    const { secoes } = montar()
    const v = decidirBusca(secoes, 'NEVOA')
    const achados = [...v].filter(([k, vis]) => vis && !k.folders).map(([k]) => k._name)
    expect(achados).toEqual(expect.arrayContaining(['névoa começa (m)', 'névoa total (m)', 'névoa em camadas']))
    const visual = secoes.find((s) => s._title === 'Visual')
    const mundo = secoes.find((s) => s._title === 'Mundo')
    expect(v.get(visual)).toBe(true)
    expect(v.get(mundo)).toBe(false)
    expect(contarAchados(v)).toBe(achados.length)
  })

  it('várias palavras valem juntas, contando o nome das pastas', () => {
    const { secoes } = montar()
    const v = decidirBusca(secoes, 'arcane sombra')
    const achados = [...v].filter(([k, vis]) => vis && !k.folders).map(([k]) => `${k.parent._title}: ${k._name}`)
    expect(achados).toEqual(['Arcane: limite da sombra', 'Arcane: cor da sombra', 'Arcane: força da sombra'])
  })

  it('a marca ⟳ acha os que pedem recarregar; busca vazia devolve o painel inteiro', () => {
    const { secoes } = montar()
    expect(contarAchados(decidirBusca(secoes, '⟳'))).toBeGreaterThanOrEqual(43)
    expect(decidirBusca(secoes, '   ')).toBeNull()
    expect(contarAchados(decidirBusca(secoes, 'xyzzy'))).toBe(0)
  })
})

describe('painel: pastas lembradas', () => {
  it('o caminho da pasta é a fila de títulos a partir da raiz', () => {
    const { raiz } = montar()
    const traco = raiz.foldersRecursive().find((f) => f._title === 'Traço de nanquim')
    expect(caminhoPasta(traco)).toBe('Visual/Quadrinho/Traço de nanquim')
    expect(caminhoPasta(raiz)).toBe('')
  })

  it('sem registro tudo nasce fechado; o que foi aberto volta aberto', () => {
    const { raiz } = montar()
    aplicarPastas(raiz, {})
    expect(raiz._closed).toBe(false)
    expect(raiz.foldersRecursive().every((f) => f._closed)).toBe(true)
    aplicarPastas(raiz, { Visual: true, 'Visual/Arcane': true })
    const abertas = raiz.foldersRecursive().filter((f) => !f._closed).map(caminhoPasta)
    expect(abertas).toEqual(['Visual', 'Visual/Arcane'])
  })

  it('sem localStorage o painel não quebra', () => {
    const antes = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('bloqueado') } })
    try { expect(lerPastas()).toEqual({}) } finally {
      if (antes) Object.defineProperty(globalThis, 'localStorage', antes)
      else delete globalThis.localStorage
    }
  })
})
