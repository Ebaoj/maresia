// Prédios: orla de Fortaleza e do Rio, casario do Recife e favela nos morros.
// Cada tipo é um InstancedMesh: milhares de caixas desenhadas numa chamada só.

import * as THREE from 'three'
import {
  linhaCosta, larguraPraia, distCosta, rioX, RIO_MEIA_LARGURA, FIM_AVENIDA, MORROS,
  fbm, smooth,
} from './mapa.js'
import { alturaTerreno, inclinacao } from './terreno.js'
import { materialPredio, toon } from '../materiais.js'
import { FACHADAS, CASAS_SIMPLES, CAL, ESQUADRIAS } from '../paleta.js'
import { adicionarCaixa } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { solidosCamera } from './solidos.js'
import { instanciarEmBlocos } from './blocos.js'
import { criarCasas } from './quarteirao.js'
import { criarAleatorio } from '../utils.js'

const rnd = criarAleatorio(42)

class Lote {
  constructor(material, tipo) {
    this.material = material
    this.tipo = tipo
    this.itens = []
  }

  // Base no ponto mais baixo do terreno, para o prédio nunca flutuar na ladeira.
  // frente: para que lado (no espaço da caixa) fica a fachada principal, ex. [0, -1]
  add(x, z, w, d, h, rot, cor, { colisao = true, frente = null } = {}) {
    const cs = Math.cos(rot)
    const sn = Math.sin(rot)
    let min = Infinity
    let max = -Infinity
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
      const lx = (a * w) / 2
      const lz = (b * d) / 2
      const hh = alturaTerreno(x + lx * cs + lz * sn, z - lx * sn + lz * cs)
      min = Math.min(min, hh)
      max = Math.max(max, hh)
    }
    const base = min - 0.4
    const altura = h + (max - min) + 0.4
    this.itens.push({ x, y: base, z, w, d, h: altura, rot, cor, frente, tipo: this.tipo, chao: min, alturaUtil: h })
    if (colisao) adicionarCaixa(x, z, w / 2, d / 2, rot)
    ocupacao.marcar(x, z, w / 2 + 0.8, d / 2 + 0.8, rot)
    return base + altura
  }

  criar(cena, nome, solido = true) {
    const geo = new THREE.BoxGeometry(1, 1, 1, 1, 6, 1).translate(0, 0.5, 0)
    const eixo = new THREE.Vector3(0, 1, 0)
    const mats = this.itens.map((it) => new THREE.Matrix4().compose(
      new THREE.Vector3(it.x, it.y, it.z),
      new THREE.Quaternion().setFromAxisAngle(eixo, it.rot),
      new THREE.Vector3(it.w, it.h, it.d)
    ))
    return instanciarEmBlocos(cena, geo, this.material, mats, this.itens.map((it) => it.cor), { nome, solido })
  }
}

// paleta "cal e sal" de 1932 (src/paleta.js): fachada nunca é acento
const CORES_ORLA = FACHADAS
const CORES_CASARIO = FACHADAS
const CORES_FAVELA = CASAS_SIMPLES

function inclinacaoCosta(x) {
  return (linhaCosta(x + 1) - linhaCosta(x - 1)) / 2
}

function predioOrla(lote, xIni, xFim, altMin, altMax, segundaFila) {
  let x = xIni
  let n = 0
  while (x < xFim) {
    const w = rnd.entre(14, 22)
    const d = rnd.entre(11, 15)
    const xc = x + w / 2
    const rot = -Math.atan(inclinacaoCosta(xc))
    const zc = linhaCosta(xc) + larguraPraia(xc) + FIM_AVENIDA + 4 + d / 2
    if (ocupacao.livre(xc, zc, w / 2, d / 2, rot)) {
      lote.add(xc, zc, w, d, rnd.entre(altMin, altMax), rot, rnd.escolha(CORES_ORLA), { frente: [0, -1] })
      if (segundaFila && rnd.chance(0.75)) {
        const d2 = rnd.entre(10, 14)
        const z2 = zc + d / 2 + 9 + d2 / 2
        if (alturaTerreno(xc, z2) < 6 && ocupacao.livre(xc, z2, w / 2, d2 / 2, rot)) {
          lote.add(xc, z2, w * rnd.entre(0.7, 1), d2, rnd.entre(altMin * 0.6, altMax * 0.7), rot, rnd.escolha(CORES_ORLA), { frente: [0, 1] })
        }
      }
    }
    x += w + rnd.entre(3, 7)
    if (++n % 4 === 0) x += 13 // rua que desce para a praia
  }
}

// Casinhas estreitas e coloridas, de frente para a rua.
function casa(lote, x, z, w, d, rot, frente) {
  if (!ocupacao.livre(x, z, w / 2, d / 2, rot)) return
  if (Math.abs(x - rioX(z)) < RIO_MEIA_LARGURA * 1.4 + d / 2) return
  lote.add(x, z, w, d, rnd.entre(6.5, 12), rot, rnd.escolha(CORES_CASARIO), { frente })
}

function quarteirao(lote, cx, cz, W, D) {
  // lados sul e norte
  for (const lado of [-1, 1]) {
    let x = cx - W / 2
    while (x < cx + W / 2 - 3) {
      const w = Math.min(rnd.entre(4, 6.5), cx + W / 2 - x)
      const d = rnd.entre(8, 10)
      casa(lote, x + w / 2, cz + lado * (D / 2 - d / 2), w, d, 0, [0, lado])
      x += w
    }
  }
  // lados oeste e leste
  for (const lado of [-1, 1]) {
    let z = cz - D / 2
    while (z < cz + D / 2 - 3) {
      const w = Math.min(rnd.entre(4, 6.5), cz + D / 2 - z)
      const d = rnd.entre(8, 10)
      casa(lote, cx + lado * (W / 2 - d / 2), z + w / 2, d, w, 0, [lado, 0])
      z += w
    }
  }
}

function casario(lote) {
  for (let bx = -100; bx <= 100; bx += 46) {
    for (let bz = -10; bz <= 290; bz += 36) {
      const cx = bx + rnd.entre(-3, 3)
      const cz = bz
      if (distCosta(cx, cz - 13) < larguraPraia(cx) + FIM_AVENIDA + 6) continue
      if (Math.abs(cx - rioX(cz)) < 36) continue
      quarteirao(lote, cx, cz, 36, 26)
    }
  }
  // casas viradas para o rio, deixando um cais para caminhar
  for (const lado of [-1, 1]) {
    let z = linhaCosta(10) + larguraPraia(10) + FIM_AVENIDA + 8
    while (z < 295) {
      const w = rnd.entre(4.5, 6.5)
      const d = rnd.entre(8, 10)
      const drx = (rioX(z + 1) - rioX(z - 1)) / 2
      const n = Math.hypot(1, drx)
      const nx = 1 / n
      const nz = -drx / n
      const dist = RIO_MEIA_LARGURA * 1.45 + 4 + d / 2
      const x = rioX(z) + lado * nx * dist
      const zz = z + lado * nz * dist
      const rot = Math.atan2(-1, drx)
      if (ocupacao.livre(x, zz, w / 2, d / 2, rot)) lote.add(x, zz, w, d, rnd.entre(7, 13), rot, rnd.escolha(CORES_CASARIO), { frente: [0, lado] })
      z += w * n
    }
  }
}

function favela(lote, caixas) {
  const tanques = []
  for (let t = 0; t < 9000 && lote.itens.length < 750; t++) {
    const x = rnd.entre(-435, -125)
    const z = rnd.entre(-20, 330)
    const s = distCosta(x, z)
    if (s < larguraPraia(x) + FIM_AVENIDA + 26) continue
    const h = alturaTerreno(x, z)
    if (h < 3.5 || h > 48) continue
    if (inclinacao(x, z) > 0.95) continue
    // favela nasce em manchas, não espalhada por igual
    const p = smooth(-0.15, 0.2, fbm(x * 0.016, z * 0.016, 3, 81))
    if (!rnd.chance(p)) continue
    const w = rnd.entre(3.5, 6)
    const d = rnd.entre(3.5, 6)
    const ex = alturaTerreno(x + 1, z) - alturaTerreno(x - 1, z)
    const ez = alturaTerreno(x, z + 1) - alturaTerreno(x, z - 1)
    const rot = Math.atan2(ez, ex) + rnd.entre(-0.15, 0.15)
    if (!ocupacao.livre(x, z, w / 2 + 0.3, d / 2 + 0.3, rot)) continue
    const topo = lote.add(x, z, w, d, rnd.entre(2.8, 6.5), rot, rnd.escolha(CORES_FAVELA))
    if (rnd.chance(0.3)) {
      // laje com um puxadinho em cima
      const w2 = w * rnd.entre(0.5, 0.8)
      const d2 = d * rnd.entre(0.5, 0.8)
      caixas.push({ x, y: topo, z, w: w2, d: d2, h: rnd.entre(2.4, 3), rot, cor: rnd.escolha(CORES_FAVELA) })
    } else if (rnd.chance(0.55)) {
      tanques.push({ x: x + rnd.entre(-1, 1), y: topo, z: z + rnd.entre(-1, 1) })
    }
  }
  return tanques
}

function igreja(cena) {
  const o = MORROS.find((m) => m.nome === 'olinda')
  const x = o.x
  const z = o.z - 8
  const base = alturaTerreno(x, z) - 0.5
  const g = new THREE.Group()
  g.position.set(x, base, z)
  const branco = toon('#fbf7ef')
  const amarelo = toon('#c9963f')
  const azul = toon('#4f7c9a')
  const add = (geo, mat, px, py, pz) => {
    const m = new THREE.Mesh(geo, mat)
    m.position.set(px, py, pz)
    m.castShadow = m.receiveShadow = true
    g.add(m)
    return m
  }
  add(new THREE.BoxGeometry(11, 10, 22), branco, 0, 5, 0)
  add(new THREE.BoxGeometry(11.6, 0.6, 22.6), amarelo, 0, 10.2, 0)
  for (const lado of [-1, 1]) {
    add(new THREE.BoxGeometry(4, 17, 4), branco, lado * 5.5, 8.5, -10)
    add(new THREE.BoxGeometry(4.4, 0.5, 4.4), amarelo, lado * 5.5, 12, -10)
    const tampa = add(new THREE.ConeGeometry(3.1, 4, 4), azul, lado * 5.5, 19, -10)
    tampa.rotation.y = Math.PI / 4
  }
  const frontao = add(new THREE.ConeGeometry(6.5, 4.5, 3), branco, 0, 12.2, -10.6)
  frontao.rotation.z = 0
  frontao.scale.set(1, 1, 0.12)
  add(new THREE.BoxGeometry(3, 5, 0.3), azul, 0, 2.5, -11.1)
  cena.add(g)
  solidosCamera.push(g)
  adicionarCaixa(x, z, 7.6, 11.6, 0)
  ocupacao.marcar(x, z, 12, 16, 0)
}

export function criarCidade(cena) {
  igreja(cena)

  const orla = new Lote(materialPredio({ celula: [3.2, 3.0], margem: [0.14, 0.22], loja: 4, vidro: '#3b2c26', telhado: '#9a8f86', faixa: '#f4eee2', faixaAltura: 0.14, chanceAcesa: 0.45, moldura: '#f3ede0', cornija: 1, interior: '#33261f', madeira: 1, veneziana1: ESQUADRIAS[0], veneziana2: ESQUADRIAS[1], veneziana3: ESQUADRIAS[4], desgaste: 0.35, taipa: CAL.taipa }), 'orla')
  predioOrla(orla, 140, 298, 24, 60, true)
  predioOrla(orla, -392, -142, 18, 40, false)
  orla.criar(cena, 'predios-orla')

  const cas = new Lote(materialPredio({ celula: [2.3, 3.3], margem: [0.3, 0.2], loja: 3.4, vidro: '#3b2c26', telhado: CAL.telha, faixa: '#f4eee2', faixaAltura: 0.09, chanceAcesa: 0.55, moldura: '#f3ede0', cornija: 1, torto: 1, interior: '#33261f', madeira: 1, veneziana1: ESQUADRIAS[0], veneziana2: ESQUADRIAS[1], veneziana3: ESQUADRIAS[2], barra: 0.4, desgaste: 0.6, taipa: CAL.taipa }), 'casario')
  casario(cas)

  const fav = new Lote(materialPredio({ celula: [2.6, 2.8], margem: [0.36, 0.33], terreo: 0, vidro: '#3b2c26', telhado: '#a3836a', faixa: '#efe6d2', faixaAltura: 0, luz: '#ffb85c', chanceAcesa: 0.6, moldura: '#e4d6bb', torto: 1.6, madeira: 1, veneziana1: ESQUADRIAS[2], veneziana2: ESQUADRIAS[3], veneziana3: ESQUADRIAS[1], barra: 0.55, desgaste: 0.9, taipa: CAL.taipa }), 'favela')
  const puxadinhos = []
  const tanques = favela(fav, puxadinhos)
  for (const p of puxadinhos) fav.itens.push({ ...p, tipo: 'puxadinho', frente: null, chao: p.y, alturaUtil: p.h })
  // casario e morro com geometria de verdade (src/mundo/quarteirao.js); caixa d'água ficou de fora (é de outra época)
  const casas = criarCasas(cena, cas.itens, fav.itens)
  // de longe, a caixa com fachada pintada; perto, a casa detalhada (troca por bloco em quarteirao.js)
  casas.registrarLonge(cas.criar(cena, 'casario-longe', false), false)
  casas.registrarLonge(fav.criar(cena, 'favela-longe', false), true)
  void tanques

  return { predios: [...orla.itens, ...cas.itens, ...fav.itens], casas }
}
