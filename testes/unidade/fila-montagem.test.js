// A fila de montagem com orçamento de tempo (Fase 1 do plano de performance, 25/10/2026).
//
// O problema que ela resolve: montar um bloco de casas de 1932 levava 150 a 300 ms na T4, e o
// bloco inteiro era montado dentro de um quadro. A fila transforma a montagem em unidades
// pequenas e gasta só um orçamento de tempo por quadro (4 ms por padrão).
import { describe, it, expect } from 'vitest'
import { criarFilaMontagem } from '../../src/mundo/fila-montagem.js'

// relógio falso: o tempo só anda quando o trabalho anda
function relogio() {
  const r = { t: 0, agora: () => r.t, gasta: (ms) => { r.t += ms } }
  return r
}

describe('fila de montagem com orçamento de tempo', () => {
  it('trabalha na ordem da prioridade (menor primeiro)', () => {
    const r = relogio()
    const fila = criarFilaMontagem({ agora: r.agora })
    const feito = []
    fila.enfileirar('longe', () => feito.push('longe'), { prioridade: 90 })
    fila.enfileirar('perto', () => feito.push('perto'), { prioridade: 10 })
    fila.enfileirar('meio', () => feito.push('meio'), { prioridade: 50 })
    fila.processar({ orcamentoMs: 1000 })
    expect(feito).toEqual(['perto', 'meio', 'longe'])
  })

  it('para quando o orçamento acaba e deixa o resto na fila', () => {
    const r = relogio()
    const fila = criarFilaMontagem({ agora: r.agora })
    const feito = []
    for (const k of ['a', 'b', 'c', 'd']) fila.enfileirar(k, () => { feito.push(k); r.gasta(3) }, { tipo: 'casa' })
    const res = fila.processar({ orcamentoMs: 10 })
    expect(feito).toEqual(['a', 'b', 'c']) // 3 + 3 + 3 = 9 ms; o quarto passaria de 10
    expect(res.feitos).toBe(3)
    // a unidade é uma tarefa que se repete: ela fica na fila até o trabalho acabar
    expect(res.resto).toBe(4)
    expect(fila.pendentes).toBe(4)
  })

  it('a primeira unidade sempre roda, mesmo se o custo aprendido for grande', () => {
    const r = relogio()
    const fila = criarFilaMontagem({ agora: r.agora })
    fila.enfileirar('pesada', () => r.gasta(50), { tipo: 'casa', custo: 50 })
    const res = fila.processar({ orcamentoMs: 4 })
    expect(res.feitos).toBe(1) // sem isso, um trabalho caro nunca sairia
  })

  it('aprende o custo de cada tipo e não começa o que não cabe', () => {
    const r = relogio()
    const fila = criarFilaMontagem({ agora: r.agora })
    // a unidade sai da fila quando o trabalho acaba (como o bloco de casas)
    const trabalho = (chave, ms) => () => { r.gasta(ms); fila.remover(chave) }
    fila.enfileirar('a', trabalho('a', 8), { tipo: 'casa' })
    fila.processar({ orcamentoMs: 100 }) // aprende: casa custa 8 ms
    expect(fila.custoConhecido('casa')).toBeCloseTo(8, 5)
    // com o orçamento de 4 ms, a casa (8 ms) não cabe depois da primeira unidade
    fila.enfileirar('barata', trabalho('barata', 1), { tipo: 'barato' })
    fila.enfileirar('casa', trabalho('casa', 8), { tipo: 'casa' })
    const res = fila.processar({ orcamentoMs: 4 })
    expect(res.feitos).toBe(1) // só a barata
    expect(fila.tem('casa')).toBe(true) // a casa ficou na fila para o próximo quadro
    expect(fila.pendentes).toBe(1)
  })

  it('reenfileirar a mesma chave atualiza a prioridade em vez de duplicar', () => {
    const r = relogio()
    const fila = criarFilaMontagem({ agora: r.agora })
    const feito = []
    fila.enfileirar('bloco', () => feito.push('bloco'), { prioridade: 500 })
    fila.enfileirar('bloco', () => feito.push('bloco'), { prioridade: 1 })
    expect(fila.pendentes).toBe(1)
    expect(fila.prioridade('bloco')).toBe(1)
    fila.processar({ orcamentoMs: 100 })
    expect(feito).toEqual(['bloco'])
  })

  it('mudar a prioridade mexe na fila sem perder o trabalho', () => {
    const r = relogio()
    const fila = criarFilaMontagem({ agora: r.agora })
    const feito = []
    fila.enfileirar('a', () => feito.push('a'), { prioridade: 1 })
    fila.enfileirar('b', () => feito.push('b'), { prioridade: 2 })
    fila.mudarPrioridade('b', 0)
    fila.processar({ orcamentoMs: 100 })
    expect(feito).toEqual(['b', 'a'])
  })

  it('remover tira a unidade da fila', () => {
    const fila = criarFilaMontagem()
    fila.enfileirar('a', () => { throw new Error('não devia rodar') })
    fila.remover('a')
    const res = fila.processar({ orcamentoMs: 100 })
    expect(res.feitos).toBe(0)
    expect(fila.pendentes).toBe(0)
  })
})
