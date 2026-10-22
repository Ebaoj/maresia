// Meios-tons escuros chapados no jogo inteiro (branch grade-final, 22/10/2026): na gradação final do Arcane
// (aranhaverso.js e aranhaverso-gpu.js, passo 12) a curva era clamp((L - 0,5) * k + 0,5, 0,3, 1,0) e depois
// dividida por L; com k = 1,15, tudo entre L ~0,24 e ~0,33 saía em exatamente 0,3, e a saturação (que usa a
// luminância de antes) ainda descia um pouco ali dentro. Parede na sombra, avesso da folhagem, metal e roupa
// viravam uma cor chapada só. A correção (gradacao-final.js) troca o piso por uma mistura suave entre o ganho
// das sombras (1,25 L) e a reta de contraste, nos dois renderizadores pelo mesmo código. Este teste roda o
// passo 12 em JavaScript (a mesma conta dos shaders) sobre uma rampa e reprova faixa plana ou descida entre
// 0,1 e 0,5. No código de antes (f06918b) ele falha: de 0,24 a 0,33 a saída fica parada em 0,3.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fatorGradacao, gradacaoFinal, GRADACAO } from '../../src/pos/gradacao-final.js'
import { PADRAO } from '../../src/config.js'

const LUM = [0.299, 0.587, 0.114]
const lum = (c) => c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2]
const e = PADRAO.estilo
const P = { contraste: e.arcGradeContraste, saturacao: e.arcGradeSaturacao, neutro: e.arcGradeNeutro, ini: e.arcGradeSombraIni, fim: e.arcGradeSombraFim }

// cores de partida: cinza, cal, terra, folha, céu de sombra, ferro e um pano saturado
const MATIZES = { cinza: [1, 1, 1], cal: [1, 0.96, 0.88], terra: [1, 0.78, 0.6], folha: [0.62, 0.85, 0.55], sombraFria: [0.8, 0.9, 1.1], ferro: [0.95, 0.92, 0.8], pano: [1.2, 0.5, 0.35] }

function rampa(matiz, de = 0.1, ate = 0.5, passo = 0.0005) {
  const l0 = lum(matiz)
  const pts = []
  for (let L = de; L <= ate + 1e-9; L += passo) {
    const cor = matiz.map((v) => (v / l0) * L)
    pts.push([L, lum(gradacaoFinal(cor, P))])
  }
  return pts
}

describe('gradação final: curva de tom suave e crescente nas sombras', () => {
  for (const [nome, matiz] of Object.entries(MATIZES)) {
    it(`${nome}: a luminância de saída sobe sempre de 0,1 a 0,5, sem faixa plana`, () => {
      const pts = rampa(matiz)
      let pior = Infinity
      for (let i = 1; i < pts.length; i++) {
        const incl = (pts[i][1] - pts[i - 1][1]) / (pts[i][0] - pts[i - 1][0])
        pior = Math.min(pior, incl)
      }
      // sem faixa plana: a inclinação nunca cai abaixo de 0,5 (antes era 0, e até negativa)
      expect(pior, `menor inclinação na rampa ${nome}`).toBeGreaterThan(0.5)
      // nenhuma janela de 0,01 de entrada sai com menos de 0,004 de diferença
      for (let i = 0; i + 20 < pts.length; i++) expect(pts[i + 20][1] - pts[i][1]).toBeGreaterThan(0.004)
    })
  }

  it('sem degrau: a inclinação muda devagar (curva suave, não emenda de retas)', () => {
    const d = 0.001
    let maiorSalto = 0, antes = null
    for (let L = 0.05; L <= 0.9; L += d) {
      const incl = (L + d) * fatorGradacao(L + d, P.contraste, P.ini, P.fim) - L * fatorGradacao(L, P.contraste, P.ini, P.fim)
      if (antes != null) maiorSalto = Math.max(maiorSalto, Math.abs(incl - antes) / d)
      antes = incl
    }
    expect(maiorSalto).toBeLessThan(0.05)
  })

  it('o resto da curva aprovada fica: ganho 1,25 nas sombras fundas, a reta de contraste acima de 0,5', () => {
    const k = P.contraste
    for (const L of [0.02, 0.05, 0.08, P.ini]) expect(L * fatorGradacao(L, k, P.ini, P.fim)).toBeCloseTo(1.25 * L, 6)
    for (const L of [P.fim, 0.5, 0.6, 0.75, 0.9]) expect(L * fatorGradacao(L, k, P.ini, P.fim)).toBeCloseTo((L - 0.5) * k + 0.5, 6)
    // no meio, o desvio da curva antiga (com o piso) fica pequeno: o visual do 21/10 não muda fora das sombras médias
    const antiga = (L) => L * Math.min(1.25, Math.max(0.7, Math.min(1, Math.max(0.3, (L - 0.5) * k + 0.5)) / Math.max(L, 0.15)))
    for (let L = 0.05; L <= 0.9; L += 0.005) expect(Math.abs(L * fatorGradacao(L, k, P.ini, P.fim) - antiga(L))).toBeLessThan(0.04)
  })

  it('os dois renderizadores usam a mesma curva (gradacao-final.js), sem o piso de 0,3', () => {
    const gl = readFileSync(new URL('../../src/pos/aranhaverso.js', import.meta.url), 'utf8')
    const gpu = readFileSync(new URL('../../src/pos/aranhaverso-gpu.js', import.meta.url), 'utf8')
    for (const fonte of [gl, gpu]) {
      expect(fonte).toContain("from './gradacao-final.js'")
      expect(fonte).not.toMatch(/0\.5\)?,\s*0\.3,\s*1\.0\)/)
    }
    expect(gl).toContain('${GLSL_GRADACAO}')
    expect(gl).toContain('fatorGradacao(Lf, uArcGradeContraste, uArcGradeSombraIni, uArcGradeSombraFim)')
    expect(gpu).toContain("fatorGradacaoTsl(W)")
    expect(gpu).toContain("fatorGradacao(Lf, U.uArcGradeContraste, U.uArcGradeSombraIni, U.uArcGradeSombraFim)")
    expect(GRADACAO.ganhoSombra).toBe(1.25)
  })
})
