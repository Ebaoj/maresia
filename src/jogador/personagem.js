// Personagem original: regata turquesa, short laranja, chinelo e chapéu de pescador.
// Montado com formas simples, num "esqueleto" de grupos (quadril, tronco, braços, pernas).
// A pose é recalculada só 12 vezes por segundo: animação "em 2", como no Aranhaverso.

import * as THREE from 'three'
import { toon } from '../materiais.js'

const COR = {
  pele: '#8a5235',
  cabelo: '#1d1411',
  regata: '#14c4b4',
  listra: '#ff4f8b',
  short: '#ff8c1a',
  chinelo: '#ffd23f',
  chapeu: '#ff4f8b',
  olho: '#1a1033',
}

function malha(geo, cor, x = 0, y = 0, z = 0) {
  // alfa 0,5 sem transparência: o filtro lê isso como "personagem" e reforça o traço
  const m = new THREE.Mesh(geo, toon(cor, { semCache: true, opacity: 0.5, blending: THREE.NoBlending }))
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

export function criarPersonagem() {
  const raiz = new THREE.Group() // posição no mundo e direção
  raiz.userData.peso = 1 // traço mais forte no personagem
  const corpo = new THREE.Group() // estica e amassa (squash & stretch)
  raiz.add(corpo)

  const quadril = new THREE.Group()
  quadril.position.y = 0.92
  corpo.add(quadril)
  const bacia = malha(new THREE.CapsuleGeometry(0.19, 0.1, 4, 10), COR.short)
  bacia.scale.set(1.2, 1, 0.9)
  quadril.add(bacia)

  const tronco = new THREE.Group()
  tronco.position.y = 0.08
  quadril.add(tronco)
  const torso = malha(new THREE.CapsuleGeometry(0.21, 0.3, 4, 12), COR.regata, 0, 0.3, 0)
  torso.scale.set(1.15, 1, 0.8)
  tronco.add(torso)
  const listra = malha(new THREE.CylinderGeometry(0.247, 0.247, 0.08, 16), COR.listra, 0, 0.3, 0)
  listra.scale.set(1.15, 1, 0.8)
  tronco.add(listra)
  tronco.add(malha(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8), COR.pele, 0, 0.6, 0))

  const cabeca = new THREE.Group()
  cabeca.position.y = 0.66
  tronco.add(cabeca)
  cabeca.add(malha(new THREE.SphereGeometry(0.19, 16, 12), COR.pele, 0, 0.17, 0))
  // cabelo black power saindo por baixo do chapéu
  for (const [x, y, z, r] of [[0, 0.24, -0.1, 0.16], [-0.14, 0.2, -0.04, 0.12], [0.14, 0.2, -0.04, 0.12], [-0.1, 0.12, -0.12, 0.11], [0.1, 0.12, -0.12, 0.11]]) {
    cabeca.add(malha(new THREE.SphereGeometry(r, 10, 8), COR.cabelo, x, y, z))
  }
  for (const lado of [-1, 1]) {
    const olho = malha(new THREE.CapsuleGeometry(0.018, 0.04, 2, 6), COR.olho, lado * 0.065, 0.19, 0.172)
    cabeca.add(olho)
  }
  const chapeu = new THREE.Group()
  chapeu.position.set(0, 0.33, 0)
  chapeu.rotation.x = -0.12
  chapeu.add(malha(new THREE.CylinderGeometry(0.17, 0.21, 0.15, 16), COR.chapeu, 0, 0.02, 0))
  chapeu.add(malha(new THREE.CylinderGeometry(0.31, 0.33, 0.025, 20), COR.chapeu, 0, -0.05, 0))
  cabeca.add(chapeu)

  const ombros = []
  const cotovelos = []
  for (const lado of [-1, 1]) {
    const ombro = new THREE.Group()
    ombro.position.set(lado * 0.29, 0.5, 0)
    ombro.userData.lado = lado
    tronco.add(ombro)
    ombro.add(malha(new THREE.CapsuleGeometry(0.065, 0.2, 4, 8), COR.pele, 0, -0.15, 0))
    const cotovelo = new THREE.Group()
    cotovelo.position.y = -0.3
    ombro.add(cotovelo)
    cotovelo.add(malha(new THREE.CapsuleGeometry(0.058, 0.18, 4, 8), COR.pele, 0, -0.13, 0))
    cotovelo.add(malha(new THREE.SphereGeometry(0.072, 10, 8), COR.pele, 0, -0.29, 0))
    ombros.push(ombro)
    cotovelos.push(cotovelo)
  }

  const coxas = []
  const joelhos = []
  for (const lado of [-1, 1]) {
    const coxa = new THREE.Group()
    coxa.position.set(lado * 0.11, -0.05, 0)
    quadril.add(coxa)
    coxa.add(malha(new THREE.CylinderGeometry(0.11, 0.1, 0.2, 10), COR.short, 0, -0.08, 0))
    coxa.add(malha(new THREE.CapsuleGeometry(0.08, 0.2, 4, 8), COR.pele, 0, -0.24, 0))
    const joelho = new THREE.Group()
    joelho.position.y = -0.42
    coxa.add(joelho)
    joelho.add(malha(new THREE.CapsuleGeometry(0.07, 0.26, 4, 8), COR.pele, 0, -0.2, 0))
    joelho.add(malha(new THREE.BoxGeometry(0.13, 0.04, 0.27), COR.chinelo, 0, -0.43, 0.05))
    joelho.add(malha(new THREE.BoxGeometry(0.09, 0.05, 0.18), COR.pele, 0, -0.39, 0.04))
    coxas.push(coxa)
    joelhos.push(joelho)
  }

  return { raiz, corpo, quadril, tronco, cabeca, ombros, cotovelos, coxas, joelhos }
}

const mix = (a, b, t) => a + (b - a) * t

// Pose a partir do estado: fase do passo, velocidade, no ar ou não.
export function aplicarPose(p, { fase, velocidade, noAr, tempo, nadando, sentado, carregando }) {
  const corrida = Math.min(1, Math.max(0, (velocidade - 4.5) / 4.5))
  const andando = Math.min(1, velocidade / 1.5)
  const A = mix(0.5, 0.95, corrida) * andando
  const s = Math.sin(fase)
  const c = Math.cos(fase)

  p.coxas.forEach((coxa, i) => {
    const sinal = i === 0 ? 1 : -1
    coxa.rotation.x = -sinal * s * A
    p.joelhos[i].rotation.x = 0.06 + Math.max(0, sinal * c) * A * 1.25
  })
  p.ombros.forEach((ombro, i) => {
    const sinal = i === 0 ? 1 : -1
    ombro.rotation.x = sinal * s * A * 0.85
    ombro.rotation.z = ombro.userData.lado * mix(0.1, 0.18, corrida)
    p.cotovelos[i].rotation.x = -(0.25 + corrida * 1.1) * andando - 0.12
  })
  p.quadril.position.y = 0.92 + 0.04 * andando * Math.cos(2 * fase) * (1 + corrida)
  p.tronco.rotation.x = 0.06 * andando + 0.3 * corrida
  p.tronco.rotation.y = s * 0.14 * andando
  p.cabeca.rotation.x = -p.tronco.rotation.x * 0.6
  p.cabeca.rotation.y = -p.tronco.rotation.y * 0.8

  // parado: respira e olha em volta
  const parado = 1 - andando
  p.tronco.scale.y = 1 + 0.018 * Math.sin(tempo * 2.2) * parado
  p.cabeca.rotation.y += Math.sin(tempo * 0.45) * 0.35 * parado

  if (noAr) {
    p.coxas[0].rotation.x = -0.7
    p.coxas[1].rotation.x = 0.35
    p.joelhos[0].rotation.x = 1.0
    p.joelhos[1].rotation.x = 0.5
    p.ombros.forEach((o) => { o.rotation.z = o.userData.lado * 1.25; o.rotation.x = -0.3 })
  }
  if (sentado) {
    // sentado no banco: coxas para frente, canelas para baixo, mãos nos joelhos
    p.quadril.position.y = 0.5
    p.coxas.forEach((cx) => { cx.rotation.x = -1.45 })
    p.joelhos.forEach((j) => { j.rotation.x = 1.45 })
    p.tronco.rotation.x = -0.05
    p.ombros.forEach((o) => { o.rotation.x = -0.55; o.rotation.z = o.userData.lado * 0.12 })
    p.cotovelos.forEach((c) => { c.rotation.x = -0.5 })
  }
  if (carregando) {
    // segurando algo na frente do peito
    p.ombros.forEach((o) => { o.rotation.x = -1.15; o.rotation.z = o.userData.lado * 0.25 })
    p.cotovelos.forEach((c) => { c.rotation.x = -0.75 })
  }
  if (nadando) {
    // braçada simples e pernas batendo
    p.ombros.forEach((o, i) => { o.rotation.x = -1.6 + Math.sin(tempo * 4 + i * Math.PI) * 1.4; o.rotation.z = o.userData.lado * 0.3 })
    p.coxas.forEach((cx, i) => { cx.rotation.x = Math.sin(tempo * 8 + i * Math.PI) * 0.35 })
    p.tronco.rotation.x = 0.9
  }
}
