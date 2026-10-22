// Bug (22/10/2026, branch bugs-22): nadando, a água em volta do jogador se enchia de anéis brancos enormes.
// A onda andava a ~10 m/s (k = 0,5 por passo numa grade de 25 cm) e durava segundos: o anel de uma braçada
// corria 7 m e o de um mergulho passava de 10 m, enquanto o passo na água rasa nem aparecia.
// O anel tem de ser pequeno, curto e do tamanho do respingo. Correção: commit "Ondinhas pequenas e curtas".
//
// O passe de onda roda na GPU; aqui ele roda no gêmeo da CPU (apoio/onda-cpu.js), com os coeficientes que o
// jogo entrega ao shader (parametrosOnda). As gotas são as mesmas que main.js e o jogador soltam.

import { describe, it, expect } from 'vitest'
import * as toque from '../../src/mundo/toque.js'
import { PADRAO } from '../../src/config.js'
import { criarOndaCpu } from './apoio/onda-cpu.js'

const cfg = JSON.parse(JSON.stringify(PADRAO))
// o código de antes (9c93b34) não tinha parametrosOnda: o shader usava k = 0,5 fixo, a grade de 64 m do mapa
// de toque e a crista de mar.js com estes limites
const ANTES = { tam: 256, area: 64, k: 0.5, amortece: cfg.interacao.amorteceOnda, crista: { de: 0.04, cheia: 0.08, some: 0.22, fim: 0.4 } }
const P = toque.parametrosOnda ? toque.parametrosOnda(cfg) : ANTES

// as gotas do jogo (raio, força): src/main.js e src/jogador
const GOTA = {
  passo: [0.22, 0.3], // pisada na água rasa, andando
  nado: [0.7, 0.6], // braçada, a cada 0,22 s enquanto nada
  tchibum: [0.9, 0.9], // mergulho
}

// uma gota sozinha: até onde a crista branca chega (m) e por quanto tempo ainda se vê alguma (s)
function anel([raio, forca]) {
  const o = criarOndaCpu(P)
  o.passo([[0, 0, raio, forca]])
  let alcance = 0
  let vida = 0
  for (let q = 1; q <= 300; q++) {
    o.passo()
    const c = o.cristas(P.crista)
    if (!c.length) continue
    vida = q / 60
    for (const [x, z] of c) alcance = Math.max(alcance, Math.hypot(x, z))
  }
  return { alcance, vida }
}

describe('ondinhas na água (toque.js + mar.js)', () => {
  const passo = anel(GOTA.passo)
  const nado = anel(GOTA.nado)
  const tchibum = anel(GOTA.tchibum)

  it('a braçada abre um anel pequeno e curto', () => {
    expect(nado.alcance).toBeGreaterThan(0.3)
    expect(nado.alcance).toBeLessThan(2.0)
    expect(nado.vida).toBeLessThan(2.0)
  })

  it('o mergulho abre o maior anel, mas ainda perto de quem caiu', () => {
    expect(tchibum.alcance).toBeLessThan(3.0)
    expect(tchibum.vida).toBeLessThan(2.5)
  })

  it('o anel é do tamanho do respingo: passo < braçada < mergulho, e o passo também aparece', () => {
    expect(passo.alcance).toBeGreaterThan(0.1)
    expect(passo.alcance).toBeLessThan(1.0)
    expect(passo.alcance).toBeLessThan(nado.alcance)
    expect(nado.alcance).toBeLessThan(tchibum.alcance)
  })

  it('nadando 3 s em linha reta, nenhuma crista fica a mais de 2,5 m de quem nada', () => {
    const o = criarOndaCpu(P)
    let x = -3
    for (let q = 0; q < 180; q++) {
      x += 1.2 / 60
      o.passo(q % 13 === 0 ? [[x, 0, ...GOTA.nado]] : [])
    }
    let longe = 0
    for (const [cx, cz] of o.cristas(P.crista)) longe = Math.max(longe, Math.hypot(cx - x, cz))
    expect(longe).toBeLessThan(2.5)
  })

  it('o coeficiente da onda fica no limite estável da grade (k <= 0,5)', () => {
    expect(P.k).toBeGreaterThan(0)
    expect(P.k).toBeLessThanOrEqual(0.5)
  })
})
