// A obra de um marco de 1932: junta a geometria procedural de um prédio (ou de uma praça) por material,
// num referencial próprio preso à grade de Herbster, e devolve poucas malhas juntadas.
//
// O referencial: x local = rua leste-sudeste (a direção da Guilherme Rocha), z local = rua sul-sudoeste
// (a direção da Major Facundo), y para cima a partir da base da obra. É a convenção do resto do motor
// (estacao.js, colisao.js): rotation.y = ROT leva o x local para a rua da grade.
//
// Por que por material e não por cor de vértice: a malha com o atributo `color` some no WebGPU em alguns
// casos (docs/motor-f4-otimizacao-webgpu.md, "Defeito do motor"). Aqui cada material é uma malha lisa,
// sem cor por vértice, e as cores ficam no material (o painel muda a cor sem reconstruir nada).

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { alturaTerreno } from '../terreno.js'
import { adicionarCaixa, adicionarCirculo, adicionarDeck } from '../colisao.js'
import { registrarEstatico } from '../../render/sombra-estatica.js'
import { congelar } from '../congelar.js'
import { solidosCamera } from '../solidos.js'

import { ROT, EX, EZ, naGrade, paraGrade } from './grade.js'

export { ROT, EX, EZ, naGrade, paraGrade }

// a menor altura do terreno num retângulo da grade (a obra nunca flutua na ladeira)
export function chaoMinimo(origem, hu, hv, passo = 4) {
  let min = Infinity
  for (let u = -hu; u <= hu + 1e-6; u += Math.max(1, hu / Math.ceil(hu / passo))) {
    for (let v = -hv; v <= hv + 1e-6; v += Math.max(1, hv / Math.ceil(hv / passo))) {
      const [x, z] = naGrade(origem, u, v)
      min = Math.min(min, alturaTerreno(x, z))
    }
  }
  return min
}

// a maior altura do terreno no retângulo (o piso de um mercado não pode ficar enterrado)
export function chaoMaximo(origem, hu, hv, passo = 4) {
  let max = -Infinity
  for (let u = -hu; u <= hu + 1e-6; u += Math.max(1, hu / Math.ceil(hu / passo))) {
    for (let v = -hv; v <= hv + 1e-6; v += Math.max(1, hv / Math.ceil(hv / passo))) {
      max = Math.max(max, alturaTerreno(...naGrade(origem, u, v)))
    }
  }
  return max
}

const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const eixoY = new THREE.Vector3(0, 1, 0)

// geometria limpa: sem índice, só posição e normal (todas as peças juntam entre si)
function limpa(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
  if (!g.attributes.normal) g.computeVertexNormals()
  return g
}

export class Obra {
  // origem: [x, z] de jogo; y: a base da obra; giro: giro extra em torno do y, além da grade
  constructor(nome, origem, y, giro = 0) {
    this.nome = nome
    this.origem = origem
    this.y = y
    this.giro = ROT + giro
    this.c = Math.cos(this.giro)
    this.s = Math.sin(this.giro)
    this.pecas = new Map() // chave do material -> geometrias
    this.detalhe = new Set() // chaves que somem de longe
  }

  // ponto local (x, z) -> mundo
  mundo(lx, lz) {
    return [this.origem[0] + lx * this.c + lz * this.s, this.origem[1] - lx * this.s + lz * this.c]
  }

  // geometria já no referencial local
  add(chave, geo) {
    if (!this.pecas.has(chave)) this.pecas.set(chave, [])
    this.pecas.get(chave).push(limpa(geo))
    return this
  }

  caixa(chave, x, y, z, sx, sy, sz, ry = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    if (ry) g.rotateY(ry)
    return this.add(chave, g.translate(x, y, z))
  }

  cilindro(chave, x, y, z, r1, r2, h, seg = 8, ry = 0) {
    const g = new THREE.CylinderGeometry(r1, r2, h, seg)
    if (ry) g.rotateY(ry)
    return this.add(chave, g.translate(x, y, z))
  }

  // peça de torno (balaústre, urna, pináculo, cúpula): perfil [[raio, altura], ...] a partir do pé
  torno(chave, x, y, z, perfil, seg = 8, escala = 1) {
    const g = new THREE.LatheGeometry(perfil.map(([r, h]) => new THREE.Vector2(r * escala, h * escala)), seg)
    return this.add(chave, g.translate(x, y, z))
  }

  // geometria posta com posição, giro em y e escala
  por(chave, geo, x, y, z, ry = 0, esc = 1) {
    const g = geo.clone()
    m4.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(eixoY, ry), new THREE.Vector3(esc, esc, esc))
    return this.add(chave, g.applyMatrix4(m4))
  }

  // as malhas: uma por material; detalhe some de longe (lista em this.detalhe)
  montar(cena, materiais, { solidos = [] } = {}) {
    const grupo = new THREE.Group()
    grupo.name = this.nome
    grupo.position.set(this.origem[0], this.y, this.origem[1])
    grupo.rotation.y = this.giro
    const malhas = []
    for (const [chave, geos] of this.pecas) {
      const mat = materiais[chave]
      if (!mat) throw new Error(`obra ${this.nome}: sem material para "${chave}"`)
      const g = mergeGeometries(geos)
      g.computeBoundingSphere()
      const m = new THREE.Mesh(g, mat)
      m.name = `${this.nome}-${chave}`
      m.castShadow = mat.userData.semSombra !== true
      m.receiveShadow = true
      m.userData.detalhe = this.detalhe.has(chave)
      grupo.add(m)
      malhas.push(m)
    }
    cena.add(grupo)
    grupo.updateMatrixWorld(true)
    for (const m of malhas) {
      registrarEstatico(m)
      congelar(m)
      if (solidos.includes(m.name.slice(this.nome.length + 1))) solidosCamera.push(m)
    }
    congelar(grupo)
    this.grupo = grupo
    this.malhas = malhas
    return grupo
  }

  // colisão: caixa no referencial local (meias medidas)
  colisaoCaixa(lx, lz, hx, hz) {
    const [x, z] = this.mundo(lx, lz)
    adicionarCaixa(x, z, hx, hz, this.giro)
  }

  colisaoCirculo(lx, lz, r) {
    const [x, z] = this.mundo(lx, lz)
    adicionarCirculo(x, z, r)
  }

  // piso alto onde o personagem anda (degrau, plataforma): altura relativa à base da obra
  deck(lx, lz, hx, hz, y, giro = 0) {
    const [x, z] = this.mundo(lx, lz)
    adicionarDeck(x, z, hx, hz, this.giro + giro, this.y + y)
  }
}

// ---------- peças comuns da arquitetura de 1932 ----------

// perfis de torno
export const PERFIL = {
  balaustre: [[0, 0], [0.07, 0], [0.07, 0.06], [0.045, 0.1], [0.075, 0.32], [0.05, 0.5], [0.035, 0.58], [0.06, 0.62], [0.06, 0.66], [0, 0.66]],
  urna: [[0, 0], [0.16, 0], [0.16, 0.08], [0.08, 0.14], [0.1, 0.2], [0.26, 0.42], [0.24, 0.56], [0.15, 0.62], [0.2, 0.66], [0.2, 0.7], [0, 0.72]],
  pinaculo: [[0, 0], [0.22, 0], [0.22, 0.25], [0.14, 0.3], [0.16, 0.5], [0.1, 0.75], [0.12, 0.85], [0.04, 1.1], [0, 1.25]],
}

// balaustrada reta de (x0, z0) a (x1, z1) no plano da obra, com o pé em y; altura total ~0,95 m
// chaves: { base, balaustre } (a base e o corrimão vão no material da base)
export function balaustrada(obra, k, x0, z0, x1, z1, y, { passo = 0.28, alt = 0.95, larg = 0.3 } = {}) {
  const dx = x1 - x0
  const dz = z1 - z0
  const L = Math.hypot(dx, dz)
  if (L < 0.2) return
  const ang = Math.atan2(-dz, dx)
  const cx = (x0 + x1) / 2
  const cz = (z0 + z1) / 2
  obra.caixa(k.base, cx, y + 0.08, cz, L, 0.16, larg, ang)
  obra.caixa(k.base, cx, y + alt - 0.06, cz, L + 0.04, 0.12, larg + 0.06, ang)
  const n = Math.max(1, Math.floor(L / passo))
  const esc = (alt - 0.28) / 0.66
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    obra.torno(k.balaustre, x0 + dx * t, y + 0.16, z0 + dz * t, PERFIL.balaustre, 6, esc)
  }
  obra.detalhe.add(k.balaustre)
}

// cornija em degraus ao longo de um retângulo (fachada inteira), saindo `sai` da parede
export function cornijaRet(obra, chave, hx, hz, y, { sai = 0.35, alt = 0.45, degraus = 3 } = {}) {
  for (let i = 0; i < degraus; i++) {
    const s = (sai * (i + 1)) / degraus
    const h = alt / degraus
    obra.caixa(chave, 0, y + h * (i + 0.5), 0, hx * 2 + s * 2, h, hz * 2 + s * 2)
  }
}
