// O dimensionamento dos lotes das casas (26/10/2026).
//
// O lote das casas (src/mundo/casas-lote.js) reserva na placa o espaço FINAL de cada material:
// o lote nunca cresce (crescer recria o buffer e a placa sobe tudo de novo: era o pico de 100 ms).
// Esse espaço não pode ser um palpite. A tabela src/mundo/casas-capacidade.json traz a contagem
// real: o script scripts/medir-casas.mjs monta a cidade como o jogo monta (a planta de 1932 lida
// do PNG) e gera a geometria de cada casa com o mesmo gerador e a mesma semente que o jogo.
//
// O que a contagem diz:
//
//   - o mapa inteiro (21.586 casas em 1.280 blocos de 96 m) pede 74.646.324 vértices: 2,99 GB na
//     placa (40 bytes por vértice: posição, normal e cor, 3 floats cada, mais o chão da casa,
//     1 float). Nove vezes o que a placa aguenta com folga;
//   - o lote não precisa de tudo isso: o desenho detalhado só existe no anel de blocos que o
//     gerenciador mantém montado (o jogador e o destino do teleporte, src/mundo/bloco-casas.js).
//     O resto do mapa é desenhado com as caixas de fachada pintada (o LOD de longe), que são
//     outras malhas (instanciadas por bloco) e não entram no lote;
//   - o pior anel do mapa (o pedaço mais denso, 23 blocos) pede 4.863.804 vértices: 194,6 MB.
//
// Então o lote é dimensionado pelo pior anel com 10% de folga: 5.350.185 vértices, 214 MB.
// Sem índice: a geometria da casa é uma sopa de triângulos (cada peça entra com os seus vértices,
// sem os compartilhados), então o lote não tem buffer de índice (cfg.desempenho.casasLoteIndices).
//
// As contas são puras (a tabela entra como argumento) para o teste conferir sem navegador.

import tabelaMedida from './casas-capacidade.json'

// a tabela da medição (o jogo usa esta; o teste passa a sua)
export const TABELA = tabelaMedida

// quanto a placa gasta por vértice do lote: posição, normal e cor (3 floats cada) e o chão da
// casa (1 float). Sem índice (a geometria é uma sopa de triângulos).
export const BYTES_POR_VERTICE = 40
// a folga do dimensionamento (10%)
export const MARGEM = 0.1

// O espaço de cada lote: a fatia do anel que o material pede, com a folga, e nunca menos do que
// o maior bloco do mapa pede (um bloco não se divide: se não couber, o bloco usa o caminho de
// antes, uma malha por pilha).
export function capacidadePorLote(tab, { margem = MARGEM, total = null } = {}) {
  const base = tab.anel?.porMaterial ?? {}
  const nomes = Object.keys(base)
  const somaBase = nomes.reduce((a, n) => a + base[n], 0)
  const orcamento = total ?? Math.ceil(somaBase * (1 + margem))
  const porLote = {}
  for (const nome of nomes) {
    const fatia = somaBase > 0 ? Math.ceil((base[nome] / somaBase) * orcamento) : 0
    const piso = Math.ceil((tab.materiais?.[nome]?.maxBloco ?? 0) * (1 + margem))
    porLote[nome] = Math.max(fatia, piso, 1)
  }
  return { porLote, vertices: orcamento, bytes: orcamento * (tab.bytesPorVertice ?? BYTES_POR_VERTICE) }
}

// quanto o lote ocupa na placa (os vértices e, se houver, o buffer de índice)
export function memoriaLote(vertices, { indices = 0, bytesPorVertice = BYTES_POR_VERTICE } = {}) {
  const bytes = vertices * bytesPorVertice
  // o índice do lote conta os vértices de todo o lote: com mais de 65.535 vértices ele tem de ser
  // de 32 bits (o de 16 estoura)
  const bytesIndice = indices * (vertices > 65535 ? 4 : 2)
  return { vertices, indices, bytes, bytesIndice, bytesTotal: bytes + bytesIndice }
}

// A demanda do mapa inteiro, para o console e o resumo (o lote não guarda tudo isso: o anel é o
// que o jogo desenha por perto).
export function resumoMapa(tab = TABELA) {
  const bytes = tab.total.bytes
  return {
    casas: tab.casas,
    blocos: tab.blocos,
    vertices: tab.total.vertices,
    bytes,
    mb: bytes / 1048576,
    anel: tab.anel.maxVertices,
    anelBlocos: tab.anel.maxBlocos,
  }
}
