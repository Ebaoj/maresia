// O desenho da cidade: Fortaleza em 1932 (só Fortaleza; docs/mapa-1932.md).
// Os dados (costa, rios, lagoas, lugares, lotes de 1932) moram em fortaleza1932.js, em geografia
// real comprimida. Este arquivo responde às mesmas perguntas de sempre para o resto do jogo:
// onde fica o mar, a praia, o rio, qual a altura do chão e onde nasce a grama.
// O mar fica ao norte, em z negativo. x cresce para leste.

import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import {
  costaZ, larguraPraiaX, rioCearaX, distPolilinha, pajeuJogo, lagoasJogo, lugaresJogo,
  nomeBairro, trechosJogo, VILAS, LIMITES,
} from './fortaleza1932.js'
import { pesoCidade1932, naCidade1932, eraRua1932 } from './ocupacao1932.js'
import { pesoCampoUrubu } from './mapa1932.js'
import { alturaComPasseio } from './passeio-terreno.js'

const perlin = new ImprovedNoise()

export { LIMITES }
export const NIVEL_CIDADE = 1.8
// em 1932 não havia avenida na beira-mar: só uma rua de areia batida entre a praia e as casas
export const LARG_CALCADAO = 4
export const LARG_AVENIDA = 6
export const FIM_AVENIDA = LARG_CALCADAO + LARG_AVENIDA // medido a partir do fim da areia
export const RIO_MEIA_LARGURA = 14

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

// Antes o mapa misturava três cidades; agora é só Fortaleza. Mantido para quem ainda pergunta.
export function pesos() {
  return { rio: 0, recife: 0, fortaleza: 1 }
}

// nome do bairro de 1932 mais próximo (para a legenda na tela)
export function bairro(x, z = 0) {
  return nomeBairro(x, z)
}

// Onde a areia encontra a água (com uma ondulação pequena: praia de verdade não é régua).
export function linhaCosta(x) {
  return costaZ(x) + 1.6 * Math.sin(x * 0.045) + 0.9 * Math.sin(x * 0.13 + 1.1)
}

export function larguraPraia(x) {
  return larguraPraiaX(x)
}

// Positivo em terra, negativo no mar.
export function distCosta(x, z) {
  return z - linhaCosta(x)
}

// Eixo do rio Ceará ao longo de z (o rio do jogo agora é ele, a oeste, com mangue).
export function rioX(z) {
  return rioCearaX(z)
}

// Os morros do Rio saíram. Fortaleza é plana: um tabuleiro baixo, dunas a leste e o outeiro da Prainha.
export const MORROS = []

const [semX, semZ] = lugaresJogo.seminario
const [pajX0, pajX1, pajZ0, pajZ1] = (() => {
  const xs = pajeuJogo.map((p) => p[0])
  const zs = pajeuJogo.map((p) => p[1])
  return [Math.min(...xs) - 40, Math.max(...xs) + 40, Math.min(...zs) - 40, Math.max(...zs) + 40]
})()
const [, aldeotaX] = [0, lugaresJogo.seminario[0] + 60] // as dunas começam a leste da Prainha

// o chão com os patamares do Passeio Público (passeio-terreno.js): o resto do mapa é o relevo de sempre
export function alturaBruta(x, z) {
  return alturaComPasseio(x, z, alturaNatural)
}

function alturaNatural(x, z) {
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  let h

  if (s < 0) {
    // fundo do mar: raso perto da praia, fundo longe
    const p = -s
    h = -Math.min(14, p * 0.12 + Math.pow(p, 1.5) * 0.004)
    h += fbm(x * 0.03, z * 0.03, 2, 5) * 0.4 * smooth(0, 20, p)
    // linha de recifes ao largo do centro (a que fechava a enseada de 1881)
    const recife = Math.exp(-(((p - 34) / 6) ** 2)) * smooth(-260, -200, x) * (1 - smooth(60, 140, x))
    if (recife > 0.01) h = mix(h, -0.7 + fbm(x * 0.2, z * 0.2, 2, 8) * 0.5, recife * 0.85)
  } else if (s < bw) {
    // areia subindo do mar até a rua da praia
    h = NIVEL_CIDADE * Math.pow(s / bw, 1.3) + fbm(x * 0.08, z * 0.08, 2, 9) * 0.08
  } else {
    // tabuleiro: sobe devagar para dentro, alguns metros acima da praia
    const dentro = smooth(bw + FIM_AVENIDA + 4, bw + FIM_AVENIDA + 140, s)
    h = NIVEL_CIDADE + dentro * (4.5 + fbm(x * 0.006, z * 0.006, 2, 2) * 2.5) + fbm(x * 0.03, z * 0.03, 3, 2) * 0.35 * dentro

    // outeiro da Prainha (o morro do Seminário)
    h += 6 * Math.exp(-(((x - semX) ** 2 + (z - semZ) ** 2) / (70 * 70)))

    // dunas a leste (Aldeota, Meireles, Mucuripe) e um pouco a oeste da Barra
    const leste = smooth(aldeotaX, aldeotaX + 120, x)
    const oeste = 1 - smooth(-1000, -900, x)
    const praiaLivre = smooth(bw + 6, bw + 50, s) // a primeira faixa atrás da praia fica baixa
    const pesoDuna = (leste * 16 + oeste * 5) * praiaLivre
    if (pesoDuna > 0) {
      const crista = Math.max(0, fbm(x * 0.009, z * 0.016, 3, 41)) * 1.6 + Math.max(0, fbm(x * 0.03, z * 0.05, 2, 43)) * 0.4
      h += pesoDuna * crista
    }

    // riacho Pajeú: um vale raso e verde cortando o lado leste do centro
    if (x > pajX0 && x < pajX1 && z > pajZ0 && z < pajZ1) {
      const dp = distPolilinha(x, z, pajeuJogo)
      h -= 3.2 * (1 - smooth(3, 22, dp))
    }

    // lagoas: bacias que descem abaixo da água
    for (const l of lagoasJogo) {
      const q0 = Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz)
      if (q0 > 2.6) continue // longe da lagoa: nem calcula o ruído da margem
      const q = q0 * (1 + 0.15 * fbm(x * 0.05, z * 0.05, 2, 13))
      if (q < 2.2) h = mix(h, -1.6 * (1 - q) + 0.3, 1 - smooth(0.6, 2.2, q))
    }
  }

  // o rio Ceará corta da foz até o sul, com as margens baixas (mangue)
  if (s > -60) {
    const d = Math.abs(x - rioX(z))
    const varzea = (1 - smooth(RIO_MEIA_LARGURA * 1.2, RIO_MEIA_LARGURA * 5, d)) * smooth(-60, 0, s)
    h = mix(h, Math.min(h, 0.6), varzea)
    const k = 1 - smooth(RIO_MEIA_LARGURA * 0.7, RIO_MEIA_LARGURA * 1.3, d)
    h = mix(h, -2.6, k)
  }
  return h
}

// Densidade de grama (0 a 1). Em 1932 o chão da cidade era areia; a grama fica nos terrenos
// vazios, nas margens do rio e do Pajeú e em volta das lagoas. Nas dunas, só restinga rala.
export function densidadeGrama(x, z, h, inclinacao) {
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  if (s < bw + FIM_AVENIDA + 2 || h < 0.5) return 0
  // onde havia cidade em 1932 não nasce grama: rua de pedra ou de areia batida (fotos de 1925 a 1936)
  const cidade = smooth(0.05, 0.35, pesoCidade1932(x, z))
  if (cidade > 0.98) return 0
  const manchas = fbm(x * 0.02, z * 0.02, 3, 61)
  let d = 0.75 * smooth(-0.15, 0.25, manchas) * (1 - cidade)
  // várzea do rio e margens das lagoas: verde
  const dr = Math.abs(x - rioX(z))
  d = Math.max(d, (1 - smooth(RIO_MEIA_LARGURA * 1.5, RIO_MEIA_LARGURA * 6, dr)) * 0.9)
  for (const l of lagoasJogo) {
    const q = Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz)
    d = Math.max(d, (1 - smooth(1.1, 2.4, q)) * 0.85)
  }
  // vilas de jangadeiros: chão de areia pisada com capim baixo e ralo (Platt 1935, ids 2987 e 3019)
  if (s < bw + 90) {
    for (const v of VILAS) {
      const [a, b] = trechosJogo[v]
      if (x > a - 20 && x < b + 20) { d *= 0.3; break }
    }
  }
  // dunas altas: só restinga
  d *= 1 - 0.7 * smooth(5, 10, h - 6)
  d *= 1 - smooth(0.75, 1.15, inclinacao)
  // Campo do Urubu na seca de 1932: terra batida e rachada, sem grama (só touceira seca, espalhada em chao-solto.js)
  d *= 1 - pesoCampoUrubu(x, z)
  return Math.min(1, Math.max(0, d))
}

export { pesoCidade1932, naCidade1932, eraRua1932 }
