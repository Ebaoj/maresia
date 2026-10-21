// O mobiliário das praças de 1932: lampião a gás (de uma e de três lanternas), banco de ferro fundido com
// ripas de madeira e jarro de balaustrada. Muitas cópias: tudo vai por instanciarEmBlocos (CLAUDE.md).
//
// Fontes (marcos-1932.md, seção 1; detalhe-4-marcos.md, seção 2):
//   FATO   a iluminação pública era a gás até 1933-35 (a elétrica chegou à Praça do Ferreira em dez/1934)
//   FATO   postes de ferro de 1 ou 3 lanternas (o cartão de 1925 mostra o cacho de três)
//   FATO   bancos de ferro fundido com assento de madeira na reforma de 1933 [Vermelho-Ferreira]
//   HIP    a altura das colunas (3,2 m a de uma lanterna, 4,2 m a de três), pela proporção das pessoas nos postais
//
// Cada peça tem duas malhas lisas (ferro e vidro, ferro e madeira), sem cor por vértice: no WebGPU a cor por
// vértice some em alguns casos (docs/motor-f4-otimizacao-webgpu.md).

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { instanciarEmBlocos } from '../blocos.js'
import { adicionarCaixa, adicionarCirculo } from '../colisao.js'
import { PERFIL } from './obra.js'

const Y = new THREE.Vector3(0, 1, 0)
const UM = new THREE.Vector3(1, 1, 1)
const limpa = (g) => {
  const n = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k)
  return n
}
const juntar = (partes) => mergeGeometries(partes.map(limpa))
const torno = (perfil, seg = 8, esc = 1) => new THREE.LatheGeometry(perfil.map(([r, h]) => new THREE.Vector2(r * esc, h * esc)), seg)

// a lanterna de quatro faces: o ferro (quinas, chapéu, base) com origem no pé da lanterna
function ferroLanterna(partes, x, y, z, esc = 1) {
  const s = esc
  partes.push(new THREE.CylinderGeometry(0.12 * s, 0.07 * s, 0.1 * s, 4).rotateY(Math.PI / 4).translate(x, y + 0.05 * s, z))
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    partes.push(new THREE.BoxGeometry(0.03 * s, 0.5 * s, 0.03 * s).translate(x + a * 0.15 * s, y + 0.35 * s, z + b * 0.15 * s))
  }
  partes.push(new THREE.CylinderGeometry(0.3 * s, 0.19 * s, 0.08 * s, 4).rotateY(Math.PI / 4).translate(x, y + 0.64 * s, z))
  partes.push(new THREE.ConeGeometry(0.26 * s, 0.3 * s, 4).rotateY(Math.PI / 4).translate(x, y + 0.83 * s, z))
  partes.push(new THREE.SphereGeometry(0.045 * s, 6, 4).translate(x, y + 1.0 * s, z))
}

// o vidro da lanterna, que acende à noite
const vidroLanterna = (x, y, z, esc = 1) => new THREE.BoxGeometry(0.28 * esc, 0.46 * esc, 0.28 * esc).translate(x, y + 0.34 * esc, z)

// a coluna de ferro fundido: base de pedestal, fuste, anel
function coluna(partes, alt) {
  partes.push(torno([[0, 0], [0.2, 0], [0.2, 0.12], [0.15, 0.2], [0.15, 0.45], [0.1, 0.55], [0.08, 0.62], [0, 0.62]], 8))
  partes.push(new THREE.CylinderGeometry(0.055, 0.08, alt - 0.62, 8).translate(0, 0.62 + (alt - 0.62) / 2, 0))
  partes.push(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 8).translate(0, alt - 0.05, 0))
}

// lampião de uma lanterna: 3,2 m até a lanterna
export const LAMP1 = { alt: 3.2 }
export function geometriaLampiao1() {
  const f = []
  coluna(f, LAMP1.alt)
  ferroLanterna(f, 0, LAMP1.alt, 0)
  return { ferro: juntar(f), vidro: juntar([vidroLanterna(0, LAMP1.alt, 0)]), luzes: [[0, LAMP1.alt + 0.34, 0]] }
}

// lampião de três lanternas (o cacho do cartão de 1925): uma no alto, duas em braços curvos
export const LAMP3 = { alt: 4.2, braco: 0.75, altBraco: 3.45 }
export function geometriaLampiao3() {
  const f = []
  coluna(f, LAMP3.alt)
  ferroLanterna(f, 0, LAMP3.alt, 0)
  const v = [vidroLanterna(0, LAMP3.alt, 0)]
  const luzes = [[0, LAMP3.alt + 0.34, 0]]
  for (const s of [-1, 1]) {
    // o braço: um arco de três gomos saindo da coluna, com a voluta embaixo
    const pts = [[0, 3.0], [0.3, 3.32], [0.6, 3.42], [LAMP3.braco, LAMP3.altBraco]]
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[i + 1]
      const L = Math.hypot(x1 - x0, y1 - y0)
      const dx = s * (x1 - x0)
      f.push(new THREE.CylinderGeometry(0.025, 0.03, L, 5).rotateZ(-Math.atan2(dx, y1 - y0)).translate(s * (x0 + x1) / 2, (y0 + y1) / 2, 0))
    }
    f.push(new THREE.TorusGeometry(0.09, 0.018, 4, 10).translate(s * 0.2, 3.02, 0))
    ferroLanterna(f, s * LAMP3.braco, LAMP3.altBraco - 0.02, 0, 0.85)
    v.push(vidroLanterna(s * LAMP3.braco, LAMP3.altBraco - 0.02, 0, 0.85))
    luzes.push([s * LAMP3.braco, LAMP3.altBraco + 0.27, 0])
  }
  return { ferro: juntar(f), vidro: juntar(v), luzes }
}

// banco de ferro fundido com ripas de madeira (1,9 m), virado para +z (como o banco da rua)
export function geometriaBanco() {
  const ferro = []
  for (const x of [-0.82, 0, 0.82]) {
    // a perna em S: pé da frente, pé de trás e o braço do encosto
    ferro.push(new THREE.BoxGeometry(0.06, 0.44, 0.06).translate(x, 0.22, 0.2))
    ferro.push(new THREE.BoxGeometry(0.06, 0.5, 0.06).rotateX(-0.25).translate(x, 0.24, -0.18))
    ferro.push(new THREE.BoxGeometry(0.06, 0.06, 0.48).translate(x, 0.42, 0))
    ferro.push(new THREE.BoxGeometry(0.06, 0.48, 0.06).rotateX(-0.2).translate(x, 0.68, -0.24))
    if (x !== 0) ferro.push(new THREE.TorusGeometry(0.07, 0.02, 4, 10, Math.PI * 1.5).rotateY(Math.PI / 2).translate(x, 0.6, 0.22))
  }
  const madeira = []
  for (let i = 0; i < 4; i++) madeira.push(new THREE.BoxGeometry(1.9, 0.035, 0.09).translate(0, 0.46, -0.16 + i * 0.11))
  for (let i = 0; i < 3; i++) madeira.push(new THREE.BoxGeometry(1.9, 0.09, 0.03).rotateX(-0.2).translate(0, 0.6 + i * 0.13, -0.26 - i * 0.025))
  return { ferro: juntar(ferro), madeira: juntar(madeira) }
}

// jarro da balaustrada (ferro bronzeado na Praça dos Leões)
export function geometriaUrna() {
  return juntar([torno(PERFIL.urna, 10, 1)])
}

// Junta as cópias de todo o mobiliário dos marcos e monta no fim (uma malha por bloco e material)
export class Mobilia {
  constructor() {
    this.tipos = new Map()
    this.luzes = [] // onde fica cada lanterna (o mapa de luz dos lampiões, cenografia.js)
    this.bancos = [] // os lugares de sentar (interacoes.js)
  }

  _lista(tipo) {
    if (!this.tipos.has(tipo)) this.tipos.set(tipo, [])
    return this.tipos.get(tipo)
  }

  lampiao(tipo, x, y, z, ry = 0) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, ry), UM)
    this._lista(tipo).push(m)
    const forma = tipo === 'lamp3' ? LAMP3_GEO() : LAMP1_GEO()
    for (const [lx, ly, lz] of forma.luzes) {
      const p = new THREE.Vector3(lx, ly, lz).applyMatrix4(m)
      this.luzes.push(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z))
    }
    adicionarCirculo(x, z, 0.22)
  }

  banco(x, y, z, ry = 0, sentar = true) {
    this._lista('banco').push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, ry), UM))
    adicionarCaixa(x, z, 0.95, 0.3, ry)
    if (sentar) this.bancos.push({ x, y, z, yaw: ry })
  }

  urna(x, y, z, esc = 1) {
    this._lista('urna').push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(esc, esc, esc)))
  }

  // materiais: { ferro, vidro, madeira, bronze }
  montar(cena, mat) {
    const pecas = {
      lamp1: () => { const g = LAMP1_GEO(); return [[g.ferro, mat.ferro, true], [g.vidro, mat.vidro, false]] },
      lamp3: () => { const g = LAMP3_GEO(); return [[g.ferro, mat.ferro, true], [g.vidro, mat.vidro, false]] },
      banco: () => { const g = geometriaBanco(); return [[g.ferro, mat.ferro, true], [g.madeira, mat.madeira, true]] },
      urna: () => [[geometriaUrna(), mat.bronze, true]],
    }
    let n = 0
    for (const [tipo, lista] of this.tipos) {
      if (!lista.length) continue
      for (const [geo, material, sombra] of pecas[tipo]()) {
        instanciarEmBlocos(cena, geo, material, lista, null, { nome: `marcos-${tipo}`, sombra })
      }
      n += lista.length
    }
    return n
  }
}

// as formas ficam guardadas: a mesma geometria para todas as cópias
let _l1 = null
let _l3 = null
const LAMP1_GEO = () => (_l1 ||= geometriaLampiao1())
const LAMP3_GEO = () => (_l3 ||= geometriaLampiao3())
