// A planta do Campo do Urubu (src/mundo/urubu-planta.js, 22/10/2026): o campo cabe na cerca do mapa e tem a
// lotação do relatório médico de 1933 (até 6.000 pessoas em redes nos galpões de zinco).
// Pega: galpão nascendo fora da cerca (os 4 galpões antigos de mapa1932-dados.json ficavam ao norte do
// polígono), galpão em cima de galpão, a cozinha ou o registro em cima de um galpão, e a linha do trem
// dentro do campo (ela isola o campo da cidade: fica por fora).
import { describe, it, expect } from 'vitest'
import { PLANTA, criarPlanta, noNucleo } from '../../src/mundo/urubu-planta.js'
import { dentroDoCampo } from '../../src/mundo/mapa1932.js'

const cantos = (p, c) => {
  const q = PLANTA.quadro
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => q.mundo(c.u + (a * c.l) / 2, c.w + (b * c.p) / 2))
}
const sobrepoe = (a, b) => Math.abs(a.u - b.u) < (a.l + b.l) / 2 && Math.abs(a.w - b.w) < (a.p + b.p) / 2

describe('a planta do Campo do Urubu', () => {
  it('tem galpões para ~6.000 pessoas, todos dentro da cerca e sem um em cima do outro', () => {
    const g = PLANTA.galpoes
    expect(g.length).toBeGreaterThanOrEqual(30)
    // redes: três vãos por galpão, uma a cada redePasso
    const redes = g.length * 3 * Math.floor((PLANTA.opcoes.galpaoComprimento - 1) / PLANTA.opcoes.redePasso)
    expect(redes).toBeGreaterThan(3500)
    expect(redes).toBeLessThan(7000)
    for (const a of g) for (const [x, z] of cantos(PLANTA, a)) expect([a.id, dentroDoCampo(x, z)]).toEqual([a.id, true])
    for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) expect([g[i].id, g[j].id, sobrepoe(g[i], g[j])]).toEqual([g[i].id, g[j].id, false])
    expect(g.filter((x) => x.tipo === 'fechado').map((x) => x.id)).toEqual(['fundos'])
  })

  it('a cozinha, a água, o posto, a capela, a guarita, o registro e as latrinas ficam dentro e livres', () => {
    const pecas = { cozinha: PLANTA.cozinha, posto: PLANTA.posto, capela: PLANTA.capela, guarita: PLANTA.guarita, registro: PLANTA.registro, latrinas: PLANTA.latrinas }
    for (const [nome, c] of Object.entries(pecas)) {
      expect([nome, !!c]).toEqual([nome, true])
      for (const [x, z] of cantos(PLANTA, c)) expect([nome, dentroDoCampo(x, z)]).toEqual([nome, true])
      for (const g of PLANTA.galpoes) expect([nome, g.id, sobrepoe(c, g)]).toEqual([nome, g.id, false])
    }
    for (const p of [PLANTA.agua.pipa, ...PLANTA.cozinha.fila.slice(0, 20), ...PLANTA.agua.fila.slice(0, 20)]) {
      expect(dentroDoCampo(p.x, p.z)).toBe(true)
    }
  })

  it('as latrinas ficam longe dos galpões e da cozinha (discretas, no canto de trás)', () => {
    const l = PLANTA.latrinas
    const perto = Math.min(...PLANTA.galpoes.map((g) => Math.hypot(g.x - l.x, g.z - l.z)))
    expect(perto).toBeGreaterThan(25)
    expect(Math.hypot(PLANTA.cozinha.x - l.x, PLANTA.cozinha.z - l.z)).toBeGreaterThan(120)
  })

  it('o portão fica na cerca e a linha do trem corre por fora, entre o campo e as oficinas', () => {
    const { portao, trilho, quadro } = PLANTA
    expect(dentroDoCampo(...quadro.mundo(0, 3))).toBe(true)
    expect(dentroDoCampo(...quadro.mundo(0, -3))).toBe(false)
    for (const p of [...trilho.principal, ...trilho.desvio, trilho.vagao]) expect(dentroDoCampo(p.x, p.z)).toBe(false)
    expect(portao.largura).toBeGreaterThan(2)
  })

  it('o núcleo construído cobre os galpões e deixa o resto do polígono para as tarefas', () => {
    for (const g of PLANTA.galpoes) expect(noNucleo(PLANTA, g.x, g.z)).toBe(true)
    expect(noNucleo(PLANTA, ...PLANTA.cerca.poligono[0])).toBe(false)
  })

  it('segue o config: menos fileiras, menos galpões', () => {
    const menor = criarPlanta({ fileirasAntes: 2, fileirasDepois: 1 })
    expect(menor.galpoes.length).toBeLessThan(PLANTA.galpoes.length)
  })
})
