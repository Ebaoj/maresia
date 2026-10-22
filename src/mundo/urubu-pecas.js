// As peças do Campo do Urubu (geometria; o lugar de cada uma está em urubu-planta.js).
//
// FATO: uma cozinha onde se preparavam os alimentos; cercas e vigilância (relatório médico de 1933, via
// Diário do Nordeste); posto médico e capela (docs/direcao-de-arte.md, seção 6). O resto é HIPÓTESE de
// desenho de época, sem modelo: a forma da cozinha de chão (caldeirão sobre três pedras), a pipa d'água, a
// guarita de tábua, a mesa do registro com o livro e o lampião de querosene, as latrinas de tábua.
// Coordenada local de cada peça: x ao longo da cerca do portão (o u da planta), z para dentro do campo (w).

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { colorir, geometriaCadeira } from './cenografia.js'
import { CAL } from '../paleta.js'
import { criarAleatorio } from '../utils.js'
import { ZINCO } from './urubu-galpao.js'

const ESTEIO = '#6e5a44'
const TABUA = '#8f785c'
const FERRO = '#2f2b27'
const PEDRA = '#8d8278'
const caixa = (l, a, p, x, y, z, cor) => colorir(new THREE.BoxGeometry(l, a, p).translate(x, y, z), cor)
const cilindro = (r0, r1, a, seg, x, y, z, cor) => colorir(new THREE.CylinderGeometry(r0, r1, a, seg).translate(x, y, z), cor)
const juntar = (partes) => mergeGeometries(partes)

// telhado de uma água (meia-água) de zinco liso com nervura pintada pela cor: l em x, p em z, caindo para -z
function meiaAgua (l, p, hFrente, hFundo, partes) {
  const ang = Math.atan2(hFrente - hFundo, p)
  const comp = Math.hypot(p, hFrente - hFundo) + 0.5
  for (let x = -l / 2 - 0.2; x < l / 2 + 0.2; x += 0.8) {
    const g = new THREE.BoxGeometry(0.82, 0.03, comp).rotateX(-ang)
    partes.push(colorir(g.translate(x + 0.4, (hFrente + hFundo) / 2 + 0.06, 0), Math.round(x / 0.8) % 4 ? ZINCO : '#a9a497'))
  }
}

// alpendre: quatro esteios e a meia-água (a cozinha, o registro, a guarita)
function alpendre (l, p, hFrente, hFundo, partes) {
  for (const x of [-l / 2, l / 2]) {
    for (const [z, h] of [[p / 2, hFrente], [-p / 2, hFundo]]) partes.push(caixa(0.15, h + 0.5, 0.15, x, (h + 0.5) / 2 - 0.5, z, ESTEIO))
  }
  for (let x = -l / 2 + 4; x < l / 2 - 1; x += 4) {
    partes.push(caixa(0.15, hFrente + 0.5, 0.15, x, (hFrente + 0.5) / 2 - 0.5, p / 2, ESTEIO))
    partes.push(caixa(0.15, hFundo + 0.5, 0.15, x, (hFundo + 0.5) / 2 - 0.5, -p / 2, ESTEIO))
  }
  partes.push(caixa(l + 0.3, 0.12, 0.12, 0, hFrente, p / 2, ESTEIO), caixa(l + 0.3, 0.12, 0.12, 0, hFundo, -p / 2, ESTEIO))
  meiaAgua(l, p, hFrente, hFundo, partes)
}

// o caldeirão de ferro sobre três pedras, com a lenha embaixo (a chama é outra peça, acesa)
export function geometriaFogao () {
  const partes = []
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2
    partes.push(colorir(new THREE.DodecahedronGeometry(0.22, 0).scale(1, 0.9, 1).translate(Math.cos(a) * 0.48, 0.18, Math.sin(a) * 0.48), PEDRA))
  }
  partes.push(cilindro(0.62, 0.5, 0.7, 12, 0, 0.72, 0, FERRO), cilindro(0.66, 0.66, 0.06, 12, 0, 1.08, 0, '#3d3833'))
  for (let k = 0; k < 4; k++) partes.push(colorir(new THREE.CylinderGeometry(0.05, 0.06, 1.1, 5).rotateZ(Math.PI / 2).rotateY(k * 0.8).translate(0, 0.08, 0), '#5a4634'))
  // a cinza em volta
  partes.push(cilindro(0.85, 0.9, 0.03, 10, 0, 0.015, 0, '#7a7068'))
  return juntar(partes)
}

// a chama: cone baixo (vai num material aceso, luzFixa)
export function geometriaChama (escala = 1) {
  return juntar([
    colorir(new THREE.ConeGeometry(0.3 * escala, 0.45 * escala, 6).translate(0, 0.25 * escala, 0), '#ffb35a'),
    colorir(new THREE.ConeGeometry(0.16 * escala, 0.6 * escala, 5).translate(0.08 * escala, 0.3 * escala, 0.05), '#ffd27a'),
  ])
}

// a fogueira da noite: roda de pedras e lenha (a chama vai à parte)
export function geometriaFogueira () {
  const partes = []
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    partes.push(colorir(new THREE.DodecahedronGeometry(0.16, 0).translate(Math.cos(a) * 0.62, 0.1, Math.sin(a) * 0.62), PEDRA))
  }
  for (let k = 0; k < 5; k++) partes.push(colorir(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 5).rotateZ(Math.PI / 2 - 0.3).rotateY(k * 1.25).translate(0, 0.16, 0), '#4f3d2e'))
  partes.push(cilindro(0.6, 0.62, 0.02, 10, 0, 0.01, 0, '#6d655e'))
  return juntar(partes)
}

// a cozinha coletiva: alpendre largo de zinco, fundo de taipa, os fogões, a mesa de servir, lenha e sacos.
// Local: x = largura (o lado aberto em +x dá para a avenida), z = comprimento
export function geometriaCozinha (l, p, fogosLocais, mesaLocal, rnd = criarAleatorio(7)) {
  const partes = []
  // alpendre girado: o lado alto (frente) virado para a avenida (+x)
  const teto = []
  alpendre(p, l, 3.4, 2.7, teto)
  const giro = new THREE.Matrix4().makeRotationY(Math.PI / 2)
  for (const g of teto) partes.push(g.applyMatrix4(giro))
  // o fundo de taipa, até o beiral de trás, e meia parede nas cabeceiras
  partes.push(caixa(0.18, 2.7, p, -l / 2 - 0.1, 1.35, 0, CAL.taipa))
  for (const z of [-p / 2 - 0.1, p / 2 + 0.1]) partes.push(caixa(l * 0.6, 1.3, 0.16, -l * 0.2, 0.65, z, CAL.taipa))
  for (const [fx, fz] of fogosLocais) partes.push(geometriaFogao().translate(fx, 0, fz))
  // a mesa de servir: tábua sobre cavaletes, com o caldeirão de servir, a pilha de pratos de folha e a concha
  const [mx, mz] = mesaLocal
  partes.push(caixa(0.8, 0.06, 3.6, mx, 0.82, mz, TABUA))
  for (const dz of [-1.5, 1.5]) for (const dx of [-0.3, 0.3]) partes.push(caixa(0.07, 0.8, 0.07, mx + dx, 0.4, mz + dz, ESTEIO))
  partes.push(cilindro(0.34, 0.3, 0.38, 10, mx, 1.04, mz - 0.8, FERRO))
  for (let k = 0; k < 6; k++) partes.push(cilindro(0.12, 0.1, 0.02, 8, mx + 0.1, 0.86 + k * 0.022, mz + 0.6, '#b9b6ad'))
  partes.push(caixa(0.04, 0.04, 0.7, mx - 0.12, 1.32, mz - 0.7, '#5a4634'))
  // a lenha empilhada e os sacos de mantimento
  for (let k = 0; k < 14; k++) partes.push(colorir(new THREE.CylinderGeometry(0.07, 0.08, 1.2, 5).rotateX(Math.PI / 2).translate(-l / 2 + 0.9 + (k % 5) * 0.17, 0.08 + Math.floor(k / 5) * 0.15, p / 2 - 1.4 + rnd.entre(-0.1, 0.1)), '#6b5440'))
  for (let k = 0; k < 6; k++) partes.push(colorir(new THREE.CapsuleGeometry(0.26, 0.4, 2, 6).rotateZ(Math.PI / 2).scale(1, 0.75, 1).translate(-l / 2 + 1.2 + (k % 3) * 0.6, 0.22 + Math.floor(k / 3) * 0.36, -p / 2 + 1.1), '#d8ccb0'))
  return juntar(partes)
}

// a pipa d'água num estrado, com a torneira, e as latas em volta. Local: origem no pé do estrado
export function geometriaPipa () {
  const partes = []
  partes.push(caixa(1.4, 0.08, 1.4, 0, 0.7, 0, TABUA))
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) partes.push(caixa(0.1, 0.7, 0.1, x, 0.35, z, ESTEIO))
  partes.push(cilindro(0.55, 0.5, 1.25, 12, 0, 1.36, 0, '#7d6040'))
  for (const y of [0.9, 1.36, 1.82]) partes.push(cilindro(0.575, 0.575, 0.05, 12, 0, y, 0, '#3d3833'))
  partes.push(caixa(0.06, 0.06, 0.25, 0, 0.98, 0.6, '#3d3833'))
  // o chão molhado embaixo da torneira (barro mais escuro)
  partes.push(cilindro(0.9, 0.95, 0.02, 10, 0, 0.012, 0.8, '#8e7a5c'))
  return juntar(partes)
}

// a lata de querosene (18 litros) que vira balde d'água
export function geometriaLata () {
  return juntar([caixa(0.24, 0.34, 0.24, 0, 0.17, 0, '#a9a69c'), caixa(0.02, 0.18, 0.02, 0, 0.42, 0, '#5a5752'), caixa(0.24, 0.02, 0.02, 0, 0.5, 0, '#5a5752')])
}

// a bacia de barro de lavar roupa, com a água
export function geometriaBacia () {
  return juntar([cilindro(0.42, 0.3, 0.2, 10, 0, 0.1, 0, '#a8643f'), cilindro(0.38, 0.38, 0.02, 10, 0, 0.17, 0, '#8d9a92')])
}

// a trouxa: os pertences num pano amarrado (a cor vem de cada cópia)
export function geometriaTrouxa () {
  return juntar([
    colorir(new THREE.SphereGeometry(0.28, 7, 5).scale(1, 0.62, 0.85).translate(0, 0.17, 0), '#ffffff'),
    colorir(new THREE.SphereGeometry(0.09, 5, 4).translate(0, 0.35, 0), '#e6e0d4'),
  ])
}

// o pano dobrado no colo de quem remenda (vai junto da pessoa sentada)
export function geometriaPano () {
  return caixa(0.5, 0.04, 0.4, 0, 0.42, 0.32, '#ffffff')
}

// a guarita de tábua do portão, com a lanterna no esteio da frente. Local: frente em +z (para dentro do campo)
export function geometriaGuarita (l, p) {
  const rnd = criarAleatorio(32)
  const partes = []
  const h = 2.5
  for (const [x0, x1, z, eixo] of [[-l / 2, l / 2, -p / 2, 'x'], [-l / 2, -0.4, p / 2, 'x'], [0.4, l / 2, p / 2, 'x'], [-p / 2, p / 2, -l / 2, 'z'], [-p / 2, p / 2, l / 2, 'z']]) {
    for (let t = x0; t < x1 - 0.05; t += 0.25) {
      const cor = rnd.escolha([TABUA, CAL.piuba, '#7d6a52'])
      if (eixo === 'x') partes.push(caixa(0.22, h, 0.03, t + 0.11, h / 2, z, cor))
      else partes.push(caixa(0.03, h, 0.22, z, h / 2, t + 0.11, cor))
    }
  }
  meiaAgua(l + 0.6, p + 0.8, h + 0.35, h, partes)
  // a janelinha (vão escuro) virada para o portão
  partes.push(caixa(0.05, 0.5, 0.8, l / 2 + 0.02, 1.6, 0, '#3a332c'))
  return juntar(partes)
}

// a porteira: dois mourões altos e duas folhas de ripa com a mão-francesa. aberta: as folhas viradas para dentro
export function geometriaPorteira (largura, aberta = true) {
  const partes = []
  for (const x of [-largura / 2, largura / 2]) partes.push(caixa(0.22, 3.2, 0.22, x, 1.1, 0, ESTEIO))
  const folha = largura / 2 - 0.12
  for (const lado of [-1, 1]) {
    const pecas = []
    for (const y of [0.3, 0.75, 1.2, 1.6]) pecas.push(caixa(folha, 0.1, 0.05, folha / 2, y, 0, TABUA))
    pecas.push(caixa(0.08, 1.5, 0.05, 0.04, 0.95, 0, ESTEIO), caixa(0.08, 1.5, 0.05, folha - 0.04, 0.95, 0, ESTEIO))
    const d = colorir(new THREE.BoxGeometry(Math.hypot(folha, 1.3), 0.08, 0.05).rotateZ(Math.atan2(1.3, folha)).translate(folha / 2, 0.95, 0), TABUA)
    pecas.push(d)
    const g = juntar(pecas)
    // dobradiça no mourão; a folha da direita espelhada
    if (lado > 0) g.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1))
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(aberta ? -lado * 1.35 : 0))
    partes.push(g.translate(lado * -largura / 2 + lado * 0.12, 0, 0))
  }
  return juntar(partes)
}

// a mesa do registro: alpendre de zinco, mesa de tábua, a cadeira do funcionário, o livro aberto, o tinteiro e
// o lampião de querosene (o vidro aceso é outra peça). O funcionário senta em +x e olha para -x (quem chega).
export function geometriaRegistro (l, p) {
  const partes = []
  alpendre(l, p, 2.6, 2.3, partes)
  partes.push(caixa(0.8, 0.05, 1.5, 0, 0.76, 0, TABUA))
  for (const dx of [-0.32, 0.32]) for (const dz of [-0.65, 0.65]) partes.push(caixa(0.06, 0.74, 0.06, dx, 0.37, dz, ESTEIO))
  const cadeira = geometriaCadeira('#6b5a48').applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2)).translate(0.75, 0, 0)
  partes.push(cadeira)
  // o livro de registro aberto, virado para o funcionário (o jogador lê por cima do ombro dele)
  partes.push(caixa(0.36, 0.03, 0.52, 0.08, 0.8, 0, '#3b2a22'))
  partes.push(caixa(0.32, 0.02, 0.24, 0.08, 0.82, -0.13, '#efe6d2'), caixa(0.32, 0.02, 0.24, 0.08, 0.82, 0.13, '#e9dfcc'))
  partes.push(cilindro(0.03, 0.035, 0.06, 6, -0.12, 0.81, 0.38, '#1d1a1a'), caixa(0.01, 0.01, 0.18, -0.1, 0.85, 0.33, '#2b2622'))
  // o lampião: base e chaminé (o vidro aceso é geometriaVidroLampiao)
  partes.push(cilindro(0.07, 0.09, 0.1, 8, -0.2, 0.83, -0.5, '#6b5f52'), cilindro(0.03, 0.03, 0.04, 6, -0.2, 1.1, -0.5, '#3d3833'))
  // o banco de quem espera e a caixa de papéis
  partes.push(caixa(1.8, 0.06, 0.36, -1.5, 0.42, -1.1, TABUA), caixa(0.06, 0.4, 0.3, -2.3, 0.2, -1.1, ESTEIO), caixa(0.06, 0.4, 0.3, -0.7, 0.2, -1.1, ESTEIO))
  partes.push(caixa(0.5, 0.34, 0.4, 0.9, 0.17, 1.0, '#7d6a52'))
  return juntar(partes)
}
export function geometriaVidroLampiao () {
  return new THREE.CylinderGeometry(0.055, 0.07, 0.16, 8)
}

// posto médico e capela: taipa caiada, telhado de zinco de duas águas. Local: x = l, z = p, porta em +z
export function geometriaCasinha (l, p, h, tipo) {
  const partes = []
  partes.push(caixa(l, h, p, 0, h / 2, 0, CAL.cal))
  partes.push(caixa(l + 0.04, 0.5, p + 0.04, 0, 0.25, 0, CAL.calVelha)) // a barra suja de barro
  partes.push(caixa(1.0, 2.1, 0.06, 0, 1.05, p / 2 + 0.02, CAL.mangue))
  for (const x of [-l / 3, l / 3]) partes.push(caixa(0.8, 0.9, 0.06, x, 1.6, p / 2 + 0.02, tipo === 'capela' ? CAL.azul : '#5a5952'))
  // duas águas de zinco ao longo de x (capela: ao longo de z, com a frente na empena)
  const comp = tipo === 'capela' ? p : l
  const larg = tipo === 'capela' ? l : p
  const cume = 1.3
  const ang = Math.atan2(cume, larg / 2)
  const agua = Math.hypot(larg / 2 + 0.4, cume)
  for (const lado of [1, -1]) {
    const g = new THREE.BoxGeometry(comp + 0.5, 0.05, agua).translate(0, 0, agua / 2).rotateX(ang)
    if (lado < 0) g.rotateY(Math.PI)
    if (tipo === 'capela') g.rotateY(Math.PI / 2)
    partes.push(colorir(g.translate(0, h + cume + 0.04, 0), ZINCO))
  }
  // empena caiada
  const tri = new THREE.BufferGeometry()
  const e = larg / 2
  const v = tipo === 'capela'
    ? [-e, h, p / 2, e, h, p / 2, 0, h + cume, p / 2, e, h, -p / 2, -e, h, -p / 2, 0, h + cume, -p / 2]
    : [l / 2, h, e, l / 2, h, -e, l / 2, h + cume, 0, -l / 2, h, -e, -l / 2, h, e, -l / 2, h + cume, 0]
  // as duas faces (o triângulo solto não tem lado de dentro)
  for (let i = 0, n = v.length; i < n; i += 9) v.push(v[i + 6], v[i + 7], v[i + 8], v[i + 3], v[i + 4], v[i + 5], v[i], v[i + 1], v[i + 2])
  tri.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  tri.computeVertexNormals()
  partes.push(colorir(tri, CAL.cal))
  if (tipo === 'capela') {
    // o sineiro de madeira na frente e a cruz
    partes.push(caixa(0.12, 2.2, 0.12, -0.7, h + cume + 0.6, p / 2 + 0.3, ESTEIO), caixa(0.12, 2.2, 0.12, 0.7, h + cume + 0.6, p / 2 + 0.3, ESTEIO))
    partes.push(caixa(1.6, 0.12, 0.14, 0, h + cume + 1.6, p / 2 + 0.3, ESTEIO), cilindro(0.16, 0.22, 0.3, 8, 0, h + cume + 1.3, p / 2 + 0.3, '#6b5f52'))
    partes.push(caixa(0.1, 0.9, 0.1, 0, h + cume + 2.15, p / 2 + 0.3, ESTEIO), caixa(0.5, 0.09, 0.09, 0, h + cume + 2.3, p / 2 + 0.3, ESTEIO))
  } else {
    // o banco de espera encostado na frente
    partes.push(caixa(3.2, 0.06, 0.36, l / 4 + 0.6, 0.44, p / 2 + 0.5, TABUA), caixa(0.06, 0.42, 0.3, l / 4 - 0.9, 0.21, p / 2 + 0.5, ESTEIO), caixa(0.06, 0.42, 0.3, l / 4 + 2.1, 0.21, p / 2 + 0.5, ESTEIO))
  }
  return juntar(partes)
}

// as latrinas: cabines de tábua em fila, meia-água de zinco, portas (umas encostadas). Local: x = fila
export function geometriaLatrinas (l, p, cabines) {
  const rnd = criarAleatorio(55)
  const partes = []
  const h = 2.1
  const w = l / cabines
  for (let i = 0; i <= cabines; i++) partes.push(caixa(0.04, h, p, -l / 2 + i * w, h / 2, 0, TABUA))
  for (let t = -l / 2; t < l / 2; t += 0.25) partes.push(caixa(0.22, h, 0.03, t + 0.11, h / 2, -p / 2, rnd.escolha([TABUA, CAL.piuba])))
  for (let i = 0; i < cabines; i++) {
    const g = new THREE.BoxGeometry(w - 0.3, h - 0.2, 0.04).translate((w - 0.3) / 2, (h - 0.2) / 2, 0)
    g.rotateY(rnd.chance(0.4) ? -0.5 : 0)
    partes.push(colorir(g.translate(-l / 2 + i * w + 0.15, 0, p / 2), rnd.escolha([TABUA, '#7d6a52'])))
  }
  meiaAgua(l + 0.4, p + 0.6, h + 0.25, h - 0.05, partes)
  return juntar(partes)
}
