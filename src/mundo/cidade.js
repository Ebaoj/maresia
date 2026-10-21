// A cidade de 1932 (docs/mapa-1932.md): cada casa nasce no lote que ela tinha na
// planta oficial - a mesma frente de rua, a mesma largura, o mesmo uso.
// Perto do centro, sobrados e casas de platibanda (casario); na periferia, casas
// simples de taipa. Os lugares históricos ficam vazios: a reconstituição de cada um
// entra por cima.

import * as THREE from 'three' // eslint-disable-line no-unused-vars
import { larguraPraia, distCosta, rioX, RIO_MEIA_LARGURA, FIM_AVENIDA } from './mapa.js'
import { alturaTerreno, inclinacao } from './terreno.js'
import { materialPredio } from '../materiais.js'
import { FACHADAS, RESERVADOS, USO } from './casario1932.js'
import { FACHADAS as CORES_CASARIO, CASAS_SIMPLES, CAL, ESQUADRIAS } from '../paleta.js'
import { adicionarCaixa } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { TAM_LOD, instanciarEmBlocos } from './blocos.js'
import { criarCasas } from './quarteirao.js'
import { casaNoMarco } from './marcos1932/pegadas.js'
import { criarAleatorio } from '../utils.js'
import { lugaresJogo, lagoasJogo, ANGULO_GRADE, pajeuJogo, distPolilinha, FATOR_PRACA } from './fortaleza1932.js'

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
    return instanciarEmBlocos(cena, geo, this.material, mats, this.itens.map((it) => it.cor), { nome, solido, tam: TAM_LOD })
  }
}

// eixos da grade de Herbster: ex = rua leste-sudeste, ez = rua sul-sudoeste (z cresce para o sul)
// a grade continua valendo para o mobiliário e para o minimapa; as casas, nao: elas
// seguem a planta oficial
// A quadra e a rua foram medidas no mundo comprimido: com a praca descomprimida,
// o mesmo quarteirao do centro ocupa FATOR_PRACA vezes mais unidades.
const ROT = -(Math.PI / 2 - ANGULO_GRADE) // -17,5 graus
const EX = [Math.cos(ROT), -Math.sin(ROT)]
const EZ = [Math.sin(ROT), Math.cos(ROT)]
const QUADRA_W = 34 * FATOR_PRACA
const QUADRA_D = 30 * FATOR_PRACA
const RUA = 9 * FATOR_PRACA
const [PFX, PFZ] = lugaresJogo.pracaFerreira
export const GRADE = { rot: ROT, ex: EX, ez: EZ, w: QUADRA_W, d: QUADRA_D, rua: RUA, origem: [PFX, PFZ] }

// os lugares que a cidade nao pode cobrir (a reconstituicao de cada um entra por cima)
const reservas = RESERVADOS.map(([chave, raio]) => {
  const [x, z] = lugaresJogo[chave]
  return { x, z, r2: raio * raio }
})

function reservado(x, z) {
  for (const r of reservas) {
    const dx = x - r.x
    const dz = z - r.z
    if (dx * dx + dz * dz < r.r2) return true
  }
  return false
}

// A fachada cai num lugar que a cidade não cobre? 'reservada' (o círculo do lugar histórico) ou 'marco' (o chão
// de um marco de 1932 que tem obra própria: Excelsior, cinemas, Leões, Mercado; marcos1932/pegadas.js)
export function lugarRecusado(f) {
  if (reservado(f.x, f.z)) return 'reservada'
  if (casaNoMarco(f.x, f.z, f.w, f.d, f.rot)) return 'marco'
  return null
}

// Cruzamento entre casas: as da planta de 1932 são coladas de parede, e a grade de
// ocupação (2 m) é grossa demais para separating vizinhas de 3 m. Aqui o teste é
// exato: retângulos girados, eixo por eixo (SAT), com uma grade esparsa por célula.
const CELO = 8
const vizinhos = new Map()

function cruza(a, b) {
  const ca = Math.cos(a.rot)
  const sa = Math.sin(a.rot)
  const cb = Math.cos(b.rot)
  const sb = Math.sin(b.rot)
  // os eixos locais da casa no mundo: o x da fachada e o z da profundidade
  const ax = [ca, -sa]
  const az = [sa, ca]
  const bx = [cb, -sb]
  const bz = [sb, cb]
  const dx = b.x - a.x
  const dz = b.z - a.z
  for (const [ex, ez] of [ax, az, bx, bz]) {
    const p = Math.abs(dx * ex + dz * ez)
    const ra = (a.w / 2) * Math.abs(ax[0] * ex + ax[1] * ez) + (a.d / 2) * Math.abs(az[0] * ex + az[1] * ez)
    const rb = (b.w / 2) * Math.abs(bx[0] * ex + bx[1] * ez) + (b.d / 2) * Math.abs(bz[0] * ex + bz[1] * ez)
    if (p > ra + rb + 0.3) return false // a parede dos fundos tem espessura
  }
  return true
}

function casaLivre(casa) {
  const raio = (casa.w + casa.d) / 2
  const i0 = Math.floor((casa.x - raio) / CELO)
  const i1 = Math.floor((casa.x + raio) / CELO)
  const j0 = Math.floor((casa.z - raio) / CELO)
  const j1 = Math.floor((casa.z + raio) / CELO)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const lista = vizinhos.get(`${i},${j}`)
      if (!lista) continue
      for (const outra of lista) if (cruza(casa, outra)) return false
    }
  }
  return true
}

function marcarCasa(casa) {
  const raio = (casa.w + casa.d) / 2
  const i0 = Math.floor((casa.x - raio) / CELO)
  const i1 = Math.floor((casa.x + raio) / CELO)
  const j0 = Math.floor((casa.z - raio) / CELO)
  const j1 = Math.floor((casa.z + raio) / CELO)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = `${i},${j}`
      if (!vizinhos.has(k)) vizinhos.set(k, [])
      vizinhos.get(k).push(casa)
    }
  }
}

// A casa cabe no lote? Se ela invade a vizinha, encolhe o fundo do lote e tenta
// de novo: perder a fachada (e deixar buraco na testada da rua) e pior que perder
// o quintal dos fundos. A frente continua no mesmo lugar; so o corpo da casa
// fica mais raso. Se nem assim couber, a casa estreita (a fachada fica no mesmo
// ponto, so mais estreita) - melhor uma casa estreita do que um vao na rua.
const FATORES = [1, 0.92, 0.84, 0.75, 0.65, 0.55, 0.45, 0.35]
const FATORES_LARGURA = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]

function casaAjustada(item) {
  const nx = Math.sin(item.rot)
  const nz = Math.cos(item.rot)
  // a linha da fachada (o lado largo da casa)
  const fx = Math.cos(item.rot)
  const fz = -Math.sin(item.rot)
  for (const f of FATORES) {
    const d = item.d * f
    const t = { x: item.x + (nx * (item.d - d)) / 2, z: item.z + (nz * (item.d - d)) / 2, w: item.w, d, rot: item.rot }
    if (casaLivre(t)) return t
  }
  for (const f of FATORES_LARGURA) {
    const w = item.w * f
    const t = { x: item.x + (fx * (item.w - w)) / 2, z: item.z + (fz * (item.w - w)) / 2, w, d: item.d, rot: item.rot }
    if (casaLivre(t)) return t
  }
  return null
}

// por que uma fachada da planta não virou casa (serve para acertar o mapa)
export const RECUSA = { sobreposta: 0, rio: 0, praia: 0, lagoa: 0, pajeu: 0, ladeira: 0, reservada: 0, marco: 0 }

function casa(lote, x, z, w, d, rot, frente, alturaMin, alturaMax, cores) {
  // casas geminadas: testa só o miolo do lote (a vizinha colada não pode ser recusada pela folga dela)
  const item = casaAjustada({ x, z, w, d, rot })
  if (!item) { RECUSA.sobreposta++; return null }
  if (Math.abs(item.x - rioX(item.z)) < RIO_MEIA_LARGURA * 1.3 + item.d / 2) { RECUSA.rio++; return null }
  if (distCosta(item.x, item.z) < larguraPraia(item.x) + FIM_AVENIDA + 2) { RECUSA.praia++; return null }
  for (const l of lagoasJogo) if (Math.hypot((item.x - l.x) / (l.rx + 8), (item.z - l.z) / (l.rz + 8)) < 1.3) { RECUSA.lagoa++; return null }
  // o riacho Pajeú corta o chão: casa em cima dele ficaria no fundo do vale
  if (distPolilinha(item.x, item.z, pajeuJogo) < 5) { RECUSA.pajeu++; return null }
  if (inclinacao(item.x, item.z) > 0.6) { RECUSA.ladeira++; return null }
  lote.add(item.x, item.z, item.w, item.d, rnd.entre(alturaMin, alturaMax), rot, rnd.escolha(cores), { frente })
  marcarCasa(item)
  return item
}

// A cidade: uma casa por fachada de 1932, na posicao, na largura e no uso que a
// planta oficial registra.
function cidade(cas, sim) {
  const quadras = []
  for (const f of FACHADAS) {
    const recusa = lugarRecusado(f)
    if (recusa) { RECUSA[recusa]++; continue }
    const galpao = f.uso === USO.Industrial || f.uso === USO.Transporte
    const lote = f.tipo === 'casario' ? cas : sim
    const alturaMin = galpao ? 4.6 : f.tipo === 'simples' ? 3.1 : 6.2
    const alturaMax = galpao ? 6.2 : f.tipo === 'simples' ? 3.9 : 8.6
    const cores = f.tipo === 'casario' ? CORES_CASARIO : CASAS_SIMPLES
    // a casa e um pouco menor que o lote: o lote tem canto funky, a casa e reta
    const casaFeita = casa(lote, f.x, f.z, f.w * 0.92, f.d * 0.94, f.rot, [0, 1], alturaMin, alturaMax, cores)
    if (casaFeita) quadras.push({ cx: casaFeita.x, cz: casaFeita.z, reservada: false, w: casaFeita.w, d: casaFeita.d, rot: f.rot })
  }
  return quadras
}

export function criarCidade(cena) {
  const cas = new Lote(materialPredio({ celula: [2.3, 3.3], margem: [0.3, 0.2], loja: 3.4, vidro: '#3b2c26', telhado: CAL.telha, faixa: '#f4eee2', faixaAltura: 0.09, chanceAcesa: 0.55, moldura: '#f3ede0', cornija: 1, torto: 1, interior: '#33261f', madeira: 1, veneziana1: ESQUADRIAS[0], veneziana2: ESQUADRIAS[1], veneziana3: ESQUADRIAS[2], barra: 0.4, desgaste: 0.6, taipa: CAL.taipa }), 'casario')
  const sim = new Lote(materialPredio({ celula: [2.6, 2.8], margem: [0.36, 0.33], terreo: 0, vidro: '#3b2c26', telhado: '#a3836a', faixa: '#efe6d2', faixaAltura: 0, luz: '#ffb85c', chanceAcesa: 0.6, moldura: '#e4d6bb', torto: 1.6, madeira: 1, veneziana2: ESQUADRIAS[2], veneziana3: ESQUADRIAS[3], veneziana1: ESQUADRIAS[1], barra: 0.55, desgaste: 0.9, taipa: CAL.taipa }), 'favela')
  const quadras = cidade(cas, sim)

  // casas com geometria de verdade (src/mundo/quarteirao.js); de longe, a caixa com fachada pintada
  const casas = criarCasas(cena, cas.itens, sim.itens)
  casas.registrarLonge(cas.criar(cena, 'casario-longe', false), false)
  casas.registrarLonge(sim.criar(cena, 'favela-longe', false), true)

  return { predios: [...cas.itens, ...sim.itens], casas, quadras, grade: GRADE }
}
