// Pincelada (Kuwahara) refeita (27/10/2026, docs/relatorio-visual.md 2.3). Pega a volta de: 12 amostras esparsas
// (a grade 4 dava só 4 amostras, por um corte |v| <= 1 exato), raio em pixels da imagem (muda com o Retina e o governador), tensor sem borrão (direção
// do traço fervendo), anisotropia no liso (elipse comprida em direção aleatória), borda devolvida crua (moldura
// serrilhada). Correção: commit "Pincelada" (visual/correcoes). Falha no 3b2b4cf.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { PADRAO } from '../../src/config.js'
import { amostrasDisco, amostrasPintura, uniformsPintura, atualizarPintura, fragKuwahara, PESOS_TENSOR } from '../../src/pos/pintura.js'

const ler = (a) => readFileSync(new URL(`../../src/pos/${a}`, import.meta.url), 'utf8')

describe('pincelada', () => {
  it('21 amostras por padrão; as grades 4, 5 e 7 dão 12, 21 e 37, todas dentro do disco', () => {
    expect(amostrasDisco(amostrasPintura(PADRAO.estilo)).length).toBe(21)
    expect([4, 5, 7].map((n) => amostrasDisco(n).length)).toEqual([12, 21, 37])
    for (const n of [4, 5, 7]) {
      const r = amostrasDisco(n).map(([x, y]) => Math.hypot(x, y))
      expect(Math.max(...r)).toBeCloseTo(1, 6)
    }
  })
  it('raio em pixels CSS: dobra com o pixel ratio', () => {
    const u = uniformsPintura(THREE)
    atualizarPintura(u, PADRAO.estilo, true, 1)
    const r1 = u.kuwahara.uRaio.value
    atualizarPintura(u, PADRAO.estilo, true, 2)
    expect(u.kuwahara.uRaio.value).toBeCloseTo(2 * r1, 6)
    atualizarPintura(u, PADRAO.estilo, true, 0.75)
    expect(u.kuwahara.uRaio.value).toBeCloseTo(0.75 * r1, 6)
  })
  it('borrão do tensor normalizado e nos dois caminhos, antes do Kuwahara', () => {
    const [a, b, c] = PESOS_TENSOR
    expect(a + 2 * b + 2 * c).toBeCloseTo(1, 3)
    for (const [arq, marca] of [['aranhaverso.js', 'this.passo(this.matDesfTensorV'], ['aranhaverso-gpu.js', 'this.passo(this.matDesfTensorV']]) {
      const f = ler(arq)
      const i = f.indexOf(marca)
      expect(i, arq).toBeGreaterThan(-1)
      expect(i).toBeLessThan(f.indexOf('this.passo(this.kuwahara('))
    }
  })
  it('anisotropia só com gradiente e borda pintada (não crua), GLSL e TSL', () => {
    const glsl = fragKuwahara(5)
    expect(glsl).toMatch(/A \*= smoothstep\(/)
    expect(glsl).toMatch(/mix\(orig\.rgb, res \* res, uForca\)/)
    expect(glsl).not.toMatch(/abs\(Lo - Lr\)/)
    const tsl = ler('pintura-gpu.js')
    expect(tsl).toMatch(/mul\(W\.smoothstep\(lim2\.mul\(0\.1\), lim2, l1\.add\(l2\)\)\)/)
    expect(tsl).toMatch(/mix\(orig\.rgb, res\.mul\(res\), U\.uForca\)/)
    expect(tsl).not.toMatch(/Lo\.sub\(Lr\)/)
  })
})
