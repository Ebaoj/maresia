// O desenho da cidade: onde fica o mar, a praia, o rio e os morros.
// Tudo aqui é função matemática de (x, z). O resto do jogo pergunta para este arquivo.
//
// Oeste (x negativo): Rio, com morros, favela e as pedras no mar.
// Centro: Recife, com o rio, as pontes e o casario colorido.
// Leste (x positivo): Fortaleza, com praia larga, jangadas, prédios na orla, dunas e o farol.
// O mar fica ao sul (z negativo).

import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'

const perlin = new ImprovedNoise()

export const LIMITES = { x0: -450, x1: 450, z0: -220, z1: 430, passo: 2 }
export const NIVEL_CIDADE = 1.8
export const LARG_CALCADAO = 7
export const LARG_AVENIDA = 12
export const FIM_AVENIDA = LARG_CALCADAO + LARG_AVENIDA // medido a partir do fim da areia
export const RIO_MEIA_LARGURA = 12

export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const mix = (a, b, t) => a + (b - a) * t

// Perlin noise de Ken Perlin: aleatório, mas suave entre vizinhos.
export function ruido(x, z, semente = 0) {
  return perlin.noise(x, z, semente)
}

// Várias camadas de Perlin somadas (fractal): detalhe grande + detalhe pequeno.
export function fbm(x, z, oitavas = 4, semente = 0) {
  let soma = 0, amp = 1, freq = 1, norma = 0
  for (let i = 0; i < oitavas; i++) {
    soma += amp * perlin.noise(x * freq, z * freq, semente + i * 17.3)
    norma += amp
    amp *= 0.5
    freq *= 2
  }
  return soma / norma
}

// Peso de cada "cidade" num ponto x, com transição suave entre elas.
export function pesos(x) {
  const rio = 1 - smooth(-140, -100, x)
  const fortaleza = smooth(100, 140, x)
  return { rio, fortaleza, recife: Math.max(0, 1 - rio - fortaleza) }
}

export function bairro(x) {
  const p = pesos(x)
  if (p.rio > 0.5) return 'rio'
  if (p.fortaleza > 0.5) return 'fortaleza'
  return 'recife'
}

// Onde a areia encontra a água.
export function linhaCosta(x) {
  return (
    22 * Math.sin(x * 0.0075 + 0.5) +
    9 * Math.sin(x * 0.021 + 1.3) -
    45 * Math.exp(-(((x - 335) / 38) ** 2)) + // a ponta do farol
    18 * Math.exp(-(((x + 215) / 70) ** 2)) // a enseada do Rio
  )
}

export function larguraPraia(x) {
  const p = pesos(x)
  return p.rio * 36 + p.recife * 26 + p.fortaleza * 46
}

// Positivo em terra, negativo no mar.
export function distCosta(x, z) {
  return z - linhaCosta(x)
}

// Centro do rio do Recife ao longo de z.
export function rioX(z) {
  return 8 + 14 * Math.sin(z * 0.011 + 0.4) + 6 * Math.sin(z * 0.031)
}

export const MORROS = [
  { x: -250, z: 160, r: 85, h: 72 },
  { x: -165, z: 245, r: 70, h: 55 },
  { x: -350, z: 110, r: 62, h: 50 },
  { x: -305, z: 275, r: 95, h: 85 },
  { x: 88, z: 215, r: 55, h: 17, nome: 'olinda' },
]

export function alturaBruta(x, z) {
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  let h

  if (s < 0) {
    // fundo do mar: raso perto da praia, fundo longe
    const p = -s
    h = -Math.min(14, p * 0.12 + Math.pow(p, 1.5) * 0.004)
    h += fbm(x * 0.03, z * 0.03, 2, 5) * 0.4 * smooth(0, 20, p)
  } else if (s < bw) {
    // areia subindo do mar até o calçadão
    h = NIVEL_CIDADE * Math.pow(s / bw, 1.3) + fbm(x * 0.08, z * 0.08, 2, 9) * 0.08
  } else {
    // a cidade é plana perto da avenida; morros e dunas só começam depois
    const mascara = smooth(bw + FIM_AVENIDA + 6, bw + FIM_AVENIDA + 45, s)
    h = NIVEL_CIDADE + fbm(x * 0.04, z * 0.04, 3, 2) * 0.35 * mascara

    // morros: o ponto é deformado por ruído para não saírem redondos
    const wx = x + fbm(x * 0.01, z * 0.01, 2, 11) * 30
    const wz = z + fbm(x * 0.01, z * 0.01, 2, 23) * 30
    for (const m of MORROS) {
      const d2 = ((wx - m.x) ** 2 + (wz - m.z) ** 2) / (m.r * m.r)
      if (d2 < 6) h += m.h * Math.exp(-d2 * 1.6) * (1 + 0.28 * fbm(x * 0.03, z * 0.03, 3, 31)) * mascara
    }

    // dunas a leste
    const duna = smooth(290, 340, x)
    if (duna > 0) h += duna * (0.55 + 0.45 * fbm(x * 0.012, z * 0.022, 3, 41)) * 14 * smooth(bw + 10, bw + 60, s)

    // serra no fundo e nas pontas: verticalização que fecha o mapa
    h += smooth(300, 420, z) * (55 + 35 * fbm(x * 0.006, z * 0.006, 3, 51))
    h += smooth(390, 450, Math.abs(x)) * 45 * mascara
  }

  // o rio corta o Recife até o mar
  const pr = pesos(x).recife
  if (pr > 0 && s > -40) {
    const d = Math.abs(x - rioX(z))
    const k = (1 - smooth(RIO_MEIA_LARGURA * 0.7, RIO_MEIA_LARGURA * 1.35, d)) * pr
    h = mix(h, -2.4, k)
  }
  return h
}

// Densidade de grama (0 a 1). A grama do shader só nasce onde isto é alto.
export function densidadeGrama(x, z, h, inclinacao) {
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  if (s < bw + FIM_AVENIDA + 2 || h < 0.5) return 0
  const p = pesos(x)
  const manchas = fbm(x * 0.02, z * 0.02, 3, 61)
  let d = 0
  d += p.rio * mix(0.75, 1.0, smooth(-0.2, 0.3, manchas))
  d += p.recife * smooth(0.12, 0.3, manchas) // só nas praças
  d += p.fortaleza * 0.7 * smooth(-0.15, 0.25, manchas)
  d *= 1 - 0.75 * smooth(290, 340, x) // nas dunas, só um pouco de restinga
  d = Math.max(d, smooth(300, 340, z)) // a serra é toda verde
  d *= 1 - smooth(0.75, 1.15, inclinacao)
  return Math.min(1, Math.max(0, d))
}
