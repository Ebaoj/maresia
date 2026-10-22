// Bug: a fatia vertical da Praia do Peixe era um x fixo do jogo (CX = 340). Quando a escala da Praça do
// Ferreira virou 1:1 (71b96cb), tudo a leste da praça andou ~350 un para leste e a fatia ficou para trás,
// num trecho de praia sem os bancos: o jogador preso nela não alcançava banco nenhum (o cenário
// sentarLevantar passou a reprovar com "não chegou a sentar"). Correção: a fatia é presa a lon/lat.
import { describe, it, expect } from 'vitest'
import { FATIA, FATIA_LON, FATIA_LAT } from '../../src/mundo/fatia.js'
import { ll, llInverso } from '../../src/mundo/fortaleza1932.js'
import { linhaCosta, larguraPraia } from '../../src/mundo/mapa.js'

describe('fatia vertical da Praia do Peixe', () => {
  it('fica no mesmo lugar real, qualquer que seja a escala do mapa', () => {
    // o ponto de 1932 que a fatia sempre mostrou (medido no 6b0e58b: x = 340 na costa)
    expect(FATIA_LON).toBeCloseTo(-38.5194, 3)
    expect(FATIA_LAT).toBeCloseTo(-3.7177, 3)
    // a ancora da fatia e um ponto de lon/lat: a volta da transformada tem de
    // devolver o mesmo lugar (a transformada e uma volta exata)
    const [voltaLon, voltaLat] = llInverso(...ll(FATIA_LON, FATIA_LAT))
    expect(voltaLon).toBeCloseTo(FATIA_LON, 6)
    expect(voltaLat).toBeCloseTo(FATIA_LAT, 6)
    // e o ponto da costa que a fatia mostra: o jogo desenha a costa da planta
    // interpolada, e a curva passa a 3,5 m da ancora (a precisao do dado)
    const [lon, lat] = llInverso(FATIA.centro[0], linhaCosta(FATIA.centro[0]))
    expect(lon).toBeCloseTo(FATIA_LON, 4)
    expect(lat).toBeCloseTo(FATIA_LAT, 4)
  })
  it('contém a costa do seu centro (água e areia dos dois lados)', () => {
    // o começo da fatia é mar, o fim é a rua da praia: a costa do jogo é quem
    // manda nas bordas (a praia é uma faixa em cima da linha da costa)
    const cx = FATIA.centro[0]
    expect(FATIA.z0).toBeLessThan(linhaCosta(cx))
    expect(FATIA.z1).toBeGreaterThan(linhaCosta(cx) + larguraPraia(cx))
    expect(FATIA.x1 - FATIA.x0).toBeCloseTo(100, 6)
  })
})
