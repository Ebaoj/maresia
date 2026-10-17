// Objetos de 1932 na altura do personagem, só na fatia vertical (mundo/fatia.js). O que faz um lugar
// parecer vivido é a densidade de coisa pequena (referência: Messenger), e cada coisa um pouco torta.
// O que tem fonte: samburá, quimanga, cabaça, remo de governo, troncos de piúba lavrados debaixo dos
// coqueiros (Platt 1935, id 3145), rolo de corda (3235), tauaçu (âncora de pedra), pote de barro, rede
// de pesca secando em varas, panos no varal, cerca de varas (2987). Ver docs/referencias-fotos-1932.md.

import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { texturizar, toonVertice } from '../materiais.js'
import { alturaTerreno } from './terreno.js'
import { linhaCosta, larguraPraia, ruido } from './mapa.js'
import { adicionarCaixa, adicionarCirculo } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { FATIA, dentroDaFatia } from './fatia.js'
import { criarAleatorio } from '../utils.js'
import { CAL, ACENTO } from '../paleta.js'

const rnd = criarAleatorio(1932)
const rndPintura = criarAleatorio(1933) // só a pintura; o rnd acima decide onde as coisas ficam
const COR = {
  madeira: '#9c8461', madeiraVelha: '#857257', madeiraEscura: '#6b5843', piuba: CAL.piuba,
  palha: '#b49a68', corda: '#b8a37a', barro: '#a8643f', barroClaro: '#c98a5c', cabaca: '#c9a85a',
  pedra: '#8d8a80', algodao: '#e9dfcb', rede: '#7d8a7a', anil: ACENTO.anil, urucum: '#b8553b',
}

// "torto": empurra cada vértice um pouco por um ruído da posição dele (o mesmo vértice repetido
// vai para o mesmo lugar, então a peça não rasga). Tira a cara de caixa perfeita de computador.
function torto(geo, amp = 0.02, freq = 3.1) {
  const p = geo.attributes.position
  const s = rnd.entre(0, 100)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    p.setXYZ(i,
      x + ruido(y * freq + s, z * freq, 1.3) * amp,
      y + ruido(x * freq, z * freq + s, 2.1) * amp * 0.5,
      z + ruido(x * freq + s, y * freq, 3.7) * amp)
  }
  geo.computeVertexNormals()
  return geo
}

// pinta a peça: cor local com manchas suaves pela posição (pincelada na COR, não na geometria; o tom por
// triângulo de antes virava faceta). alt = 1 marca a parte que usa a textura alternativa do material
// (a pedra, aTexAlt). A luz e a sombra vêm do materiais.js, nunca da cor.
// triAntes: quantos triângulos a peça tinha na pintura antiga (um sorteio por triângulo). O sorteio da
// posição dos objetos é o mesmo rnd, então ele avança igual a antes para a praia sair no mesmo lugar.
function pintar(geo, hex, varia = 0.08, alt = 0, triAntes = null) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g.attributes.uv) g.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const p = g.attributes.position
  const n = p.count
  for (let i = 0, t = triAntes ?? n / 3; i < t; i++) rnd.proximo()
  const a = new Float32Array(n * 3)
  const s = rndPintura.entre(0, 50)
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
    // duas escalas de mancha (~25 cm e ~8 cm), sem repetir entre peças (semente por peça)
    const k = 1 + (ruido(x * 4 + s, z * 4 + y * 3, 5.1) * 0.7 + ruido(x * 12, z * 12 + y * 9 + s, 6.3) * 0.3) * varia * 1.6
    a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  g.setAttribute('aTexAlt', new THREE.BufferAttribute(new Float32Array(n).fill(alt), 1))
  return g
}

// pedra arredondada e um pouco torta (as de antes eram dodecaedros de 12 faces: facetadas), com a textura
// de pedra
function pedra(r, sx = 1, sy = 1, sz = 1) {
  const g = mergeVertices(new THREE.IcosahedronGeometry(r, 2).deleteAttribute('normal').deleteAttribute('uv'))
  g.scale(sx, sy, sz)
  return torto(g, r * 0.22, 1.5 / r)
}

const cil = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg, 2)
const pau = (a, b, r, hex, seg = 5) => {
  const d = new THREE.Vector3().subVectors(b, a)
  const g = cil(r * 0.85, r, d.length(), seg).translate(0, d.length() / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()))
  g.translate(a.x, a.y, a.z)
  return pintar(torto(g, r * 0.25), hex)
}
const V = (x, y, z) => new THREE.Vector3(x, y, z)

// ---------- as peças (origem no chão, frente em +Z) ----------

function samburá() {
  // cesto de boca apertada, trançado: faixas de tom alternado
  const g = new THREE.LatheGeometry([[0.0, 0], [0.16, 0.0], [0.22, 0.12], [0.2, 0.28], [0.12, 0.38], [0.1, 0.42]].map(([x, y]) => new THREE.Vector2(x, y)), 10)
  const p = pintar(torto(g, 0.012), COR.palha, 0.05)
  const c = p.attributes.color
  for (let i = 0; i < c.count; i++) if (Math.floor(p.attributes.position.getY(i) / 0.06) % 2) c.setXYZ(i, c.getX(i) * 0.82, c.getY(i) * 0.82, c.getZ(i) * 0.82)
  return p
}
function pote() {
  const g = new THREE.LatheGeometry([[0.0, 0], [0.12, 0.0], [0.2, 0.12], [0.21, 0.24], [0.13, 0.38], [0.09, 0.42], [0.11, 0.46]].map(([x, y]) => new THREE.Vector2(x, y)), 12)
  return pintar(torto(g, 0.01), COR.barro, 0.06)
}
function cabaca() {
  const g = new THREE.SphereGeometry(0.12, 9, 7).scale(1, 0.9, 1).translate(0, 0.11, 0)
  const pescoco = cil(0.04, 0.06, 0.12, 7).translate(0, 0.26, 0)
  return mergeGeometries([pintar(torto(g, 0.012), COR.cabaca), pintar(pescoco, COR.cabaca)])
}
function roloCorda(r = 0.28) {
  const partes = []
  for (let k = 0; k < 4; k++) partes.push(pintar(torto(new THREE.TorusGeometry(r - k * 0.015, 0.035, 5, 16).rotateX(Math.PI / 2).translate(0, 0.035 + k * 0.05, 0), 0.015), COR.corda, 0.1))
  return mergeGeometries(partes)
}
function tauacu() {
  // âncora de pedra amarrada numa cruz de madeira
  const pedraA = pintar(pedra(0.2, 1.2, 0.8, 1).translate(0, 0.16, 0), COR.pedra, 0.15, 1, 36)
  return mergeGeometries([pedraA, pau(V(-0.45, 0.12, 0), V(0.45, 0.12, 0), 0.035, COR.madeiraEscura), pau(V(0, 0.12, -0.4), V(0, 0.12, 0.4), 0.035, COR.madeiraEscura), pau(V(0, 0.1, 0), V(0, 0.7, 0.05), 0.03, COR.madeiraEscura)])
}
function remoEncostado() {
  // remo de governo: cabo comprido e pá larga, encostado (inclinado ~70°)
  const a = V(0, 0, 0.0)
  const b = V(0, 2.4, -0.75)
  const cabo = pau(a, b, 0.035, COR.madeiraVelha)
  const pa = pintar(torto(new THREE.BoxGeometry(0.22, 0.75, 0.03).translate(0, 0.38, 0), 0.01), COR.madeira)
  pa.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize()))
  return mergeGeometries([cabo, pa])
}
function troncosPiuba() {
  // troncos de piúba empilhados para fazer jangada (Platt 3145): roliços, claros, um ou dois lavrados
  const partes = []
  const camadas = [[-0.34, 0, 0.17], [0, 0, 0.17], [0.34, 0, 0.17], [-0.17, 0.3, 0.16], [0.17, 0.3, 0.16]]
  for (const [x, y, r] of camadas) {
    const L = rnd.entre(5.4, 6.6)
    const g = cil(r * 0.9, r, L, 9).rotateZ(Math.PI / 2).translate(rnd.entre(-0.3, 0.3), y + r, x)
    partes.push(pintar(torto(g, 0.02, 1.3), rnd.chance(0.3) ? '#c2ae8c' : COR.piuba, 0.12))
  }
  // dois calços atravessados por baixo
  for (const x of [-1.8, 1.8]) partes.push(pintar(torto(new THREE.BoxGeometry(0.16, 0.12, 1.2).translate(x, 0.06, 0), 0.015), COR.madeiraEscura))
  return mergeGeometries(partes)
}
function redeSecando() {
  // duas forquilhas com uma vara em cima e a rede pendurada em pano: malha escura e rala
  const partes = [pau(V(-1.6, 0, 0), V(-1.6, 1.9, 0), 0.04, COR.madeiraVelha), pau(V(1.6, 0, 0), V(1.6, 1.9, 0), 0.04, COR.madeiraVelha), pau(V(-1.75, 1.85, 0), V(1.75, 1.85, 0), 0.03, COR.madeiraVelha)]
  // malha vazada: fios finos em losango, caindo em barriga entre as forquilhas
  const queda = (u, v) => 1.8 - v * (1.3 + 0.25 * Math.sin(u * Math.PI))
  const fio = (u0, v0, u1, v1) => {
    const a = V(-1.5 + u0 * 3, queda(u0, v0), 0.05 * Math.sin(u0 * 9 + v0 * 5))
    const b = V(-1.5 + u1 * 3, queda(u1, v1), 0.05 * Math.sin(u1 * 9 + v1 * 5))
    const d = b.clone().sub(a)
    const g = new THREE.BoxGeometry(0.012, d.length(), 0.012).translate(0, d.length() / 2, 0)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()))
    return g.translate(a.x, a.y, a.z)
  }
  const fios = []
  const NU = 16
  const NV = 7
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      fios.push(fio(i / NU, j / NV, (i + 1) / NU, (j + 1) / NV), fio((i + 1) / NU, j / NV, i / NU, (j + 1) / NV))
    }
  }
  // a beira de baixo, com as boias de cortiça
  for (let i = 0; i < NU; i++) fios.push(fio(i / NU, 1, (i + 1) / NU, 1))
  const g = mergeGeometries(fios)
  for (let i = 1; i < NU; i += 3) partes.push(pintar(new THREE.SphereGeometry(0.05, 6, 4).scale(1.3, 0.8, 1).translate(-1.5 + (i / NU) * 3, queda(i / NU, 1), 0), '#c9b48a'))
  partes.push(pintar(g, COR.rede, 0.25))
  return mergeGeometries(partes)
}
function varal(cores) {
  // duas varas, uma corda e panos pendurados (um pode ser o anil, o único acento forte da fatia)
  const partes = [pau(V(-1.4, 0, 0), V(-1.4, 1.75, 0), 0.03, COR.madeiraVelha), pau(V(1.4, 0, 0), V(1.4, 1.75, 0), 0.03, COR.madeiraVelha), pau(V(-1.4, 1.7, 0), V(1.4, 1.65, 0), 0.008, COR.corda, 4)]
  let x = -1.15
  for (const cor of cores) {
    const w = rnd.entre(0.45, 0.7)
    const h = rnd.entre(0.5, 0.85)
    const pano = new THREE.PlaneGeometry(w, h, 3, 3).translate(x + w / 2, 1.68 - h / 2, 0)
    partes.push(pintar(torto(pano, 0.04, 4), cor, 0.06))
    x += w + 0.08
  }
  return mergeGeometries(partes)
}
function bancoTosco() {
  const tampo = pintar(torto(new THREE.BoxGeometry(1.2, 0.07, 0.3).translate(0, 0.42, 0), 0.015), COR.madeira)
  const pes = [[-0.45, -0.1], [-0.45, 0.1], [0.45, -0.1], [0.45, 0.1]].map(([x, z]) => pau(V(x, 0, z), V(x * 0.95, 0.4, z * 0.9), 0.03, COR.madeiraEscura))
  return mergeGeometries([tampo, ...pes])
}
function fogareiro() {
  // três pedras e uma panela de barro em cima, cinza no chão
  const partes = []
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    partes.push(pintar(pedra(0.11, 1, 0.85, 1.1).translate(Math.cos(a) * 0.17, 0.08, Math.sin(a) * 0.17), COR.pedra, 0.2, 1, 36))
  }
  const panela = new THREE.LatheGeometry([[0.0, 0], [0.12, 0.0], [0.16, 0.08], [0.15, 0.16], [0.17, 0.18]].map(([x, y]) => new THREE.Vector2(x, y)), 10).translate(0, 0.16, 0)
  partes.push(pintar(torto(panela, 0.008), '#5a4034', 0.08))
  partes.push(pintar(new THREE.CircleGeometry(0.35, 9).rotateX(-Math.PI / 2).translate(0, 0.01, 0), '#77706a', 0.2))
  return mergeGeometries(partes)
}
function esteira() {
  return pintar(torto(new THREE.PlaneGeometry(1.0, 1.7, 4, 6).rotateX(-Math.PI / 2).translate(0, 0.015, 0), 0.01, 2), '#c4ab76', 0.12)
}

function redeNoChao() {
  // rede estendida na areia para remendar: um monte baixo e irregular, escuro
  return pintar(torto(new THREE.CircleGeometry(1.1, 10).rotateX(-Math.PI / 2).scale(1.4, 1, 0.8).translate(0, 0.03, 0), 0.06, 2), COR.rede, 0.3)
}
function peixeSecando() {
  // varal de peixe escalado secando ao sol: duas forquilhas, uma vara, peixes abertos pendurados
  const partes = [pau(V(-1.1, 0, 0), V(-1.1, 1.4, 0), 0.03, COR.madeiraVelha), pau(V(1.1, 0, 0), V(1.1, 1.4, 0), 0.03, COR.madeiraVelha), pau(V(-1.2, 1.36, 0), V(1.2, 1.36, 0), 0.025, COR.madeiraVelha)]
  for (let x = -0.9; x <= 0.9; x += 0.3) {
    // peixe aberto, de cabeça para baixo: corpo em gota e o rabo em cima, preso na vara
    const f = new THREE.Shape()
    f.moveTo(0, -0.34)
    f.quadraticCurveTo(0.1, -0.22, 0.08, -0.06)
    f.lineTo(0.03, 0.0)
    f.lineTo(0.08, 0.07)
    f.lineTo(-0.08, 0.07)
    f.lineTo(-0.03, 0.0)
    f.lineTo(-0.08, -0.06)
    f.quadraticCurveTo(-0.1, -0.22, 0, -0.34)
    const peixe = new THREE.ShapeGeometry(f, 4).translate(x + rnd.entre(-0.03, 0.03), 1.26, rnd.entre(-0.02, 0.02))
    peixe.rotateY(rnd.entre(-0.4, 0.4))
    partes.push(pintar(peixe, rnd.chance(0.5) ? '#a88e66' : '#9a8259', 0.2)) // peixe salgado secando: âmbar, não branco
  }
  return mergeGeometries(partes)
}

// ---------- distribuição ----------

// onde ficam os fogareiros (a fumaça desenhada sai deles, efeitos2d.js)
export const FOGAREIROS = []

export function criarObjetosFatia(cena, casasPalha) {
  const tipos = new Map()
  const por = (nome, fabrica) => {
    if (!tipos.has(nome)) tipos.set(nome, { geo: fabrica(), mats: [] })
    return tipos.get(nome)
  }
  const Y = V(0, 1, 0)
  const pôr = (nome, fabrica, x, z, rot, { raio = 0, caixa = null, escala = 1 } = {}) => {
    if (!dentroDaFatia(x, z)) return false
    const t = por(nome, fabrica)
    if (nome === 'fogareiro') FOGAREIROS.push(new THREE.Vector3(x, alturaTerreno(x, z), z))
    t.mats.push(new THREE.Matrix4().compose(V(x, alturaTerreno(x, z) - 0.02, z), new THREE.Quaternion().setFromAxisAngle(Y, rot), V(escala, escala, escala)))
    if (raio) adicionarCirculo(x, z, raio)
    if (caixa) adicionarCaixa(x, z, caixa[0], caixa[1], rot)
    return true
  }
  // em volta de cada casa de palha da fatia: o que fica na porta e no quintal
  const casas = casasPalha.filter((c) => dentroDaFatia(c.x, c.z))
  for (const c of casas) {
    const fx = Math.sin(c.rot), fz = Math.cos(c.rot) // frente da casa
    const lx = Math.cos(c.rot), lz = -Math.sin(c.rot)
    const ao = (u, v) => [c.x + lx * u + fx * v, c.z + lz * u + fz * v]
    const d = c.d / 2
    const w = c.w / 2
    // na porta: pote d'água, cabaça, um banco encostado ou uma esteira
    pôr('pote', pote, ...ao(w * 0.55, d + 0.4), rnd.entre(0, 6), { raio: 0.22 })
    if (rnd.chance(0.6)) pôr('cabaca', cabaca, ...ao(w * 0.55 + 0.35, d + 0.3), rnd.entre(0, 6))
    if (rnd.chance(0.5)) pôr('banco', bancoTosco, ...ao(-w * 0.4, d + 0.45), c.rot + rnd.entre(-0.1, 0.1), { caixa: [0.6, 0.15] })
    else pôr('esteira', esteira, ...ao(-w * 0.2, d + 1.2), c.rot + Math.PI / 2 + rnd.entre(-0.3, 0.3))
    // de lado: samburás empilhados, um rolo de corda
    pôr('samburá', samburá, ...ao(w + 0.4, d * 0.3), rnd.entre(0, 6), { raio: 0.22 })
    if (rnd.chance(0.6)) pôr('samburá', samburá, ...ao(w + 0.45, d * 0.3 - 0.5), rnd.entre(0, 6), { raio: 0.22, escala: 0.85 })
    if (rnd.chance(0.7)) pôr('corda', roloCorda, ...ao(w + 0.5, -d * 0.4), rnd.entre(0, 6))
    // atrás: varal ou rede secando; fogareiro
    if (rnd.chance(0.5)) pôr('varal', () => varal([COR.algodao, '#d8c8a8', COR.anil]), ...ao(rnd.entre(-1, 1), -d - 2.2), c.rot + rnd.entre(-0.3, 0.3), { caixa: [1.5, 0.1] })
    else pôr('rede', redeSecando, ...ao(rnd.entre(-1, 1), -d - 2.4), c.rot + rnd.entre(-0.3, 0.3), { caixa: [1.7, 0.15] })
    if (rnd.chance(0.55)) pôr('fogareiro', fogareiro, ...ao(-w - 1.0, -d * 0.2), 0, { raio: 0.35 })
    // remo de governo encostado na parede
    if (rnd.chance(0.5)) pôr('remo', remoEncostado, ...ao(-w - 0.05, d * 0.5), c.rot + Math.PI / 2)
  }
  // na areia, entre a vila e o mar: troncos de piúba, tauaçu, cordas, samburás perto das jangadas
  for (let i = 0; i < 110; i++) {
    const x = rnd.entre(FATIA.x0 + 3, FATIA.x1 - 3)
    const s = rnd.entre(3, larguraPraia(x) + 12)
    const z = linhaCosta(x) + s
    if (!ocupacao.livre(x, z, 1.0, 1.0)) continue
    const r = rnd.proximo()
    let ok = false
    if (r < 0.12) {
      if (ocupacao.livre(x, z, 3.4, 1.0, 0)) { ok = pôr('troncos', troncosPiuba, x, z, rnd.entre(-0.3, 0.3) + Math.PI / 2, { caixa: [0.8, 3.2] }); if (ok) ocupacao.marcar(x, z, 3.4, 1.0, 0) }
    } else if (r < 0.3) ok = pôr('tauacu', tauacu, x, z, rnd.entre(0, 6), { raio: 0.3 })
    else if (r < 0.55) ok = pôr('corda', roloCorda, x, z, rnd.entre(0, 6))
    else if (r < 0.7) ok = pôr('samburá', samburá, x, z, rnd.entre(0, 6), { raio: 0.22 })
    else if (r < 0.78) ok = pôr('cabaca', cabaca, x, z, rnd.entre(0, 6))
    else if (r < 0.88) ok = pôr('redeChao', redeNoChao, x, z, rnd.entre(0, 6))
    else if (ocupacao.livre(x, z, 1.4, 0.4, 0)) ok = pôr('peixe', peixeSecando, x, z, rnd.entre(-0.5, 0.5), { caixa: [1.1, 0.1] })
    if (ok) ocupacao.marcar(x, z, 0.6, 0.6)
  }
  // madeira em tudo e pedra na parte marcada (aTexAlt): antes as pedras levavam veio de madeira
  const mat = texturizar(toonVertice({ side: THREE.DoubleSide }), { topo: 'madeira', lado: 'madeira', tam: 0.8, alt: 'pedra', tamAlt: 0.5 })
  let n = 0
  for (const [nome, t] of tipos) {
    if (!t.mats.length) continue
    const im = new THREE.InstancedMesh(t.geo, mat, t.mats.length)
    t.mats.forEach((m, i) => im.setMatrixAt(i, m))
    im.castShadow = true
    im.receiveShadow = true
    im.name = 'fatia-' + nome
    im.computeBoundingSphere()
    cena.add(im)
    n += t.mats.length
  }
  return n
}
