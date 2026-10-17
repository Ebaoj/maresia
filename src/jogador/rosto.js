// Rosto desenhado (fase 4 do corpo): olhos e boca são desenhos 2D trocáveis presos à cabeça, como nos
// filmes do Aranhaverso, que desenham a expressão por cima do 3D. Barato e muito expressivo.
// O desenho é feito no canvas, com traço de nanquim levemente tremido; cada expressão é uma textura.
// Para outro modelo (o neto), basta passar as âncoras: onde ficam olhos e boca no espaço do osso Head.

import * as THREE from 'three'
import { luzFixa } from '../materiais.js'
import { criarAleatorio } from '../utils.js'

const TINTA = '#1a1033'
const rnd = criarAleatorio(1932)

function tela(desenhar, w = 128, h = 128) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = TINTA
  g.fillStyle = TINTA
  desenhar(g, w, h)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}
// traço tremido de leve, como pena
const tremido = (g, pontos, largura) => {
  g.lineWidth = largura
  g.beginPath()
  pontos.forEach(([x, y], i) => {
    const jx = x + (rnd.proximo() - 0.5) * 1.6
    const jy = y + (rnd.proximo() - 0.5) * 1.6
    if (i === 0) g.moveTo(jx, jy)
    else g.lineTo(jx, jy)
  })
  g.stroke()
}
const arco = (cx, cy, rx, ry, a0, a1, n = 14) => Array.from({ length: n + 1 }, (_, i) => {
  const a = a0 + ((a1 - a0) * i) / n
  return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]
})

// ---------- desenho ----------
// pincelada que afina nas pontas (sobrancelha, pálpebra): segmentos com largura variando
function pincel(g, pts, l0, l1, cor = TINTA) {
  g.strokeStyle = cor
  for (let i = 0; i < pts.length - 1; i++) {
    const t = i / (pts.length - 1)
    g.lineWidth = l0 + (l1 - l0) * Math.sin(Math.PI * Math.min(1, t * 1.15)) // grossa no meio, fina nas pontas
    g.beginPath(); g.moveTo(...pts[i]); g.lineTo(...pts[i + 1]); g.stroke()
  }
  g.strokeStyle = TINTA
}
const encher = (g, pts, cor) => { g.fillStyle = cor; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.fillStyle = TINTA }
const bola = (g, x, y, r, cor = TINTA) => { g.fillStyle = cor; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.fillStyle = TINTA }
// amêndoa do olho: pálpebra de cima e de baixo, aberta por "abre" (0 a 1)
const amendoa = (cx, cy, w, h, abre = 1) => [...arco(cx, cy, w, h * abre, Math.PI, Math.PI * 2, 18), ...arco(cx, cy, w, h * 0.55 * abre, 0, Math.PI, 18)]
const IRIS = '#3a2418' // castanho-escuro
const BRANCO = '#f4efe6'

// Cada estilo desenha, num quadro de 128 px, o olho com a sobrancelha (o direito é o esquerdo espelhado)
// e a boca, para as mesmas expressões. "escala" aumenta o plano em relação à âncora do modelo.
const ESTILOS = {
  // o primeiro: traço simples de nanquim
  atual: {
    escalaOlho: 1, escalaBoca: 1,
    olhos: {
      aberto: (g) => { tremido(g, arco(64, 70, 34, 22, Math.PI * 1.08, Math.PI * 1.92), 14); g.beginPath(); g.ellipse(64, 66, 17, 21, 0, 0, Math.PI * 2); g.fill(); bola(g, 59, 60, 4, '#fff') },
      fechado: (g) => tremido(g, arco(64, 52, 32, 16, Math.PI * 0.12, Math.PI * 0.88), 14),
      feliz: (g) => tremido(g, arco(64, 76, 30, 22, Math.PI * 1.12, Math.PI * 1.88), 16),
      susto: (g) => { tremido(g, arco(64, 64, 26, 28, 0, Math.PI * 2, 22), 12); bola(g, 64, 64, 6) },
      determinado: (g) => { tremido(g, [[30, 40], [64, 50], [98, 46]], 16); tremido(g, arco(64, 72, 30, 16, Math.PI * 1.1, Math.PI * 1.9), 12); g.beginPath(); g.ellipse(64, 70, 15, 16, 0, 0, Math.PI * 2); g.fill() },
    },
    bocas: {
      neutra: (g) => tremido(g, [[38, 64], [64, 66], [90, 63]], 14),
      sorriso: (g) => tremido(g, arco(64, 50, 28, 22, Math.PI * 0.15, Math.PI * 0.85), 14),
      aberta: (g) => { g.beginPath(); g.ellipse(64, 64, 14, 18, 0, 0, Math.PI * 2); g.fill() },
      o: (g) => tremido(g, arco(64, 64, 12, 14, 0, Math.PI * 2, 16), 12),
      firme: (g) => tremido(g, [[42, 66], [64, 62], [86, 66]], 14),
    },
  },
  // Aranhaverso (Miles): amêndoa com o branco à mostra, pálpebra de cima grossa que passa do canto
  // de fora, íris escura grande encostada na pálpebra, sobrancelha de pincel, risquinhos de nanquim
  // embaixo do olho
  aranhaverso: {
    escalaOlho: 1.9, escalaBoca: 1.3,
    olhos: (() => {
      const sobr = (g, y0, inclina, alta = 0) => pincel(g, [[30, y0 + 6 - alta], [48, y0 - 2 - alta], [70, y0 - 4 - alta + inclina * 0.5], [96, y0 + 2 - alta + inclina]], 4, 13)
      const risco = (g) => { tremido(g, [[50, 104], [60, 106]], 3); tremido(g, [[64, 107], [74, 107]], 3) }
      const olho = (g, abre, irisY = 70, irisR = 15) => {
        encher(g, amendoa(64, 74, 34, 22, abre), BRANCO)
        g.save(); g.beginPath(); amendoa(64, 74, 34, 22, abre).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.clip()
        bola(g, 66, irisY, irisR, IRIS); bola(g, 66, irisY, irisR * 0.45); bola(g, 61, irisY - 6, 3.5, '#fff')
        g.restore()
        pincel(g, [...arco(64, 74, 34, 22 * abre, Math.PI * 1.02, Math.PI * 1.98, 12), [104, 66 - 6 * abre]], 5, 11) // pálpebra de cima passando do canto
        tremido(g, arco(64, 74, 30, 12 * abre, Math.PI * 0.2, Math.PI * 0.8, 8), 3) // pálpebra de baixo, fina
      }
      return {
        aberto: (g) => { sobr(g, 36, 0); olho(g, 1); risco(g) },
        fechado: (g) => { sobr(g, 38, 2); pincel(g, arco(64, 70, 33, 9, Math.PI * 0.08, Math.PI * 0.92, 14), 5, 11); risco(g) },
        feliz: (g) => { sobr(g, 30, -4, 3); pincel(g, arco(64, 84, 32, 20, Math.PI * 1.1, Math.PI * 1.9, 14), 5, 12); risco(g) },
        susto: (g) => { sobr(g, 24, -6, 6); olho(g, 1.25, 74, 11); risco(g) },
        determinado: (g) => { sobr(g, 42, -12); olho(g, 0.6, 76, 14) },
      }
    })(),
    bocas: {
      neutra: (g) => { pincel(g, [[36, 62], [52, 60], [64, 61], [78, 60], [92, 63]], 3, 8); tremido(g, [[56, 76], [72, 76]], 4) },
      sorriso: (g) => { pincel(g, [[32, 54], ...arco(64, 50, 30, 18, Math.PI * 0.12, Math.PI * 0.88, 10), [96, 54]], 3, 9); tremido(g, [[54, 82], [74, 82]], 4) },
      aberta: (g) => { encher(g, arco(64, 66, 18, 16, 0, Math.PI * 2, 18), '#2a1414'); pincel(g, arco(64, 66, 20, 18, Math.PI * 1.1, Math.PI * 1.9, 10), 3, 8) },
      o: (g) => { encher(g, arco(64, 66, 10, 12, 0, Math.PI * 2, 14), '#2a1414'); tremido(g, arco(64, 66, 11, 13, 0, Math.PI * 2, 14), 5) },
      firme: (g) => pincel(g, [[40, 64], [64, 60], [88, 64]], 4, 10),
    },
  },
  // olhos grandes e redondos, íris grande com dois brilhos
  grande: {
    escalaOlho: 1.75, escalaBoca: 1.2,
    olhos: (() => {
      const sobr = (g, y, inc = 0) => tremido(g, [[36, y + 4], [64, y - 3 + inc], [92, y + 2 + inc * 2]], 7)
      const olho = (g, ry = 30, iris = 20) => {
        encher(g, arco(64, 74, 30, ry, 0, Math.PI * 2, 24), BRANCO)
        bola(g, 66, 76, iris, IRIS); bola(g, 66, 76, iris * 0.5); bola(g, 58, 66, 6, '#fff'); bola(g, 74, 86, 3, '#fff')
        tremido(g, arco(64, 74, 30, ry, Math.PI * 1.05, Math.PI * 1.95, 16), 9); tremido(g, arco(64, 74, 30, ry, Math.PI * 0.25, Math.PI * 0.75, 8), 4)
      }
      return {
        aberto: (g) => { sobr(g, 30); olho(g) },
        fechado: (g) => { sobr(g, 34); tremido(g, arco(64, 72, 30, 12, Math.PI * 0.1, Math.PI * 0.9, 14), 9) },
        feliz: (g) => { sobr(g, 26, -2); tremido(g, arco(64, 86, 30, 22, Math.PI * 1.1, Math.PI * 1.9, 14), 10) },
        susto: (g) => { sobr(g, 18, -4); olho(g, 34, 13) },
        determinado: (g) => { tremido(g, [[34, 34], [64, 46], [94, 44]], 9); olho(g, 18, 17) },
      }
    })(),
    bocas: {
      neutra: (g) => tremido(g, [[44, 64], [64, 66], [84, 63]], 7),
      sorriso: (g) => tremido(g, arco(64, 54, 26, 18, Math.PI * 0.15, Math.PI * 0.85, 12), 8),
      aberta: (g) => encher(g, arco(64, 64, 16, 18, 0, Math.PI * 2, 18), '#2a1414'),
      o: (g) => tremido(g, arco(64, 66, 10, 12, 0, Math.PI * 2, 14), 7),
      firme: (g) => tremido(g, [[46, 66], [64, 62], [82, 66]], 7),
    },
  },
  // Gato de Botas 2: olhos enormes e brilhantes, cílios marcados, quase sem branco
  gato: {
    escalaOlho: 2.0, escalaBoca: 1.15,
    olhos: (() => {
      const cilios = (g) => { tremido(g, [[30, 58], [22, 50]], 5); tremido(g, [[38, 50], [32, 42]], 5) }
      const olho = (g, ry = 34, iris = 28) => {
        encher(g, arco(64, 74, 32, ry, 0, Math.PI * 2, 24), BRANCO)
        bola(g, 64, 76, iris, '#4a2c1a'); bola(g, 64, 76, iris * 0.55, '#1a0f0a')
        bola(g, 54, 62, 9, '#fff'); bola(g, 76, 90, 4, '#fff')
        pincel(g, arco(64, 74, 32, ry, Math.PI * 1.0, Math.PI * 2.0, 16), 6, 13); cilios(g)
      }
      return {
        aberto: (g) => olho(g),
        fechado: (g) => { pincel(g, arco(64, 70, 32, 12, Math.PI * 0.08, Math.PI * 0.92, 14), 6, 13); cilios(g) },
        feliz: (g) => pincel(g, arco(64, 88, 32, 26, Math.PI * 1.1, Math.PI * 1.9, 14), 6, 14),
        susto: (g) => olho(g, 38, 18),
        determinado: (g) => { pincel(g, [[28, 36], [64, 50], [100, 48]], 6, 14); olho(g, 22, 22) },
      }
    })(),
    bocas: {
      neutra: (g) => tremido(g, [[46, 64], [64, 67], [82, 64]], 7),
      sorriso: (g) => { tremido(g, arco(54, 56, 12, 12, Math.PI * 0.1, Math.PI * 0.95, 8), 7); tremido(g, arco(74, 56, 12, 12, Math.PI * 0.05, Math.PI * 0.9, 8), 7) },
      aberta: (g) => encher(g, arco(64, 64, 14, 16, 0, Math.PI * 2, 18), '#2a1414'),
      o: (g) => tremido(g, arco(64, 66, 9, 11, 0, Math.PI * 2, 14), 7),
      firme: (g) => tremido(g, [[48, 66], [64, 63], [80, 66]], 7),
    },
  },
  // mínimo: olho de ponto e sobrancelha de traço, bem gráfico
  minimo: {
    escalaOlho: 1.5, escalaBoca: 1.2,
    olhos: {
      aberto: (g) => { tremido(g, [[44, 40], [64, 36], [84, 40]], 9); g.beginPath(); g.ellipse(64, 72, 11, 15, 0, 0, Math.PI * 2); g.fill() },
      fechado: (g) => { tremido(g, [[44, 42], [64, 38], [84, 42]], 9); tremido(g, [[46, 72], [64, 76], [82, 72]], 9) },
      feliz: (g) => { tremido(g, [[44, 34], [64, 30], [84, 34]], 9); tremido(g, arco(64, 80, 18, 12, Math.PI * 1.1, Math.PI * 1.9, 10), 10) },
      susto: (g) => { tremido(g, [[44, 26], [64, 22], [84, 26]], 9); tremido(g, arco(64, 70, 14, 16, 0, Math.PI * 2, 16), 7) },
      determinado: (g) => { tremido(g, [[40, 40], [64, 50], [88, 46]], 10); g.beginPath(); g.ellipse(64, 74, 10, 9, 0, 0, Math.PI * 2); g.fill() },
    },
    bocas: {
      neutra: (g) => tremido(g, [[46, 64], [82, 64]], 8),
      sorriso: (g) => tremido(g, arco(64, 54, 18, 14, Math.PI * 0.15, Math.PI * 0.85, 10), 9),
      aberta: (g) => { g.beginPath(); g.ellipse(64, 64, 11, 13, 0, 0, Math.PI * 2); g.fill() },
      o: (g) => tremido(g, arco(64, 64, 8, 10, 0, Math.PI * 2, 12), 7),
      firme: (g) => tremido(g, [[48, 66], [80, 66]], 9),
    },
  },
}
export const ESTILOS_ROSTO = Object.keys(ESTILOS)

function plano(tex, w, h) {
  const m = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.25, transparent: false, opacity: 0.5, blending: THREE.NoBlending, side: THREE.DoubleSide, depthWrite: true })
  luzFixa(m, 0.85)
  m.customProgramCacheKey = () => 'luz-fixa-rosto'
  m.polygonOffset = true
  m.polygonOffsetFactor = -2
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m)
  p.renderOrder = 2
  return p
}

// ancoras (espaço do osso Head): olhos [x, y, z] (o esquerdo; o direito é espelhado), boca [x, y, z],
// tamanho do olho e da boca em metros, e o quanto inclinar para acompanhar a curva da cabeça
export function criarRosto(cabeca, ancoras = {}, estiloInicial = 'atual') {
  const A = {
    olho: [0.046, 0.118, 0.12], boca: [0, 0.045, 0.116], tamOlho: 0.078, tamBoca: 0.085, curva: 0.4, ...ancoras,
  }
  const cache = {}
  const texturas = (nome) => {
    if (!cache[nome]) {
      const e = ESTILOS[nome] || ESTILOS.atual
      cache[nome] = {
        e,
        olhos: Object.fromEntries(Object.entries(e.olhos).map(([k, f]) => [k, tela(f)])),
        bocas: Object.fromEntries(Object.entries(e.bocas).map(([k, f]) => [k, tela(f)])),
      }
    }
    return cache[nome]
  }
  let T = texturas(estiloInicial)
  const olhos = [1, -1].map((s) => {
    const p = plano(T.olhos.aberto, A.tamOlho, A.tamOlho)
    p.position.set(A.olho[0] * s, A.olho[1], A.olho[2])
    p.rotation.y = s * A.curva // vira um pouco para o lado, seguindo a esfera
    p.userData.lado = s
    cabeca.add(p)
    return p
  })
  const boca = plano(T.bocas.neutra, A.tamBoca, A.tamBoca)
  boca.position.set(...A.boca)
  boca.rotation.x = -0.25
  cabeca.add(boca)
  const aplicarEscala = () => {
    // o desenho cresce em volta da âncora; o olho sobe um pouco para a sobrancelha caber na testa
    for (const o of olhos) o.scale.set(o.userData.lado * T.e.escalaOlho, T.e.escalaOlho, 1)
    boca.scale.setScalar(T.e.escalaBoca)
  }
  aplicarEscala()

  let piscar = 2 + rnd.proximo() * 3
  let fechado = 0
  let fixo = null // expressão pedida pela história, por um tempo
  let atual = { olho: 'aberto', boca: 'neutra' }
  const mostrar = () => {
    for (const o of olhos) o.material.map = T.olhos[atual.olho] || T.olhos.aberto
    boca.material.map = T.bocas[atual.boca] || T.bocas.neutra
  }
  return {
    // estado do corpo -> expressão; chamado a cada pose
    atualizar(dt, s) {
      piscar -= dt
      if (piscar <= 0) { fechado = 0.13; piscar = 2 + rnd.proximo() * 4 }
      fechado -= dt
      let olho = 'aberto'
      let b = 'neutra'
      if (s.noAr) { olho = 'susto'; b = 'o' } else if (s.vel > 3.6) { olho = 'determinado'; b = 'aberta' } else if (s.vel > 2.2) { olho = 'determinado'; b = 'firme' } else if (s.nadando) { b = 'firme' }
      if (fixo) { fixo.t -= dt; if (fixo.t <= 0) fixo = null; else { olho = fixo.olho || olho; b = fixo.boca || b } }
      if (fechado > 0 && olho !== 'susto') olho = 'fechado'
      atual = { olho, boca: b }
      mostrar()
    },
    // para a história: expressar(olho, boca, segundos), por exemplo ('feliz', 'sorriso', 2)
    expressar(olho, b, segundos = 2) { fixo = { olho, boca: b, t: segundos } },
    // troca o estilo do desenho na hora (painel), sem recarregar
    estilo(nome) { T = texturas(nome); aplicarEscala(); mostrar() },
    expressoes: { olhos: Object.keys(ESTILOS.atual.olhos), bocas: Object.keys(ESTILOS.atual.bocas) },
  }
}
