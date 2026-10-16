// Gente na cidade: figuras genéricas e originais, de pé, sentadas na areia ou caminhando
// no calçadão. Quem caminha balança "em 2", como o resto da animação.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { linhaCosta, larguraPraia, pesos, NIVEL_CIDADE, LARG_CALCADAO, rioX, RIO_MEIA_LARGURA } from './mapa.js'
import { trechosJogo, VILAS } from './fortaleza1932.js'
import { densidadeLotes, distCosta } from './mapa.js'
import { alturaChao } from './colisao.js'
import { alturaTerreno } from './terreno.js'
import { toonVertice } from '../materiais.js'
import { ocupacao } from './ocupacao.js'
import { criarAleatorio } from '../utils.js'

const rnd = criarAleatorio(808)

// 1932 (fotos de 1925 a 1936 e docs/figurino.md): terno e camisa de linho branco ou creme,
// algodãozinho "cor de couro" (mangue, murici), cinza, azul desbotado; vestidos claros e compridos;
// chapéu de palha na maioria. Elenco diverso, como a Fortaleza da época.
const PELES = ['#e8bf9a', '#c98e62', '#a8693f', '#8a5235', '#6b3f26', '#4e2c1a']
const ROUPAS = ['#efe9dc', '#efe9dc', '#e4dccb', '#d9cbb0', '#8a5a3c', '#a5764f', '#9aa0a3', '#6f7f8f', '#c9b48a', '#efe9dc']
const BAIXO = ['#efe9dc', '#d9cbb0', '#6b5a4a', '#8a5a3c', '#5a5a5e', '#9aa0a3']
const VESTIDOS = ['#efe9dc', '#e2d3bd', '#c9b6c0', '#b9c4c9', '#d8c48f', '#a9b49a']
const CHAPEUS = ['#d9bf86', '#d9bf86', '#c8a86a', '#e9dcc0', '#3b3330']
const CABELO = ['#1d1411', '#2a1c14', '#3a2418', '#1d1411']

function parte(geo, cor) {
  const g = geo.toNonIndexed()
  g.deleteAttribute('uv')
  const c = new THREE.Color(cor)
  const n = g.attributes.position.count
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [c.r, c.g, c.b]), 3))
  return g
}

function figura(sentada, mulher = false) {
  const pele = rnd.escolha(PELES)
  const roupa = mulher ? rnd.escolha(VESTIDOS) : rnd.escolha(ROUPAS)
  const baixo = mulher ? roupa : rnd.escolha(BAIXO)
  const partes = []
  const quadril = sentada ? 0.32 : 0.9
  // chapéu de palha (ou de feltro escuro) na maioria; mulheres às vezes com lenço
  if (!mulher || rnd.chance(0.35)) {
    const cor = rnd.escolha(CHAPEUS)
    partes.push(parte(new THREE.CylinderGeometry(0.27, 0.29, 0.03, 12).translate(0, quadril + 1.0, 0), cor))
    partes.push(parte(new THREE.CylinderGeometry(0.14, 0.16, 0.13, 10).translate(0, quadril + 1.07, 0), cor))
  }
  // vestido comprido até a canela
  if (mulher && !sentada) partes.push(parte(new THREE.CylinderGeometry(0.2, 0.34, 0.75, 10).translate(0, 0.52, 0), roupa))
  partes.push(parte(new THREE.CapsuleGeometry(0.2, 0.32, 3, 8).scale(1.1, 1, 0.8).translate(0, quadril + 0.38, 0), roupa))
  partes.push(parte(new THREE.SphereGeometry(0.17, 10, 8).translate(0, quadril + 0.83, 0), pele))
  partes.push(parte(new THREE.SphereGeometry(0.18, 8, 6).scale(1, 0.75, 1).translate(0, quadril + 0.93, -0.03), rnd.escolha(CABELO)))
  for (const lado of [-1, 1]) {
    partes.push(parte(new THREE.CapsuleGeometry(0.06, 0.42, 3, 6).translate(lado * 0.28, quadril + 0.3, 0).rotateZ(lado * 0.06), pele))
    if (sentada) {
      partes.push(parte(new THREE.CapsuleGeometry(0.08, 0.5, 3, 6).rotateX(Math.PI / 2).translate(lado * 0.11, 0.2, 0.35), baixo))
    } else {
      partes.push(parte(new THREE.CapsuleGeometry(0.08, 0.6, 3, 6).translate(lado * 0.11, 0.45, 0), lado < 0 ? baixo : baixo))
      partes.push(parte(new THREE.BoxGeometry(0.12, 0.05, 0.24).translate(lado * 0.11, 0.03, 0.04), '#1a1a22'))
    }
  }
  return mergeGeometries(partes)
}

export function criarPessoas(cena, grade) {
  const tipos = []
  for (let i = 0; i < 12; i++) tipos.push({ geo: figura(false, i % 3 === 0), lista: [] })
  for (let i = 0; i < 6; i++) tipos.push({ geo: figura(true, i % 3 === 0), lista: [], sentada: true })
  const emPe = tipos.filter((t) => !t.sentada)
  const sentadas = tipos.filter((t) => t.sentada)
  const andando = []

  const longeDoRio = (x, z) => Math.abs(x - rioX(z)) > RIO_MEIA_LARGURA * 2
  // gente nas vilas de jangadeiros e na Praia Formosa (perto do porto)
  const trechos = [...VILAS, 'praiaFormosa'].map((k) => trechosJogo[k])
  const xPraia = () => { const [a, b] = rnd.escolha(trechos); return rnd.entre(a, b) }

  // caminhando no calçadão, cada um num trecho, indo e voltando
  for (let i = 0; i < 24; i++) {
    const x = xPraia()
    const z0 = linhaCosta(x) + larguraPraia(x)
    if (!longeDoRio(x, z0)) continue
    const t = rnd.escolha(emPe)
    andando.push({ tipo: t, idx: t.lista.length, x, faixa: rnd.entre(1.5, LARG_CALCADAO - 1.5), vel: rnd.entre(0.9, 1.5) * (rnd.chance(0.5) ? 1 : -1), ini: x - rnd.entre(15, 35), fim: x + rnd.entre(15, 35), fase: rnd.entre(0, 6) })
    t.lista.push(new THREE.Matrix4())
  }
  // andando pelas calçadas da cidade, ao longo das ruas da grade de Herbster
  const [ox, oz] = grade.origem
  const pX = grade.w + grade.rua
  const pZ = grade.d + grade.rua
  const naGrade = (dir, k, t, lado) => {
    const meio = (k + 0.5) * (dir === 0 ? pZ : pX) + lado * (grade.rua / 2 - 1.1)
    const a = dir === 0 ? t : meio
    const b = dir === 0 ? meio : t
    return [ox + a * grade.ex[0] + b * grade.ez[0], oz + a * grade.ex[1] + b * grade.ez[1]]
  }
  const ruaViva = (x, z) => densidadeLotes(x, z) > 0.18 && Math.hypot(x - ox, z - oz) < 520 && distCosta(x, z) > larguraPraia(x) + 12
  for (let i = 0, tent = 0; i < 150 && tent < 3000; tent++) {
    const dir = rnd.chance(0.5) ? 0 : 1
    const k = Math.floor(rnd.entre(-7, 7))
    const t = rnd.entre(-320, 320)
    const lado = rnd.chance(0.5) ? 1 : -1
    const [x, z] = naGrade(dir, k, t, lado)
    if (!ruaViva(x, z)) continue
    const tp = rnd.escolha(emPe)
    andando.push({ tipo: tp, idx: tp.lista.length, grade: true, dir, k, lado, t, vel: rnd.entre(0.8, 1.4) * (rnd.chance(0.5) ? 1 : -1), ini: t - rnd.entre(20, 60), fim: t + rnd.entre(20, 60), fase: rnd.entre(0, 6) })
    tp.lista.push(new THREE.Matrix4())
    i++
  }
  // conversando na porta, em grupinhos
  for (let g = 0, tent = 0; g < 45 && tent < 2000; tent++) {
    const [x, z] = naGrade(rnd.chance(0.5) ? 0 : 1, Math.floor(rnd.entre(-7, 7)), rnd.entre(-320, 320), rnd.chance(0.5) ? 1 : -1)
    if (!ruaViva(x, z)) continue
    const n = 2 + Math.floor(rnd.entre(0, 2.99))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const px = x + Math.cos(a) * 0.7
      const pz = z + Math.sin(a) * 0.7
      const yaw = Math.atan2(x - px, z - pz)
      rnd.escolha(emPe).lista.push(new THREE.Matrix4().compose(new THREE.Vector3(px, alturaChao(px, pz) + 0.02, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)))
    }
    g++
  }

  // sentadas na areia, perto do mar
  for (let i = 0; i < 30; i++) {
    const x = xPraia()
    const bw = larguraPraia(x)
    const z = linhaCosta(x) + rnd.entre(bw * 0.25, bw * 0.75)
    if (!longeDoRio(x, z) || !ocupacao.livre(x, z, 0.4, 0.4)) continue
    const yaw = Math.PI + rnd.entre(-0.6, 0.6) // olhando para o mar
    rnd.escolha(sentadas).lista.push(new THREE.Matrix4().compose(new THREE.Vector3(x, alturaTerreno(x, z), z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)))
  }
  // de pé conversando em grupinhos pela cidade e na praia
  for (let g = 0; g < 26; g++) {
    const x = xPraia()
    const naPraia = rnd.chance(0.5)
    const bw = larguraPraia(x)
    const z = linhaCosta(x) + (naPraia ? rnd.entre(bw * 0.3, bw * 0.8) : bw + rnd.entre(1, LARG_CALCADAO - 1))
    if (!longeDoRio(x, z)) continue
    const n = 2 + Math.floor(rnd.entre(0, 3))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const px = x + Math.cos(a) * 0.8
      const pz = z + Math.sin(a) * 0.8
      if (!ocupacao.livre(px, pz, 0.3, 0.3)) continue
      const yaw = Math.atan2(x - px, z - pz)
      const y = naPraia ? alturaTerreno(px, pz) : NIVEL_CIDADE + 0.05
      rnd.escolha(emPe).lista.push(new THREE.Matrix4().compose(new THREE.Vector3(px, y, pz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)))
    }
  }

  // alfa 0,85: o filtro reconhece como gente e dá traço médio
  const mat = toonVertice({ opacity: 0.85, blending: THREE.NoBlending })
  for (const t of tipos) {
    if (!t.lista.length) continue
    t.malha = new THREE.InstancedMesh(t.geo, mat, t.lista.length)
    t.lista.forEach((mm, i) => t.malha.setMatrixAt(i, mm))
    t.malha.castShadow = true
    t.malha.userData.peso = 0.8
    t.malha.name = 'pessoas'
    cena.add(t.malha)
  }

  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const um = new THREE.Vector3(1, 1, 1)
  const Y = new THREE.Vector3(0, 1, 0)
  let acumulado = 0
  return {
    atualizar(dt, tempo) {
      // só reposiciona 12 vezes por segundo: caminhada "em 2"
      acumulado += dt
      if (acumulado < 1 / 12) return
      const passo = acumulado
      acumulado = 0
      const tocados = new Set()
      for (const a of andando) {
        if (a.grade) {
          a.t += a.vel * passo
          if (a.t > a.fim || a.t < a.ini) a.vel *= -1
          const [x, z] = naGrade(a.dir, a.k, a.t, a.lado)
          const balanco = Math.abs(Math.sin(tempo * 7 + a.fase)) * 0.06
          p.set(x, alturaChao(x, z) + 0.02 + balanco, z)
          const e = a.dir === 0 ? grade.ex : grade.ez
          q.setFromAxisAngle(Y, Math.atan2(e[0] * Math.sign(a.vel), e[1] * Math.sign(a.vel)))
          a.tipo.malha.setMatrixAt(a.idx, new THREE.Matrix4().compose(p, q, um))
          tocados.add(a.tipo.malha)
          continue
        }
        a.x += a.vel * passo
        if (a.x > a.fim || a.x < a.ini) a.vel *= -1
        const z = linhaCosta(a.x) + larguraPraia(a.x) + a.faixa
        const balanco = Math.abs(Math.sin(tempo * 7 + a.fase)) * 0.06
        p.set(a.x, NIVEL_CIDADE + 0.05 + balanco, z)
        q.setFromAxisAngle(Y, a.vel > 0 ? Math.PI / 2 : -Math.PI / 2)
        a.tipo.malha.setMatrixAt(a.idx, new THREE.Matrix4().compose(p, q, um))
        tocados.add(a.tipo.malha)
      }
      for (const m of tocados) m.instanceMatrix.needsUpdate = true
    },
  }
}
