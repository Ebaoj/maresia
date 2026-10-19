// Fase 2b: o material dos atores instanciados (sem GPU). A conta do shader só roda no WebGPU; aqui ficam a
// escolha das linhas da textura por tempo e a forma do material que o renderizador converte.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ATRIBUTOS, materialAtoresVat, quadroDoTempo } from '../../src/mundo/atores-vat-material.js'

const clipe = { linha0: 10, quadros: 30, duracao: 1 }

describe('quadroDoTempo', () => {
  it('tempo 0: primeira linha do clipe e a seguinte, sem fração', () => {
    expect(quadroDoTempo(clipe, 0)).toEqual({ linhaA: 10, linhaB: 11, frac: 0 })
  })

  it('tempo = duração dá a volta e cai no mesmo lugar do tempo 0', () => {
    expect(quadroDoTempo(clipe, 1)).toEqual(quadroDoTempo(clipe, 0))
    expect(quadroDoTempo(clipe, 3)).toEqual(quadroDoTempo(clipe, 0))
  })

  it('último quadro: linhaB volta para a primeira linha do clipe', () => {
    const r = quadroDoTempo(clipe, 29.25 / 30)
    expect(r.linhaA).toBe(10 + 29)
    expect(r.linhaB).toBe(10)
    expect(r.frac).toBeCloseTo(0.25, 6)
  })

  it('fração entre dois quadros', () => {
    const r = quadroDoTempo(clipe, 4.25 / 30)
    expect(r.linhaA).toBe(14)
    expect(r.linhaB).toBe(15)
    expect(r.frac).toBeCloseTo(0.25, 6)
  })

  it('clipe que não dura 1 s e não começa na linha 0', () => {
    const c = { linha0: 42, quadros: 15, duracao: 0.5 }
    const r = quadroDoTempo(c, 0.5 + 0.21) // 0,21 s dentro do clipe = quadro 6,3
    expect(r.linhaA).toBe(42 + 6)
    expect(r.linhaB).toBe(42 + 7)
    expect(r.frac).toBeCloseTo(0.3, 6)
  })

  it('tempo negativo faz a volta pelo fim', () => {
    const r = quadroDoTempo(clipe, -1.5 / 30) // 1,5 quadro antes do fim = quadro 28,5
    expect(r.linhaA).toBe(10 + 28)
    expect(r.linhaB).toBe(10 + 29)
    expect(r.frac).toBeCloseTo(0.5, 6)
    const meio = quadroDoTempo(clipe, -0.5 / 30)
    expect(meio.linhaA).toBe(10 + 29)
    expect(meio.linhaB).toBe(10)
    expect(meio.frac).toBeCloseTo(0.5, 6)
  })

  it('tempo um fio abaixo de zero ou da duração nunca sai do clipe', () => {
    for (const t of [-1e-17, -1e-12, 1 - 1e-17, 1 - 1e-12, 1e9 + 0.999999999999]) {
      const r = quadroDoTempo(clipe, t)
      expect(r.linhaA).toBeGreaterThanOrEqual(10)
      expect(r.linhaA).toBeLessThan(10 + 30)
      expect(r.linhaB).toBeGreaterThanOrEqual(10)
      expect(r.linhaB).toBeLessThan(10 + 30)
      expect(r.frac).toBeGreaterThanOrEqual(0)
      expect(r.frac).toBeLessThanOrEqual(1)
    }
  })
})

describe('materialAtoresVat', () => {
  const textura = new THREE.DataTexture(new Float32Array(28 * 4 * 4 * 2), 28 * 4, 2, THREE.RGBAFormat, THREE.FloatType)
  const atributos = {
    animA: new THREE.InstancedBufferAttribute(new Float32Array(16 * 4), 4),
    animB: new THREE.InstancedBufferAttribute(new Float32Array(16 * 4), 4),
  }

  it('os nomes dos atributos de instância são os do contrato', () => {
    expect(ATRIBUTOS).toEqual({ animA: 'aAnimA', animB: 'aAnimB' })
  })

  it('devolve o toon pintado, sem cache, branco, com os dois ganchos do TSL', () => {
    const m = materialAtoresVat({ textura, nOssos: 28, atributos })
    expect(m.isMeshToonMaterial).toBe(true)
    expect(m.opacity).toBe(0.85)
    expect(m.blending).toBe(THREE.NoBlending)
    expect(m.color.getHexString()).toBe('ffffff')
    expect(m.userData.luzMRT).toBe(true)
    expect(m.userData.tsl.nome).toBe('atores-vat')
    expect(typeof m.userData.tsl.posicao).toBe('function')
    expect(typeof m.userData.tsl.posicaoSombra).toBe('function')
    // sem cache: duas chamadas, dois materiais (cada um com as suas entradas)
    expect(materialAtoresVat({ textura, nOssos: 28, atributos })).not.toBe(m)
  })

  it('aceita outra opacidade', () => {
    expect(materialAtoresVat({ textura, nOssos: 28, opacity: 0.5, atributos }).opacity).toBe(0.5)
  })

  it('sem os atributos reais não monta: o nó precisa deles', () => {
    expect(() => materialAtoresVat({ textura, nOssos: 28 })).toThrow(/atributos/)
    expect(() => materialAtoresVat({ textura, nOssos: 28, atributos: { animA: atributos.animA } })).toThrow(/atributos/)
  })
})
