// A Estação Central de Fortaleza (docs/mapa-1932.md).
//
// A estação foi erguida pelos retirantes de 1877-79 e inaugurada em 9 de junho de
// 1880, na Praça Castro Carreira, na junção da linha do Baturité com o ramal para o
// cais do Poço das Dragas. O primeiro trem chegou em 30 de novembro de 1873, puxado
// a cavalo, do trapiche do porto.
//
// O que se ve aqui e um marco de leitura: um predio comprido de dois pavimentos
// paralelo aos trilhos, com telhado de duas aguas, um relogio no meio da fachada e a
// marquise de ferro na plataforma. Os vãos e a cor sao de leitura, nao de foto: a
// planta oficial da cidade nao detalha a station.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toon, toonVertice } from '../materiais.js'
import { CAL } from '../paleta.js'
import { lugaresJogo } from './fortaleza1932.js'
import { alturaTerreno } from './terreno.js'
import { adicionarCaixa, adicionarCirculo } from './colisao.js'

// a direcao da linha do Baturite quando ela sai da Central (o predio e paralelo a via)
const ANGULO = -0.628

function corir(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

// um vao em arco (a station tinha portais de ferro e vidro)
function vaoArco(w, h, arco) {
  const s = new THREE.Shape()
  const x0 = -w / 2
  const x1 = w / 2
  s.moveTo(x0, 0)
  s.lineTo(x1, 0)
  s.lineTo(x1, h - arco)
  s.quadraticCurveTo(0, h + arco, x0, h - arco)
  s.lineTo(x0, 0)
  return new THREE.ExtrudeGeometry(s, { depth: 0.18, bevelEnabled: false, curveSegments: 8 })
}

export function criarEstacao(cena) {
  const [x, z] = lugaresJogo.estacao
  const chao = alturaTerreno(x, z)
  const grupo = new THREE.Group()
  grupo.name = 'estacao-central'
  grupo.position.set(x, chao, z)
  grupo.rotation.y = ANGULO

  const parede = toonVertice()
  const detalhe = toon(CAL.cal)
  const telha = toon(CAL.telha)
  const ferro = toon('#2f2a2e')
  const pedra = toon('#b9b0a0')

  // --- o predio: dois pavimentos, 24 unidades de comprimento (uns 65 m)
  const L = 24
  const P = 8.5
  const corpo = mergeGeometries([
    corir(new THREE.BoxGeometry(L, 6.4, P).translate(0, 3.2, 0), CAL.cal),
    corir(new THREE.BoxGeometry(L + 0.6, 0.5, P + 0.6).translate(0, 6.5, 0), CAL.calVelha), // cimalha
  ])
  const mCorpo = new THREE.Mesh(corpo, parede)
  mCorpo.castShadow = true
  mCorpo.receiveShadow = true
  grupo.add(mCorpo)

  // telhado de duas aguas, cumeeira no comprimento
  const telhas = []
  for (const lado of [-1, 1]) {
    const t = new THREE.BoxGeometry(L + 1.2, 0.28, P / 2 + 0.9)
    t.rotateX(lado * 0.42)
    t.translate(0, 7.6, lado * (P / 4 + 0.1))
    telhas.push(corir(t, CAL.telha))
  }
  const mTelha = new THREE.Mesh(mergeGeometries(telhas), telha)
  mTelha.castShadow = true
  grupo.add(mTelha)

  // --- a fachada da praça: portais de arco, um no meio e um em cada ponta
  // O portal e um vao: fica recuado na parede, com o peitoril em pedra e o
  // batente de madeira. Se ficar na frente da parede, vira uma placa preta
  // boiando no ar.
  const arcos = []
  for (const px of [-8.5, 0, 8.5]) {
    const a = vaoArco(2.6, 3.2, 0.7)
    a.translate(px, 1.1, P / 2 - 0.16)
    arcos.push(corir(a, '#4a3428'))
    // o batente de madeira do vao
    arcos.push(corir(new THREE.BoxGeometry(2.9, 0.22, 0.22).translate(px, 1.05, P / 2 + 0.06), '#6b4a33'))
    // peitoril de pedra
    arcos.push(corir(new THREE.BoxGeometry(3.2, 0.24, 0.34).translate(px, 0.98, P / 2 + 0.02), CAL.cal))
  }
  // janelas do segundo pavimento
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue
    arcos.push(corir(new THREE.BoxGeometry(1.1, 1.5, 0.14).translate(i * 2.3, 4.6, P / 2 - 0.04), '#4a3a2c'))
    arcos.push(corir(new THREE.BoxGeometry(1.3, 0.14, 0.16).translate(i * 2.3, 3.8, P / 2 + 0.02), CAL.cal))
  }
  const mArcos = new THREE.Mesh(mergeGeometries(arcos), parede)
  mArcos.castShadow = true
  grupo.add(mArcos)

  // --- o relogio no meio da fachada (a station tinha relogio de duas faces)
  const rel = new THREE.Group()
  rel.position.set(0, 7.2, P / 2 + 0.1)
  const corpoRel = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.7), detalhe)
  corpoRel.castShadow = true
  rel.add(corpoRel)
  const disco = new THREE.Mesh(new THREE.CircleGeometry(0.72, 16), toon('#f2ead6'))
  disco.position.z = 0.37
  rel.add(disco)
  const ponteiros = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.5, 0.06), toon('#2b2622'))
  ponteiros.position.set(0, 0.2, 0.44)
  rel.add(ponteiros)
  const minutos = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.62, 0.06), toon('#2b2622'))
  minutos.position.set(0.18, 0.24, 0.45)
  minutos.rotation.z = -0.9
  rel.add(minutos)
  grupo.add(rel)

  // --- a plataforma do lado da via e a marquise de ferro
  const plat = []
  plat.push(corir(new THREE.BoxGeometry(L + 6, 0.9, 6.5).translate(0, 0.45, -P / 2 - 3.4), '#9a9184'))
  plat.push(corir(new THREE.BoxGeometry(L + 6, 0.22, 0.5).translate(0, 0.95, -P / 2 - 6.5), '#b0a698'))
  const mPlat = new THREE.Mesh(mergeGeometries(plat), pedra)
  mPlat.receiveShadow = true
  mPlat.castShadow = true
  grupo.add(mPlat)

  const colunas = []
  const telhadoMarquise = []
  for (let i = -4; i <= 4; i++) {
    const px = i * 3
    colunas.push(corir(new THREE.CylinderGeometry(0.11, 0.13, 4.2, 6).translate(px, 2.9, -P / 2 - 6.1), '#3a3630'))
    colunas.push(corir(new THREE.BoxGeometry(0.5, 0.22, 1.4).translate(px, 5.05, -P / 2 - 5.6), '#3a3630'))
  }
  telhadoMarquise.push(corir(new THREE.BoxGeometry(L + 1, 0.26, 5.2).translate(0, 5.3, -P / 2 - 4.6), CAL.telha))
  const mCol = new THREE.Mesh(mergeGeometries(colunas), ferro)
  mCol.castShadow = true
  grupo.add(mCol)
  const mMarq = new THREE.Mesh(mergeGeometries(telhadoMarquise), telha)
  mMarq.castShadow = true
  grupo.add(mMarq)

  // --- os trilhos que saem da central para o Baturite
  const trilhos = []
  for (const dx of [-0.9, 0.9]) {
    trilhos.push(corir(new THREE.BoxGeometry(26, 0.16, 0.18).translate(13, 1.05, -P / 2 - 3.4 + dx), '#6b5f52'))
  }
  for (let i = 0; i < 22; i++) {
    trilhos.push(corir(new THREE.BoxGeometry(0.5, 0.12, 2.6).translate(1.2 + i * 1.15, 0.95, -P / 2 - 3.4), '#5a4a3a'))
  }
  const mTrilhos = new THREE.Mesh(mergeGeometries(trilhos), parede)
  mTrilhos.receiveShadow = true
  grupo.add(mTrilhos)

  // --- a placa da estação
  const placa = new THREE.Mesh(new THREE.BoxGeometry(7.2, 1.1, 0.14), toon('#2f4a5e'))
  placa.position.set(0, 5.6, P / 2 + 0.16)
  grupo.add(placa)
  // e o letreiro de ferro no alto do portal do meio
  const letreiro = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.5, 0.12), toon('#1f2a33'))
  letreiro.position.set(0, 4.5, P / 2 + 0.12)
  grupo.add(letreiro)

  cena.add(grupo)

  // colisao: o predio, a plataforma e o relogio
  const c = Math.cos(ANGULO)
  const s = Math.sin(ANGULO)
  const mundo = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]
  const [cx, cz] = mundo(0, 0)
  adicionarCaixa(cx, cz, L / 2 + 0.5, P / 2 + 0.5, ANGULO)
  const [px2, pz2] = mundo(0, -P / 2 - 3.4)
  adicionarCaixa(px2, pz2, (L + 6) / 2, 3.4, ANGULO)
  for (const [lx, lz] of [[-8.5, P / 2 + 0.4], [0, P / 2 + 0.4], [8.5, P / 2 + 0.4]]) {
    const [ax, az] = mundo(lx, lz)
    adicionarCirculo(ax, az, 0.9)
  }

  return grupo
}
