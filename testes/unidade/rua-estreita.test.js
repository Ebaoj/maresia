// Regressão: a rua de 1932 sem sulco de roda nem poeira na parede (revisão 2 do orquestrador, 21/10/2026: "lê como
// uma laje lisa de plástico"). A grade de ocupação é de 3 m e a rua comprimida tem uma ou duas células de largura:
// a crista ocupava a rua inteira e posicaoNaRua1932 dava 0 em toda parte (medido em (-207, 249): 0,00 em 6 m). O
// terreno passou a usar posicaoNaRuaSuave (chao1932.js), contínua: 0 no meio da rua, 1 na borda, mesmo com 2 células.
// Corrigido no commit da rua de terra (rodada 2).
import { describe, it, expect } from 'vitest'
import { montarChao1932, posicaoNaRua1932, posicaoNaRuaSuave } from '../../src/mundo/chao1932.js'

const NX = 10
const NZ = 6
const CEL = 3
function ruaDeDuasCelulas() {
  const classe = new Uint8Array(NX * NZ)
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) classe[j * NX + i] = i === 4 || i === 5 ? 1 : 2
  return classe
}

describe('a posição na rua estreita (duas células)', () => {
  it('vai de 0 no meio a perto de 1 na borda, sem patamar', () => {
    montarChao1932(ruaDeDuasCelulas(), NX, NZ, 0, 0, CEL)
    // a rua vai de x = 12 a x = 18 (meio em 15)
    const z = 9
    // a da grade é 0 na rua inteira (o defeito)
    expect(posicaoNaRua1932(13, z)).toBe(0)
    expect(posicaoNaRua1932(17, z)).toBe(0)
    // a contínua: 0 no meio, crescendo até a borda, igual dos dois lados
    expect(posicaoNaRuaSuave(15, z)).toBeCloseTo(0, 2)
    expect(posicaoNaRuaSuave(13.5, z)).toBeCloseTo(0.5, 1)
    expect(posicaoNaRuaSuave(16.5, z)).toBeCloseTo(0.5, 1)
    expect(posicaoNaRuaSuave(12.2, z)).toBeGreaterThan(0.85)
    expect(posicaoNaRuaSuave(9, z)).toBe(-1) // no lote
  })
})
