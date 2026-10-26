// O preparo da geometria do bloco para o lote (26/10/2026).
//
// A pilha da casa (Fase 1) escreve direto nos seus arrays, mas os arrays nascem com folga
// (crescem dobrando) e o bloco precisa deles no tamanho exato. O corte é uma cópia: feita na
// thread do jogo, ela atrasava o quadro.
//
// Este módulo é puro (sem three, sem DOM): ele corta os arrays no tamanho do bloco e, quando
// a geometria tem índice, desloca os índices para a fatia do lote (o índice do lote conta os
// vértices de todo o lote, não só os do bloco). O mesmo código roda no trabalhador
// (src/mundo/gerador-bloco.worker.js) e no caminho sem trabalhador (o mesmo corte, na thread).
export function prepararGeometria({ vertices, pos, nor, cor, chao, indice = null, base = 0 }) {
  const n = Math.max(0, vertices | 0)
  const p = cortar(pos, n * 3)
  const no = cortar(nor, n * 3)
  const c = cortar(cor, n * 3)
  const ch = cortar(chao, n)
  let idx = null
  if (indice && indice.length) {
    // o índice do lote conta os vértices de todo o lote: com a soma, um índice de 16 bits
    // pode estourar, e aí o índice tem de ser de 32 bits
    const maior = indice[indice.length - 1] + base
    const Tipo = (indice.BYTES_PER_ELEMENT === 2 && maior > 65535) ? Uint32Array : indice.constructor
    idx = new Tipo(indice.length)
    for (let i = 0; i < indice.length; i++) idx[i] = indice[i] + base
  }
  return { vertices: n, pos: p, nor: no, cor: c, chao: ch, indice: idx }
}

// o array no tamanho pedido: o que já está no tamanho vai direto, o que tem folga é cortado
function cortar(array, tamanho) {
  if (!array) return new Float32Array(tamanho)
  if (array.length === tamanho) return array
  if (array.length > tamanho) return array.slice(0, tamanho)
  const novo = new Float32Array(tamanho)
  novo.set(array)
  return novo
}
