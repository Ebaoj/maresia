// Os círculos de LUGARES_RESERVADOS (fortaleza1932.js) que viraram só chão não tiram mais casa.
// Pega: o círculo da Praça do Ferreira (26 un no mundo comprimido, 71 un com a praça em 1:1) apagava
// 13 fachadas da planta de 1932 em volta da praça, fora do contorno dela e fora dos marcos: a praça
// ficava sem as fachadas que a fecham nas fotos de 1925 a 1936. Correção: RESERVA_SO_CHAO, e a praça
// passa a recusar casa pelo contorno de verdade (cidade.js, cantoNaPraca).
import { describe, it, expect } from 'vitest'
import { FACHADAS } from '../../src/mundo/casario1932.js'
import { lugarRecusado } from '../../src/mundo/cidade.js'
import { lugaresJogo, LUGARES_RESERVADOS, RESERVA_SO_CHAO } from '../../src/mundo/fortaleza1932.js'
import { dentroDaPraca } from '../../src/mundo/praca1932.js'

const cantos = (f) => [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => {
  const c = Math.cos(f.rot)
  const s = Math.sin(f.rot)
  return [f.x + (a * f.w) / 2 * c + (b * f.d) / 2 * s, f.z - (a * f.w) / 2 * s + (b * f.d) / 2 * c]
})

describe('reservas que viraram só chão', () => {
  it('nenhuma fachada em volta da Praça do Ferreira é apagada pelo círculo', () => {
    const [cx, cz] = lugaresJogo.pracaFerreira
    const raio = LUGARES_RESERVADOS.find(([k]) => k === 'pracaFerreira')[1]
    let perto = 0
    for (const f of FACHADAS) {
      if (Math.hypot(f.x - cx, f.z - cz) > raio) continue
      if (cantos(f).some((p) => dentroDaPraca(...p))) continue
      perto++
      expect(lugarRecusado(f)).not.toBe('reservada')
    }
    expect(perto).toBeGreaterThan(5)
  })
  it('e nenhuma casa mantida tem canto dentro da praça', () => {
    for (const f of FACHADAS) {
      if (lugarRecusado(f)) continue
      for (const p of cantos(f)) expect(dentroDaPraca(...p)).toBe(false)
    }
  })
  it('os lugares sem obra continuam reservados (o Theatro, o Seminário, o campo do Otávio Bonfim)', () => {
    for (const k of ['theatro', 'seminario', 'campoOtavioBonfim']) expect(RESERVA_SO_CHAO.has(k)).toBe(false)
  })
})
