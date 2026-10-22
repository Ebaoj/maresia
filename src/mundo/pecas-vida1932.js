// As peças da vida de rua de 1932 (src/mundo/vida1932.js põe no mundo): carroça de duas rodas, jumento
// com cangalha e caçuás, saco de algodão, caixote, pote de barro, varal de quintal e o poste do bonde.
//
// O que tem fonte (docs/direcao-de-arte.md e o dossiê marcos-1932.md): a Estação Central despachava
// algodão (armazéns de algodão no entorno, trens de algodão nas fotos de Platt, 1935); a feira do
// Mercado de Ferro; a água de pote e cacimba (cata-vento e bomba a braço nos quintais); o bonde
// elétrico da Light (1913) com fio aéreo. HIPÓTESE: a forma exata de cada peça (desenho genérico de
// época, sem modelo de referência), as quantidades e os lugares.
//
// Cada peça é uma geometria com cor por vértice (toonVertice, que escreve gLuz) e poucos triângulos:
// elas aparecem às dezenas e de longe.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { colorir } from './cenografia.js'
import { CAL } from '../paleta.js'

const MADEIRA = '#8a7154'
const MADEIRA_ESCURA = '#5f4f3d'
const FERRO = '#2b2622'
const JUTA = '#cdb994'
const ALGODAO = '#d8cbb0' // o fardo de algodão em pano de juta claro, sujo de viagem (não o branco da cal)
const PELO = '#7d7166'
const PELO_CLARO = '#a59a8c'

const caixa = (l, a, p, x, y, z, cor) => colorir(new THREE.BoxGeometry(l, a, p).translate(x, y, z), cor)

// carroça de duas rodas, varais para a frente (+z). Origem no chão, no meio do eixo
export function geometriaCarroca() {
  const partes = []
  // as rodas: aro de madeira com oito raios (um disco achatado de 10 lados basta de longe)
  for (const lado of [-0.72, 0.72]) {
    partes.push(colorir(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 10).rotateZ(Math.PI / 2).translate(lado, 0.62, 0), MADEIRA_ESCURA))
    partes.push(colorir(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 6).rotateZ(Math.PI / 2).translate(lado, 0.62, 0), FERRO))
  }
  partes.push(caixa(1.5, 0.06, 0.06, 0, 0.62, 0, FERRO)) // o eixo
  // a caixa da carroça: o estrado e as tábuas dos lados
  partes.push(caixa(1.25, 0.08, 2.0, 0, 0.82, -0.15, MADEIRA))
  for (const lado of [-0.6, 0.6]) partes.push(caixa(0.05, 0.36, 2.0, lado, 1.04, -0.15, MADEIRA))
  partes.push(caixa(1.25, 0.36, 0.05, 0, 1.04, -1.15, MADEIRA))
  // os varais, para o animal (descem até o chão na frente quando a carroça está solta)
  for (const lado of [-0.42, 0.42]) {
    partes.push(caixa(0.07, 0.07, 2.2, lado, 0.5, 1.75, MADEIRA_ESCURA).rotateX(0.0))
  }
  partes.push(caixa(0.9, 0.07, 0.07, 0, 0.5, 2.8, MADEIRA_ESCURA))
  return mergeGeometries(partes)
}

// carga da carroça: três sacos deitados no estrado
export function geometriaCargaSacos() {
  const partes = []
  for (const [x, z, y] of [[-0.3, -0.6, 1.0], [0.3, -0.6, 1.0], [0, 0.15, 1.0], [0, -0.25, 1.35]]) {
    partes.push(colorir(new THREE.CapsuleGeometry(0.24, 0.55, 2, 6).rotateX(Math.PI / 2).scale(1, 0.75, 1).translate(x, y, z), JUTA))
  }
  return mergeGeometries(partes)
}

// jumento de pé (parado: o movimento de bicho é rotoscopia, e este fica imóvel), com a cangalha e dois
// caçuás (os cestos de cipó do sertão). Cabeça para +z
export function geometriaJumento(comCaçuas = true) {
  const partes = []
  partes.push(colorir(new THREE.CapsuleGeometry(0.28, 0.75, 3, 8).rotateX(Math.PI / 2).translate(0, 1.0, 0), PELO))
  // pescoço e cabeça
  partes.push(colorir(new THREE.CylinderGeometry(0.14, 0.2, 0.6, 7).rotateX(-0.75).translate(0, 1.28, 0.62), PELO))
  partes.push(colorir(new THREE.CapsuleGeometry(0.13, 0.32, 2, 7).rotateX(Math.PI / 2 - 0.5).translate(0, 1.42, 0.92), PELO))
  partes.push(colorir(new THREE.SphereGeometry(0.1, 6, 4).translate(0, 1.32, 1.13), PELO_CLARO)) // o focinho claro
  // as orelhas compridas
  for (const lado of [-0.07, 0.07]) partes.push(colorir(new THREE.ConeGeometry(0.045, 0.32, 4).rotateX(-0.25).translate(lado, 1.75, 0.8), PELO))
  // as pernas
  for (const [x, z] of [[-0.16, 0.4], [0.16, 0.4], [-0.16, -0.42], [0.16, -0.42]]) {
    partes.push(colorir(new THREE.CylinderGeometry(0.06, 0.05, 0.85, 5).translate(x, 0.43, z), PELO))
    partes.push(colorir(new THREE.CylinderGeometry(0.065, 0.065, 0.08, 5).translate(x, 0.04, z), '#2e2620'))
  }
  // o rabo
  partes.push(colorir(new THREE.CylinderGeometry(0.025, 0.04, 0.55, 4).rotateX(0.25).translate(0, 0.85, -0.68), PELO))
  if (comCaçuas) {
    partes.push(caixa(0.62, 0.12, 0.7, 0, 1.33, -0.05, MADEIRA_ESCURA)) // a cangalha
    for (const lado of [-0.42, 0.42]) {
      partes.push(colorir(new THREE.CylinderGeometry(0.2, 0.16, 0.48, 7).translate(lado, 1.06, -0.05), CAL.palha))
    }
  }
  return mergeGeometries(partes)
}

// saco de algodão em pé (fardo de juta amarrado), um pouco torto
export function geometriaSaco() {
  return colorir(new THREE.CapsuleGeometry(0.3, 0.55, 2, 7).scale(1, 1, 0.8).translate(0, 0.58, 0), JUTA)
}

// fardo de algodão prensado (o que a Estação despachava): caixa clara com duas cintas
export function geometriaFardo() {
  return mergeGeometries([
    caixa(0.95, 0.55, 0.55, 0, 0.275, 0, ALGODAO),
    caixa(0.05, 0.57, 0.57, -0.26, 0.285, 0, MADEIRA_ESCURA),
    caixa(0.05, 0.57, 0.57, 0.26, 0.285, 0, MADEIRA_ESCURA),
  ])
}

// caixote de madeira de feira
export function geometriaCaixote() {
  return mergeGeometries([
    caixa(0.62, 0.42, 0.44, 0, 0.21, 0, MADEIRA),
    caixa(0.64, 0.05, 0.46, 0, 0.36, 0, MADEIRA_ESCURA),
    caixa(0.64, 0.05, 0.46, 0, 0.08, 0, MADEIRA_ESCURA),
  ])
}

// pote de barro na porta (a água de beber)
export function geometriaPote() {
  const perfil = [[0.0, 0], [0.12, 0.0], [0.2, 0.12], [0.21, 0.24], [0.13, 0.38], [0.09, 0.42], [0.11, 0.46]]
  return colorir(new THREE.LatheGeometry(perfil.map(([x, y]) => new THREE.Vector2(x, y)), 9), '#a8643f')
}

// varal de quintal: duas varas, o fio e três panos (a cor forte de 1932 vai no pano)
export function geometriaVaral(cores) {
  const partes = []
  for (const x of [-1.6, 1.6]) partes.push(caixa(0.06, 1.9, 0.06, x, 0.95, 0, MADEIRA_ESCURA))
  partes.push(caixa(3.2, 0.02, 0.02, 0, 1.82, 0, '#d9cbb0'))
  const larg = [0.7, 0.55, 0.8]
  let x = -1.2
  larg.forEach((l, i) => {
    partes.push(colorir(new THREE.PlaneGeometry(l, 0.62 + 0.1 * i).translate(x + l / 2, 1.5 - 0.05 * i, 0), cores[i % cores.length]))
    x += l + 0.12
  })
  const g = mergeGeometries(partes)
  return g
}

// o poste do bonde: madeira, braço de ferro sobre a rua (+x) e o isolador onde o fio passa.
// O fio do bonde pende a 6 m, no meio da rua, sobre o trilho
export const ALTURA_FIO_BONDE = 6.0
export function geometriaPosteBonde(braco) {
  return mergeGeometries([
    colorir(new THREE.CylinderGeometry(0.1, 0.14, 7.0, 6).translate(0, 3.5, 0), MADEIRA_ESCURA),
    caixa(braco, 0.06, 0.06, braco / 2, ALTURA_FIO_BONDE + 0.25, 0, FERRO),
    colorir(new THREE.CylinderGeometry(0.025, 0.025, braco * 0.62, 4).rotateZ(Math.PI / 2 - 0.35).translate(braco * 0.28, ALTURA_FIO_BONDE - 0.25, 0), FERRO),
    colorir(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 6).translate(braco, ALTURA_FIO_BONDE + 0.12, 0), '#d9cbb0'),
  ])
}
