// A cidade inteira conferida contra a planta de 1932 (docs/mapa-1932.md, v16): o casario montado como o jogo
// monta (criarCidade, com o raster da planta lido do PNG), procurando no mapa todo casa sobre casa, casa na
// praça ou num marco, casa em cima do trilho, casa fora de todo lote construído e casa no meio da rua.
//
// Pega o que o Joabe viu em a764f60: "quarteirões sobrepostos e onde não deveria haver quarteirão". Com as
// faixas da escala, a casa da planta caía torta fora do lote dela: 145 casas com menos de 15% do chão em lote
// (a764f60) e 261 com mais da metade na rua; agora 45 e 242 (commit "Escala: o centro histórico e o Campo do
// Urubu em 1:1, sem faixas"). O resto das casas "na rua" é a planta: lotes mais estreitos que o pixel de 3 m do
// raster, que o raster lê como rua (86% delas são casas da própria planta). Casa sobre casa, na praça e no
// marco já eram zero e continuam; casa no trilho é zero desde a via férrea de 1932 (ferrovia1932.js).
import { describe, it, expect, beforeAll } from 'vitest'
import { conferirCidade } from './apoio/conferir-cidade.js'

let r
beforeAll(async () => { r = await conferirCidade() }, 300000)

describe('a cidade conferida contra a planta de 1932', () => {
  it('nenhuma casa em cima de outra (mais de 1 m² de verdade de interseção)', () => {
    expect(r.casas).toBeGreaterThan(18000)
    expect(r.sobrepostas, JSON.stringify(r.sobrepostas.slice(0, 5))).toEqual([])
  })
  it('nenhuma casa na Praça do Ferreira, num marco ou no leito da via férrea', () => {
    expect(r.naPraca.length).toBe(0)
    expect(r.noMarco.length).toBe(0)
    expect(r.temFerrovia).toBe(true)
    expect(r.noTrilho.length).toBe(0)
  })
  it('a casa fica no lote da planta: no máximo 0,3% fora de todo lote e 1,2% com mais da metade na rua', () => {
    expect(r.foraDeLote.length / r.casas, `fora de lote: ${r.foraDeLote.length}`).toBeLessThan(0.003)
    expect(r.naRua.length / r.casas, `na rua: ${r.naRua.length}`).toBeLessThan(0.012)
  })
})
