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

// olhos: um desenho por expressão (64 px de altura é o olho inteiro)
const OLHOS = {
  aberto: (g) => { // amendoado, pálpebra de cima marcada, pupila grande
    tremido(g, arco(64, 70, 34, 22, Math.PI * 1.08, Math.PI * 1.92), 14)
    g.beginPath(); g.ellipse(64, 66, 17, 21, 0, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#fff'; g.beginPath(); g.arc(59, 60, 4, 0, Math.PI * 2); g.fill()
  },
  fechado: (g) => tremido(g, arco(64, 52, 32, 16, Math.PI * 0.12, Math.PI * 0.88), 14),
  feliz: (g) => tremido(g, arco(64, 76, 30, 22, Math.PI * 1.12, Math.PI * 1.88), 16),
  susto: (g) => {
    tremido(g, arco(64, 64, 26, 28, 0, Math.PI * 2, 22), 12)
    g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill()
  },
  determinado: (g) => { // sobrancelha baixa por cima: correndo, empurrando
    tremido(g, [[30, 40], [64, 50], [98, 46]], 16)
    tremido(g, arco(64, 72, 30, 16, Math.PI * 1.1, Math.PI * 1.9), 12)
    g.beginPath(); g.ellipse(64, 70, 15, 16, 0, 0, Math.PI * 2); g.fill()
  },
}
const BOCAS = {
  neutra: (g) => tremido(g, [[38, 64], [64, 66], [90, 63]], 14),
  sorriso: (g) => tremido(g, arco(64, 50, 28, 22, Math.PI * 0.15, Math.PI * 0.85), 14),
  aberta: (g) => { g.beginPath(); g.ellipse(64, 64, 14, 18, 0, 0, Math.PI * 2); g.fill() }, // correndo, ofegante
  o: (g) => { tremido(g, arco(64, 64, 12, 14, 0, Math.PI * 2, 16), 12) },
  firme: (g) => tremido(g, [[42, 66], [64, 62], [86, 66]], 14),
}

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
export function criarRosto(cabeca, ancoras = {}) {
  const A = {
    olho: [0.046, 0.118, 0.12], boca: [0, 0.045, 0.116], tamOlho: 0.078, tamBoca: 0.085, curva: 0.4, ...ancoras,
  }
  const texOlhos = Object.fromEntries(Object.entries(OLHOS).map(([k, f]) => [k, tela(f)]))
  const texBocas = Object.fromEntries(Object.entries(BOCAS).map(([k, f]) => [k, tela(f)]))
  const olhos = [1, -1].map((s) => {
    const p = plano(texOlhos.aberto, A.tamOlho, A.tamOlho)
    p.position.set(A.olho[0] * s, A.olho[1], A.olho[2])
    p.rotation.y = s * A.curva // vira um pouco para o lado, seguindo a esfera
    p.scale.x = s // o olho direito é o esquerdo espelhado
    cabeca.add(p)
    return p
  })
  const boca = plano(texBocas.neutra, A.tamBoca, A.tamBoca)
  boca.position.set(...A.boca)
  boca.rotation.x = -0.25
  cabeca.add(boca)

  let piscar = 2 + rnd.proximo() * 3
  let fechado = 0
  let fixo = null // expressão pedida pela história, por um tempo
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
      for (const o of olhos) o.material.map = texOlhos[olho]
      boca.material.map = texBocas[b]
    },
    // para a história: expressar(olho, boca, segundos), por exemplo ('feliz', 'sorriso', 2)
    expressar(olho, b, segundos = 2) { fixo = { olho, boca: b, t: segundos } },
    expressoes: { olhos: Object.keys(OLHOS), bocas: Object.keys(BOCAS) },
  }
}
