// Pisca (27/10/2026, docs/relatorio-visual.md 1.2): o grão do passe final entrava com uTempo no hash e trocava a
// tela inteira 8 vezes por segundo, depois da estabilização (que não o vê). Pega o grão andando com o tempo nos dois
// caminhos (GLSL e TSL). Correção: commit "Grão parado" (visual/correcoes).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const ler = (a) => readFileSync(new URL(`../../src/pos/${a}`, import.meta.url), 'utf8')
const linhaGrao = (fonte, marca) => fonte.split('\n').filter((l) => l.includes(marca))

describe('grão do passe final', () => {
  it('GLSL: o grão não depende do tempo', () => {
    const ls = linhaGrao(ler('aranhaverso.js'), '* uGrao')
    expect(ls.length).toBe(1)
    expect(ls[0]).not.toMatch(/uTempo/)
  })
  it('TSL: o grão não depende do tempo', () => {
    const ls = linhaGrao(ler('aranhaverso-gpu.js'), 'mul(U.uGrao)')
    expect(ls.length).toBe(1)
    expect(ls[0]).not.toMatch(/uTempo/)
  })
})
