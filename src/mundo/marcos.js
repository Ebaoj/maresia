// Marcos verticais: o farol do Mucuripe (nas duas épocas) e as pedras no mar (saem com o mapa).
// Verticalização: ponto alto no horizonte dá vontade de ir até lá.

import * as THREE from 'three'
import { linhaCosta, larguraPraia, ruido, NIVEL_CIDADE } from './mapa.js'
import { alturaTerreno } from './terreno.js'
import { toon, toonVertice, luzFixa } from '../materiais.js'
import { adicionarCirculo, adicionarCaixa } from './colisao.js'
import { globais } from '../globais.js'

function pedra({ x, z, altura, raio, alongar = 1.3, inclinar = 0.12, semente = 0 }) {
  const perfil = []
  for (let i = 0; i <= 30; i++) {
    const t = i / 30
    const y = -16 + t * (altura + 16)
    const tt = Math.max(0, (y + 2) / (altura + 2))
    const r = raio * Math.pow(Math.max(0, 1 - Math.pow(tt, 2.3)), 0.5) + (y < 0 ? (-y) * 0.6 : 0)
    perfil.push(new THREE.Vector2(Math.max(0.01, r), y))
  }
  const geo = new THREE.LatheGeometry(perfil, 48)
  const pos = geo.attributes.position
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const n = ruido(v.x * 0.05 + semente, v.y * 0.05, v.z * 0.05)
    const k = 1 + n * 0.16
    v.x *= k * alongar
    v.z *= k
    v.x += v.y * inclinar
    pos.setXYZ(i, v.x, v.y, v.z)
  }
  geo.computeVertexNormals()
  // granito nas paredes, mato no que é mais plano
  const cores = []
  const nor = geo.attributes.normal
  const granito = new THREE.Color('#c2a8a4')
  const granitoEscuro = new THREE.Color('#8f7f8e')
  const mato = new THREE.Color('#3f9a4a')
  const c = new THREE.Color()
  for (let i = 0; i < pos.count; i++) {
    const ny = nor.getY(i)
    const y = pos.getY(i)
    const listra = ruido(pos.getX(i) * 0.2, y * 0.02, pos.getZ(i) * 0.2 + semente)
    c.copy(granito).lerp(granitoEscuro, THREE.MathUtils.smoothstep(listra, -0.1, 0.4))
    c.lerp(mato, THREE.MathUtils.smoothstep(ny, 0.55, 0.75) + (y < 6 && y > 0 ? 0.6 : 0))
    cores.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  const m = new THREE.Mesh(geo, toonVertice())
  m.position.set(x, 0, z)
  m.castShadow = m.receiveShadow = true
  return m
}

function farol(cena) {
  const x = 336
  const z = linhaCosta(x) + 16
  const base = alturaTerreno(x, z) - 0.3
  const g = new THREE.Group()
  g.position.set(x, base, z)

  // listras vermelhas e brancas pintadas por vértice
  const torre = new THREE.CylinderGeometry(1.7, 2.6, 22, 16, 11)
  const cor = []
  const vermelho = new THREE.Color('#e63946')
  const branco = new THREE.Color('#fff6e0')
  const p = torre.attributes.position
  for (let i = 0; i < p.count; i++) {
    const faixa = Math.floor((p.getY(i) + 11) / 4.4) % 2
    const c = faixa ? vermelho : branco
    cor.push(c.r, c.g, c.b)
  }
  torre.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3))
  const mTorre = new THREE.Mesh(torre.toNonIndexed(), toonVertice())
  mTorre.position.y = 11
  const sacada = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 0.4, 16), toon('#2a2840'))
  sacada.position.y = 22.2
  const matLanterna = luzFixa(new THREE.MeshBasicMaterial({ color: '#fff3c4' }), 1, globais.uNoite)
  const lanterna = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 2.2, 12), matLanterna)
  lanterna.position.y = 23.5
  const chapeu = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.8, 12), toon('#e63946'))
  chapeu.position.y = 25.5
  const casinha = new THREE.Mesh(new THREE.BoxGeometry(6, 3.2, 5), toon('#fff6e0'))
  casinha.position.set(4.5, 1.6, 1)
  for (const o of [mTorre, sacada, chapeu, casinha]) { o.castShadow = o.receiveShadow = true; g.add(o) }
  g.add(lanterna)

  // facho girando à noite
  const matFacho = luzFixa(new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), 0, globais.uNoite)
  const geoFacho = new THREE.ConeGeometry(5, 90, 16, 1, true).translate(0, -45, 0).rotateZ(Math.PI / 2)
  const facho = new THREE.Group()
  facho.position.y = 23.5
  const f1 = new THREE.Mesh(geoFacho, matFacho)
  const f2 = new THREE.Mesh(geoFacho, matFacho)
  f2.rotation.y = Math.PI
  f1.userData.semNormal = f2.userData.semNormal = true
  facho.add(f1, f2)
  g.add(facho)
  cena.add(g)
  adicionarCirculo(x, z, 2.8)
  adicionarCaixa(x + 4.5, z + 1, 3, 2.5, 0)

  const lanternaApagada = new THREE.Color('#fff3c4')
  const lanternaAcesa = new THREE.Color('#ffe08a').multiplyScalar(2.5)
  return (t) => {
    const noite = globais.uNoite.value
    facho.rotation.y = t * 0.7
    matFacho.opacity = noite * 0.22
    facho.visible = noite > 0.05
    matLanterna.color.copy(lanternaApagada).lerp(lanternaAcesa, noite)
  }
}

export function criarMarcos(cena) {
  // as duas pedras do Rio, no mar
  const grande = { x: -335, z: linhaCosta(-335) - 115, altura: 96, raio: 44, alongar: 1.45, inclinar: 0.1, semente: 3 }
  const pequena = { x: -248, z: linhaCosta(-248) - 62, altura: 48, raio: 34, alongar: 1.25, inclinar: -0.05, semente: 9 }
  cena.add(pedra(grande), pedra(pequena))
  adicionarCirculo(grande.x, grande.z, grande.raio * 1.2)
  adicionarCirculo(pequena.x, pequena.z, pequena.raio * 1.1)

  // o bondinho saiu em 16/10/2026: o jogo agora é só Fortaleza (as pedras saem com o mapa)

  const atualizarFarol = farol(cena)

  return {
    atualizar(t) {
      atualizarFarol(t)
    },
  }
}

export { NIVEL_CIDADE }
