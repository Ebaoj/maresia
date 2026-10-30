// O dimensionamento dos lotes das casas (26/10/2026).
//
// O lote das casas (src/mundo/casas-lote.js) reserva na placa o espaço FINAL de cada material: o
// lote nunca cresce (crescer recria o buffer e a placa sobe tudo de novo: era o pico de 100 ms).
// Esse espaço vem da medição real do mapa (src/mundo/casas-capacidade.json, feita por
// scripts/medir-casas.mjs com o mesmo gerador e a mesma semente que o jogo).
//
// O que estes testes pegam:
//  - a tabela deixar de bater com o mapa (o gerador mudou e a tabela ficou velha): a amostra
//    gera a geometria de verdade e confere com a média da tabela;
//  - a fatia de cada material sair errada (o 'pecas' é o maior do mapa: as portas, janelas,
//    cornija e guarda-corpo);
//  - a folga de 10% sumir (o lote tem de caber no anel que o jogo desenha por perto);
//  - o espaço de um lote não caber o maior bloco do mapa (um bloco não se divide: se não couber,
//    o bloco usa o caminho de antes, uma malha por pilha);
//  - o número do painel (cfg.desempenho.casasLoteVertices) deixar de bater com a medição;
//  - o lote pedir um buffer de índice que a geometria não tem (a casa é uma sopa de triângulos).
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { capacidadePorLote, memoriaLote, resumoMapa, TABELA, BYTES_POR_VERTICE, MARGEM } from '../../src/mundo/casas-capacidade.js'
import { capacidadeMedida } from '../../src/mundo/casas-lote.js'
import { PADRAO } from '../../src/config.js'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))

describe('a capacidade dos lotes das casas', () => {
  it('a tabela é a contagem real do mapa (o total é a soma dos materiais)', () => {
    const soma = Object.values(TABELA.materiais).reduce((a, m) => a + m.vertices, 0)
    expect(soma).toBe(TABELA.total.vertices)
    expect(TABELA.total.bytes).toBe(TABELA.total.vertices * TABELA.bytesPorVertice)
    expect(TABELA.bytesPorVertice).toBe(BYTES_POR_VERTICE)
    expect(TABELA.casas).toBeGreaterThan(18000) // a planta de 1932 tem mais de 18 mil casas
    expect(TABELA.blocos).toBeGreaterThan(1000) // e mais de mil blocos de 96 m
  })

  it('a folga é de 10% sobre o anel que o jogo desenha por perto', () => {
    const { vertices } = capacidadePorLote(TABELA)
    expect(vertices).toBe(Math.ceil(TABELA.anel.maxVertices * (1 + MARGEM)))
    expect(vertices).toBeGreaterThan(TABELA.anel.maxVertices)
    // e o mapa inteiro não cabe (é a razão do anel: 2,99 GB é mais do que a placa aguenta)
    expect(TABELA.total.vertices).toBeGreaterThan(TABELA.anel.maxVertices * 10)
  })

  it('a fatia de cada material sai da demanda medida (o pecas é o maior do mapa)', () => {
    const { porLote } = capacidadePorLote(TABELA)
    expect(porLote.pecas).toBeGreaterThan(porLote.reboco)
    expect(porLote.reboco).toBeGreaterThan(porLote.telhas)
    // o reboco da favela (o morro) é o seu próprio lote (o material dele tem mais desgaste)
    expect(porLote.rebocoMorro).toBeGreaterThan(0)
    // e a fatia segue a demanda: o 'pecas' pede 86% do anel
    const anel = TABELA.anel.porMaterial
    const total = Object.values(anel).reduce((a, b) => a + b, 0)
    for (const [nome, v] of Object.entries(anel)) {
      const esperado = Math.ceil((v / total) * Object.values(porLote).reduce((a, b) => a + b, 0))
      expect(porLote[nome]).toBeGreaterThanOrEqual(Math.floor(esperado * 0.99))
    }
  })

  it('nenhum lote fica sem espaço para o maior bloco do mapa', () => {
    const { porLote } = capacidadePorLote(TABELA)
    for (const [nome, m] of Object.entries(TABELA.materiais)) {
      expect(porLote[nome]).toBeGreaterThanOrEqual(Math.ceil(m.maxBloco * (1 + MARGEM)))
    }
  })

  it('o número do painel bate com a medição (a tabela não pode ficar velha sem ninguém ver)', () => {
    const { vertices } = capacidadePorLote(TABELA)
    expect(PADRAO.desempenho.casasLoteVertices).toBe(vertices)
    // e o número do painel é o que a capacidadeMedida usa
    const medida = capacidadeMedida({ total: PADRAO.desempenho.casasLoteVertices })
    expect(medida.vertices).toBe(vertices)
    expect(medida.capacidade.pecas).toBeGreaterThan(medida.capacidade.telhas)
  })

  it('a memória do lote é a conta dos bytes por vértice (sem índice: a casa é uma sopa de triângulos)', () => {
    const { vertices } = capacidadePorLote(TABELA)
    const m = memoriaLote(vertices)
    expect(m.bytes).toBe(vertices * BYTES_POR_VERTICE)
    expect(m.bytesIndice).toBe(0) // sem buffer de índice
    expect(PADRAO.desempenho.casasLoteIndices).toBe(0)
    // e o lote inteiro fica na conta de 300 MB
    expect(m.bytesTotal / 1048576).toBeLessThan(300)
    // o mapa inteiro, esse, não cabe: é a razão do anel
    expect(resumoMapa(TABELA).mb / 1024).toBeGreaterThan(2)
  })

  it('a tabela bate com o mapa de hoje (o gerador mudou, a tabela tem de mudar junto)', async () => {
    const amostra = await amostraDeCasas(40)
    expect(amostra.casas).toBe(40)
    // a média por casa de cada lote bate com a da tabela (a casa varia de tamanho: aTolerance
    // cobre a variação da fachada, dos vãos e do telhado)
    for (const [tipo, dados] of Object.entries(amostra.porTipo)) {
      const tabela = TABELA.porTipo[tipo]
      expect(tabela).toBeTruthy()
      for (const [lote, media] of Object.entries(dados)) {
        const medida = tabela.mediaPorLote[lote]
        expect(medida, `a tabela não tem o lote ${lote}`).toBeGreaterThan(0)
        // a casa da amostra é a mesma casa do mapa: a média tem de ser a mesma ordem
        expect(media).toBeGreaterThan(medida * 0.6)
        expect(media).toBeLessThan(medida * 1.6)
      }
    }
  }, 300000)
})

// A amostra: monta a cidade como o jogo monta (a planta de 1932 lida do PNG) e gera a geometria
// de algumas casas com o mesmo gerador e a mesma semente do jogo.
async function amostraDeCasas(n) {
  const { lerPng } = await import('./apoio/png.js')
  if (!globalThis.document) globalThis.document = {}
  if (!globalThis.document.createElement) {
    const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true })
    globalThis.document.createElement = () => ({ getContext: () => ctx, width: 0, height: 0, style: {}, addEventListener() {} })
  }
  if (!globalThis.document.createElementNS) globalThis.document.createElementNS = (_, n) => globalThis.document.createElement(n)
  const ocup = await import('../../src/mundo/ocupacao1932.js')
  const png = lerPng(`${RAIZ}src/mundo/mapa1932-malha.png`)
  ocup.montarOcupacao1932(png.dados, png.w, png.h)
  const { calcularAlturas } = await import('../../src/mundo/terreno.js')
  calcularAlturas()
  const { criarCidade } = await import('../../src/mundo/cidade.js')
  const THREE = await import('three')
  const { casa, pilhasVazias, planejar } = await import('../../src/mundo/casa1932.js')
  const { criarAleatorio } = await import('../../src/utils.js')
  const cena = new THREE.Scene()
  const cfg = JSON.parse(JSON.stringify(PADRAO))
  const { predios } = criarCidade(cena, cfg)
  const sementeDe = (i) => 1932 + i * 7919
  // o planejamento (o jogo faz o mesmo ao abrir)
  planejar(true)
  for (const [i, it] of predios.entries()) {
    for (const _ of casa(it, pilhasVazias(), criarAleatorio(sementeDe(i)), it.tipo === 'favela')) { /* nada */ }
  }
  planejar(false)
  // a geometria de verdade de um pedaço do mapa (as casas do começo: as do casario)
  const porTipo = {}
  let casas = 0
  for (const [i, it] of predios.entries()) {
    if (casas >= n) break
    const simples = it.tipo === 'favela'
    const pilhas = pilhasVazias()
    for (const _ of casa(it, pilhas, criarAleatorio(sementeDe(i)), simples)) { /* nada */ }
    const tipo = simples ? 'favela' : 'casario'
    porTipo[tipo] = porTipo[tipo] ?? {}
    for (const p of Object.keys(pilhas)) {
      const lote = p === 'reboco' && simples ? 'rebocoMorro' : p
      porTipo[tipo][lote] = (porTipo[tipo][lote] ?? 0) + pilhas[p].n
    }
    casas++
  }
  // a média por casa de cada lote
  const medias = {}
  for (const [tipo, lotes] of Object.entries(porTipo)) {
    const quantas = predios.slice(0, casas).filter((it) => (it.tipo === 'favela' ? 'favela' : 'casario') === tipo).length
    medias[tipo] = {}
    for (const [lote, v] of Object.entries(lotes)) medias[tipo][lote] = Math.round(v / Math.max(1, quantas))
  }
  return { casas, porTipo: medias }
}
