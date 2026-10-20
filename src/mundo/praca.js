// A Praça do Ferreira em 1932: o que a reforma do prefeito Godofredo Maciel deixou nela.
//
// Fonte (com a marca de confiança em docs/mapa-1932.md):
//   D  1920: Maciel fecha o poço central, manda retirar os quiosques de café dos
//      quatro cantos, mosaica a praça e faz vários jardins.
//   D  1923: o palanque do centro é trocado por outro, coberto: o coreto da banda.
//   D  a Light iluminava a praça; o poste fica na calçada do contorno.
//   H  quantos jardins são, onde eles ficam e o desenho do coreto.
//
// Não entram (anacronismo): a Coluna da Hora (o relógio da praça é de 1933) e os
// quiosques de café dos quatro cantos (retirados na reforma de 1920).
//
// O que este módulo monta: o coreto coberto no centro, quatro jardins com grade de
// ferro, arvoreira e bancos, e reserva o terreo na grade de ocupacao para as
// arvores soltas nao cairem em cima.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { alturaTerreno } from './terreno.js'
import { ocupacao } from './ocupacao.js'
import { toon, toonVertice } from '../materiais.js'
import { colorir } from './cenografia.js'
import { geometriaBanco } from './rua.js'
import { instanciarEmBlocos } from './blocos.js'
import { criarAleatorio } from '../utils.js'
import { cajueiro, murici, oiti } from './especies.js'
import { CENTRO, RAIO_MAX, dentroDaPraca, raioEm } from './praca1932.js'

const rnd = criarAleatorio(1932)

// o coreto: raio da plataforma, altura da coluna, folga da grade
const CORETO = { raio: 2.8, altura: 3.2, telhado: 1.3, grade: 0.9 }

// onde os jardins podem ficar: uma direção só serve se o canteiro inteiro couber
// dentro da praça, com folga do coreto
function escolherJardins() {
  const cantos = 16
  const bons = []
  for (let k = 0; k < cantos; k++) {
    const ang = (k / cantos) * Math.PI * 2
    const r = raioEm(ang)
    const rr = r * 0.52
    if (rr < CORETO.raio + 3.4 || rr > RAIO_MAX - 2) continue
    const cx = CENTRO[0] + Math.cos(ang) * rr
    const cz = CENTRO[1] + Math.sin(ang) * rr
    // o canteiro (4 x 4) tem de caber inteiro na praça
    let cabe = true
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2], [0, 0]]) {
      if (!dentroDaPraca(cx + dx, cz + dz)) { cabe = false; break }
    }
    if (cabe) bons.push({ ang, x: cx, z: cz })
  }
  // quatro bem espalhados: o mais longe de cada um já escolhido
  const escolhidos = []
  for (const b of bons) {
    if (escolhidos.length >= 4) break
    if (escolhidos.some((e) => Math.abs(((b.ang - e.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.7)) continue
    escolhidos.push(b)
  }
  return escolhidos
}

// o coreto coberto: plataforma de alvenaria, oito colunas, telhado e grade de ferro
function geometriaCoreto() {
  const partes = []
  const r = CORETO.raio
  // a plataforma
  partes.push(colorir(new THREE.CylinderGeometry(r, r + 0.15, 0.55, 16).translate(0, 0.27, 0), '#cfc4a8'))
  partes.push(colorir(new THREE.CylinderGeometry(r - 0.25, r - 0.25, 0.08, 16).translate(0, 0.56, 0), '#8d6f4f'))
  // as colunas
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    partes.push(colorir(new THREE.CylinderGeometry(0.14, 0.16, CORETO.altura, 8)
      .translate(Math.cos(a) * (r - 0.5), CORETO.altura / 2 + 0.55, Math.sin(a) * (r - 0.5)), '#e8dcc0'))
  }
  // o aro da cobertura e o telhado de zinco
  partes.push(colorir(new THREE.CylinderGeometry(r + 0.2, r + 0.2, 0.22, 16).translate(0, CORETO.altura + 0.6, 0), '#b9b3a4'))
  partes.push(colorir(new THREE.ConeGeometry(r + 0.45, CORETO.telhado, 16).translate(0, CORETO.altura + 0.6 + CORETO.telhado / 2, 0), '#9c9a8c'))
  partes.push(colorir(new THREE.SphereGeometry(0.16, 8, 6).translate(0, CORETO.altura + 0.6 + CORETO.telhado + 0.1, 0), '#8a6f3f'))
  // a grade de ferro em volta do coreto
  const nGrade = 20
  for (let k = 0; k < nGrade; k++) {
    const a = (k / nGrade) * Math.PI * 2
    partes.push(colorir(new THREE.BoxGeometry(0.05, CORETO.grade, 0.05)
      .translate(Math.cos(a) * (r - 0.15), CORETO.altura * 0.5 + 0.4, Math.sin(a) * (r - 0.15)), '#3b3038'))
  }
  partes.push(colorir(new THREE.TorusGeometry(r - 0.15, 0.05, 6, 24).rotateX(Math.PI / 2).translate(0, CORETO.altura * 0.5 + 0.4, 0), '#3b3038'))
  return mergeGeometries(partes.map((g) => g.toNonIndexed()))
}

// o jardim: canteiro de alvenaria com grade de ferro, terra e arvoreira
function geometriaCanteiro() {
  const partes = []
  const a = 2.2
  // mureta de alvenaria
  partes.push(colorir(new THREE.BoxGeometry(a * 2, 0.42, 0.3).translate(0, 0.21, -a), '#d6c9a6'))
  partes.push(colorir(new THREE.BoxGeometry(a * 2, 0.42, 0.3).translate(0, 0.21, a), '#d6c9a6'))
  partes.push(colorir(new THREE.BoxGeometry(0.3, 0.42, a * 2).translate(-a, 0.21, 0), '#d6c9a6'))
  partes.push(colorir(new THREE.BoxGeometry(0.3, 0.42, a * 2).translate(a, 0.21, 0), '#d6c9a6'))
  // a terra dentro
  partes.push(colorir(new THREE.BoxGeometry(a * 2 - 0.3, 0.12, a * 2 - 0.3).translate(0, 0.38, 0), '#6b5136'))
  // a grade de ferro
  for (let k = -4; k <= 4; k++) {
    const x = (k / 4) * (a - 0.2)
    partes.push(colorir(new THREE.BoxGeometry(0.045, 0.75, 0.045).translate(x, 0.78, -a), '#3b3038'))
    partes.push(colorir(new THREE.BoxGeometry(0.045, 0.75, 0.045).translate(x, 0.78, a), '#3b3038'))
    partes.push(colorir(new THREE.BoxGeometry(0.045, 0.75, 0.045).translate(-a, 0.78, x), '#3b3038'))
    partes.push(colorir(new THREE.BoxGeometry(0.045, 0.75, 0.045).translate(a, 0.78, x), '#3b3038'))
  }
  partes.push(colorir(new THREE.BoxGeometry(a * 2, 0.06, 0.06).translate(0, 1.12, -a), '#3b3038'))
  partes.push(colorir(new THREE.BoxGeometry(a * 2, 0.06, 0.06).translate(0, 1.12, a), '#3b3038'))
  partes.push(colorir(new THREE.BoxGeometry(0.06, 0.06, a * 2).translate(-a, 1.12, 0), '#3b3038'))
  partes.push(colorir(new THREE.BoxGeometry(0.06, 0.06, a * 2).translate(a, 1.12, 0), '#3b3038'))
  return mergeGeometries(partes.map((g) => g.toNonIndexed()))
}

// arbusto: massa verde baixa
function geometriaArbusto(rndA) {
  const g = new THREE.IcosahedronGeometry(0.45, 1)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  const cores = []
  const c1 = new THREE.Color('#2f6b38')
  const c2 = new THREE.Color('#5f9c46')
  const cor = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const k = 1 + rndA.entre(-0.25, 0.25)
    v.multiplyScalar(k)
    v.y *= 0.75
    p.setXYZ(i, v.x, v.y + 0.5, v.z)
    cor.copy(c1).lerp(c2, THREE.MathUtils.clamp(v.y + 0.4, 0, 1))
    cores.push(cor.r, cor.g, cor.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.deleteAttribute('uv')
  g.computeVertexNormals()
  return g.toNonIndexed()
}

export function criarPraca(cena) {
  const y0 = alturaTerreno(CENTRO[0], CENTRO[1])
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)

  // ---- o coreto coberto, no centro da praça (1923)
  const coreto = new THREE.Mesh(geometriaCoreto(), toonVertice())
  coreto.position.set(CENTRO[0], y0, CENTRO[1])
  coreto.castShadow = true
  coreto.receiveShadow = true
  coreto.name = 'coreto'
  cena.add(coreto)
  ocupacao.marcar(CENTRO[0], CENTRO[1], CORETO.raio + 0.6, CORETO.raio + 0.6)

  // ---- os jardins (1920): canteiro com grade, arvoreira, arbustos e bancos
  const jardins = escolherJardins()
  const canteiros = []
  const bancos = []
  const matrizesArvoreira = { oiti: [], murici: [], cajueiro: [] }
  const matrizesArbusto = []
  const rndA = criarAleatorio(778)
  const geoArvores = { oiti: oiti(rndA), murici: murici(rndA), cajueiro: cajueiro(rndA) }
  for (const j of jardins) {
    const y = alturaTerreno(j.x, j.z)
    const ang = rnd.entre(0, Math.PI * 2)
    q.setFromAxisAngle(Y, ang)
    canteiros.push(m.clone().compose(new THREE.Vector3(j.x, y, j.z), q, new THREE.Vector3(1, 1, 1)))
    ocupacao.marcar(j.x, j.z, 2.6, 2.6)
    // arvoreira dentro do canteiro: oiti e murici, de copa pequena (a praça é
    // pequena no jogo e a copa do cajueiro a tomava inteira)
    for (let k = 0; k < 2; k++) {
      const ax = j.x + rnd.entre(-1.4, 1.4)
      const az = j.z + rnd.entre(-1.4, 1.4)
      const esp = rnd.chance(0.6) ? 'oiti' : 'murici'
      const esc = rnd.entre(0.7, 0.95)
      q.setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2))
      matrizesArvoreira[esp].push(m.clone().compose(
        new THREE.Vector3(ax, alturaTerreno(ax, az) - 0.1, az), q, new THREE.Vector3(esc, esc, esc)
      ))
    }
    // arbustos na frente da mureta
    for (let k = 0; k < 6; k++) {
      const ax = j.x + rnd.entre(-2, 2)
      const az = j.z + rnd.entre(-2, 2)
      if (Math.hypot(ax - j.x, az - j.z) > 1.7) continue
      const e = rnd.entre(0.8, 1.2)
      q.setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2))
      matrizesArbusto.push(m.clone().compose(new THREE.Vector3(ax, alturaTerreno(ax, az), az), q, new THREE.Vector3(e, e, e)))
    }
    // bancos em volta do jardim, virados para o canteiro
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4
      const bx = j.x + Math.cos(a) * 3.1
      const bz = j.z + Math.sin(a) * 3.1
      if (!dentroDaPraca(bx, bz)) continue
      const y = alturaTerreno(bx, bz)
      q.setFromAxisAngle(Y, -a + Math.PI / 2)
      bancos.push(m.clone().compose(new THREE.Vector3(bx, y, bz), q, new THREE.Vector3(1, 1, 1)))
    }
  }

  const mat = toonVertice()
  if (canteiros.length) {
    instanciarEmBlocos(cena, geometriaCanteiro(), mat, canteiros, null, { nome: 'canteiros' })
  }
  if (bancos.length) {
    instanciarEmBlocos(cena, geometriaBanco(), toonVertice(), bancos, null, { nome: 'bancos-praca' })
  }
  if (matrizesArbusto.length) {
    instanciarEmBlocos(cena, geometriaArbusto(rndA), mat, matrizesArbusto, null, { nome: 'arbustos' })
  }
  for (const [esp, lista] of Object.entries(matrizesArvoreira)) {
    if (!lista.length) continue
    instanciarEmBlocos(cena, geoArvores[esp], mat, lista, null, { nome: `arvores-praca-${esp}`, placa: true })
  }

  return { jardins: jardins.length, coreto: [CENTRO[0], y0, CENTRO[1]] }
}
