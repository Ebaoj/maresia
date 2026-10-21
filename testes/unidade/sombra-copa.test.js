// Sombra da copa do coqueiro (21/10/2026). Bug de affa542: a máscara só da sombra tinha 14 folíolos iguais e
// igualmente espaçados em todas as folhas; no chão, ao meio-dia, a copa virava um "espirógrafo" de arcos com
// listras de frequência constante (Poço da Draga, x 636 z 16). Estes testes pegam a volta da listra regular.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { foliolos, desenharMascaraSombra, VARIANTES_SOMBRA } from '../../src/mundo/sombra-copa.js'
import { geometriaCopa } from '../../src/mundo/vegetacao.js'
import { criarAleatorio } from '../../src/utils.js'

const eixo = { x0: 0.5, y0: 0, x1: 0.5, y1: 1 }
const ctxFalso = () => new Proxy({}, { get: (alvo, k) => (k in alvo ? alvo[k] : () => {}), set: (alvo, k, v) => { alvo[k] = v; return true } })

describe('máscara da sombra da copa', () => {
  it('os vãos entre folíolos variam: nada de listra de frequência constante', () => {
    for (const semente of [1, 7, 1932]) {
      const lista = foliolos(criarAleatorio(semente), { eixo })
      const ts = [...new Set(lista.filter((f) => f.lado === 1).map((f) => f.t))].sort((a, b) => a - b)
      const vaos = ts.slice(1).map((t, i) => t - ts[i])
      const media = vaos.reduce((a, b) => a + b, 0) / vaos.length
      const desvio = Math.sqrt(vaos.reduce((a, b) => a + (b - media) ** 2, 0) / vaos.length)
      expect(desvio / media).toBeGreaterThan(0.5) // espaçamento igual daria 0
      expect(Math.max(...vaos) / Math.min(...vaos)).toBeGreaterThan(3) // tufos colados e vãos largos
    }
  })

  it('a folha afina na base e na ponta', () => {
    const lista = foliolos(criarAleatorio(3), { eixo })
    const media = (de, ate) => { const l = lista.filter((f) => f.t >= de && f.t < ate); return l.reduce((a, f) => a + f.comp, 0) / l.length }
    expect(media(0.35, 0.65)).toBeGreaterThan(media(0, 0.12) * 1.3)
    expect(media(0.35, 0.65)).toBeGreaterThan(media(0.85, 1) * 1.3)
  })

  it('as variantes diferem entre si: folha quebrada, segunda folha por baixo, comprimentos', () => {
    const info = desenharMascaraSombra(ctxFalso())
    expect(info).toHaveLength(VARIANTES_SOMBRA)
    expect(new Set(info.map((v) => v.foliolos)).size).toBeGreaterThan(VARIANTES_SOMBRA / 2)
    expect(info.some((v) => v.quebra)).toBe(true)
    expect(info.some((v) => v.segunda)).toBe(true)
    expect(info.some((v) => !v.segunda)).toBe(true)
    // com semente: sai sempre igual
    expect(desenharMascaraSombra(ctxFalso())).toEqual(info)
  })

  it('cada folha da copa lê uma variante pelo uv1 (sem todas iguais)', () => {
    const geo = geometriaCopa(new THREE.Vector3(0, 8, 0))
    const uv1 = geo.getAttribute('uv1')
    expect(uv1).toBeTruthy()
    const variantes = new Set()
    for (let i = 0; i < uv1.count; i++) variantes.add(Math.min(VARIANTES_SOMBRA - 1, Math.floor(uv1.getX(i) * VARIANTES_SOMBRA - 1e-6 + 1e-9)))
    expect(variantes.size).toBeGreaterThanOrEqual(Math.min(VARIANTES_SOMBRA, 6))
  })
})
