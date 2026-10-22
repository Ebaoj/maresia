// Textura dos cartões de folha (árvores pintadas, 21/10/2026): um atlas 2 x 2 desenhado no canvas, sem baixar nada.
// Cada quadrante é um ramo de folhas visto de frente, com alfa (o que não é folha some no alphaTest). A cor é um cinza
// perto de 1 que só tira valor: quem pinta é a cor por vértice da copa (luz em cima, sombra fria embaixo).
//   0 miúda: folha pequena e elíptica, muito junta (oiti, fícus, mangue)
//   1 larga: folha grande e arredondada na ponta (cajueiro, guajiru)
//   2 média: folha média, ponta fina (murici)
//   3 leque: o leque da carnaúba aberto, com as pontas rasgadas em tiras (u = ângulo, v = raio)
// O desenho tem semente: sai igual toda vez.

import { criarAleatorio } from '../utils.js'

export const QUADRANTE = { miuda: 0, larga: 1, media: 2, leque: 3 }
// canto (u0, v0) de cada quadrante no atlas, em uv (o canvas vira de cabeça para baixo na textura: v = 1 no alto)
export function cantoQuadrante(q) { return [(q % 2) * 0.5, q < 2 ? 0.5 : 0] }

const FORMAS = {
  miuda: { n: 30, comp: [34, 52], larg: [0.34, 0.42], ponta: 0.25, abre: 2.1 },
  larga: { n: 13, comp: [70, 96], larg: [0.5, 0.6], ponta: 0.85, abre: 2.3 },
  media: { n: 20, comp: [52, 70], larg: [0.3, 0.36], ponta: 0.15, abre: 2.2 },
}

// uma folha: base em (0, 0), ponta em (0, -comp); "ponta" 0 = aguda, 1 = arredondada
function folha(ctx, comp, larg, ponta, tom) {
  const w = comp * larg
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.bezierCurveTo(w * 0.9, -comp * 0.18, w * (0.55 + ponta * 0.45), -comp * (0.78 + ponta * 0.12), 0, -comp)
  ctx.bezierCurveTo(-w * (0.55 + ponta * 0.45), -comp * (0.78 + ponta * 0.12), -w * 0.9, -comp * 0.18, 0, 0)
  const g = ctx.createLinearGradient(0, 0, 0, -comp)
  const v = Math.round(255 * tom)
  const vb = Math.round(255 * tom * 0.8)
  g.addColorStop(0, `rgb(${vb},${vb},${vb})`)
  g.addColorStop(1, `rgb(${v},${v},${v})`)
  ctx.fillStyle = g
  ctx.fill()
  // nervura e um dos lados mais escuro: a folha dobra na nervura e lê como volume pequeno
  ctx.save()
  ctx.clip()
  ctx.fillStyle = 'rgba(0,0,0,0.13)'
  ctx.fillRect(0, -comp, w, comp)
  ctx.restore()
  ctx.strokeStyle = 'rgba(0,0,0,0.28)'
  ctx.lineWidth = Math.max(1.2, comp * 0.035)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -comp * 0.9)
  ctx.stroke()
}

// ramo: folhas saindo de um galhinho curvo, abertas em leque para cima, as de trás mais escuras
function ramo(ctx, x0, y0, tam, f, rnd) {
  ctx.save()
  ctx.translate(x0, y0)
  const s = tam / 256
  ctx.scale(s, s)
  // galhinho
  ctx.strokeStyle = 'rgb(120,105,90)'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(0, 118)
  ctx.quadraticCurveTo(rnd.entre(-20, 20), 30, rnd.entre(-12, 12), -50)
  ctx.stroke()
  const lista = []
  for (let i = 0; i < f.n; i++) {
    const t = i / (f.n - 1)
    // ao longo do galhinho, do pé até a ponta; o ângulo abre para fora e para cima
    const y = 110 - t * 170 + rnd.entre(-8, 8)
    const x = rnd.entre(-10, 10)
    const lado = i % 2 ? 1 : -1
    const ang = lado * (f.abre * (1 - t * 0.75)) * rnd.entre(0.55, 1.0) * 0.5 + rnd.entre(-0.2, 0.2)
    lista.push({ x, y, ang, comp: rnd.entre(f.comp[0], f.comp[1]) * (1 - t * 0.25), larg: rnd.entre(f.larg[0], f.larg[1]), fundo: rnd.chance(0.4) })
  }
  // primeiro as de trás (mais escuras), depois as da frente
  for (const fundo of [true, false]) {
    for (const l of lista) {
      if (l.fundo !== fundo) continue
      ctx.save()
      ctx.translate(l.x, l.y)
      ctx.rotate(l.ang)
      folha(ctx, l.comp, l.larg, f.ponta, fundo ? rnd.entre(0.74, 0.84) : rnd.entre(0.88, 1.0))
      ctx.restore()
    }
  }
  ctx.restore()
}

// o leque da carnaúba: inteiro perto do pecíolo, rasgado em tiras pontudas na borda (as tiras caem um pouco)
function leque(ctx, x0, y0, L, rnd) {
  const N = 16
  for (let i = 0; i < N; i++) {
    const a = x0 + (i / N) * L
    const b = x0 + ((i + 1) / N) * L
    const meio = (a + b) / 2
    const corte = rnd.entre(0.42, 0.6) // onde a tira se solta da vizinha (fração do raio)
    const yCorte = y0 + L - corte * L
    const tom = Math.round(255 * rnd.entre(0.86, 1.0))
    ctx.fillStyle = `rgb(${tom},${tom},${tom})`
    ctx.beginPath()
    ctx.moveTo(a, y0 + L)
    ctx.lineTo(a, yCorte)
    ctx.lineTo(meio + rnd.entre(-1.5, 1.5), y0 + 2)
    ctx.lineTo(b, yCorte)
    ctx.lineTo(b, y0 + L)
    ctx.closePath()
    ctx.fill()
    // a prega no meio da tira
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(meio, y0 + L)
    ctx.lineTo(meio, y0 + 6)
    ctx.stroke()
  }
}

// desenha o atlas inteiro num contexto 2D de lado T (512 é o padrão)
export function desenharAtlasFolhas(ctx, T = 512) {
  const rnd = criarAleatorio(1932)
  ctx.clearRect(0, 0, T, T)
  const h = T / 2
  const margem = T * 0.012
  const quads = [['miuda', 0, 0], ['larga', h, 0], ['media', 0, h]]
  for (const [nome, x, y] of quads) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(x + margem, y + margem, h - 2 * margem, h - 2 * margem)
    ctx.clip()
    // dois ramos cruzados: o cartão fica cheio sem virar retângulo
    ramo(ctx, x + h * 0.5, y + h * 0.58, h * 0.92, FORMAS[nome], rnd)
    ctx.save()
    ctx.translate(x + h * 0.5, y + h * 0.5)
    ctx.rotate(rnd.entre(2.4, 3.6))
    ramo(ctx, 0, h * 0.06, h * 0.78, FORMAS[nome], rnd)
    ctx.restore()
    ctx.restore()
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(h + margem, h + margem, h - 2 * margem, h - 2 * margem)
  ctx.clip()
  leque(ctx, h + margem, h + margem, h - 2 * margem, rnd)
  ctx.restore()
}
