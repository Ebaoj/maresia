// A curva de tom da gradação final do Arcane (passo 12 de aranhaverso.js e aranhaverso-gpu.js), num lugar só:
// o GLSL, o TSL e a cópia em JavaScript que o teste confere (testes/unidade/gradacao-final.test.js).
//
// O fator multiplica a cor pela luminância L. Embaixo, as sombras fundas ganham 1,25 (o jogo não vira breu);
// em cima, a reta de contraste em volta de 0,5, (L - 0,5) * k + 0,5 (os meios escurecem, as luzes abrem).
// Entre as duas, uma mistura suave (smoothstep de ini a fim). Antes (até f06918b) a curva tinha um piso de
// 0,3 dividido por L: tudo entre ~0,24 e ~0,33 saía em exatamente 0,3, e parede na sombra, avesso da
// folhagem, metal e roupa viravam uma cor chapada só (branch grade-final, 22/10/2026).
// O fator continua preso entre 0,7 e 1,25, como antes.

export const GRADACAO = { ganhoSombra: 1.25, fatorMin: 0.7, fatorMax: 1.25 }

const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const mix = (a, b, t) => a + (b - a) * t
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const f = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

// k = contraste (cfg.estilo.arcGradeContraste); ini e fim = a faixa da emenda (arcGradeSombraIni e Fim)
export function fatorGradacao(L, k, ini, fim) {
  const alta = clamp((L - 0.5) * k + 0.5, 0, 1)
  const alvo = mix(GRADACAO.ganhoSombra * L, alta, smoothstep(ini, fim, L))
  return clamp(alvo / Math.max(L, 1e-3), GRADACAO.fatorMin, GRADACAO.fatorMax)
}

export const GLSL_GRADACAO = /* glsl */ `
float fatorGradacao(float L, float k, float ini, float fim) {
  float alta = clamp((L - 0.5) * k + 0.5, 0.0, 1.0);
  float alvo = mix(${f(GRADACAO.ganhoSombra)} * L, alta, smoothstep(ini, fim, L));
  return clamp(alvo / max(L, 1e-3), ${f(GRADACAO.fatorMin)}, ${f(GRADACAO.fatorMax)});
}
`

// a mesma conta em TSL (W = o módulo three/tsl de render/gpu/comum.js)
export function fatorGradacaoTsl(W) {
  const { Fn, float, clamp: c, mix: m, max, smoothstep: s } = W
  return Fn(([L, k, ini, fim]) => {
    const alta = c(L.sub(0.5).mul(k).add(0.5), 0.0, 1.0)
    const alvo = m(L.mul(GRADACAO.ganhoSombra), alta, s(ini, fim, L))
    return c(alvo.div(max(L, 1e-3)), GRADACAO.fatorMin, GRADACAO.fatorMax)
  }).setLayout({ name: 'mFatorGradacao', type: 'float', inputs: [{ name: 'L', type: 'float' }, { name: 'k', type: 'float' }, { name: 'ini', type: 'float' }, { name: 'fim', type: 'float' }] })
}

const LUM = [0.299, 0.587, 0.114]
const lum = (c) => c[0] * LUM[0] + c[1] * LUM[1] + c[2] * LUM[2]

// o passo 12 inteiro em JavaScript, no mundo (fora do céu), com a gradação ligada: a mesma ordem dos shaders
// (a saturação e o neutro usam a luminância de antes da curva, como lá)
export function gradacaoFinal(cor, { contraste = 1.15, saturacao = 1.05, neutro: puxa = 0.12, cal = [0.937, 0.902, 0.824], ini = 0.12, fim = 0.45 } = {}) {
  const Lf = lum(cor)
  const fa = fatorGradacao(Lf, contraste, ini, fim)
  let c = cor.map((v) => v * fa)
  const mx = Math.max(...c), mn = Math.min(...c)
  const sat = (mx - mn) / Math.max(mx, 1e-3)
  const neutro = 1 - smoothstep(0.04, 0.26, sat)
  c = c.map((v, i) => mix(v, mix(Lf, cal[i], 0.4) * mx, neutro * puxa))
  return c.map((v) => mix(Lf, v, saturacao))
}
