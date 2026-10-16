// Gente na cidade: figuras genéricas e originais, de pé, sentadas na areia ou caminhando
// no calçadão. Quem caminha balança "em 2", como o resto da animação.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { linhaCosta, larguraPraia, pesos, NIVEL_CIDADE, LARG_CALCADAO, rioX, RIO_MEIA_LARGURA } from './mapa.js'
import { trechosJogo, VILAS } from './fortaleza1932.js'
import { alturaTerreno } from './terreno.js'
import { toonVertice } from '../materiais.js'
import { ocupacao } from './ocupacao.js'
import { criarAleatorio } from '../utils.js'

const rnd = criarAleatorio(808)

const PELES = ['#f1c7a3', '#c98e62', '#8a5235', '#5a3420']
const ROUPAS = ['#e63946', '#ffd23f', '#3a86ff', '#ffffff', '#06d6a0', '#ff7a3d', '#f15bb5', '#2a9d8f', '#8338ec', '#1d3557']
const BAIXO = ['#1d3557', '#457b9d', '#e9c46a', '#2a2840', '#ff8c1a', '#a8dadc']
const CABELO = ['#1d1411', '#3a2418', '#d9a441', '#1d1411']

function parte(geo, cor) {
  const g = geo.toNonIndexed()
  g.deleteAttribute('uv')
  const c = new THREE.Color(cor)
  const n = g.attributes.position.count
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [c.r, c.g, c.b]), 3))
  return g
}

function figura(sentada) {
  const pele = rnd.escolha(PELES)
  const roupa = rnd.escolha(ROUPAS)
  const baixo = rnd.escolha(BAIXO)
  const partes = []
  const quadril = sentada ? 0.32 : 0.9
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

export function criarPessoas(cena) {
  const tipos = []
  for (let i = 0; i < 8; i++) tipos.push({ geo: figura(false), lista: [] })
  for (let i = 0; i < 5; i++) tipos.push({ geo: figura(true), lista: [], sentada: true })
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
