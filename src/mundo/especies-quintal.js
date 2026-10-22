// Versão antiga das espécies (cidade-1932, 1bb7dd3), só para as árvores dos quintais (quintal1932.js),
// até elas passarem para a técnica nova das árvores pintadas (especies.js, docs/arvores-pintadas.md).
// Espécies nativas (docs/direcao-de-arte.md, lacuna 6: silhueta). Primeira leva:
// cajueiro, carnaúba, mangue-vermelho, arbustos de restinga (murici, guajiru) e o coqueiro.
// Nada de "bolha lisa": cada árvore tem galhos à mostra e a folhagem em muitos cachos menores,
// com céu aparecendo entre eles, como massa pintada (referência: Gato de Botas 2).
// Cada função devolve uma geometria com cor por vértice, com a base do tronco em (0, 0, 0).

import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ruido } from './mapa.js'

const cor = new THREE.Color()
const cor2 = new THREE.Color()

function pintarGeo(g, hex) {
  g = g.index ? g.toNonIndexed() : g
  g.deleteAttribute('uv')
  cor.set(hex)
  const n = g.attributes.position.count
  const c = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { c[i * 3] = cor.r; c[i * 3 + 1] = cor.g; c[i * 3 + 2] = cor.b }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3))
  return g
}

// cilindro de a até b, afinando de ra para rb
function galho(a, b, ra, rb, hex, lados = 6) {
  const d = new THREE.Vector3().subVectors(b, a)
  const comp = d.length()
  const g = new THREE.CylinderGeometry(rb, ra, comp, lados, 1, false)
  g.translate(0, comp / 2, 0)
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
  g.translate(a.x, a.y, a.z)
  return pintarGeo(g, hex)
}

// galho curvo: segue uma lista de pontos, afinando do primeiro ao último
function galhoCurvo(pts, r0, r1, hex) {
  const partes = []
  for (let i = 0; i < pts.length - 1; i++) {
    const t0 = i / (pts.length - 1)
    const t1 = (i + 1) / (pts.length - 1)
    partes.push(galho(pts[i], pts[i + 1], r0 + (r1 - r0) * t0, r0 + (r1 - r0) * t1, hex))
    // junta arredondada para não abrir fresta na dobra
    if (i > 0) {
      const j = new THREE.SphereGeometry(r0 + (r1 - r0) * t0, 6, 4)
      j.translate(pts[i].x, pts[i].y, pts[i].z)
      partes.push(pintarGeo(j, hex))
    }
  }
  return partes
}

// cacho de folhagem: icosaedro amassado por ruído, base achatada, mais claro em cima.
// "topo" tinge a parte de cima (folha nova acobreada do cajueiro, flor do murici).
// "detalhe" força o número de faces do icosaedro (1 = barato, para as árvores
// distantes do quintal, que ninguém vê de perto).
function cacho(raio, centro, escura, clara, semente, { achatar = 0.75, topo = null, forca = 0.45, detalhe = null } = {}) {
  // cacho grande com mais vértices: com poucos, as faixas do toon desenham os polígonos
  const g = new THREE.IcosahedronGeometry(raio, detalhe ?? (raio > 0.9 ? 2 : 1))
  const p = g.attributes.position
  const v = new THREE.Vector3()
  const cores = []
  const ce = new THREE.Color(escura)
  const cc = new THREE.Color(clara)
  const ct = topo ? new THREE.Color(topo) : null
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const k = 1 + ruido(v.x * 1.1 + semente, v.y * 1.1 + semente * 0.3, v.z * 1.1) * forca * 1.3 // ruído de -1 a 1
    v.multiplyScalar(k)
    v.y *= achatar
    if (v.y < -raio * 0.25) v.y = -raio * 0.25 + (v.y + raio * 0.25) * 0.35 // base mais reta
    const alto = THREE.MathUtils.smoothstep(v.y / raio, -0.5, 0.7)
    cor2.copy(ce).lerp(cc, alto)
    if (ct && v.y > raio * 0.45 && ruido(v.x * 2 + semente, v.z * 2, semente) > 0.25) cor2.lerp(ct, 0.55)
    cores.push(cor2.r, cor2.g, cor2.b)
    p.setXYZ(i, v.x + centro.x, v.y + centro.y, v.z + centro.z)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.deleteAttribute('uv')
  // normais suaves (na malha indexada): massa pintada, não pedra facetada
  g.deleteAttribute('normal') // as normais por face impediam juntar os vértices
  const gi = mergeVertices(g)
  gi.computeVertexNormals()
  return gi.toNonIndexed()
}

const V = (x, y, z) => new THREE.Vector3(x, y, z)

// CAJUEIRO: tronco curto e torto que logo se abre em galhos grossos quase horizontais; alguns
// descem até perto do chão. Copa baixa e larga (até ~12 m), verde escuro brilhante, com folha
// nova acobreada no topo.
export function cajueiro(rnd, { barato = false } = {}) {
  // "barato": a folhagem com menos faces (a arvore do quintal, longe de quem olha)
  const casca = '#5e4636'
  const partes = []
  const altT = rnd.entre(0.9, 1.5)
  const inclina = V(rnd.entre(-0.35, 0.35), altT, rnd.entre(-0.35, 0.35))
  partes.push(...galhoCurvo([V(0, 0, 0), V(inclina.x * 0.4, altT * 0.55, inclina.z * 0.4), inclina], 0.42, 0.32, casca))
  const nGalhos = 4 + Math.floor(rnd.entre(0, 2.99))
  const pontas = []
  for (let i = 0; i < nGalhos; i++) {
    const a = (i / nGalhos) * Math.PI * 2 + rnd.entre(-0.4, 0.4)
    const dir = V(Math.cos(a), 0, Math.sin(a))
    const L = rnd.entre(3.2, 5.6)
    const desce = rnd.chance(0.08) // galho encostando na areia: raro (é anomalia, não regra)
    const p1 = inclina.clone().addScaledVector(dir, L * 0.35).add(V(0, rnd.entre(0.8, 1.4), 0))
    const p2 = inclina.clone().addScaledVector(dir, L * 0.7).add(V(0, desce ? 0.3 : rnd.entre(1.0, 1.8), 0))
    const p3 = inclina.clone().addScaledVector(dir, L).add(V(0, desce ? -inclina.y + 0.45 : rnd.entre(0.4, 1.4), 0))
    partes.push(...galhoCurvo([inclina, p1, p2, p3], 0.24, 0.07, casca))
    // galhinho secundário saindo do meio
    const lado = V(-dir.z, 0, dir.x).multiplyScalar(rnd.chance(0.5) ? 1 : -1)
    const s1 = p1.clone().addScaledVector(lado, rnd.entre(1.0, 1.8)).add(V(0, rnd.entre(0.6, 1.2), 0))
    partes.push(...galhoCurvo([p1, s1], 0.12, 0.05, casca))
    pontas.push(p2, p3, s1)
  }
  // cachos: nas pontas e por cima dos galhos, deixando vãos
  const folhaEsc = '#22492c'
  const folhaCla = '#5b8a3c'
  const cobre = '#a8623a'
  let s = rnd.entre(0, 100)
  for (const p of pontas) {
    const r = rnd.entre(1.2, 1.9)
    partes.push(cacho(r, p.clone().add(V(rnd.entre(-0.3, 0.3), r * 0.45, rnd.entre(-0.3, 0.3))), folhaEsc, folhaCla, s++, { topo: rnd.chance(0.4) ? cobre : null, detalhe: barato ? 1 : null }))
  }
  // miolo da copa, mais alto, segurando a silhueta em domo baixo
  for (let i = 0; i < 4; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    const r = rnd.entre(1.5, 2.2)
    partes.push(cacho(r, inclina.clone().add(V(Math.cos(a) * rnd.entre(0.5, 1.8), rnd.entre(2.2, 3.0), Math.sin(a) * rnd.entre(0.5, 1.8))), folhaEsc, folhaCla, s++, { topo: cobre, detalhe: barato ? 1 : null }))
  }
  return mergeGeometries(partes)
}

// MANGUEIRA: a árvore de quintal. Tronco grosso e reto (meio metro na base) que
// sobe alto antes de abrir em galhos, e a copa em domo largo e cheia, verde
// escuro, com a folha nova mais clara no alto. Nas fotos de Platt (1935) ela
// sombreia o quintal inteiro; é a árvore dos quintais de 1932.
export function mangueira(rnd, { barato = false } = {}) {
  // "barato": a folhagem com menos faces (a arvore do quintal, longe de quem olha)
  const partes = []
  const casca = '#6a5647'
  const altT = rnd.entre(3.4, 4.6)
  const topo = V(rnd.entre(-0.25, 0.25), altT, rnd.entre(-0.25, 0.25))
  partes.push(...galhoCurvo([V(0, 0, 0), V(topo.x * 0.3, altT * 0.55, topo.z * 0.3), topo], 0.52, 0.34, casca))
  // galhos: sobem e abrem; a copa fecha em domo
  const nGalhos = 5 + Math.floor(rnd.entre(0, 2.99))
  const pontas = []
  for (let i = 0; i < nGalhos; i++) {
    const a = (i / nGalhos) * Math.PI * 2 + rnd.entre(-0.3, 0.3)
    const dir = V(Math.cos(a), 0, Math.sin(a))
    const L = rnd.entre(2.6, 4.2)
    const p1 = topo.clone().addScaledVector(dir, L * 0.4).add(V(0, rnd.entre(0.9, 1.6), 0))
    const p2 = topo.clone().addScaledVector(dir, L).add(V(0, rnd.entre(1.8, 2.8), 0))
    partes.push(...galhoCurvo([topo, p1, p2], 0.22, 0.08, casca))
    const lado = V(-dir.z, 0, dir.x).multiplyScalar(rnd.chance(0.5) ? 1 : -1)
    const s1 = p1.clone().addScaledVector(lado, rnd.entre(0.9, 1.6)).add(V(0, rnd.entre(0.5, 1.1), 0))
    partes.push(...galhoCurvo([p1, s1], 0.11, 0.05, casca))
    pontas.push(p2, s1)
  }
  const folhaEsc = '#1f4a26'
  const folhaCla = '#5c8a38'
  let s = rnd.entre(0, 100)
  for (const p of pontas) {
    const r = rnd.entre(1.4, 2.0)
    partes.push(cacho(r, p.clone().add(V(rnd.entre(-0.25, 0.25), r * 0.35, rnd.entre(-0.25, 0.25))), folhaEsc, folhaCla, s++, { detalhe: barato ? 1 : null }))
  }
  // o miolo da copa, mais alto, fechando o domo
  for (let i = 0; i < 5; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    const r = rnd.entre(1.7, 2.4)
    partes.push(cacho(r, topo.clone().add(V(Math.cos(a) * rnd.entre(0.4, 1.6), rnd.entre(2.2, 3.2), Math.sin(a) * rnd.entre(0.4, 1.6))), folhaEsc, folhaCla, s++, { topo: '#6d9a42', detalhe: barato ? 1 : null }))
  }
  return mergeGeometries(partes)
}

// folha em leque (carnaúba): setor de ~250° com pregas alternadas, levemente em concha.
// Feita com os dois lados (triângulos duplicados), para não sumir vista por baixo.
function leque(raio, hex, hexBorda, semente) {
  const N = 16
  const pos = []
  const cores = []
  const c0 = new THREE.Color(hex)
  const c1 = new THREE.Color(hexBorda)
  const aberto = 2.2
  const ponto = (t, f) => {
    const a = -aberto + (2 * aberto * t)
    const prega = (Math.round(t * N) % 2 === 0 ? 1 : -1) * 0.07 * raio * f
    return [Math.cos(a) * raio * f, prega - f * f * raio * 0.18, Math.sin(a) * raio * f]
  }
  const tri = (a, b, c, ca, cb, cc) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...b)
    cores.push(...ca, ...cb, ...cc, ...ca, ...cc, ...cb)
  }
  const cc = (f) => { const k = c0.clone().lerp(c1, f); return [k.r, k.g, k.b] }
  for (let i = 0; i < N; i++) {
    const t0 = i / N
    const t1 = (i + 1) / N
    const meio0 = ponto(t0, 0.4)
    const meio1 = ponto(t1, 0.4)
    const fora0 = ponto(t0, 1.0)
    const fora1 = ponto(t1, 1.0)
    tri([0, 0, 0], meio0, meio1, cc(0), cc(0.3), cc(0.3))
    tri(meio0, fora0, fora1, cc(0.3), cc(1), cc(1))
    tri(meio0, fora1, meio1, cc(0.3), cc(1), cc(0.3))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.computeVertexNormals()
  void semente
  return g
}

// CARNAÚBA: estipe reto e fino (9 a 12 m), com os pecíolos velhos em espiral na base; coroa
// globosa de folhas em leque verde-acinzentado (a cera). Planta social: em grupo, na várzea.
export function carnauba(rnd) {
  const partes = []
  const H = rnd.entre(9, 12.5)
  const curva = V(rnd.entre(-0.6, 0.6), 0, rnd.entre(-0.6, 0.6))
  const pts = [V(0, 0, 0), V(curva.x * 0.2, H * 0.35, curva.z * 0.2), V(curva.x * 0.6, H * 0.7, curva.z * 0.6), V(curva.x, H, curva.z)]
  partes.push(...galhoCurvo(pts, 0.22, 0.16, '#7a6a5c'))
  // bainhas cruzadas no terço de baixo: anéis de escamas
  for (let k = 0; k < 14; k++) {
    const t = 0.05 + (k / 14) * 0.45
    const centro = V(curva.x * t * t, H * t, curva.z * t * t)
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * Math.PI * 2 + (k % 2) * (Math.PI / 4)
      const esc = new THREE.BoxGeometry(0.16, 0.34, 0.06)
      esc.rotateZ((k % 2 ? 1 : -1) * 0.6)
      esc.rotateY(-a)
      esc.translate(centro.x + Math.cos(a) * 0.21, centro.y, centro.z + Math.sin(a) * 0.21)
      partes.push(pintarGeo(esc, k % 3 === 0 ? '#5e5046' : '#6e5e50'))
    }
  }
  // coroa: pecíolos irradiando e o leque na ponta
  const topo = pts[3]
  const verde = rnd.chance(0.5) ? '#6f8f72' : '#7d9a6e'
  const nFolhas = 22 + Math.floor(rnd.entre(0, 8))
  for (let i = 0; i < nFolhas; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    const el = rnd.entre(-0.25, 1.3) // elevação do pecíolo: coroa esférica, nada descendo pelo tronco
    const dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el))
    const L = rnd.entre(1.3, 1.9)
    const fim = topo.clone().addScaledVector(dir, L)
    partes.push(galho(topo, fim, 0.035, 0.025, '#6e7a52', 4))
    const f = leque(rnd.entre(0.95, 1.25), verde, '#a7b8a0', i)
    // o leque abre para fora, na direção do pecíolo, caindo um pouco
    const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), V(dir.x, dir.y * 0.6 - 0.15, dir.z).normalize())
    f.applyQuaternion(q)
    f.translate(fim.x, fim.y, fim.z)
    partes.push(f)
  }
  // sem saia de folhas secas: na carnaúba adulta as folhas inteiras caem (ESALQ)
  // miolo da coroa (as folhas novas fechadas)
  partes.push(cacho(0.55, topo.clone().add(V(0, 0.2, 0)), '#55704f', '#8aa080', rnd.entre(0, 50), { achatar: 1.2 }))
  return mergeGeometries(partes)
}

// MANGUE-VERMELHO: raízes-escora em arco saindo do tronco para a lama, algumas raízes aéreas
// caindo dos galhos; copa densa e arredondada, verde médio brilhante. Base no nível da água.
export function mangueVermelho(rnd) {
  const partes = []
  const casca = '#6b5544'
  const H = rnd.entre(1.8, 2.6) // altura onde as escoras saem
  const topo = V(rnd.entre(-0.3, 0.3), H + rnd.entre(1.2, 2.0), rnd.entre(-0.3, 0.3))
  partes.push(...galhoCurvo([V(0, H * 0.6, 0), V(0, H, 0), topo], 0.2, 0.13, casca))
  const nRaiz = 9 + Math.floor(rnd.entre(0, 5))
  for (let i = 0; i < nRaiz; i++) {
    const a = (i / nRaiz) * Math.PI * 2 + rnd.entre(-0.2, 0.2)
    const r = rnd.entre(1.2, 2.3)
    const saida = V(0, H * rnd.entre(0.55, 1.0), 0)
    const meio = V(Math.cos(a) * r * 0.55, saida.y + rnd.entre(0.2, 0.5), Math.sin(a) * r * 0.55)
    const chao = V(Math.cos(a) * r, -0.3, Math.sin(a) * r)
    partes.push(...galhoCurvo([saida, meio, V(Math.cos(a) * r * 0.9, saida.y * 0.45, Math.sin(a) * r * 0.9), chao], 0.075, 0.05, casca))
  }
  // galhos e copa
  const pontas = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd.entre(-0.4, 0.4)
    const p = topo.clone().add(V(Math.cos(a) * rnd.entre(1.2, 2.0), rnd.entre(0.4, 1.0), Math.sin(a) * rnd.entre(1.2, 2.0)))
    partes.push(galho(topo, p, 0.1, 0.05, casca))
    pontas.push(p)
    if (rnd.chance(0.6)) partes.push(galho(p, V(p.x * 1.05, -0.2, p.z * 1.05), 0.03, 0.025, casca, 4)) // raiz aérea
  }
  let s = rnd.entre(0, 100)
  for (const p of pontas) partes.push(cacho(rnd.entre(1.1, 1.5), p.clone().add(V(0, 0.5, 0)), '#244a2c', '#5f8f44', s++))
  partes.push(cacho(rnd.entre(1.4, 1.8), topo.clone().add(V(0, 1.3, 0)), '#244a2c', '#5f8f44', s++))
  return mergeGeometries(partes)
}

// MURICI: arbusto de restinga (1,5 a 2,5 m), poucos caules finos, cachos arredondados e
// espigas de flor amarela no topo. A casca dele tinge a roupa dos jangadeiros.
export function murici(rnd) {
  const partes = []
  const casca = '#6b5240'
  let s = rnd.entre(0, 100)
  // vários caules curtos e a folhagem começando perto do chão, em camadas
  const n = 4 + Math.floor(rnd.entre(0, 2.99))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd.entre(-0.4, 0.4)
    const topo = V(Math.cos(a) * rnd.entre(0.3, 0.8), rnd.entre(1.0, 1.7), Math.sin(a) * rnd.entre(0.3, 0.8))
    partes.push(...galhoCurvo([V(0, 0, 0), V(topo.x * 0.6, topo.y * 0.45, topo.z * 0.6), topo], 0.06, 0.03, casca))
    partes.push(cacho(rnd.entre(0.55, 0.75), topo.clone().add(V(0, 0.15, 0)), '#3a5a30', '#7f9c4a', s++, { topo: '#e2b53a' }))
    partes.push(cacho(rnd.entre(0.5, 0.7), V(topo.x * 0.9, rnd.entre(0.45, 0.75), topo.z * 0.9), '#33522c', '#6f8e44', s++))
  }
  return mergeGeometries(partes)
}

// GUAJIRU: moita baixa e densa de restinga, mais larga que alta (2 a 3 m por 1 m), folha
// arredondada verde-clara, alguns frutos arroxeados.
export function guajiru(rnd) {
  const partes = []
  let s = rnd.entre(0, 100)
  const n = 5 + Math.floor(rnd.entre(0, 3.99))
  for (let i = 0; i < n; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    const d = rnd.entre(0, 1.1)
    const r = rnd.entre(0.55, 0.85)
    partes.push(cacho(r, V(Math.cos(a) * d, r * 0.55, Math.sin(a) * d), '#41623a', '#8fae5a', s++, { achatar: 0.7, topo: rnd.chance(0.3) ? '#6a3a5a' : null }))
  }
  return mergeGeometries(partes)
}

// OITI (segunda leva, adiantado para as ruas): árvore de rua nativa da Mata Atlântica, tronco
// reto, copa densa e arredondada, verde escuro. Substitui a "árvore genérica" das calçadas.
export function oiti(rnd) {
  const partes = []
  const casca = '#5a4a3c'
  const H = rnd.entre(2.2, 2.9)
  const topo = V(rnd.entre(-0.2, 0.2), H, rnd.entre(-0.2, 0.2))
  partes.push(...galhoCurvo([V(0, 0, 0), V(topo.x * 0.4, H * 0.6, topo.z * 0.4), topo], 0.24, 0.17, casca))
  const pontas = []
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd.entre(-0.4, 0.4)
    const p = topo.clone().add(V(Math.cos(a) * rnd.entre(1.0, 1.6), rnd.entre(0.9, 1.5), Math.sin(a) * rnd.entre(1.0, 1.6)))
    partes.push(...galhoCurvo([topo, p], 0.13, 0.06, casca))
    pontas.push(p)
  }
  let s = rnd.entre(0, 100)
  for (const p of pontas) partes.push(cacho(rnd.entre(1.1, 1.5), p.clone().add(V(0, 0.45, 0)), '#21452b', '#55823f', s++))
  for (let i = 0; i < 3; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    partes.push(cacho(rnd.entre(1.2, 1.6), topo.clone().add(V(Math.cos(a) * 0.6, rnd.entre(2.0, 2.6), Math.sin(a) * 0.6)), '#21452b', '#5f8f44', s++))
  }
  return mergeGeometries(partes)
}
