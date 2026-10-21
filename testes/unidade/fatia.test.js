// Bug: a fatia vertical da Praia do Peixe era um x fixo do jogo (CX = 340). Quando a escala da Praça do
// Ferreira virou 1:1 (71b96cb), tudo a leste da praça andou ~350 un para leste e a fatia ficou para trás,
// num trecho de praia sem os bancos: o jogador preso nela não alcançava banco nenhum (o cenário
// sentarLevantar passou a reprovar com "não chegou a sentar"). Correção: a fatia é presa a lon/lat.
import { describe, it, expect } from 'vitest'
import { FATIA, FATIA_LON, FATIA_LAT } from '../../src/mundo/fatia.js'
import { LON_POR_X, LAT_POR_Z } from '../../src/mundo/fortaleza1932.js'

describe('fatia vertical da Praia do Peixe', () => {
  it('fica no mesmo lugar real, qualquer que seja a escala do mapa', () => {
    // o ponto de 1932 que a fatia sempre mostrou (medido no 6b0e58b: x = 340 na costa)
    expect(FATIA_LON).toBeCloseTo(-38.5194, 3)
    expect(FATIA_LAT).toBeCloseTo(-3.7177, 3)
    expect(LON_POR_X(FATIA.centro[0])).toBeCloseTo(FATIA_LON, 4)
  })
  it('contém a costa do seu centro (água e areia dos dois lados)', () => {
    const zCosta = FATIA.z0 + 22
    expect(LAT_POR_Z(zCosta)).toBeCloseTo(FATIA_LAT, 3)
    expect(FATIA.x1 - FATIA.x0).toBe(100)
  })
})
