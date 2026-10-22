// A cerca do Campo do Urubu e a linha do trem que passa por fora (geometria no lugar do mundo, seguindo o chão).
//
// FATO: o campo era cercado e vigiado; ficava isolado do resto da cidade pela linha do trem, perto das
// oficinas da RVC (dossiê, seção 23). O sobrevivente fala em "terra cercada com arame" e na "porteira".
// O conceito aprovado (3-campo-urubu.png) mostra arame farpado em mourões de madeira.
// HIPÓTESE: mourão a cada 3 m, quatro fios; a linha a ~22 m da cerca, de bitola métrica, com um desvio e uma
// plataforma de terra batida onde as famílias desciam; postes de telégrafo ao longo da linha.
//
// Tudo sai em peças { geo, x, z } já no lugar do mundo, para o urubu1932.js juntar numa malha por bloco.

import * as THREE from 'three'
import { colorir } from './cenografia.js'
import { alturaTerreno } from './terreno.js'
import { adicionarCaixa } from './colisao.js'

const MOURAO = '#6e5a44'
const ARAME = '#6f6b63'
const DORMENTE = '#5e4c3c'
const TRILHO = '#4f4a45'
const LASTRO = '#8f8679'

// uma caixa de comprimento `comp` entre dois pontos do mundo (a, b), no meio deles, girada no rumo a->b
function entre (a, b, alt, larg, cor) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const comp = Math.hypot(dx, dy, dz)
  const g = new THREE.BoxGeometry(larg, alt, comp)
  const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), new THREE.Vector3(dx, dy, dz), new THREE.Vector3(0, 1, 0))
  g.applyMatrix4(m)
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  return colorir(g, cor)
}

// a cerca: o polígono do mapa; no lado do portão, o vão da porteira. farpas: só onde o olho chega (perto do núcleo)
export function pecasCerca (planta, { altura = 1.8, perto = () => true } = {}) {
  const pecas = []
  const { poligono, lado, portao } = planta.cerca
  const fios = [0.32, 0.72, 1.12, altura - 0.25]
  for (let i = 0; i < poligono.length; i++) {
    const [x0, z0] = poligono[i]
    const [x1, z1] = poligono[(i + 1) % poligono.length]
    const comp = Math.hypot(x1 - x0, z1 - z0)
    const n = Math.max(2, Math.round(comp / 3))
    const ehPortao = (i === lado[0] && (i + 1) % poligono.length === lado[1]) || (i === lado[1] && (i + 1) % poligono.length === lado[0])
    // o vão: em t (0 a 1 no lado), em volta do portão
    let vao = [2, 2]
    if (ehPortao) {
      const tp = Math.hypot(portao.x - x0, portao.z - z0) / comp
      const meia = (portao.largura / 2 + 0.15) / comp
      vao = [tp - meia, tp + meia]
    }
    const ponto = (t) => { const x = x0 + (x1 - x0) * t; const z = z0 + (z1 - z0) * t; return { x, z, y: alturaTerreno(x, z) } }
    const ts = []
    for (let k = 0; k <= n; k++) {
      const t = k / n
      if (t > vao[0] && t < vao[1]) continue
      ts.push(t)
    }
    if (ehPortao) ts.push(vao[0], vao[1])
    ts.sort((a, b) => a - b)
    for (const t of ts) {
      const p = ponto(t)
      pecas.push({ geo: colorir(new THREE.BoxGeometry(0.14, altura + 0.6, 0.14).rotateY(i * 0.7 + t * 9).translate(p.x, p.y + (altura + 0.6) / 2 - 0.5, p.z), MOURAO), x: p.x, z: p.z })
    }
    for (let k = 0; k < ts.length - 1; k++) {
      const ta = ts[k]
      const tb = ts[k + 1]
      if (ta >= vao[0] - 1e-6 && tb <= vao[1] + 1e-6) continue
      const a = ponto(ta)
      const b = ponto(tb)
      for (const [j, h] of fios.entries()) {
        // o fio cede um pouco no meio do vão (de mourão a mourão)
        const meio = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, y: (a.y + b.y) / 2 + h - 0.03 - j * 0.005 }
        const pa = { ...a, y: a.y + h }
        const pb = { ...b, y: b.y + h }
        pecas.push({ geo: entre(pa, meio, 0.02, 0.02, ARAME), x: meio.x, z: meio.z })
        pecas.push({ geo: entre(meio, pb, 0.02, 0.02, ARAME), x: meio.x, z: meio.z })
        if (!perto(meio.x, meio.z)) continue
        // as farpas: um X pequeno a cada 0,45 m
        const passos = Math.floor(Math.hypot(b.x - a.x, b.z - a.z) / 0.45)
        for (let f = 1; f < passos; f++) {
          const s = f / passos
          const q = s < 0.5 ? s * 2 : (s - 0.5) * 2
          const p0 = s < 0.5 ? pa : meio
          const p1 = s < 0.5 ? meio : pb
          const fx = p0.x + (p1.x - p0.x) * q
          const fy = p0.y + (p1.y - p0.y) * q
          const fz = p0.z + (p1.z - p0.z) * q
          const g = new THREE.BoxGeometry(0.012, 0.1, 0.012).rotateZ(0.7).rotateY(f)
          const g2 = new THREE.BoxGeometry(0.012, 0.1, 0.012).rotateZ(-0.7).rotateY(f)
          pecas.push({ geo: colorir(g.translate(fx, fy, fz), ARAME), x: fx, z: fz }, { geo: colorir(g2.translate(fx, fy, fz), ARAME), x: fx, z: fz })
        }
      }
      // o arame barra o caminho: uma caixa fina por vão (a colisão é 2D)
      const cx = (a.x + b.x) / 2
      const cz = (a.z + b.z) / 2
      adicionarCaixa(cx, cz, Math.hypot(b.x - a.x, b.z - a.z) / 2 + 0.1, 0.18, Math.atan2(-(b.z - a.z), b.x - a.x))
    }
  }
  return pecas
}

// um trecho de linha (polilinha no mundo): lastro, dormentes a cada 0,65 m e os dois trilhos
function trecho (pts, bitola, pecas) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const comp = Math.hypot(b.x - a.x, b.z - a.z)
    const dx = (b.x - a.x) / comp
    const dz = (b.z - a.z) / comp
    const nx = -dz
    const nz = dx
    const yaw = Math.atan2(dx, dz)
    const N = Math.ceil(comp / 5)
    for (let k = 0; k < N; k++) {
      const s0 = (k / N) * comp
      const s1 = ((k + 1) / N) * comp
      const p = (s, off) => { const x = a.x + dx * s + nx * off; const z = a.z + dz * s + nz * off; return { x, z, y: alturaTerreno(x, z) } }
      // o lastro: uma faixa de pedra britada, um pouco acima do chão
      const c = p((s0 + s1) / 2, 0)
      pecas.push({ geo: colorir(new THREE.BoxGeometry(2.6, 0.16, s1 - s0 + 0.05).rotateY(yaw).translate(c.x, c.y + 0.03, c.z), LASTRO), x: c.x, z: c.z })
      for (const off of [-bitola / 2, bitola / 2]) {
        const ra = p(s0, off)
        const rb = p(s1, off)
        ra.y += 0.25
        rb.y += 0.25
        pecas.push({ geo: entre(ra, rb, 0.11, 0.07, TRILHO), x: c.x, z: c.z })
      }
    }
    for (let s = 0.3; s < comp; s += 0.65) {
      const x = a.x + dx * s
      const z = a.z + dz * s
      pecas.push({ geo: colorir(new THREE.BoxGeometry(1.9, 0.12, 0.2).rotateY(yaw).translate(x, alturaTerreno(x, z) + 0.15, z), DORMENTE), x, z })
    }
  }
}

// a linha: principal, desvio, para-choque, plataforma de terra, postes de telégrafo, um vagão parado no desvio
export function pecasTrilho (planta) {
  const pecas = []
  const t = planta.trilho
  const q = planta.quadro
  trecho(t.principal, t.bitola, pecas)
  trecho(t.desvio, t.bitola, pecas)
  const yaw = Math.atan2(q.u[0], q.u[1])
  // o para-choque: dormentes empilhados com terra atrás
  {
    const { x, z } = t.paraChoque
    const y = alturaTerreno(x, z)
    for (let k = 0; k < 4; k++) pecas.push({ geo: colorir(new THREE.BoxGeometry(1.9, 0.2, 0.22).rotateY(yaw + Math.PI / 2).translate(x, y + 0.25 + k * 0.21, z), DORMENTE), x, z })
    const [bx, bz] = q.mundo(t.paraChoque.u - 1.6, t.paraChoque.w)
    pecas.push({ geo: colorir(new THREE.BoxGeometry(3, 1.0, 2.4).rotateY(yaw + Math.PI / 2).translate(bx, alturaTerreno(bx, bz) + 0.3, bz), '#a88c6a'), x: bx, z: bz })
    adicionarCaixa(x, z, 1.2, 1.2, q.rot)
  }
  // a plataforma de terra batida com a beira de tábua, entre o desvio e a cerca
  {
    const p = t.plataforma
    const y = alturaTerreno(p.x, p.z)
    pecas.push({ geo: colorir(new THREE.BoxGeometry(p.l, 0.9, p.p).rotateY(q.rot).translate(p.x, y + 0.05, p.z), '#b39573'), x: p.x, z: p.z })
    const [ex, ez] = q.mundo(p.u, p.w - p.p / 2)
    pecas.push({ geo: colorir(new THREE.BoxGeometry(p.l, 0.5, 0.1).rotateY(q.rot).translate(ex, y + 0.25, ez), '#6b5a48'), x: ex, z: ez })
  }
  // postes de telégrafo a cada 50 m, do lado de fora da linha
  const [a, b] = t.principal
  const comp = Math.hypot(b.x - a.x, b.z - a.z)
  for (let s = 10; s < comp; s += 50) {
    const k = s / comp
    const [x, z] = q.mundo(a.u + (b.u - a.u) * k, a.w - 4)
    const y = alturaTerreno(x, z)
    pecas.push({ geo: colorir(new THREE.CylinderGeometry(0.09, 0.12, 6.5, 6).translate(x, y + 3.0, z), '#6b5a48'), x, z })
    pecas.push({ geo: colorir(new THREE.BoxGeometry(1.2, 0.1, 0.1).rotateY(q.rot).translate(x, y + 6.0, z), '#5e4c3c'), x, z })
  }
  return pecas
}

// o vagão fechado de madeira parado no desvio (local: x ao longo da linha)
export function geometriaVagao () {
  const partes = []
  const cx = (l, a, p, x, y, z, cor) => partes.push(colorir(new THREE.BoxGeometry(l, a, p).translate(x, y, z), cor))
  cx(7.4, 0.25, 2.3, 0, 0.95, 0, '#3d3833')
  cx(7.2, 2.1, 2.5, 0, 2.15, 0, '#7a5a40')
  for (let x = -3.4; x <= 3.4; x += 0.4) cx(0.04, 2.1, 2.52, x, 2.15, 0, '#6a4c36')
  cx(7.4, 0.12, 2.7, 0, 3.27, 0, '#8d8a80')
  cx(1.6, 1.8, 0.06, 0, 2.05, 1.28, '#5e4433')
  for (const x of [-2.4, 2.4]) {
    for (const z of [-0.5, 0.5]) partes.push(colorir(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12).rotateX(Math.PI / 2).translate(x, 0.67, z), '#2b2622'))
  }
  return partes
}
