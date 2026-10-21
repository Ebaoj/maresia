// Regressão: o chão da cidade de 1932 (item 1 do bloco: a cidade não pode
// parecer um deserto de areia).
//
// O chão de 1932 é: rua de terra batida (com o rodeiro da carroça no meio),
// calçamento de paralelepípedo no Centro, quintal de terra com mato ralo
// atrás das casas, e areia só na praia e nas dunas.
//
// O que estes testes prendem:
//   1. a planta de 1932 decide o chão: rua, quintal ou mato;
//   2. a posição na rua (que dá o rodeiro) sai certa: 0 no meio da rua,
//      perto de 1 na borda, e nada fora da rua. Antes a transformada de
//      distância media a distância até a rua mais próxima em vez da borda,
//      e o campo saía só com 0 ou 1: o rodeiro nunca aparecia;
//   3. o Centro calçado é medido em metros de verdade (a escala do mapa
//      muda: a Praça do Ferreira está em 1:1 e o resto é comprimido).
import { describe, it, expect, beforeAll } from 'vitest'
import {
  montarChao1932, tipoChao1932, posicaoNaRua1932,
  distRealDaPraca, maskCentro1932,
  CHAO_RUA, CHAO_QUINTAL, CHAO_MATO,
} from '../../src/mundo/chao1932.js'
import { ll } from '../../src/mundo/fortaleza1932.js'

// uma grade de mentira: uma rua de 3 células (9 m) no meio, lotes dos dois
// lados, e um pedaço vazio no fim
const NX = 9
const NZ = 9
const CEL = 3
const RUA_A = 3
const RUA_B = 5

function gradeDeTeste() {
  const classe = new Uint8Array(NX * NZ)
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i
      if (i >= RUA_A && i <= RUA_B) classe[k] = 1 // rua
      else if (j < NZ - 2) classe[k] = 2 // lote
      else classe[k] = 0 // mato
    }
  }
  return classe
}

const xDe = (i) => i * CEL + CEL / 2
const zDe = (j) => j * CEL + CEL / 2

beforeAll(() => {
  montarChao1932(gradeDeTeste(), NX, NZ, 0, 0, CEL)
})

describe('chão de 1932: a planta decide o chão', () => {
  it('a rua é rua, o lote é quintal e o vazio é mato', () => {
    expect(tipoChao1932(xDe(4), zDe(4))).toBe(CHAO_RUA)
    expect(tipoChao1932(xDe(1), zDe(4))).toBe(CHAO_QUINTAL)
    expect(tipoChao1932(xDe(1), zDe(NZ - 1))).toBe(CHAO_MATO)
  })
})

describe('chão de 1932: a posição na rua (o rodeiro da carroça)', () => {
  it('o meio da rua é 0 e a borda é perto de 1', () => {
    expect(posicaoNaRua1932(xDe(4), zDe(4))).toBeCloseTo(0, 2)
    expect(posicaoNaRua1932(xDe(3), zDe(4))).toBeCloseTo(0.67, 1)
    expect(posicaoNaRua1932(xDe(5), zDe(4))).toBeCloseTo(0.67, 1)
  })

  it('fora da rua não há posição (e o valor nunca passa de 1)', () => {
    expect(posicaoNaRua1932(xDe(1), zDe(4))).toBe(-1)
    for (let j = 0; j < NZ; j++) {
      for (let i = 0; i < NX; i++) {
        const u = posicaoNaRua1932(xDe(i), zDe(j))
        expect(u).toBeGreaterThanOrEqual(-1)
        expect(u).toBeLessThanOrEqual(1)
      }
    }
  })

  it('o campo tem valores no meio do caminho (o rodeiro pode aparecer)', () => {
    // se o campo só tivesse 0 e 1, o sulco da carroça nunca sairia
    const valores = new Set()
    for (let j = 0; j < NZ; j++) {
      for (let i = RUA_A; i <= RUA_B; i++) {
        const u = posicaoNaRua1932(xDe(i), zDe(j))
        if (u > 0.05 && u < 0.95) valores.add(Math.round(u * 100) / 100)
      }
    }
    expect(valores.size).toBeGreaterThan(0)
  })
})

describe('chão de 1932: o Centro calçado é medido em metros de verdade', () => {
  it('a Praça do Ferreira está no centro do calçamento', () => {
    const [px, pz] = ll(-38.5276, -3.7275)
    expect(distRealDaPraca(px, pz)).toBeLessThan(5)
    expect(maskCentro1932(px, pz, 650, 180)).toBeCloseTo(1, 3)
  })

  it('longe da praça não há calçamento', () => {
    const [px, pz] = ll(-38.5276, -3.7275)
    // um ponto a 1 km de verdade da praça
    const [lx, lz] = ll(-38.5276, -3.7185)
    const d = distRealDaPraca(lx, lz)
    expect(d).toBeGreaterThan(800)
    expect(maskCentro1932(lx, lz, 650, 180)).toBe(0)
  })
})
