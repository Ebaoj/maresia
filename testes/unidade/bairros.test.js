// Bug: a legenda do bairro mostrava "Poço da Draga" no Passeio Público e na Estação. O centro do bairro
// Poço da Draga na lista BAIRROS ficou na coordenada antiga (-38.5275), ~700 m a oeste do lugar revisado
// (LUGARES.pocoDraga, junto da Ponte Velha), e o "mais perto vence" dava a ele o miolo do Centro. Depois
// da Praça do Ferreira em 1:1 (71b96cb), comparar em unidades do jogo também tirava do Centro a Sé, o
// Forte e o Mercado: a comparação passou a ser em metros reais.
import { describe, it, expect } from 'vitest'
import { nomeBairro, lugaresJogo } from '../../src/mundo/fortaleza1932.js'

const em = (k) => nomeBairro(...lugaresJogo[k])

describe('legenda do bairro nos marcos de 1932', () => {
  it('o miolo do Centro é Centro', () => {
    for (const k of ['pracaFerreira', 'passeioPublico', 'estacao', 'pracaEstacao', 'se', 'santaCasa', 'pracaLeoes', 'forte', 'mercado', 'theatro'])
      expect([k, em(k)]).toEqual([k, 'Centro'])
  })
  it('os lugares pequenos ficam com o seu nome', () => {
    expect(em('pocoDraga')).toBe('Poço da Draga')
    expect(em('seminario')).toBe('Prainha')
  })
})
