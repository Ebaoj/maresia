// A cidade de 1932 (docs/mapa-1932.md): a grade de Herbster sai da Praça do Ferreira com o ângulo
// medido nos lotes de 1932 (ruas a 72,5 graus do leste) e só nasce quadra onde havia lotes.
// Perto do centro, sobrados e casas de platibanda (casario); na periferia, casas simples de taipa.
// As quadras dos lugares históricos ficam vazias: a reconstituição de cada lugar entra por cima.

import * as THREE from 'three' // eslint-disable-line no-unused-vars
import { larguraPraia, distCosta, rioX, RIO_MEIA_LARGURA, FIM_AVENIDA, densidadeLotes } from './mapa.js'
import { alturaTerreno, inclinacao } from './terreno.js'
import { materialPredio } from '../materiais.js'
import { FACHADAS, CASAS_SIMPLES, CAL, ESQUADRIAS } from '../paleta.js'
import { adicionarCaixa } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { instanciarEmBlocos } from './blocos.js'
import { criarCasas } from './quarteirao.js'
import { criarAleatorio } from '../utils.js'
import { lugaresJogo, lagoasJogo, ANGULO_GRADE } from './fortaleza1932.js'

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

const CORES_CASARIO = FACHADAS
const CORES_SIMPLES = CASAS_SIMPLES

// eixos da grade no jogo: ex = rua leste-sudeste, ez = rua sul-sudoeste (z cresce para o sul)
const ROT = -(Math.PI / 2 - ANGULO_GRADE) // -17,5 graus
const EX = [Math.cos(ROT), -Math.sin(ROT)]
const EZ = [Math.sin(ROT), Math.cos(ROT)]
const QUADRA_W = 34
const QUADRA_D = 30
const RUA = 9
const [PFX, PFZ] = lugaresJogo.pracaFerreira
export const GRADE = { rot: ROT, ex: EX, ez: EZ, w: QUADRA_W, d: QUADRA_D, rua: RUA, origem: [PFX, PFZ] }
// quadras reservadas para os lugares históricos (ficam vazias aqui)
const RESERVADOS = ['pracaFerreira', 'passeioPublico', 'forte', 'se', 'santaCasa', 'pracaLeoes', 'mercadoFerro', 'theatro', 'estacao', 'cemiterio', 'seminario', 'campoOtavioBonfim']

function paraMundo(cx, cz, lx, lz) {
  return [cx + lx * EX[0] + lz * EZ[0], cz + lx * EX[1] + lz * EZ[1]]
}

function casa(lote, x, z, w, d, rot, frente, alturaMin, alturaMax, cores) {
  if (!ocupacao.livre(x, z, w / 2, d / 2, rot)) return
  if (Math.abs(x - rioX(z)) < RIO_MEIA_LARGURA * 2 + d / 2) return
  if (distCosta(x, z) < larguraPraia(x) + FIM_AVENIDA + 2) return
  for (const l of lagoasJogo) if (Math.hypot((x - l.x) / (l.rx + 8), (z - l.z) / (l.rz + 8)) < 1.3) return
  if (inclinacao(x, z) > 0.6) return
  lote.add(x, z, w, d, rnd.entre(alturaMin, alturaMax), rot, rnd.escolha(cores), { frente })
}

// casas nos quatro lados de uma quadra; "cheia" é a chance de cada lote estar ocupado
function quadra(lote, cx, cz, cheia, aMin, aMax, cores) {
  const W = QUADRA_W
  const D = QUADRA_D
  for (const lado of [-1, 1]) {
    let lx = -W / 2
    while (lx < W / 2 - 3) {
      const w = Math.min(rnd.entre(4, 6.5), W / 2 - lx)
      const d = rnd.entre(8, 10)
      if (rnd.chance(cheia)) {
        const [x, z] = paraMundo(cx, cz, lx + w / 2, lado * (D / 2 - d / 2))
        casa(lote, x, z, w, d, ROT, [0, lado], aMin, aMax, cores)
      }
      lx += w
    }
  }
  for (const lado of [-1, 1]) {
    let lz = -D / 2 + 10
    while (lz < D / 2 - 10) {
      const w = Math.min(rnd.entre(4, 6.5), D / 2 - 10 - lz)
      if (w < 3.5) break
      const d = rnd.entre(8, 10)
      if (rnd.chance(cheia)) {
        const [x, z] = paraMundo(cx, cz, lado * (W / 2 - d / 2), lz + w / 2)
        casa(lote, x, z, d, w, ROT, [lado, 0], aMin, aMax, cores)
      }
      lz += w
    }
  }
}

function cidade(casario, simples) {
  const passoX = QUADRA_W + RUA
  const passoZ = QUADRA_D + RUA
  // as quadras dos lugares históricos
  const reservadas = new Set()
  for (const k of RESERVADOS) {
    const [x, z] = lugaresJogo[k]
    const dx = x - PFX
    const dz = z - PFZ
    const a = Math.round((dx * EX[0] + dz * EX[1]) / passoX)
    const b = Math.round((dx * EZ[0] + dz * EZ[1]) / passoZ)
    reservadas.add(`${a},${b}`)
  }
  const quadras = []
  for (let b = -16; b <= 26; b++) {
    for (let a = -36; a <= 36; a++) {
      const [cx, cz] = paraMundo(PFX, PFZ, a * passoX, b * passoZ)
      if (reservadas.has(`${a},${b}`)) { quadras.push({ cx, cz, reservada: true }); continue }
      const dens = densidadeLotes(cx, cz)
      if (dens < 0.12) continue
      const dCentro = Math.hypot(cx - PFX, cz - PFZ)
      const cheia = Math.min(0.95, 0.25 + dens * 1.1)
      if (dCentro < 330) quadra(casario, cx, cz, cheia, 6.5, 12, CORES_CASARIO)
      else quadra(simples, cx, cz, cheia * 0.85, 2.9, dCentro < 520 ? 7 : 4.2, CORES_SIMPLES)
      quadras.push({ cx, cz, reservada: false })
    }
  }
  return quadras
}

export function criarCidade(cena) {
  const cas = new Lote(materialPredio({ celula: [2.3, 3.3], margem: [0.3, 0.2], loja: 3.4, vidro: '#3b2c26', telhado: CAL.telha, faixa: '#f4eee2', faixaAltura: 0.09, chanceAcesa: 0.55, moldura: '#f3ede0', cornija: 1, torto: 1, interior: '#33261f', madeira: 1, veneziana1: ESQUADRIAS[0], veneziana2: ESQUADRIAS[1], veneziana3: ESQUADRIAS[2], barra: 0.4, desgaste: 0.6, taipa: CAL.taipa }), 'casario')
  const sim = new Lote(materialPredio({ celula: [2.6, 2.8], margem: [0.36, 0.33], terreo: 0, vidro: '#3b2c26', telhado: '#a3836a', faixa: '#efe6d2', faixaAltura: 0, luz: '#ffb85c', chanceAcesa: 0.6, moldura: '#e4d6bb', torto: 1.6, madeira: 1, veneziana1: ESQUADRIAS[2], veneziana2: ESQUADRIAS[3], veneziana3: ESQUADRIAS[1], barra: 0.55, desgaste: 0.9, taipa: CAL.taipa }), 'favela')
  const quadras = cidade(cas, sim)

  // casas com geometria de verdade (src/mundo/quarteirao.js); de longe, a caixa com fachada pintada
  const casas = criarCasas(cena, cas.itens, sim.itens)
  casas.registrarLonge(cas.criar(cena, 'casario-longe', false), false)
  casas.registrarLonge(sim.criar(cena, 'favela-longe', false), true)

  return { predios: [...cas.itens, ...sim.itens], casas, quadras, grade: GRADE }
}

