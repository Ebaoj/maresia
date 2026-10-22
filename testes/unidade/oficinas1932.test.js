// Os prédios das Oficinas da RVC no Urubu (src/mundo/oficinas1932.js, 22/10/2026; docs/mapa-1932.md, v17).
// Pega: prédio fora do recinto da planta, prédio no leito da linha (o desvio passa junto das cabeceiras), prédio em
// cima de prédio ou do Campo do Urubu, e o recinto fora da zona 1:1 (os prédios sairiam tortos).
import { describe, it, expect } from 'vitest'
import { prediosNoJogo, dentroDasOficinas, RECINTO_OFICINAS } from '../../src/mundo/oficinas1932.js'
import { casaNaFerrovia } from '../../src/mundo/ferrovia1932.js'
import { dentroDoCampo } from '../../src/mundo/mapa1932.js'
import { metrosPorUn, anisotropiaJogo } from '../../src/mundo/escala1932.js'

const P = prediosNoJogo()
const cantos = (p, f = 1) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => {
  const lx = (a * p.comp * f) / 2
  const lz = (b * p.larg * f) / 2
  return [p.x + lx * Math.cos(p.rot) + lz * Math.sin(p.rot), p.z - lx * Math.sin(p.rot) + lz * Math.cos(p.rot)]
})
// separação de eixos: dois retângulos girados se cruzam?
function cruzam(A, B) {
  for (const q of [A, B]) {
    for (let i = 0; i < 4; i++) {
      const e = [q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]]
      const ax = [-e[1], e[0]]
      const pa = A.map((p) => p[0] * ax[0] + p[1] * ax[1])
      const pb = B.map((p) => p[0] * ax[0] + p[1] * ax[1])
      if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false
    }
  }
  return true
}

describe('as Oficinas da RVC', () => {
  it('sete prédios, o meio de cada um no recinto ou junto dele, nenhum no leito da linha nem no campo', () => {
    expect(P.length).toBe(7)
    expect(RECINTO_OFICINAS.length).toBeGreaterThan(3)
    for (const p of P) {
      // F e G ficam na beira sul do recinto (a planta os desenha em cima da linha do muro)
      const dMuro = Math.min(...RECINTO_OFICINAS.map(([x, z]) => Math.hypot(x - p.x, z - p.z)))
      expect([p.nome, dentroDasOficinas(p.x, p.z) || dMuro < 120]).toEqual([p.nome, true])
      expect([p.nome, casaNaFerrovia(p.x, p.z, p.comp, p.larg, p.rot)]).toEqual([p.nome, false])
      for (const [x, z] of cantos(p)) expect([p.nome, dentroDoCampo(x, z)]).toEqual([p.nome, false])
    }
  })
  it('nenhum prédio em cima de outro', () => {
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) expect([P[i].nome, P[j].nome, cruzam(cantos(P[i]), cantos(P[j]))]).toEqual([P[i].nome, P[j].nome, false])
  })
  it('o recinto fica em 1:1 (os prédios têm a medida da planta, sem entortar)', () => {
    for (const p of P) {
      for (const [x, z] of cantos(p)) {
        expect(Math.abs(metrosPorUn(x, z) - 1), p.nome).toBeLessThan(0.02)
        expect(anisotropiaJogo(x, z), p.nome).toBeLessThan(1.02)
      }
    }
  })
})
