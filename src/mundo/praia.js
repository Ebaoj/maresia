// Coisas da praia: guarda-sóis (alguns com as cores do frevo), barracas, postes,
// jangadas e o píer.

import * as THREE from 'three'
import {
  linhaCosta, larguraPraia, distCosta, rioX, RIO_MEIA_LARGURA, pesos, LARG_CALCADAO,
  NIVEL_CIDADE,
} from './mapa.js'
import { trechosJogo, VILAS } from './fortaleza1932.js'
import { alturaTerreno } from './terreno.js'
import { toon, toonVertice, luzFixa } from '../materiais.js'
import { adicionarCaixa, adicionarCirculo, adicionarDeck } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { globais } from '../globais.js'
import { criarAleatorio } from '../utils.js'
import { instanciarEmBlocos } from './blocos.js'
import { geometriaJangada, materialJangada } from './jangada.js'

const rnd = criarAleatorio(2024)

function pintarFatias(geo, cores) {
  const g = geo.toNonIndexed()
  const pos = g.attributes.position
  const cor = []
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
    const ang = Math.atan2(cz, cx) + Math.PI
    const fatia = Math.floor((ang / (Math.PI * 2)) * cores.length * 2) % cores.length
    c.set(cores[fatia])
    for (let k = 0; k < 3; k++) cor.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3))
  return g
}

function guardaSois(cena) {
  const variantes = [
    ['#a8432e', '#e7d3a3', '#5e8a6e', '#4f7c9a'], // listras desbotadas
    ['#c2412d', '#efe6d2'],
    ['#2e4c9a', '#efe6d2'],
    ['#c9963f', '#efe6d2'],
  ].map((cores) => {
    const g = pintarFatias(new THREE.ConeGeometry(1.7, 0.7, 16, 1, true), cores)
    g.translate(0, 2.35, 0)
    return { geo: g, lista: [] }
  })
  const postes = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const um = new THREE.Vector3(1, 1, 1)
  for (let t = 0; t < 900; t++) {
    const x = rnd.entre(-420, 420)
    const p = pesos(x)
    if (!rnd.chance(0.35 + p.fortaleza * 0.4)) continue
    if (Math.abs(x - rioX(0)) < RIO_MEIA_LARGURA * 2.5 && p.recife > 0.5) continue
    const bw = larguraPraia(x)
    const z = linhaCosta(x) + rnd.entre(bw * 0.3, bw * 0.8)
    if (!ocupacao.livre(x, z, 1.8, 1.8)) continue
    ocupacao.marcar(x, z, 1.8, 1.8)
    const y = alturaTerreno(x, z)
    e.set(rnd.entre(-0.12, 0.12), rnd.entre(0, 6.28), rnd.entre(-0.12, 0.12))
    q.setFromEuler(e)
    m.compose(new THREE.Vector3(x, y, z), q, um)
    const v = p.recife > 0.5 && rnd.chance(0.7) ? variantes[0] : rnd.escolha(variantes.slice(1))
    v.lista.push(m.clone())
    postes.push(m.clone())
    adicionarCirculo(x, z, 0.15)
  }
  const mat = toonVertice({ side: THREE.DoubleSide })
  for (const v of variantes) instanciarEmBlocos(cena, v.geo, mat, v.lista, null, { nome: 'guarda-sois' })
  const geoPoste = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 5).translate(0, 1.25, 0)
  instanciarEmBlocos(cena, geoPoste, toon('#f4efe6'), postes, null, { nome: 'hastes', sombra: false })
}

function barracas(cena) {
  const grupo = new THREE.Group()
  const madeira = toon('#c98b4b')
  const palha = toon('#c8a86a')
  for (let x = -400; x < 400; x += rnd.entre(55, 80)) {
    const p = pesos(x)
    if (p.rio > 0.5) continue
    if (Math.abs(x - rioX(0)) < 40) continue
    const bw = larguraPraia(x)
    const z = linhaCosta(x) + bw * 0.62
    if (!ocupacao.livre(x, z, 3, 3)) continue
    ocupacao.marcar(x, z, 3.5, 3.5)
    const y = alturaTerreno(x, z)
    const b = new THREE.Group()
    b.position.set(x, y, z)
    b.rotation.y = rnd.entre(-0.3, 0.3)
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3), madeira)
    corpo.position.y = 1.2
    const balcao = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.25, 0.8), toon('#a8432e'))
    balcao.position.set(0, 1.3, -1.8)
    const teto = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2, 4), palha)
    teto.position.y = 3.4
    teto.rotation.y = Math.PI / 4
    for (const o of [corpo, balcao, teto]) {
      o.castShadow = o.receiveShadow = true
      b.add(o)
    }
    grupo.add(b)
    adicionarCaixa(x, z, 2.2, 2, b.rotation.y)
  }
  cena.add(grupo)
}

// Postes ao longo do calçadão: a lâmpada acende à noite (cor > 1 estoura em branco quente).
function postes(cena) {
  const lista = []
  for (let x = -440; x < 440; x += 22) {
    if (Math.abs(x - rioX(linhaCosta(x) + 30)) < RIO_MEIA_LARGURA * 1.5) continue
    const z = linhaCosta(x) + larguraPraia(x) + LARG_CALCADAO - 0.6
    lista.push(new THREE.Vector3(x, NIVEL_CIDADE, z))
    adicionarCirculo(x, z, 0.2)
  }
  const geoHaste = new THREE.CylinderGeometry(0.08, 0.11, 5.5, 6).translate(0, 2.75, 0)
  const haste = new THREE.InstancedMesh(geoHaste, toon('#2a2840'), lista.length)
  const matLuz = luzFixa(new THREE.MeshBasicMaterial({ color: '#d9d4c0' }), 1, globais.uNoite)
  const luz = new THREE.InstancedMesh(new THREE.SphereGeometry(0.38, 10, 8), matLuz, lista.length)
  const m = new THREE.Matrix4()
  lista.forEach((p, i) => {
    haste.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z))
    luz.setMatrixAt(i, m.makeTranslation(p.x, p.y + 5.7, p.z))
  })
  haste.castShadow = true
  cena.add(haste, luz)
  const apagada = new THREE.Color('#d9d4c0')
  const acesa = new THREE.Color('#ffd27a').multiplyScalar(2.2)
  return () => matLuz.color.copy(apagada).lerp(acesa, globais.uNoite.value)
}

// a jangada de paus de verdade mora em jangada.js (casco de troncos, vela grande, remo de governo)
const VARIANTES = Array.from({ length: 6 }, (_, i) => ({ areia: geometriaJangada({ semente: i * 3.1, idade: 0.2 + (i % 3) * 0.3, naAreia: true }), mar: geometriaJangada({ semente: i * 3.1 + 1, idade: 0.2 + (i % 3) * 0.3 }) }))
function jangada(_cor, naAreia = false) {
  const g = new THREE.Group()
  const m = new THREE.Mesh(rnd.escolha(VARIANTES)[naAreia ? 'areia' : 'mar'], materialJangada())
  m.castShadow = true
  m.receiveShadow = true
  g.add(m)
  return g
}

function jangadas(cena) {
  const lista = []
  const cores = ['#e7d8bd', '#e7d8bd', '#d9c39a', '#cbbf9f', '#e2c2a8'] // algodão cru, velas e panos gastos
  // na areia, perto da água
  const vila = () => { const [a, b] = trechosJogo[rnd.escolha(VILAS)]; return rnd.entre(a, b) }
  for (let i = 0; i < 26; i++) {
    const x = vila()
    const z = linhaCosta(x) + rnd.entre(2, 9)
    if (!ocupacao.livre(x, z, 3.5, 3.5)) continue
    ocupacao.marcar(x, z, 3.5, 3.5)
    const j = jangada(rnd.escolha(cores), true)
    j.position.set(x, alturaTerreno(x, z) + 0.18, z)
    j.rotation.set(0, Math.PI / 2 + rnd.entre(-0.35, 0.35), rnd.entre(-0.03, 0.03)) // proa para o mar, como nas fotos de 1935
    cena.add(j)
    adicionarCaixa(x, z, 3.2, 1.1, j.rotation.y)
  }
  // no mar, balançando
  for (let i = 0; i < 12; i++) {
    const x = vila()
    const z = linhaCosta(x) - rnd.entre(25, 90)
    const j = jangada(rnd.escolha(cores))
    j.position.set(x, -0.18, z)
    j.rotation.y = rnd.entre(0, Math.PI * 2)
    j.userData.fase = rnd.entre(0, 6.28)
    cena.add(j)
    lista.push(j)
  }
  return (t) => {
    for (const j of lista) {
      j.position.y = -0.2 + Math.sin(t * 1.3 + j.userData.fase) * 0.12
      j.rotation.z = Math.sin(t * 1.1 + j.userData.fase) * 0.06
      j.rotation.x = Math.cos(t * 0.9 + j.userData.fase) * 0.04
    }
  }
}

// Píer de madeira entrando no mar: dá para caminhar até a ponta.
function pier(cena) {
  const x = 215
  const inc = (linhaCosta(x + 1) - linhaCosta(x - 1)) / 2
  const rot = -Math.atan(inc)
  const zIni = linhaCosta(x) + larguraPraia(x) + 0.5
  const comp = larguraPraia(x) + 120
  const zc = zIni - comp / 2
  const y = NIVEL_CIDADE + 0.15
  const g = new THREE.Group()
  g.position.set(x, 0, zc)
  g.rotation.y = rot
  const madeira = toon('#b98552')
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, comp), madeira)
  deck.position.y = y - 0.2
  deck.receiveShadow = deck.castShadow = true
  g.add(deck)
  const geoPilar = new THREE.CylinderGeometry(0.28, 0.28, 18, 6)
  for (let k = -comp / 2 + 4; k < comp / 2; k += 8) {
    for (const lado of [-2.6, 2.6]) {
      const p = new THREE.Mesh(geoPilar, toon('#7a5638'))
      p.position.set(lado, y - 9.3, k)
      g.add(p)
    }
  }
  for (const lado of [-3, 3]) {
    const corr = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, comp), toon('#f4efe6'))
    corr.position.set(lado, y + 1.0, 0)
    corr.castShadow = true
    g.add(corr)
    for (let k = -comp / 2 + 1; k < comp / 2; k += 3) {
      const poste = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), toon('#f4efe6'))
      poste.position.set(lado, y + 0.5, k)
      g.add(poste)
    }
  }
  // na ponta, um quiosquinho
  const quiosque = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.2, 6), toon('#a8432e'))
  quiosque.position.set(0, y + 3.6, -comp / 2 + 3)
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), toon('#2a2840'))
  haste.position.set(0, y + 1.3, -comp / 2 + 3)
  g.add(quiosque, haste)
  cena.add(g)

  const c = Math.cos(rot)
  const s = Math.sin(rot)
  adicionarDeck(x, zc, 3, comp / 2, rot, y)
  // corrimãos laterais (só na parte sobre o mar) e a ponta
  const meio = -larguraPraia(x) * 0.4
  const metade = (comp - larguraPraia(x) * 0.8) / 2
  for (const lado of [-3, 3]) adicionarCaixa(x + lado * c + meio * s, zc - lado * s + meio * c, 0.2, metade, rot)
  const pontaZ = -comp / 2
  adicionarCaixa(x + pontaZ * s, zc + pontaZ * c, 3.2, 0.3, rot)
  adicionarCirculo(x + (-comp / 2 + 3) * s, zc + (-comp / 2 + 3) * c, 0.3)
}

// 1932: sem guarda-sol, barraca, poste de praia ou píer moderno (saíram em 16/10/2026).
// Ficam as jangadas, nas vilas de jangadeiros (a Ponte Metálica entra com a reconstituição do porto).
export function criarPraia(cena) {
  const atualizarJangadas = jangadas(cena)
  return {
    atualizar(t) {
      atualizarJangadas(t)
    },
  }
}
void pier
void barracas
void guardaSois
void postes
