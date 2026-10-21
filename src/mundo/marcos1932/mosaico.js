// O piso de pedra portuguesa da Praça do Ferreira reformada (1932-33): "faixas de mosaico no piso" (FATO,
// [DN-Ferreira-reforma]). O desenho é HIPÓTESE, na escala da calçada portuguesa de verdade:
//   - o fundo: pedra miúda irregular (5 a 8 cm) creme-ocre, com a junta de areia aparecendo de perto
//   - as faixas: 0,8 m de largura, dois fios de pedra escura nas bordas e losangos de 36 cm no meio, em pedra
//     cinza-carvão (não preto puro), nas bordas do eixo comprido, da travessa, em volta da coluna e dos canteiros
// Tudo é textura repetida em metros (uma pedra de 6 cm precisa de ~250 px por metro: um mapa único da praça
// inteira passaria de 60 MB), em duas malhas rentes ao chão: o fundo e as faixas.

import * as THREE from 'three'
import { CENTRO, dentroDaPraca } from '../praca1932.js'
import { alturaTerreno } from '../terreno.js'
import { texturaCanvas, toon } from '../../materiais.js'
import { criarAleatorio } from '../../utils.js'
import { naGrade } from './grade.js'

const TAM_FUNDO = 2 // metros por repetição do fundo
const FAIXA = { larg: 0.8, passo: 1.44 } // a faixa e o comprimento da repetição (quatro losangos de 36 cm)

// as pedras: células de uma grade torta, cada uma um polígono de tom próprio, com a junta clara entre elas
function pedras(ctx, x0, y0, w, h, pxPorM, cores, rnd, junta) {
  const tam = 0.065 * pxPorM
  ctx.fillStyle = junta
  ctx.fillRect(x0, y0, w, h)
  for (let y = y0 - tam; y < y0 + h + tam; y += tam * 0.9) {
    const des = rnd.entre(0, tam)
    for (let x = x0 - tam + des; x < x0 + w + tam; x += tam * rnd.entre(0.8, 1.15)) {
      const c = cores[Math.floor(rnd.entre(0, cores.length))]
      ctx.fillStyle = c
      ctx.beginPath()
      const n = 5 + Math.floor(rnd.entre(0, 3))
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rnd.entre(-0.3, 0.3)
        const r = tam * rnd.entre(0.36, 0.5)
        const px = x + tam / 2 + Math.cos(a) * r
        const py = y + tam / 2 + Math.sin(a) * r * 0.9
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.fill()
    }
  }
}

// tons a partir de uma cor: mais claro, mais escuro, um pouco mais quente
function tons(hex, n = 6, varia = 0.12) {
  const c = new THREE.Color(hex)
  const rnd = criarAleatorio(41)
  const lista = []
  for (let i = 0; i < n; i++) {
    const k = 1 + rnd.entre(-varia, varia)
    lista.push(`#${new THREE.Color(Math.min(1, c.r * k * 1.02), Math.min(1, c.g * k), Math.min(1, c.b * k * 0.97)).getHexString()}`)
  }
  return lista
}

function texturaFundo(cfg) {
  const PX = 512 / TAM_FUNDO
  const tex = texturaCanvas(512, 512, (ctx) => {
    pedras(ctx, 0, 0, 512, 512, PX, tons(cfg.marcos.corMosaicoClaro), criarAleatorio(1933), '#9c8a6c')
  })
  return tex
}

// a faixa: largura no eixo x da textura (0..1 = a largura), comprimento no y (0..1 = um passo)
function texturaFaixa(cfg) {
  const PX = 320 / FAIXA.larg
  const W = 320
  const H = Math.round(FAIXA.passo * PX)
  return texturaCanvas(W, H, (ctx) => {
    const rnd = criarAleatorio(1934)
    pedras(ctx, 0, 0, W, H, PX, tons(cfg.marcos.corMosaicoClaro), rnd, '#9c8a6c')
    // o escuro vai por máscara: desenha o desenho em preto num canvas de recorte e enche de pedra escura
    const m = document.createElement('canvas')
    m.width = W
    m.height = H
    const mc = m.getContext('2d')
    mc.fillStyle = '#000'
    const fio = 0.07 * PX
    mc.fillRect(0, 0, fio, H)
    mc.fillRect(W - fio, 0, fio, H)
    const l = 0.36 * PX // o losango: 36 cm de comprido, 24 cm de largo
    const la = 0.24 * PX
    for (let k = 0; k < 4; k++) {
      const cy = (k + 0.5) * (H / 4)
      mc.beginPath()
      mc.moveTo(W / 2, cy - l / 2)
      mc.lineTo(W / 2 + la / 2, cy)
      mc.lineTo(W / 2, cy + l / 2)
      mc.lineTo(W / 2 - la / 2, cy)
      mc.fill()
    }
    const e = document.createElement('canvas')
    e.width = W
    e.height = H
    const ec = e.getContext('2d')
    pedras(ec, 0, 0, W, H, PX, tons(cfg.marcos.corMosaicoEscuro, 6, 0.18), rnd, '#6f6658')
    ec.globalCompositeOperation = 'destination-in'
    ec.drawImage(m, 0, 0)
    ctx.drawImage(e, 0, 0)
  })
}

// faixa ao longo de uma polilinha (u, v), rente ao chão, cortada fora do contorno da praça
function malhaFaixa(pts, larg, y0, fechada = false) {
  const pos = []
  const uv = []
  const ponto = (u, v) => {
    const [x, z] = naGrade(CENTRO, u, v)
    return [x - CENTRO[0], alturaTerreno(x, z) + y0, z - CENTRO[1]]
  }
  const lista = fechada ? [...pts, pts[0]] : pts
  let dist = 0
  for (let i = 0; i < lista.length - 1; i++) {
    const [a, b] = [lista[i], lista[i + 1]]
    const L = Math.hypot(b[0] - a[0], b[1] - a[1])
    const n = Math.max(1, Math.ceil(L / 0.8))
    const nx = -(b[1] - a[1]) / L
    const nz = (b[0] - a[0]) / L
    for (let k = 0; k < n; k++) {
      const t0 = k / n
      const t1 = (k + 1) / n
      const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0]
      const p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]
      const d0 = dist + L * t0
      const d1 = dist + L * t1
      const meio = naGrade(CENTRO, (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
      if (!dentroDaPraca(...meio)) continue
      const h = larg / 2
      const q = [
        ponto(p0[0] - nx * h, p0[1] - nz * h), ponto(p0[0] + nx * h, p0[1] + nz * h),
        ponto(p1[0] - nx * h, p1[1] - nz * h), ponto(p1[0] + nx * h, p1[1] + nz * h),
      ]
      const t = [[0, d0], [1, d0], [0, d1], [1, d1]].map(([s, d]) => [s, d / FAIXA.passo])
      for (const i3 of [0, 1, 2, 2, 1, 3]) { pos.push(...q[i3]); uv.push(...t[i3]) }
    }
    dist += L
  }
  return { pos, uv }
}

function malha(pos, uv, mat, nome) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat)
  m.position.set(CENTRO[0], 0, CENTRO[1])
  m.receiveShadow = true
  m.castShadow = false
  m.name = nome
  return m
}

function materialPiso(tex, desloca) {
  const mat = toon('#ffffff', { semCache: true })
  mat.map = tex
  mat.polygonOffset = true
  mat.polygonOffsetFactor = desloca
  mat.polygonOffsetUnits = desloca
  return mat
}

// limites: { U0, U1, V0, V1, RODA, EIXO }; plano: os canteiros
export function criarMosaico(cena, cfg, plano, { U0, U1, V0, V1, RODA, EIXO }) {
  // o fundo: malha de meio metro dentro do contorno, com a pedra miúda presa ao mundo
  const pos = []
  const uv = []
  const P = 0.5
  for (let u = U0; u < U1; u += P) {
    for (let v = V0; v < V1; v += P) {
      if (!dentroDaPraca(...naGrade(CENTRO, u + P / 2, v + P / 2))) continue
      for (const [a, b] of [[0, 0], [0, P], [P, 0], [P, 0], [0, P], [P, P]]) {
        const [x, z] = naGrade(CENTRO, u + a, v + b)
        pos.push(x - CENTRO[0], alturaTerreno(x, z) + 0.035, z - CENTRO[1])
        uv.push((u + a) / TAM_FUNDO, (v + b) / TAM_FUNDO)
      }
    }
  }
  const fundo = malha(pos, uv, materialPiso(texturaFundo(cfg), -2), 'praca-mosaico')
  cena.add(fundo)

  // as faixas
  const tf = texturaFaixa(cfg)
  tf.wrapS = THREE.ClampToEdgeWrapping
  const fp = []
  const fu = []
  const somar = (r) => { fp.push(...r.pos); fu.push(...r.uv) }
  const L = FAIXA.larg
  for (const s of [-1, 1]) {
    somar(malhaFaixa([[s * (EIXO - 0.6), V0], [s * (EIXO - 0.6), -RODA - 0.8]], L, 0.045))
    somar(malhaFaixa([[s * (EIXO - 0.6), RODA + 0.8], [s * (EIXO - 0.6), V1]], L, 0.045))
    somar(malhaFaixa([[U0, s * 3.8], [-RODA - 0.8, s * 3.8]], L, 0.045))
    somar(malhaFaixa([[RODA + 0.8, s * 3.8], [U1, s * 3.8]], L, 0.045))
  }
  // as duas rodas em volta da coluna
  for (const r of [RODA - 0.5, 4.2]) {
    const n = Math.round((Math.PI * 2 * r) / 0.7)
    somar(malhaFaixa(Array.from({ length: n }, (_, k) => [Math.cos((k / n) * Math.PI * 2) * r, Math.sin((k / n) * Math.PI * 2) * r]), L, 0.047, true))
  }
  // o friso em volta de cada canteiro
  for (const c of plano.canteiros) {
    const a = c.hu + 0.75
    const b = c.hv + 0.75
    somar(malhaFaixa([[c.u - a, c.v - b], [c.u + a, c.v - b], [c.u + a, c.v + b], [c.u - a, c.v + b]], 0.6, 0.046, true))
  }
  const faixas = malha(fp, fu, materialPiso(tf, -4), 'praca-mosaico-faixas')
  cena.add(faixas)
  return [fundo, faixas]
}
