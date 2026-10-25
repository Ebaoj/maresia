// Fila de montagem com orçamento de tempo (Fase 1 do plano de performance, docs/PLANO-PERFORMANCE.md).
//
// O problema: montar um bloco de casas de 1932 levava 150 a 300 ms na T4, e o jogo
// montava um bloco inteiro dentro de um quadro. Depois de um teleporte, vários blocos
// entravam de uma vez e o quadro travava por centenas de milissegundos.
//
// A solução: a montagem vira uma fila de unidades de trabalho, e cada quadro gasta
// só um orçamento de tempo (cfg.desempenho.orcamentoMontagemMs, 4 ms por padrão).
// A unidade pode ser pequena (uma casa, uma etapa de casa, a junção de uma pilha),
// e a fila aprende o custo de cada tipo de unidade para não começar uma unidade que
// claramente não cabe no orçamento que sobrou.
//
// A unidade é uma tarefa que se repete: enquanto ela estiver na fila, cada quadro
// ela avança um passo (é assim que o bloco de casas é montado em etapas). A unidade
// sai da fila quando o trabalho acaba (a tarefa avisa: remover(chave)).
//
// A lógica é pura (sem three, sem DOM): os testes chamam direto.

const ORCAMENTO_PADRAO = 4

// Uma unidade de trabalho pendente
// chave: identificador único (o bloco, por exemplo)
// fazer: função que avança o trabalho um passo
// prioridade: menor = antes (a distância até a câmera, por exemplo)
// custo: estimativa em ms, quando se sabe de antemão
// tipo: rótulo do trabalho (serve para aprender o custo médio)
function criarItem(chave, fazer, { prioridade = 0, custo = 0, tipo = '' } = {}) {
  return { chave, fazer, prioridade, custo, tipo }
}

export function criarFilaMontagem({ orcamentoMs = ORCAMENTO_PADRAO, agora = () => performance.now() } = {}) {
  const itens = new Map() // chave -> item
  const custoPorTipo = new Map() // tipo -> média do custo medido (ms)

  // A fila é sempre percorrida na ordem da prioridade (menor primeiro). O item entra
  // na fila uma vez só: reenfileirar a mesma chave atualiza a prioridade em vez de
  // duplicar o trabalho.
  function ordenar() {
    return [...itens.values()].sort((a, b) => a.prioridade - b.prioridade)
  }

  // O que a fila aprendeu sobre um tipo de trabalho (ms). Serve para não começar uma
  // unidade que não cabe no orçamento que sobrou.
  function custoConhecido(tipo) {
    return custoPorTipo.get(tipo) ?? 0
  }

  return {
    // orçamento padrão da fila (ms por quadro)
    orcamentoMs,

    enfileirar(chave, fazer, opcoes = {}) {
      const existe = itens.get(chave)
      if (existe) {
        existe.fazer = fazer
        existe.prioridade = opcoes.prioridade ?? existe.prioridade
        existe.custo = opcoes.custo ?? existe.custo
        existe.tipo = opcoes.tipo ?? existe.tipo
        return existe
      }
      const item = criarItem(chave, fazer, opcoes)
      itens.set(chave, item)
      return item
    },

    remover(chave) { return itens.delete(chave) },
    tem(chave) { return itens.has(chave) },
    get pendentes() { return itens.size },
    mudarPrioridade(chave, prioridade) {
      const item = itens.get(chave)
      if (item) item.prioridade = prioridade
      return item
    },
    prioridade(chave) { return itens.get(chave)?.prioridade },
    custoConhecido,
    limpar() { itens.clear(); custoPorTipo.clear() },

    // Trabalha até o orçamento acabar. Cada unidade avança um passo.
    // Devolve o que fez.
    //   feitos: quantas unidades foram feitas
    //   ms: quanto tempo o quadro gastou
    //   resto: quantas unidades ficaram na fila
    //   ultimo: a chave da última unidade feita (para a instrumentação)
    processar(opcoes = {}) {
      const teto = opcoes.orcamentoMs ?? this.orcamentoMs
      const relogio = opcoes.agora ?? agora
      const t0 = relogio()
      let feitos = 0
      let ultimo = null
      for (const item of ordenar()) {
        const gasto = relogio() - t0
        const estimado = item.custo || custoConhecido(item.tipo)
        // Não cabe no que sobrou: espera o próximo quadro. A primeira unidade sempre
        // roda (senão um trabalho estimado como caro nunca sairia).
        if (feitos > 0 && gasto + estimado > teto) break
        const a = relogio()
        item.fazer()
        const durou = relogio() - a
        // média do tipo: o próximo orçamento sabe quanto custa, sem chutar
        const anterior = custoPorTipo.get(item.tipo)
        custoPorTipo.set(item.tipo, anterior === undefined ? durou : anterior * 0.7 + durou * 0.3)
        feitos++
        ultimo = item.chave
        if (relogio() - t0 >= teto) break
      }
      return { feitos, ms: relogio() - t0, resto: itens.size, ultimo }
    },
  }
}
