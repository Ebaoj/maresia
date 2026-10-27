// Plantio das espécies nativas (src/mundo/especies.js) por ambiente: oiti nas calçadas, mangue nas
// margens do rio, restinga e cajueiro nas dunas, a mistura de Fortaleza no resto. Mais buganvília
// (nativa) pendurada nas casas e vasos na porta.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { distCosta, larguraPraia, FIM_AVENIDA, pesos, fbm, ruido, rioX, RIO_MEIA_LARGURA } from './mapa.js'
import { alturaTerreno, inclinacao } from './terreno.js'
import { toonVertice } from '../materiais.js'
import { adicionarCirculo } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { criarAleatorio } from '../utils.js'
import { instanciarEmBlocos } from './blocos.js'
import { FATOR_PRACA, lugaresJogo } from './fortaleza1932.js'
import { LIMITES, pesoCidade1932, linhaCosta } from './mapa.js'
import { cajueiro, carnauba, mangueVermelho, murici, guajiru, oiti } from './especies.js'
import { instanciarArvores } from './lod-arvores.js'

const rnd = criarAleatorio(555)

// Bolota de folhagem: icosaedro amassado por ruído, com cor mais clara em cima.
function massa(raio, cx, cy, cz, escura, clara, semente) {
  const g = new THREE.IcosahedronGeometry(raio, 1)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  const cores = []
  const c = new THREE.Color()
  const ce = new THREE.Color(escura)
  const cc = new THREE.Color(clara)
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const k = 1 + ruido(v.x * 0.9 + semente, v.y * 0.9, v.z * 0.9) * 0.35
    v.multiplyScalar(k)
    v.y *= 0.8
    p.setXYZ(i, v.x + cx, v.y + cy, v.z + cz)
    c.copy(ce).lerp(cc, THREE.MathUtils.smoothstep(v.y / raio, -0.6, 0.8))
    cores.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.deleteAttribute('uv')
  g.computeVertexNormals()
  return g
}

// o IcosahedronGeometry já nasce sem índice: toNonIndexed() nele só avisa no console
const semIndice = (g) => (g.index ? g.toNonIndexed() : g)

function geometriaBuganvilia() {
  const partes = []
  for (let i = 0; i < 4; i++) partes.push(massa(rnd.entre(0.6, 0.9), rnd.entre(-0.8, 0.8), rnd.entre(-0.6, 0.2), rnd.entre(-0.2, 0.2), '#8a2a5a', '#c9558a', i * 5.1))
  partes.push(massa(0.5, 0, -0.9, 0, '#1f6b3a', '#4fa84a', 9.1))
  return mergeGeometries(partes.map(semIndice))
}

function geometriaVaso() {
  const vaso = new THREE.CylinderGeometry(0.32, 0.22, 0.5, 8).translate(0, 0.25, 0)
  vaso.deleteAttribute('uv')
  const n = vaso.attributes.position.count
  const c = new THREE.Color('#c4552d')
  vaso.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [c.r, c.g, c.b]), 3))
  return mergeGeometries([vaso.toNonIndexed(), semIndice(massa(0.45, 0, 0.85, 0, '#1f6b3a', '#6cc75a', 2.2))])
}

export function criarArvores(cena, predios, grade) {
  // espécies nativas (src/mundo/especies.js), 3 ou 4 variações de cada, com semente própria
  const rndE = criarAleatorio(1932)
  const variantes = (fn, n) => Array.from({ length: n }, () => ({ pecas: fn(rndE), mats: [] }))
  const ESP = {
    oiti: variantes(oiti, 3),
    cajueiro: variantes(cajueiro, 4),
    carnauba: variantes(carnauba, 3),
    mangue: variantes(mangueVermelho, 3),
    murici: variantes(murici, 3),
    guajiru: variantes(guajiru, 3),
  }
  // espaço que a copa ocupa no chão e o raio do tronco para colisão
  const COPA = { oiti: 2.2, cajueiro: 4.6, carnauba: 1.4, mangue: 2.4, murici: 1.3, guajiru: 1.6 }
  const TRONCO = { oiti: 0.3, cajueiro: 0.45, carnauba: 0.25, mangue: 0.7, murici: 0.45, guajiru: 0.9 }
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)

  const plantar = (esp, x, z, escala, naAgua = false) => {
    const r = COPA[esp] * escala
    if (!ocupacao.livre(x, z, r, r)) return false
    if (!naAgua && Math.abs(x - rioX(z)) < RIO_MEIA_LARGURA * 1.5 && pesos(x).recife > 0.3) return false
    ocupacao.marcar(x, z, r, r)
    q.setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2))
    const y = naAgua ? Math.max(alturaTerreno(x, z) - 0.1, -0.05) : alturaTerreno(x, z) - 0.1
    const mm = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(escala, escala * rnd.entre(0.9, 1.15), escala))
    rnd.escolha(ESP[esp]).mats.push(mm)
    adicionarCirculo(x, z, TRONCO[esp] * escala)
    return true
  }
  const sortear = (tabela) => {
    let t = rnd.proximo()
    for (const [esp, p] of tabela) { if ((t -= p) <= 0) return esp }
    return tabela[0][0]
  }

  // oitis nas ruas do centro, na beira da rua (seguindo a grade de Herbster)
  const [ox, oz] = grade.origem
  const pX = grade.w + grade.rua
  const pZ = grade.d + grade.rua
  for (let k = -9; k <= 9; k++) {
    for (let t = -420; t <= 420; t += rnd.entre(10, 16)) {
      const lado = rnd.chance(0.5) ? 1 : -1
      const b = (k + 0.5) * pZ + lado * 3.4 * FATOR_PRACA
      const x = ox + t * grade.ex[0] + b * grade.ez[0]
      const z = oz + t * grade.ex[1] + b * grade.ez[1]
      if (Math.hypot(x - ox, z - oz) > 480 || pesoCidade1932(x, z) < 0.15) continue
      if (distCosta(x, z) < larguraPraia(x) + FIM_AVENIDA + 5) continue
      if (rnd.chance(0.45)) plantar('oiti', x, z, rnd.entre(0.9, 1.2))
    }
  }

  // mangue nas margens baixas do rio, com a base no nível da água
  for (let z = linhaCosta(rioX(0)) + 4; z < LIMITES.z1; z += rnd.entre(3, 5.5)) {
    for (const lado of [-1, 1]) {
      const x = rioX(z) + lado * RIO_MEIA_LARGURA * rnd.entre(0.95, 1.3)
      if (alturaTerreno(x, z) > 1.2 || rnd.chance(0.35)) continue
      plantar('mangue', x, z, rnd.entre(0.8, 1.25), true)
    }
  }

  // dunas a leste: restinga (murici, guajiru) e cajueiros
  const inicioDunas = lugaresJogo.seminario[0] + 60
  for (let i = 0; i < 9000; i++) {
    const x = rnd.entre(inicioDunas, LIMITES.x1 - 10)
    const z = rnd.entre(linhaCosta(x), LIMITES.z1 - 10)
    const s = distCosta(x, z)
    if (s < larguraPraia(x) + 3 || inclinacao(x, z) > 0.7 || pesoCidade1932(x, z) > 0.2) continue
    if (!rnd.chance(0.06)) continue
    plantar(sortear([['guajiru', 0.4], ['murici', 0.35], ['cajueiro', 0.25]]), x, z, rnd.entre(0.8, 1.2))
  }

  // praças e terrenos verdes: cada região com sua mistura
  for (let i = 0; i < 14000; i++) {
    const x = rnd.entre(LIMITES.x0 + 10, LIMITES.x1 - 10)
    const z = rnd.entre(linhaCosta(x) + 20, LIMITES.z1 - 10)
    if (x > inicioDunas) continue // as dunas já foram plantadas
    if (distCosta(x, z) < larguraPraia(x) + FIM_AVENIDA + 6) continue
    const h = alturaTerreno(x, z)
    if (h > 60 || inclinacao(x, z) > 0.8) continue
    const verde = fbm(x * 0.02, z * 0.02, 3, 61)
    // terreno vazio entre os bairros e quintais: mais árvore onde a cidade rareia
    const dl = pesoCidade1932(x, z)
    const chance = (dl > 0.35 ? 0.01 : 0.05) * (verde > -0.05 ? 1.4 : 0.6)
    if (!rnd.chance(chance)) continue
    // só Fortaleza (decisão de 16/10/2026): a mesma mistura em todo o mapa; na serra, mata (oiti por
    // enquanto; ipê, embaúba e piúba vêm na segunda leva)
    const esp = sortear([['cajueiro', 0.4], ['carnauba', 0.3], ['murici', 0.15], ['guajiru', 0.15]])
    if (esp === 'carnauba') {
      // carnaúba em grupo
      const n = 2 + Math.floor(rnd.entre(0, 3))
      for (let k = 0; k < n; k++) plantar('carnauba', x + rnd.entre(-5, 5), z + rnd.entre(-5, 5), rnd.entre(0.85, 1.15))
    } else plantar(esp, x, z, rnd.entre(0.85, 1.2))
  }
  // corpo, copa simples de longe e cartões de folha, com vento (lod-arvores.js)
  for (const [esp, lista] of Object.entries(ESP)) for (const v of lista) instanciarArvores(cena, v.pecas, v.mats, { nome: esp })
  const mat = toonVertice()

  // buganvília no alto das paredes do casario e da favela
  const bug = []
  const vasos = []
  for (const c of predios) {
    if (c.tipo !== 'casario' && c.tipo !== 'favela') continue
    const cs = Math.cos(c.rot)
    const sn = Math.sin(c.rot)
    if (rnd.chance(c.tipo === 'casario' ? 0.18 : 0.08)) {
      const lado = rnd.chance(0.5) ? 1 : -1
      const lx = lado * (c.w / 2)
      const lz = rnd.entre(-c.d / 2, c.d / 2) * 0.6
      q.setFromAxisAngle(Y, c.rot + (lado > 0 ? -Math.PI / 2 : Math.PI / 2))
      bug.push(new THREE.Matrix4().compose(new THREE.Vector3(c.x + lx * cs + lz * sn, c.y + c.h - 0.4, c.z - lx * sn + lz * cs), q, new THREE.Vector3(1, 1, 1)))
    }
    if (c.frente && rnd.chance(0.35)) {
      const [fx, fz] = c.frente
      const meia = fx !== 0 ? c.w / 2 : c.d / 2
      const lat = rnd.entre(-1, 1)
      const lx = fx * (meia + 0.45) + (fz !== 0 ? lat : 0)
      const lz = fz * (meia + 0.45) + (fx !== 0 ? lat : 0)
      const x = c.x + lx * cs + lz * sn
      const z = c.z - lx * sn + lz * cs
      const yv = c.fachada ? c.fachada.chao + c.fachada.calcada : alturaTerreno(x, z)
      vasos.push(m.clone().makeTranslation(x, yv, z))
    }
  }
  instanciarEmBlocos(cena, geometriaBuganvilia(), mat, bug, null, { nome: 'buganvilias', placa: true })
  instanciarEmBlocos(cena, geometriaVaso(), mat, vasos, null, { nome: 'vasos', placa: true })
}
