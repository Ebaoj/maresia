// Antisserrilhado (27/10/2026, docs/relatorio-visual.md 2.2): a cena não tinha nenhum (escada parada em toda quina e
// silhueta). Pega: o SMAA sumir da cadeia, ou sair do lugar (depois da estabilização, antes do desfoque e da
// pincelada), nos dois caminhos; e a mistura do SMAA mexer no alfa (o peso do traço). Correção: commit "SMAA".
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PADRAO } from '../../src/config.js'

const ler = (a) => readFileSync(new URL(`../../src/pos/${a}`, import.meta.url), 'utf8')
const ordem = (fonte, marcas) => marcas.map((m) => { const i = fonte.indexOf(m); expect(i, m).toBeGreaterThan(-1); return i })

describe('SMAA na cadeia do pós', () => {
  it('ligado por padrão', () => expect(PADRAO.estilo.smaa).toBe(true))
  it('WebGL: estabilização -> SMAA -> desfoque -> pincelada', () => {
    const f = ler('aranhaverso.js')
    const d = f.slice(f.indexOf('  desenhar() {'))
    const [estab, smaa, dof, pint] = ordem(d, ['this.estab.desenhar(', 'this.smaa.desenhar(', 'this.dofLigado && dofAntes', 'this.passo(this.matTensor'])
    expect(estab).toBeLessThan(smaa)
    expect(smaa).toBeLessThan(dof)
    expect(dof).toBeLessThan(pint)
  })
  it('WebGPU: estabilização -> SMAA -> desfoque -> pincelada', () => {
    const f = ler('aranhaverso-gpu.js')
    const d = f.slice(f.indexOf('  desenhar() {'))
    const [estab, smaa, dof, pint] = ordem(d, ['this.estab.desenhar(', 'this.smaa.desenhar(', 'b.dofLigado && dofAntes', 'this.passo(this.matTensor'])
    expect(estab).toBeLessThan(smaa)
    expect(smaa).toBeLessThan(dof)
    expect(dof).toBeLessThan(pint)
  })
  it('a mistura guarda o alfa do próprio pixel nos dois caminhos', () => {
    expect(ler('smaa.js')).toMatch(/gl_FragColor = vec4\(m \* m, C\.a\)/)
    expect(ler('smaa-gpu.js')).toMatch(/vec4\(s\.rgb\.mul\(s\.rgb\), c\.a\)/)
  })
})
