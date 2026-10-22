// Profundidade de campo (src/pos/profundidade.js): as contas que decidem quanto cada distância desfoca e como o
// foco acompanha o jogador. O desenho (passes de GPU) é conferido nas fotos e no vídeo de docs/capturas/profundidade/;
// aqui ficam as regras que não podem voltar atrás sem aviso:
// - o jogador (na distância do foco) fica nítido; o fundo desfoca aos poucos e para no máximo;
// - marco a 100-300 m não vira mancha (o raio fica abaixo do máximo nos padrões);
// - o foco segue o jogador suavizado, sem passar do alvo (sem "bombear") e sem depender do passo do quadro.

import { describe, it, expect } from 'vitest'
import { PADRAO } from '../../src/config.js'
import { cocLonge, cocPerto, parametrosProfundidade, focoSuave, focoAcompanha, distanciaDeVista } from '../../src/pos/profundidade.js'

const e = PADRAO.estilo

describe('profundidade: quanto cada distância desfoca', () => {
  const foco = 6
  const p = parametrosProfundidade(e, foco, 720)

  it('o jogador e a faixa em volta dele ficam nítidos', () => {
    expect(cocLonge(foco, p)).toBe(0)
    expect(cocPerto(foco, p)).toBe(0)
    expect(cocLonge(foco + e.dofLongeInicio * 0.99, p)).toBe(0)
    expect(cocPerto(foco - e.dofPertoMargem * 0.99, p)).toBe(0)
  })

  it('o fundo desfoca cada vez mais com a distância e para no máximo', () => {
    let antes = 0
    for (const d of [20, 40, 80, 150, 300, 600, 1500, 5000]) {
      const c = cocLonge(d, p)
      expect(c).toBeGreaterThanOrEqual(antes)
      expect(c).toBeLessThanOrEqual(1)
      antes = c
    }
    expect(cocLonge(5000, p)).toBeGreaterThan(0.5)
  })

  it('marco a 100-300 m continua forma: raio abaixo do máximo e de poucos pixels', () => {
    for (const d of [100, 200, 300]) {
      const raio = cocLonge(d, p) * p.raioCheio
      expect(raio).toBeGreaterThan(0.5) // desfoca alguma coisa
      expect(raio).toBeLessThan(p.raioCheio * 0.9)
      expect(raio).toBeLessThan(6) // em pixels de uma imagem de 720 de altura
    }
  })

  it('o que está entre a câmera e o jogador desfoca mais quanto mais perto', () => {
    // desde 22/10 (profundidade-camera) a frente começa em foco x dofPertoFator, não mais em foco - margem fixa
    expect(cocPerto(p.pertoIni - 0.5, p)).toBeGreaterThan(0)
    expect(cocPerto(1, p)).toBeGreaterThan(cocPerto(3, p))
    expect(cocPerto(0.3, p)).toBeLessThanOrEqual(1)
  })

  it('desligado ou com abertura zero, nada desfoca', () => {
    const z = parametrosProfundidade({ ...e, dofAbertura: 0 }, foco, 720)
    expect(cocLonge(500, z)).toBe(0)
    expect(cocPerto(1, z)).toBe(0)
  })

  it('o raio acompanha a altura da imagem (o mesmo desenho em qualquer resolução)', () => {
    const a = parametrosProfundidade(e, foco, 720)
    const b = parametrosProfundidade(e, foco, 1440)
    expect(b.raioCheio).toBeCloseTo(a.raioCheio * 2)
    expect(cocLonge(200, b)).toBeCloseTo(cocLonge(200, a))
  })

  it('o passo das amostras é inteiro (amostra no centro do texel) e cobre o raio com 8 de cada lado', () => {
    for (const h of [360, 720, 1125, 2160]) {
      const q = parametrosProfundidade({ ...e, dofRaio: 24 }, foco, h)
      expect(Number.isInteger(q.passo)).toBe(true)
      expect(q.passo * 8).toBeGreaterThanOrEqual(q.raioMeio - 1e-9)
      expect(Number.isInteger(q.passoQuarto)).toBe(true)
      expect(q.passoQuarto * 8).toBeGreaterThanOrEqual(q.raioQuarto - 1e-9)
    }
  })
})

describe('profundidade: o foco acompanha o jogador', () => {
  it('distância de vista: o eixo da câmera, não a distância em linha reta', () => {
    expect(distanciaDeVista([0, 0, 0], [0, 0, -1], [0, 0, -6])).toBeCloseTo(6)
    expect(distanciaDeVista([0, 0, 0], [0, 0, -1], [3, 0, -6])).toBeCloseTo(6)
  })

  it('vai até o alvo sem passar dele (não bombeia)', () => {
    let f = 6
    const vistos = []
    for (let i = 0; i < 120; i++) { f = focoSuave(f, 12, 1 / 60, 0.35); vistos.push(f) }
    for (let i = 1; i < vistos.length; i++) expect(vistos[i]).toBeGreaterThanOrEqual(vistos[i - 1])
    expect(Math.max(...vistos)).toBeLessThanOrEqual(12)
    expect(f).toBeGreaterThan(11.9)
  })

  it('não depende do passo do quadro: 30 e 120 quadros por segundo chegam ao mesmo lugar em 0,5 s', () => {
    let a = 6, b = 6
    for (let i = 0; i < 15; i++) a = focoSuave(a, 12, 1 / 30, 0.35)
    for (let i = 0; i < 60; i++) b = focoSuave(b, 12, 1 / 120, 0.35)
    expect(a).toBeCloseTo(b, 6)
  })

  it('a câmera pula para perto (algo entre ela e o jogador): o jogador nunca sai da faixa nítida', () => {
    let f = focoAcompanha(null, 6, 0, e)
    for (let i = 0; i < 30; i++) {
      const alvo = i < 5 ? 6 : 1.6 // a câmera colou em 1,6 m do jogador no quadro 5
      f = focoAcompanha(f, alvo, 1 / 60, e)
      const p = parametrosProfundidade(e, f, 720)
      expect(cocPerto(alvo, p), `quadro ${i}`).toBe(0)
      expect(cocLonge(alvo, p), `quadro ${i}`).toBe(0)
    }
  })

  it('teleporte (primeiro quadro ou salto no tempo) vai direto ao alvo', () => {
    expect(focoAcompanha(null, 40, 1 / 60, e)).toBe(40)
    expect(focoAcompanha(6, 40, 3, e)).toBe(40)
  })

  it('suavização zero vai direto; passo de tempo inválido não estraga o foco', () => {
    expect(focoSuave(6, 9, 1 / 60, 0)).toBe(9)
    expect(focoSuave(6, 9, NaN, 0.35)).toBe(6)
    expect(focoSuave(6, 9, -1, 0.35)).toBe(6)
  })
})
