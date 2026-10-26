// O trabalhador que monta o bloco de casas (26/10/2026).
//
// A geometria de um bloco de 96 m levava 20 a 30 ms na thread do jogo (dezenas de casas, cada
// uma com centenas de peças): mesmo fatiada por casa, cada casa levava ~1,3 ms e o quadro
// passava do orçamento de montagem. Aqui o bloco é gerado fora da thread do jogo: a thread
// só espera o resultado e escreve os vértices no lote, em fatias
// (src/mundo/lote-fatia.js).
//
// O trabalhador devolve os arrays de cada pilha (posição, normal, cor e o chão da casa) no
// tamanho exato e transfere a memória: o bloco não é copiado duas vezes.
//
// O trabalhador não tem a colisão da thread do jogo (o deck da calçada é registrado por quem
// monta o bloco, em src/mundo/quarteirao.js).

import { casa, pilhasVazias } from './casa1932.js'
import { prepararGeometria } from './lote-geometria.js'
import { criarAleatorio } from '../utils.js'

self.onmessage = (evento) => {
  const { id, casas } = evento.data
  const pilhas = pilhasVazias()
  for (const c of casas) {
    // o gerador da casa é drenado inteiro: o bloco sai pronto
    for (const _ of casa(c.it, pilhas, criarAleatorio(c.semente), c.simples)) { /* nada */ }
  }
  const saida = {}
  const transferencia = []
  for (const [nome, pilha] of Object.entries(pilhas)) {
    if (!pilha.n) continue
    // o corte no tamanho exato do bloco (e o índice deslocado para a fatia do lote, quando a
    // geometria tem índice): o mesmo código do caminho sem trabalhador
    const dados = prepararGeometria({
      vertices: pilha.n,
      pos: pilha.pPos, nor: pilha.pNor, cor: pilha.pCor, chao: pilha.pChao,
    })
    saida[nome] = dados
    transferencia.push(dados.pos.buffer, dados.nor.buffer, dados.cor.buffer, dados.chao.buffer)
    if (dados.indice) transferencia.push(dados.indice.buffer)
  }
  self.postMessage({ id, pilhas: saida }, transferencia)
}
