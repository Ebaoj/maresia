// A escrita do lote em fatias (26/10/2026, src/mundo/lote-fatia.js).
//
// A geometria do bloco entrava no BatchedMesh de uma vez (o addGeometry do three copia a pilha
// inteira) e o lote crescia no meio da partida (o setGeometrySize recria o buffer e a placa sobe
// tudo de novo). Medido na T4, uma unidade de montagem levava 70 a 100 ms e o quadro passava de
// 100 ms.
//
// A correção: o lote nasce com o espaço final (nunca cresce) e a geometria entra em fatias. Cada
// quadro escreve um trecho dos vértices na faixa reservada, e o trecho cabe no orçamento de tempo
// do quadro (cfg.desempenho.orcamentoMontagemMs).
//
// O que este teste prende:
//  - a fatia caber no orçamento do quadro (com um relógio falso, o custo é controlado);
//  - a pilha entrar inteira, em quantas fatias forem precisas (nada se perde);
//  - a fatia nunca parar (o quadro sempre avança);
//  - o custo por vértice medido encolher a fatia seguinte (um vértice caro encolhe a fatia);
//  - o aviso de quando a pilha entrou toda (a instância do lote só entra aí).
import { describe, expect, it } from 'vitest'
import { criarFatia, tamanhoDaFatia, CUSTO_VERTICE, FATIA_MAXIMA } from '../../src/mundo/lote-fatia.js'

// relógio falso: o tempo só anda quando o trabalho anda (o custo por vértice é o do teste)
function relogio(custoPorVertice = 0.0001) {
  const r = { t: 0, custo: custoPorVertice, agora: () => r.t }
  // o escritor chama escrever(inicio, n)
  r.escrever = (inicio, n) => { r.t += n * r.custo }
  return r
}

describe('a fatia da escrita no lote', () => {
  it('a fatia cabe no orçamento do quadro (o relógio falso mede o custo)', () => {
    const r = relogio(0.0001) // 0,1 ms por vértice
    const f = criarFatia({ vertices: 100000, escrever: r.escrever, agora: r.agora })
    const r1 = f.passo(3) // o orçamento do quadro é 3 ms
    expect(r1.escritos).toBeGreaterThan(0)
    expect(r1.ms).toBeLessThanOrEqual(3) // o pedaço não passou do orçamento
    expect(r1.fim).toBe(false)
    expect(f.pendente).toBeGreaterThan(0) // e o resto da pilha ficou para o próximo quadro
  })

  it('a pilha inteira entra, em quantas fatias forem precisas', () => {
    const r = relogio(0.00005)
    const escritos = []
    const f = criarFatia({
      vertices: 1000,
      agora: r.agora,
      escrever: (ini, n) => { escritos.push([ini, n]); r.escrever(ini, n) },
    })
    let guarda = 0
    while (!f.fim) {
      f.passo(3)
      if (++guarda > 100) throw new Error('a fatia não andou')
    }
    // os vértices entraram todos, uma vez só e na ordem
    const total = escritos.reduce((a, [, n]) => a + n, 0)
    expect(total).toBe(1000)
    let esperado = 0
    for (const [ini, n] of escritos) { expect(ini).toBe(esperado); esperado += n }
    expect(f.escritos).toBe(1000)
    expect(f.pendente).toBe(0)
  })

  it('a fatia nunca para (o quadro sempre avança, mesmo sem orçamento)', () => {
    const r = relogio(0.0001)
    const f = criarFatia({ vertices: 1000, escrever: r.escrever, agora: r.agora })
    const p = f.passo(0)
    expect(p.escritos).toBeGreaterThanOrEqual(1)
    expect(f.escritos).toBeGreaterThan(0)
  })

  it('o tamanho da fatia respeita o orçamento, o teto e o que falta', () => {
    expect(tamanhoDaFatia({ orcamentoMs: 3, restantes: 100000 })).toBeLessThanOrEqual(FATIA_MAXIMA)
    expect(tamanhoDaFatia({ orcamentoMs: 3, restantes: 10 })).toBe(10)
    expect(tamanhoDaFatia({ orcamentoMs: 0, restantes: 10 })).toBe(1)
    expect(tamanhoDaFatia({ orcamentoMs: 3, restantes: 0 })).toBe(0)
    // o custo do vértice encolhe a fatia
    const cara = tamanhoDaFatia({ orcamentoMs: 3, restantes: 100000, custo: CUSTO_VERTICE * 10 })
    const barata = tamanhoDaFatia({ orcamentoMs: 3, restantes: 100000, custo: CUSTO_VERTICE / 10 })
    expect(cara).toBeLessThan(barata)
  })

  it('o custo por vértice medido encolhe a fatia seguinte (um vértice caro encolhe a fatia)', () => {
    const r = relogio(0.001) // 1 ms por vértice: caro
    const f = criarFatia({ vertices: 100000, escrever: r.escrever, agora: r.agora })
    const primeira = f.passo(3)
    // a primeira fatia usa a estimativa do começo; a segunda já sabe o custo do vértice
    const segunda = f.passo(3)
    expect(segunda.escritos).toBeLessThan(primeira.escritos)
    expect(f.custo).toBeCloseTo(0.001, 6)
  })

  it('o escritor avisa quando a pilha entrou toda (a instância do lote só entra aí)', () => {
    let terminou = 0
    const r = relogio(0.00001)
    const f = criarFatia({
      vertices: 10,
      agora: r.agora,
      escrever: r.escrever,
      aoTerminar: () => { terminou++ },
    })
    f.passo(3)
    expect(terminou).toBe(1) // entrou numa fatia só
    expect(f.fim).toBe(true)
    f.passo(3)
    expect(terminou).toBe(1) // e não avisa de novo
  })
})
