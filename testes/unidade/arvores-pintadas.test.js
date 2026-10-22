// Árvores pintadas e vento (21/10/2026, docs/arvores-pintadas.md). Pega: espécie que perde a malha de longe ou os
// cartões, atributo de vento fora da faixa (tronco que balança no pé, cacho solto do galho), copa que volta a ser
// lida como bolas (normal do topo apontando para o lado), cor sem o topo claro e o baixo escuro, orçamento de
// triângulos estourado, vento soprando para o lado errado e a troca de detalhe piscando na divisa do bloco.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { oiti, ficus, cajueiro, carnauba, mangueVermelho, murici, guajiru } from '../../src/mundo/especies.js'
import { criarAleatorio } from '../../src/utils.js'
import { direcaoVento } from '../../src/mundo/vento-arvores.js'
import { nivelDoBloco, corDaCopia } from '../../src/mundo/lod-arvores.js'

const ESPECIES = { oiti, ficus, cajueiro, carnauba, mangueVermelho, murici, guajiru }
const tris = (g) => (g ? g.index.count / 3 : 0)
const lum = (c, i) => 0.3 * c.getX(i) + 0.59 * c.getY(i) + 0.11 * c.getZ(i)

describe('árvores pintadas: forma', () => {
  for (const [nome, fn] of Object.entries(ESPECIES)) {
    const p = fn(criarAleatorio(7))
    it(`${nome}: três malhas indexadas, com os atributos do vento e sem número quebrado`, () => {
      for (const g of [p.corpo, p.longe]) {
        expect(g.index).toBeTruthy()
        for (const k of ['position', 'normal', 'color', 'aVento', 'aTexAlt']) expect(g.attributes[k], k).toBeTruthy()
        expect(g.attributes.aVento.itemSize).toBe(4)
        for (const v of g.attributes.position.array) expect(Number.isFinite(v)).toBe(true)
      }
      expect(p.cartoes).toBeTruthy()
      for (const k of ['position', 'normal', 'color', 'uv', 'aVento', 'aCentro', 'aCanto']) expect(p.cartoes.attributes[k], k).toBeTruthy()
      // o WebGPU aceita 8 buffers de vértice: com a matriz e a cor da cópia, os cartões têm de caber em 6
      const buffers = new Set(Object.values(p.cartoes.attributes).map((a) => (a.isInterleavedBufferAttribute ? a.data : a)))
      expect(buffers.size).toBeLessThanOrEqual(6)
    })

    it(`${nome}: mesma semente, mesma árvore`, () => {
      const q = fn(criarAleatorio(7))
      expect(Array.from(q.corpo.attributes.position.array.slice(0, 300))).toEqual(Array.from(p.corpo.attributes.position.array.slice(0, 300)))
      expect(q.cartoes.attributes.position.count).toBe(p.cartoes.attributes.position.count)
    })

    it(`${nome}: orçamento de triângulos (perto e longe)`, () => {
      expect(tris(p.corpo)).toBeLessThan(4500)
      expect(tris(p.longe)).toBeLessThan(tris(p.corpo) * 0.4)
      if (nome !== 'carnauba') expect(tris(p.cartoes) / 2).toBeLessThan(450)
    })

    it(`${nome}: o pé não balança, o cacho balança com peso cheio`, () => {
      const av = p.corpo.attributes.aVento
      const pos = p.corpo.attributes.position
      for (let i = 0; i < av.count; i++) {
        expect(av.getX(i)).toBeGreaterThanOrEqual(0)
        expect(av.getY(i)).toBeGreaterThanOrEqual(0)
        expect(av.getY(i)).toBeLessThanOrEqual(1)
        if (pos.getY(i) < 0.2) expect(av.getX(i)).toBeLessThan(0.05)
      }
      const ta = p.corpo.attributes.aTexAlt
      let folhagem = 0
      for (let i = 0; i < av.count; i++) if (ta.getX(i) === 1) { folhagem++; expect(av.getY(i)).toBeGreaterThanOrEqual(0.5) }
      expect(folhagem).toBeGreaterThan(0)
    })
  }

  it('copa lida como um volume: no alto a normal aponta para cima e a cor é mais clara que embaixo', () => {
    for (const fn of [oiti, ficus, cajueiro, mangueVermelho]) {
      const g = fn(criarAleatorio(3)).corpo
      const pos = g.attributes.position, n = g.attributes.normal, c = g.attributes.color, ta = g.attributes.aTexAlt
      let y0 = Infinity, y1 = -Infinity
      for (let i = 0; i < pos.count; i++) if (ta.getX(i) === 1) { y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i)) }
      const alto = [], baixo = []
      for (let i = 0; i < pos.count; i++) {
        if (ta.getX(i) !== 1) continue
        const t = (pos.getY(i) - y0) / (y1 - y0)
        if (t > 0.85) alto.push(i)
        if (t < 0.15) baixo.push(i)
      }
      const media = (l, f) => l.reduce((s, i) => s + f(i), 0) / l.length
      expect(media(alto, (i) => n.getY(i))).toBeGreaterThan(0.6)
      expect(media(baixo, (i) => n.getY(i))).toBeLessThan(-0.2)
      expect(media(alto, (i) => lum(c, i))).toBeGreaterThan(media(baixo, (i) => lum(c, i)) * 1.6)
    }
  })

  it('cartões: viram para a câmera (canto no plano da tela), normal de tamanho 1; o leque da carnaúba não vira', () => {
    const g = oiti(criarAleatorio(5)).cartoes
    const n = g.attributes.normal, k = g.attributes.aCanto, w = g.attributes.aVento
    const v = new THREE.Vector3()
    for (let i = 0; i < n.count; i++) {
      expect(v.fromBufferAttribute(n, i).length()).toBeCloseTo(1, 3)
      expect(k.getZ(i)).toBe(1)
      expect(w.getW(i)).toBe(1)
    }
    const c = carnauba(criarAleatorio(5)).cartoes.attributes.aCanto
    for (let i = 0; i < c.count; i++) expect(c.getZ(i)).toBe(0)
  })
})

describe('carnaúba de longe', () => {
  // a carnaúba de longe ficava com os leques cheios (3,3 mil triângulos por árvore, 820 mil no quadro da Coluna da
  // Hora, cidade-cheia 21/10/2026): de longe vai a versão simples, que não pode sumir (é a copa inteira)
  it('tem leques simples para longe, com menos de um quarto dos triângulos', () => {
    const p = carnauba(criarAleatorio(9))
    expect(p.cartoesLonge).toBeTruthy()
    expect(tris(p.cartoesLonge)).toBeGreaterThan(0)
    expect(tris(p.cartoesLonge)).toBeLessThan(tris(p.cartoes) * 0.25)
  })
})

describe('vento e distância', () => {
  it('o alísio de lés-sudeste sopra para oeste e um pouco para o norte (x leste, z sul)', () => {
    const d = direcaoVento(110)
    expect(d.x).toBeCloseTo(-0.94, 2)
    expect(d.y).toBeCloseTo(-0.34, 2)
    const l = direcaoVento(90)
    expect(l.x).toBeCloseTo(-1, 5)
    expect(Math.abs(l.y)).toBeLessThan(1e-9)
  })

  it('a troca perto/longe do bloco tem folga: não pisca na divisa', () => {
    expect(nivelDoBloco(89, 90, null)).toBe(true)
    expect(nivelDoBloco(95, 90, true)).toBe(true)
    expect(nivelDoBloco(95, 90, false)).toBe(false)
    expect(nivelDoBloco(101, 90, true)).toBe(false)
  })

  it('cor por cópia: fixa pela posição e perto de 1', () => {
    const a = corDaCopia(10.5, 20.25)
    const b = corDaCopia(10.5, 20.25)
    expect(a.equals(b)).toBe(true)
    for (let i = 0; i < 50; i++) {
      const c = corDaCopia(i * 13.1, i * 7.7)
      for (const v of [c.r, c.g, c.b]) { expect(v).toBeGreaterThan(0.85); expect(v).toBeLessThan(1.15) }
    }
    expect(corDaCopia(0, 0, 0).equals(new THREE.Color(1, 1, 1))).toBe(true)
  })
})
