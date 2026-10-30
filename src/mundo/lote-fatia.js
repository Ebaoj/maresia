// A escrita no lote das casas é fatiada (26/10/2026, src/mundo/lote-fatia.js).
//
// A geometria do bloco entrava no BatchedMesh de uma vez (o addGeometry do three copia a
// pilha inteira) e o lote crescia no meio da partida (o setGeometrySize recria o buffer e a
// placa sobe tudo de novo). Medido na T4, uma unidade de montagem levava 70 a 100 ms e o
// quadro passava de 100 ms.
//
// A correção: o lote nasce com o espaço final (nunca cresce) e a geometria entra em fatias.
// Cada quadro escreve um trecho dos vértices na faixa reservada, e o trecho cabe no
// orçamento de tempo do quadro (cfg.desempenho.orcamentoMontagemMs).
//
// A lógica é pura (sem three, sem DOM): os testes chamam direto, com um relógio falso.

export const FATOR_ORCAMENTO = 0.8 // a fatia usa só esta parte do orçamento do quadro
export const CUSTO_VERTICE = 0.0002 // a estimativa do começo do custo de um vértice (ms)
export const FATIA_MAXIMA = 65536 // o teto de vértices por fatia

// Quantos vértices cabem na fatia: o que cabe no orçamento (pelo custo do vértice), o que
// ainda falta e o teto da fatia. Nunca zero enquanto houver vértice (a escrita anda).
export function tamanhoDaFatia({ orcamentoMs = 0, restantes = 0, maximo = FATIA_MAXIMA, custo = CUSTO_VERTICE }) {
  if (restantes <= 0) return 0
  if (orcamentoMs <= 0) return 1
  const cabem = Math.floor((orcamentoMs * FATOR_ORCAMENTO) / Math.max(custo, 1e-9))
  return Math.max(1, Math.min(cabem, maximo, restantes))
}

// A fatia de uma escrita: ela sabe o que ainda falta e escreve o pedaço que cabe no
// orçamento do quadro.
//   escrever(inicio, quantidade): copia os vértices [inicio, inicio + quantidade) da pilha
//   vertices: quantos vértices a pilha tem
//   agora: o relógio (o teste passa um relógio falso)
//   maximo: o teto de vértices por fatia
//   custo: a estimativa do começo do custo de um vértice (depois, a medida do pedaço)
//   aoTerminar: chamado uma vez, quando a pilha entra inteira
export function criarFatia({ escrever, vertices, agora = () => performance.now(), maximo = FATIA_MAXIMA, custo = CUSTO_VERTICE, aoTerminar = null }) {
  const total = Math.max(0, vertices | 0)
  let escritos = 0
  let msPorVertice = custo
  let terminou = false
  return {
    get vertices() { return total },
    get escritos() { return escritos },
    get pendente() { return total - escritos },
    get custo() { return msPorVertice },
    get fim() { return terminou },
    // Escreve um pedaço da fatia. Devolve { ms, escritos, fim }.
    passo(orcamentoMs = 0) {
      if (terminou) return { ms: 0, escritos: 0, fim: true }
      const restantes = total - escritos
      if (restantes <= 0) { terminou = true; return { ms: 0, escritos: 0, fim: true } }
      const n = tamanhoDaFatia({ orcamentoMs, restantes, maximo, custo: msPorVertice })
      const a = agora()
      escrever(escritos, n)
      const ms = agora() - a
      escritos += n
      // o custo do vértice medido: a fatia seguinte se ajusta ao que a máquina levou
      if (n > 0 && ms > 0) msPorVertice = ms / n
      if (escritos >= total) {
        terminou = true
        aoTerminar?.()
      }
      return { ms, escritos: n, fim: terminou }
    },
  }
}

// O escritor de uma pilha no lote: a mesma fatia, com o aviso de quando a pilha entrou toda
// (a instância do lote só entra aí).
export class Escritor {
  constructor({ escrever, vertices, agora = () => performance.now(), maximo = FATIA_MAXIMA, custo = CUSTO_VERTICE, aoTerminar = null }) {
    this.fatia = criarFatia({ escrever, vertices, agora, maximo, custo, aoTerminar })
  }
  get vertices() { return this.fatia.vertices }
  get escritos() { return this.fatia.escritos }
  get pendente() { return this.fatia.pendente }
  get custo() { return this.fatia.custo }
  get fim() { return this.fatia.fim }
  // Escreve um pedaço. Devolve { ms, escritos, fim }.
  passo(orcamentoMs = 0) { return this.fatia.passo(orcamentoMs) }
}
