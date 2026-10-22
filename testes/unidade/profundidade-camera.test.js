// Profundidade de campo e a câmera (bug do Joabe, 22/10/2026, integracao f6bf9e6: "com a câmera longe, umas coisas
// ficam borradas"; "não respeita a câmera"). Causas, medidas em docs/capturas/profundidade-camera/:
// 1. a faixa da frente era proporcional à distância do foco (começava em foco - 1,5 m e enchia na metade disso): com
//    a câmera a 45 m, tudo entre 22 e 43 m da câmera (a rua em volta do jogador) saía borrado;
// 2. o fundo começava 8 m fixos depois do jogador: longe, a 2x a distância dele já amolecia;
// 3. o foco suavizado (0,35 s) ficava para trás no zoom de aproximar (a câmera chega na hora) e a rua perto do
//    jogador entrava na faixa da frente;
// 4. o raio não acompanhava a abertura da lente (fov), que a corrida muda.
// Correção no commit que acompanha este teste (branch profundidade-camera).

import { describe, it, expect } from 'vitest'
import { PADRAO } from '../../src/config.js'
import { cocLonge, cocPerto, parametrosProfundidade, focoAcompanha } from '../../src/pos/profundidade.js'

const e = PADRAO.estilo
const raioPx = (c, p) => c * p.raioCheio

describe('profundidade e zoom: a faixa nítida cresce com a distância do foco', () => {
  it('o jogador inteiro (da cabeça aos pés) fica nítido em qualquer zoom, do mais perto ao mais longe', () => {
    for (const f of [1.2, 1.6, 2.5, 3.5, 5, 8, 12, 20, 30, 45]) {
      const p = parametrosProfundidade(e, f, 720)
      // cabeça mais perto da câmera e pés mais longe com a câmera alta (até ~0,7 m e ~1 m do alvo)
      for (const d of [f - Math.min(0.7, f * 0.45), f, f + 1]) {
        expect(raioPx(cocPerto(d, p), p), `foco ${f}, d ${d}`).toBeLessThan(0.5)
        expect(raioPx(cocLonge(d, p), p), `foco ${f}, d ${d}`).toBeLessThan(0.5)
      }
    }
  })

  it('com a câmera longe, o que está a meio caminho e a 2x a distância do jogador fica nítido', () => {
    for (const f of [20, 30, 45]) {
      const p = parametrosProfundidade(e, f, 720)
      expect(raioPx(cocPerto(f * 0.5, p), p), `meio, foco ${f}`).toBeLessThan(1)
      expect(raioPx(cocLonge(f * 2, p), p), `dobro, foco ${f}`).toBeLessThan(0.5)
    }
  })

  it('plano aberto: com a câmera longe, o que está logo abaixo dela (o telhado) também fica nítido', () => {
    // zoom na praça (22/10): a câmera a 45 m passa por cima de um telhado a ~10 m dela
    const p = parametrosProfundidade(e, 45, 720)
    expect(raioPx(cocPerto(10, p), p)).toBeLessThan(0.5)
    expect(raioPx(cocPerto(5, p), p)).toBeLessThan(0.5)
  })

  it('o fundo de verdade ainda amolece com a câmera longe', () => {
    const p = parametrosProfundidade(e, 45, 720)
    expect(raioPx(cocLonge(400, p), p)).toBeGreaterThan(1)
    expect(raioPx(cocLonge(5000, p), p)).toBeGreaterThan(2)
  })

  it('no zoom de sempre (5 m) a moldura da frente continua bem desfocada, como no visual aprovado', () => {
    const p = parametrosProfundidade(e, 5, 720)
    expect(raioPx(cocPerto(1.75, p), p)).toBeGreaterThan(0.9 * p.raioCheio)
    expect(cocPerto(3.6, p)).toBe(0)
    expect(raioPx(cocLonge(300, p), p)).toBeGreaterThan(2)
  })

  it('o raio segue a abertura da lente: fov mais fechado desfoca mais, o de sempre (50°) fica igual', () => {
    const a = parametrosProfundidade(e, 5, 720, 50)
    const b = parametrosProfundidade(e, 5, 720, 30)
    const c = parametrosProfundidade(e, 5, 720, 57)
    expect(a.raioCheio).toBeCloseTo((e.dofRaio) * 1, 6)
    expect(b.raioCheio).toBeGreaterThan(a.raioCheio)
    expect(c.raioCheio).toBeLessThan(a.raioCheio)
  })
})

describe('profundidade e zoom: o foco anda com a câmera', () => {
  it('zoom de aproximar (a câmera chega na hora): o foco vai junto no mesmo quadro', () => {
    expect(focoAcompanha(5, 2.5, 1 / 60, e)).toBeCloseTo(2.5, 6)
    expect(focoAcompanha(45, 2.5, 1 / 60, e)).toBeCloseTo(2.5, 6)
  })

  it('zoom de afastar: a rua perto do jogador não entra na frente nem no fundo em nenhum quadro', () => {
    let f = focoAcompanha(null, 2.5, 0, e)
    for (let i = 0; i < 120; i++) {
      const alvo = 2.5 * Math.pow(45 / 2.5, Math.min(1, i / 60)) // de 2,5 a 45 m em 1 s
      f = focoAcompanha(f, alvo, 1 / 60, e)
      const p = parametrosProfundidade(e, f, 720)
      for (const d of [alvo * 0.85, alvo, alvo * 1.3]) {
        expect(raioPx(cocPerto(d, p), p), `quadro ${i}, d ${d}`).toBeLessThan(0.5)
        expect(raioPx(cocLonge(d, p), p), `quadro ${i}, d ${d}`).toBeLessThan(0.5)
      }
    }
  })
})
