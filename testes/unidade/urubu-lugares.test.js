// Os lugares do Campo do Urubu que a história usa (src/mundo/urubu-lugares.js, 22/10/2026). Pega: lugar que cai
// fora do campo (ou dentro de um galpão), a cerca do Zé com os lados trocados, a rede da família fora de um
// galpão de redes, o desvio do lado de dentro da cerca.
import { describe, it, expect } from 'vitest'
import { LUGARES_URUBU, lugaresDoCampo } from '../../src/mundo/urubu-lugares.js'
import { PLANTA, criarPlanta } from '../../src/mundo/urubu-planta.js'
import { dentroDoCampo } from '../../src/mundo/mapa1932.js'

const L = LUGARES_URUBU
const emGalpao = (p, folga = 0) => PLANTA.galpoes.find((g) => Math.abs(p.u - g.u) < g.l / 2 + folga && Math.abs(p.w - g.w) < g.p / 2 + folga)

describe('os lugares do Campo do Urubu', () => {
  it('tem os lugares do roteiro', () => {
    for (const k of ['registro', 'redeDaFamilia', 'filaDaCozinha', 'portao', 'cercaDoZe', 'galpaoDosFundos', 'desvio']) {
      expect([k, Number.isFinite(L[k]?.x) && Number.isFinite(L[k]?.z)]).toEqual([k, true])
    }
  })
  it('o registro, a fila e o lado de dentro do portão ficam dentro da cerca e fora dos galpões', () => {
    for (const [k, p] of Object.entries({ registro: L.registro, chegada: L.registro.chegada, fila: L.filaDaCozinha, filaFim: L.filaDaCozinha.fim, portaoDentro: L.portao.dentro, guarda: L.portao.guarda })) {
      expect([k, dentroDoCampo(p.x, p.z), !!emGalpao(p)]).toEqual([k, true, false])
    }
    expect(dentroDoCampo(L.portao.fora.x, L.portao.fora.z)).toBe(false)
  })
  it('a rede da família fica num galpão de redes (não o dos fundos), num vão entre as linhas de esteios', () => {
    const g = emGalpao(L.redeDaFamilia)
    expect(g?.id).toBe(L.redeDaFamilia.galpao)
    expect(g.tipo).not.toBe('fechado')
    for (const r of L.redeDaFamilia.redes) expect(emGalpao(r)?.id).toBe(g.id)
  })
  it('na cerca do Zé, o menino fica do lado de dentro e o Zé do lado de fora, longe do soldado do portão', () => {
    const c = L.cercaDoZe
    expect(dentroDoCampo(c.dentro.x, c.dentro.z)).toBe(true)
    expect(dentroDoCampo(c.fora.x, c.fora.z)).toBe(false)
    expect(Math.hypot(c.x - L.portao.guarda.x, c.z - L.portao.guarda.z)).toBeGreaterThan(150)
  })
  it('o galpão dos fundos é o fechado, longe da avenida por onde passa a visita', () => {
    const g = emGalpao(L.galpaoDosFundos)
    expect(g?.tipo).toBe('fechado')
    expect(Math.abs(L.galpaoDosFundos.u)).toBeGreaterThan(60)
    expect(dentroDoCampo(L.galpaoDosFundos.porta.x, L.galpaoDosFundos.porta.z)).toBe(true)
  })
  it('o desvio e o vagão ficam do lado de fora da cerca', () => {
    for (const p of [L.desvio, L.desvio.paraChoque, L.desvio.vagao]) expect(dentroDoCampo(p.x, p.z)).toBe(false)
  })
  it('os lugares seguem a planta do painel', () => {
    const outra = lugaresDoCampo(criarPlanta({ recuoPortao: 40 }))
    expect(outra.redeDaFamilia.w).toBeGreaterThan(L.redeDaFamilia.w)
  })
})
