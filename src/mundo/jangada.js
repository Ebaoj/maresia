// A jangada cearense de paus (a mesma em 1881 e em 1932: a de tábuas só chega em 1944).
// Fontes: IBGE, "Jangadeiros" (Tipos e Aspectos do Brasil); Koster (1816); fotos de Robert S. Platt,
// 1935 (jangadas chegando, venda do peixe sobre a jangada). Ver docs/referencias-fotos-1932.md.
// - casco: 6 troncos de piúba redondos lado a lado, ~6,8 x 1,9 m, os "bordos" um pouco mais altos,
//   rente à água; travessas cavilhadas
// - banco de vela perto da proa, com o mastro atravessando; bolina descendo entre os troncos
// - vela triangular grande, de faixas de algodãozinho costuradas, bojuda, manchada e remendada;
//   retranca na base
// - banco de governo na popa e o remo de governo em forma de pá; samburá no convés
// Eixo local: x para a proa, y para cima, z para o lado.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { texturizar, toonVertice } from '../materiais.js'
import { ruido } from './mapa.js'

function colorir(geo, hex, fn = null) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const p = g.attributes.position
  const a = new Float32Array(p.count * 3)
  const t = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    t.copy(c)
    if (fn) fn(t, p.getX(i), p.getY(i), p.getZ(i))
    a[i * 3] = t.r; a[i * 3 + 1] = t.g; a[i * 3 + 2] = t.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}

function barra(a, b, r, hex, lados = 6) {
  const d = new THREE.Vector3().subVectors(b, a)
  const L = d.length()
  const g = new THREE.CylinderGeometry(r, r, L, lados).translate(0, L / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
  g.translate(a.x, a.y, a.z)
  return colorir(g, hex)
}

// vela: triângulo subdividido (coordenadas baricêntricas), bojo no meio, faixas de pano costuradas
// paralelas à valuma (a borda de trás, do topo do mastro ao fim da retranca: Platt 3263), manchas
// (sangue de peixe, limo) e remendos
function vela(amura, topo, punho, semente, idade) {
  const N = 20
  const base = new THREE.Color('#e9dfcb').lerp(new THREE.Color('#b9a582'), idade)
  const ponto = (i, j) => {
    const w1 = i / N // em direção ao punho (fim da retranca)
    const w2 = j / N // em direção ao topo do mastro
    const w0 = 1 - w1 - w2
    const p = new THREE.Vector3().addScaledVector(amura, w0).addScaledVector(punho, w1).addScaledVector(topo, w2)
    p.z += 27 * w0 * w1 * w2 * 0.42 + w1 * w2 * 0.3 // bojo, maior perto da valuma
    const c = base.clone()
    if ((w0 * 12) % 1 < 0.07) c.multiplyScalar(0.85) // costura das faixas: w0 constante corre paralelo à valuma
    const n = ruido(p.x * 0.55 + semente, p.y * 0.55, semente * 0.7)
    c.multiplyScalar(1 - Math.max(0, n) * (0.22 + idade * 0.4))
    c.multiplyScalar(1 - (1 - w2) * 0.1 * idade)
    const h = Math.abs(Math.sin((Math.floor(w1 * 6) * 12.9898 + Math.floor(w2 * 7) * 78.233 + semente) * 437.585)) % 1
    if (h > 0.88) c.lerp(new THREE.Color(h > 0.94 ? '#c4b493' : '#f2ecdc'), 0.6)
    return [p, c]
  }
  const pos = []
  const cores = []
  const tri = (a, b, c) => {
    for (const [p, cor] of [a, b, c]) { pos.push(p.x, p.y, p.z); cores.push(cor.r, cor.g, cor.b) }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N - i; j++) {
      tri(ponto(i, j), ponto(i + 1, j), ponto(i, j + 1))
      if (i + j < N - 1) tri(ponto(i + 1, j), ponto(i + 1, j + 1), ponto(i, j + 1))
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.computeVertexNormals()
  return g
}

const madeira = '#9c8461'
const madeiraEscura = '#6b5843'

// geometria de uma jangada; "naAreia" acrescenta os roletes de coqueiro por baixo
export function geometriaJangada({ semente = 0, idade = 0.4, naAreia = false } = {}) {
  const partes = []
  const L = 6.8
  // casco: 6 troncos, os de fora (bordos) mais altos; proa arredondada e um pouco levantada
  const zs = [-0.82, -0.49, -0.16, 0.16, 0.49, 0.82]
  zs.forEach((z, k) => {
    const r = k === 0 || k === 5 ? 0.15 : 0.17
    const y = (k === 0 || k === 5 ? 0.05 : 0) + r
    const tronco = new THREE.CylinderGeometry(r, r * 0.92, L, 9).rotateZ(Math.PI / 2).translate(0, y, z)
    partes.push(colorir(tronco, madeira, (c, x, yy) => {
      c.multiplyScalar(0.82 + 0.18 * Math.min(1, yy / (2 * r))) // molhada embaixo
      c.multiplyScalar(1 + 0.08 * Math.sin(x * 3.1 + k * 1.7))
    }))
    partes.push(colorir(new THREE.SphereGeometry(r, 8, 6).scale(0.9, 1, 1).translate(L / 2, y + 0.02, z), madeira))
  })
  // travessas cavilhadas
  for (const x of [-2.4, 0, 2.4]) partes.push(colorir(new THREE.BoxGeometry(0.08, 0.06, 1.95).translate(x, 0.36, 0), madeiraEscura))
  // banco de vela (perto da proa) sobre quatro pés, o mastro atravessando; bolina por baixo
  const xBanco = 1.7
  partes.push(colorir(new THREE.BoxGeometry(0.34, 0.06, 1.5).translate(xBanco, 0.86, 0), madeira))
  for (const [dx, dz] of [[-0.12, -0.6], [0.12, -0.6], [-0.12, 0.6], [0.12, 0.6]]) partes.push(colorir(new THREE.BoxGeometry(0.06, 0.52, 0.06).translate(xBanco + dx, 0.6, dz), madeiraEscura))
  partes.push(colorir(new THREE.BoxGeometry(0.5, 0.9, 0.05).translate(xBanco - 0.35, -0.1, 0), madeiraEscura))
  // mastro, inclinado para trás
  const pe = new THREE.Vector3(xBanco + 0.05, 0.3, 0)
  const topoMastro = new THREE.Vector3(xBanco - 0.45, 8.6, 0) // a vela é bem mais alta que o casco (fotos de 1935)
  partes.push(barra(pe, topoMastro, 0.065, '#7a6040'))
  // retranca e vela
  const amura = new THREE.Vector3(xBanco - 0.02, 1.05, 0)
  const punho = new THREE.Vector3(xBanco - 6.1, 1.45, 0) // a retranca passa da popa (fotos de 1935)
  partes.push(barra(amura, punho, 0.045, '#7a6040'))
  partes.push(vela(amura, topoMastro.clone().add(new THREE.Vector3(0.05, -0.15, 0)), punho, semente, idade))
  // banco de governo na popa, remo de governo em pá descendo na água
  partes.push(colorir(new THREE.BoxGeometry(0.4, 0.06, 1.2).translate(-2.9, 0.72, 0), madeira))
  for (const dz of [-0.5, 0.5]) partes.push(colorir(new THREE.BoxGeometry(0.06, 0.38, 0.06).translate(-2.9, 0.52, dz), madeiraEscura))
  const remo0 = new THREE.Vector3(-2.6, 1.3, 0.55)
  const remo1 = new THREE.Vector3(-3.9, -0.4, 0.75)
  partes.push(barra(remo0, remo1, 0.04, '#7a6040'))
  partes.push(colorir(new THREE.BoxGeometry(0.75, 0.04, 0.28).translate(0, 0, 0).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3().subVectors(remo1, remo0).normalize())).translate(remo1.x + 0.15, remo1.y + 0.2, remo1.z), madeira))
  // samburá (cesto de boca apertada) e a quimanga
  partes.push(colorir(new THREE.CylinderGeometry(0.14, 0.24, 0.4, 9).translate(-0.6, 0.55, 0.45), '#b89a63'))
  partes.push(colorir(new THREE.SphereGeometry(0.15, 8, 6).scale(1, 0.8, 1).translate(-1.1, 0.48, -0.35), '#7f6a3c'))
  // rolo de corda no convés (Platt 3235)
  partes.push(colorir(new THREE.TorusGeometry(0.22, 0.06, 5, 12).rotateX(Math.PI / 2).translate(0.6, 0.42, -0.45), '#a08a64'))
  partes.push(colorir(new THREE.TorusGeometry(0.17, 0.05, 5, 10).rotateX(Math.PI / 2).translate(0.6, 0.5, -0.45), '#94805c'))
  // roletes de tronco de coqueiro por baixo (quando está na areia)
  if (naAreia) for (const x of [-1.8, 1.4]) partes.push(colorir(new THREE.CylinderGeometry(0.13, 0.13, 2.3, 8).rotateX(Math.PI / 2).translate(x, -0.08, 0), '#8a7a62'))
  return mergeGeometries(partes)
}

let _mat = null
export function materialJangada() {
  if (!_mat) _mat = texturizar(toonVertice({ side: THREE.DoubleSide }), { topo: 'madeira', lado: 'madeira', tam: 1.2 }) // pau de piúba gasto de sal (visual Arcane)
  return _mat
}
