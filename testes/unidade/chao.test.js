// Regressão: pé flutuando 5 a 10 cm na beira da praia (corrigido em 523bec7, 16/10/2026).
// A colisão ainda subia o chão até o nível da avenida de antes de 1932, que já não existe no mundo.
// Regra: o chão debaixo do pé é o terreno ou um deck (ponte, píer), e nada mais o levanta.
import { beforeAll, describe, expect, it } from 'vitest'
import { alturaChao } from '../../src/mundo/colisao.js'
import { LIMITES } from '../../src/mundo/mapa.js'
import { alturaTerreno, calcularAlturas } from '../../src/mundo/terreno.js'
import { criarAleatorio } from '../../src/utils.js'

beforeAll(() => calcularAlturas())

describe('altura do chão', () => {
  it('sem decks, é exatamente a altura do terreno em todo o mapa', () => {
    const rnd = criarAleatorio(1932)
    const diferentes = []
    for (let i = 0; i < 20000; i++) {
      const x = rnd.entre(LIMITES.x0, LIMITES.x1)
      const z = rnd.entre(LIMITES.z0, LIMITES.z1)
      const d = alturaChao(x, z) - alturaTerreno(x, z)
      if (Math.abs(d) > 1e-6) diferentes.push({ x: Math.round(x), z: Math.round(z), sobra: +d.toFixed(3) })
    }
    expect(diferentes.slice(0, 5)).toEqual([])
  })
})
