// Camada 2 da interação: física de verdade (Rapier, WebAssembly) só perto do jogador.
//
// - Chão: o mapa de alturas inteiro vira um "heightfield" (barato, mesmo grande).
// - Prédios, coqueiros, postes e decks entram como sólidos só num raio de 70 m do jogador,
//   recarregados a cada meio segundo (o teste de 16/10 mostrou: mapa inteiro custa ~4 ms,
//   só perto ~1 ms).
// - Objetos soltos (bolas de praia e cocos) longe do jogador ficam desligados.
// - O personagem continua com o controle próprio; na física ele é uma cápsula que empurra
//   o que encosta, e dá um "chute" quando corre de encontro a uma bola.
// - Na água tudo boia (empuxo simples + atrito da água).
// - Conversa com a camada 1: o que rola deita a grama, marca a areia e faz ondinha.

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { LIMITES, distCosta, larguraPraia, linhaCosta } from './mapa.js'
import { alturas, NX, NZ, alturaTerreno } from './terreno.js'
import { fixosPerto } from './colisao.js'
import { toonVertice } from '../materiais.js'
import { criarAleatorio } from '../utils.js'

const RAIO_FIXOS = 70
const RAIO_ATIVO = 80
const PASSO = 1 / 60
const NIVEL_AGUA = 0

function geometriaBola() {
  // bola de praia: gomos coloridos
  const g = new THREE.SphereGeometry(0.35, 16, 12).toNonIndexed()
  const pos = g.attributes.position
  const cores = ['#e63946', '#fff6e0', '#3a86ff', '#ffd23f', '#fff6e0', '#06d6a0']
  const c = new THREE.Color()
  const arr = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const gomo = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 6
    c.set(Math.abs(cy) > 0.3 ? '#fff6e0' : cores[gomo])
    for (let k = 0; k < 3; k++) { arr[(i + k) * 3] = c.r; arr[(i + k) * 3 + 1] = c.g; arr[(i + k) * 3 + 2] = c.b }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  g.deleteAttribute('uv')
  return g
}

function geometriaCoco() {
  const g = new THREE.SphereGeometry(0.17, 10, 8).scale(1, 1.15, 1).toNonIndexed()
  const pos = g.attributes.position
  const arr = new Float32Array(pos.count * 3)
  const verde = new THREE.Color('#6f9a2a')
  const marrom = new THREE.Color('#7a5230')
  for (let i = 0; i < pos.count; i++) {
    const c = pos.getY(i) > 0.12 ? marrom : verde
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  g.deleteAttribute('uv')
  return g
}

export async function criarFisica(cena, cfg, { coqueiros, toque, areia }) {
  await RAPIER.init()
  const world = new RAPIER.World({ x: 0, y: -25, z: 0 })
  const rnd = criarAleatorio(1337)

  // chão: linhas = eixo z, colunas = eixo x, ordem coluna a coluna (conferido em teste)
  const nl = NZ - 1
  const nc = NX - 1
  const h = new Float32Array((nl + 1) * (nc + 1))
  for (let r = 0; r <= nl; r++) for (let c = 0; c <= nc; c++) h[c * (nl + 1) + r] = alturas[r * NX + c]
  const { x0, x1, z0, z1 } = LIMITES
  world.createCollider(
    RAPIER.ColliderDesc.heightfield(nl, nc, h, { x: x1 - x0, y: 1, z: (NZ - 1) * LIMITES.passo })
      .setTranslation((x0 + x1) / 2, 0, z0 + ((NZ - 1) * LIMITES.passo) / 2)
      .setFriction(0.8)
  )

  // sólidos por perto
  const ativos = new Map()
  const quat = (yaw) => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
  function carregarFixos(x, z) {
    const queridos = new Set()
    fixosPerto(x, z, RAIO_FIXOS, (o, deck) => {
      queridos.add(o)
      if (ativos.has(o)) return
      let desc
      if (deck) {
        const yaw = Math.atan2(o.s, o.c)
        desc = RAPIER.ColliderDesc.cuboid(o.hx, 0.15, o.hz).setTranslation(o.cx, o.y - 0.15 + o.arco * 0.5, o.cz).setRotation(quat(yaw))
      } else if (o.tipo === 0) {
        const yaw = Math.atan2(o.s, o.c)
        const base = alturaTerreno(o.cx, o.cz) - 2
        desc = RAPIER.ColliderDesc.cuboid(o.hx, 14, o.hz).setTranslation(o.cx, base + 14, o.cz).setRotation(quat(yaw))
      } else {
        desc = RAPIER.ColliderDesc.cylinder(5, o.r).setTranslation(o.cx, alturaTerreno(o.cx, o.cz) + 4, o.cz)
      }
      ativos.set(o, world.createCollider(desc.setFriction(0.7)))
    })
    for (const [o, col] of ativos) {
      if (!queridos.has(o)) {
        world.removeCollider(col, false)
        ativos.delete(o)
      }
    }
  }

  // o personagem na física: cápsula cinemática que segue a posição do controle
  const corpoJog = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased())
  world.createCollider(RAPIER.ColliderDesc.capsule(0.5, 0.33), corpoJog)

  // objetos soltos
  const props = []
  const geoBola = geometriaBola()
  const geoCoco = geometriaCoco()
  const mat = toonVertice()
  const MAX_BOLAS = 12
  const MAX_COCOS = 120
  const malhaBolas = new THREE.InstancedMesh(geoBola, mat, MAX_BOLAS)
  const malhaCocos = new THREE.InstancedMesh(geoCoco, mat, MAX_COCOS)
  for (const mm of [malhaBolas, malhaCocos]) {
    mm.count = 0
    mm.castShadow = true
    mm.receiveShadow = true
    mm.frustumCulled = false
    mm.userData.peso = 0.7
    cena.add(mm)
  }

  function criarProp(tipo, x, y, z, vel = null) {
    const lista = props.filter((p) => p.tipo === tipo)
    const max = tipo === 'bola' ? MAX_BOLAS : MAX_COCOS
    if (lista.length >= max) {
      // recicla o mais antigo que estiver longe da vista
      const velho = lista[0]
      world.removeRigidBody(velho.corpo)
      props.splice(props.indexOf(velho), 1)
    }
    const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setAngularDamping(tipo === 'coco' ? 1.5 : 0.3).setCanSleep(true)
    const corpo = world.createRigidBody(desc)
    const col = tipo === 'bola'
      ? RAPIER.ColliderDesc.ball(0.35).setDensity(0.08).setRestitution(0.65).setFriction(0.6)
      : RAPIER.ColliderDesc.ball(0.17).setDensity(1.1).setRestitution(0.15).setFriction(0.9)
    world.createCollider(col, corpo)
    if (vel) corpo.setLinvel(vel, true)
    const p = { tipo, corpo, raio: tipo === 'bola' ? 0.35 : 0.17, naAgua: false, carregado: false }
    props.push(p)
    return p
  }

  // bolas espalhadas nas praias; cocos caídos no pé de alguns coqueiros
  for (let i = 0; i < MAX_BOLAS; i++) {
    const x = rnd.entre(-380, 380)
    const z = linhaCosta(x) + larguraPraia(x) * rnd.entre(0.3, 0.7)
    criarProp('bola', x, alturaTerreno(x, z) + 0.5, z)
  }
  for (const c of coqueiros) {
    if (!rnd.chance(0.12)) continue
    const a = rnd.entre(0, Math.PI * 2)
    const x = c.pos.x + Math.cos(a) * rnd.entre(0.6, 1.6)
    const z = c.pos.z + Math.sin(a) * rnd.entre(0.6, 1.6)
    criarProp('coco', x, alturaTerreno(x, z) + 0.3, z)
  }

  let acFixos = 1
  let acumulado = 0
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const p3 = new THREE.Vector3()
  const um = new THREE.Vector3(1, 1, 1)
  const jogAnterior = new THREE.Vector3()

  function passoFisica(jogador) {
    const jp = jogador.pos
    corpoJog.setNextKinematicTranslation({ x: jp.x, y: jp.y + 0.85, z: jp.z })
    for (const p of props) {
      if (p.carregado) continue
      const t = p.corpo.translation()
      const longe = (t.x - jp.x) ** 2 + (t.z - jp.z) ** 2 > RAIO_ATIVO ** 2
      if (longe !== !p.corpo.isEnabled()) p.corpo.setEnabled(!longe)
      if (longe) continue
      // empuxo: o que está abaixo da água é empurrado para cima e freado
      const fundo = alturaTerreno(t.x, t.z)
      const submerso = fundo < NIVEL_AGUA - 0.1 ? THREE.MathUtils.clamp((NIVEL_AGUA + p.raio * 0.4 - t.y) / (p.raio * 2), 0, 1) : 0
      if (submerso > 0) {
        const massa = p.corpo.mass()
        p.corpo.applyImpulse({ x: 0, y: massa * 25 * (p.tipo === 'bola' ? 2.6 : 1.7) * submerso * PASSO, z: 0 }, true)
        const v = p.corpo.linvel()
        p.corpo.setLinvel({ x: v.x * 0.97, y: v.y * 0.9, z: v.z * 0.97 }, true)
        if (!p.naAgua && v.y < -2) toque.gota(t.x, t.z, 0.6, Math.min(1, -v.y * 0.12))
      }
      p.naAgua = submerso > 0
      // chute: o jogador correndo de encontro à bola
      if (p.tipo === 'bola' && jogador.noChao) {
        const dx = t.x - jp.x
        const dz = t.z - jp.z
        const d = Math.hypot(dx, dz)
        const vj = jogador.vel
        const contra = (vj.x * dx + vj.z * dz) / Math.max(d, 1e-3)
        if (d < 0.95 && contra > 2 && Math.abs(t.y - (jp.y + 0.35)) < 0.8) {
          const f = p.corpo.mass() * Math.min(contra, 9) * 1.1
          p.corpo.applyImpulse({ x: (dx / d) * f, y: f * 0.55, z: (dz / d) * f }, true)
        }
      }
    }
    world.timestep = PASSO
    world.step()
  }

  // esbarrar no coqueiro derruba coco (de vez em quando)
  function cutucarCoqueiros(jogador, dt) {
    const jp = jogador.pos
    for (const c of coqueiros) {
      c.espera -= dt
      if (c.espera > 0) continue
      const d = Math.hypot(c.pos.x - jp.x, c.pos.z - jp.z)
      if (d < 0.95 && jogador.velHoriz > 3) {
        criarProp('coco', c.copa.x + rnd.entre(-0.4, 0.4), c.copa.y - 0.3, c.copa.z + rnd.entre(-0.4, 0.4), { x: rnd.entre(-1, 1), y: 0, z: rnd.entre(-1, 1) })
        c.espera = 6
      }
    }
  }

  return {
    world,
    props,
    criarProp,
    corpoJogador: corpoJog,
    atualizar(dt, jogador) {
      acFixos += dt
      if (acFixos > 0.5 || jogAnterior.distanceToSquared(jogador.pos) > 400) {
        acFixos = 0
        carregarFixos(jogador.pos.x, jogador.pos.z)
        jogAnterior.copy(jogador.pos)
      }
      cutucarCoqueiros(jogador, dt)
      acumulado += dt
      let n = 0
      while (acumulado >= PASSO && n < 3) {
        passoFisica(jogador)
        acumulado -= PASSO
        n++
      }
      if (n === 3) acumulado = 0

      // desenho e marcas na grama, areia e água
      let ib = 0
      let ic = 0
      for (const p of props) {
        const t = p.corpo.translation()
        const r = p.corpo.rotation()
        q.set(r.x, r.y, r.z, r.w)
        p3.set(t.x, t.y, t.z)
        m4.compose(p3, q, um)
        if (p.tipo === 'bola') malhaBolas.setMatrixAt(ib++, m4)
        else malhaCocos.setMatrixAt(ic++, m4)
        if (!p.corpo.isEnabled() || p.corpo.isSleeping() || p.carregado) continue
        const v = p.corpo.linvel()
        const vel = Math.hypot(v.x, v.z)
        const noChao = t.y - alturaTerreno(t.x, t.z) < p.raio + 0.08
        if (vel > 0.4 && noChao) {
          toque.tocar(t.x, t.z, p.raio * 2.2, 0.8, v.x, v.z)
          const sc = distCosta(t.x, t.z)
          if (sc > 0 && sc < larguraPraia(t.x)) areia.marcar(t.x, t.z, p.raio * 0.8, 0.018)
        }
      }
      malhaBolas.count = ib
      malhaCocos.count = ic
      malhaBolas.instanceMatrix.needsUpdate = true
      malhaCocos.instanceMatrix.needsUpdate = true
    },
  }
}

