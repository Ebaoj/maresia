// A cidade de 1932 (docs/mapa-1932.md): cada casa nasce no lote que ela tinha na
// planta oficial - a mesma frente de rua, a mesma largura, o mesmo uso.
// Perto do centro, sobrados e casas de platibanda (casario); na periferia, casas
// simples de taipa. Os lugares históricos ficam vazios: a reconstituição de cada um
// entra por cima.

import * as THREE from 'three' // eslint-disable-line no-unused-vars
import { larguraPraia, distCosta, rioX, RIO_MEIA_LARGURA, FIM_AVENIDA } from './mapa.js'
import { alturaTerreno, inclinacao } from './terreno.js'
import { materialPredio } from '../materiais.js'
import { FACHADAS, RESERVADOS, USO, VAOS } from './casario1932.js'
import { FACHADAS as CORES_CASARIO, CASAS_SIMPLES, CAL, ESQUADRIAS } from '../paleta.js'
import { adicionarCaixa } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { TAM_LOD, instanciarEmBlocos } from './blocos.js'
import { criarCasas } from './quarteirao.js'
import { criarAleatorio } from '../utils.js'
import { criarMuros1932, ALTURA_MURO, ESPESSURA_MURO } from './muro1932.js'
import { lugaresJogo, lagoasJogo, ANGULO_GRADE, pajeuJogo, distPolilinha, FATOR_PRACA, escalaJogo } from './fortaleza1932.js'
import { distRealDaPraca } from './chao1932.js'

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
export const RECUSA = { sobreposta: 0, rio: 0, praia: 0, lagoa: 0, pajeu: 0, ladeira: 0, reservada: 0 }

// Onde não pode morar: o rio, a praia, as lagoas, o riacho Pajeú e a ladeira.
function recusaDe(item) {
  if (Math.abs(item.x - rioX(item.z)) < RIO_MEIA_LARGURA * 1.3 + item.d / 2) return 'rio'
  if (distCosta(item.x, item.z) < larguraPraia(item.x) + FIM_AVENIDA + 2) return 'praia'
  for (const l of lagoasJogo) if (Math.hypot((item.x - l.x) / (l.rx + 8), (item.z - l.z) / (l.rz + 8)) < 1.3) return 'lagoa'
  // o riacho Pajeú corta o chão: casa em cima dele ficaria no fundo do vale
  if (distPolilinha(item.x, item.z, pajeuJogo) < 5) return 'pajeu'
  if (inclinacao(item.x, item.z) > 0.6) return 'ladeira'
  return null
}

function casa(lote, x, z, w, d, rot, frente, alturaMin, alturaMax, cores, opcoes = {}) {
  // casas geminadas: testa só o miolo do lote (a vizinha colada não pode ser recusada pela folga dela)
  const item = casaAjustada({ x, z, w, d, rot })
  if (!item) { RECUSA.sobreposta++; return null }
  const recusa = recusaDe(item)
  if (recusa) { RECUSA[recusa]++; return null }
  const altura = opcoes.altura ?? rnd.entre(alturaMin, alturaMax)
  const cor = opcoes.cor ?? rnd.escolha(cores)
  lote.add(item.x, item.z, item.w, item.d, altura, rot, cor, { frente })
  marcarCasa(item)
  return item
}

// Casa nova numa folha de testada já escolhida: ela entra no lugar, sem
// ajuste (a folha foi medida na linha da fachada).
function casaNaFolga(lote, item, altura, cor) {
  if (!casaLivre(item)) { RECUSA.sobreposta++; return null }
  const recusa = recusaDe(item)
  if (recusa) { RECUSA[recusa]++; return null }
  lote.add(item.x, item.z, item.w, item.d, altura, item.rot, cor, { frente: [0, 1] })
  marcarCasa(item)
  return item
}

// A cidade: uma casa por fachada de 1932, na posicao, na largura e no uso que a
// planta oficial registra.
function cidade(cas, sim) {
  const quadras = []
  for (const f of FACHADAS) {
    if (reservado(f.x, f.z)) { RECUSA.reservada++; continue }
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

// ---------------------------------------------------------------- item 2
// A frente contínua: a planta oficial de 1932 é esparsa (26% das frentes têm
// vizinho; a folga mediana entre duas frentes é de 22 m), e a cidade parecia
// um deserto de areia com as casas soltas. Estes trechos da testada são
// preenchidos: no Centro, casa geminada na mesma linha de fachada, com
// alturas e cores variadas da paleta cal e sal; nos bairros, muro caiado com
// portão de madeira.
//
// A semente é fixa (1932): a cidade sai sempre igual.
export const FRENTE = { vaos: 0, casas: 0, muros: 0, recusadas: 0, passagens: 0 }

function preencheVaus(cas, cfg) {
  const rnd = criarAleatorio(1932)
  const muros = []
  const raio = cfg.chao.centroRaio
  for (const vao of VAOS) {
    const ax = vao.a[0]
    const az = vao.a[1]
    const bx = vao.b[0]
    const bz = vao.b[1]
    const dx = bx - ax
    const dz = bz - az
    const comp = Math.hypot(dx, dz)
    if (comp < 0.6) continue
    const ux = dx / comp
    const uz = dz / comp
    const mx = (ax + bx) / 2
    const mz = (az + bz) / 2
    // a normal do vão: a perpendicular à linha do vão, virada para a rua
    let nx = uz
    let nz = -ux
    if (nx * vao.normal[0] + nz * vao.normal[1] < 0) { nx = -nx; nz = -nz }
    // quantos metros de verdade o vão tem: a escala do mapa muda de um ponto
    // para outro (a praça está em 1:1, o resto é comprimido)
    const e = escalaJogo(mx, mz)
    const metros = Math.hypot(dx / e.x, dz / e.z)
    if (metros < 7) { FRENTE.passagens++; continue } // uma passagem de pedestre, não uma casa
    FRENTE.vaos++
    if (distRealDaPraca(mx, mz) < raio) {
      // Centro: a fileira de casas continua a linha da fachada. Cada casa
      // fica 0,45 un menor que o trecho que cabe: a parede entre as
      // vizinhas tem espessura, e a casa não invade o vizinho (o teste de
      // sobreposição da cidade conta a parede como sobreposição).
      const quantas = Math.max(1, Math.min(Math.round(metros / 11), Math.floor((comp - 0.45) / 5)))
      const larg = comp / quantas - 0.45
      const prof = Math.min(40, Math.max(2, vao.prof))
      const rot = Math.atan2(nx, nz)
      for (let i = 0; i < quantas; i++) {
        // Onde a casa cabe: a casa da esquina é uma caixa reta e o quarteirão
        // é curvo, então ela avança sobre o vão. A casa nova procura o
        // trecho livre da linha, em vez de brigar com a esquina.
        let item = null
        for (let t = (i + 0.12) / quantas; t <= 1 && !item; t += 0.02) {
          const cx = ax + dx * t
          const cz = az + dz * t
          const teste = { x: cx - nx * (prof / 2), z: cz - nz * (prof / 2), w: larg, d: prof, rot }
          if (casaLivre(teste)) item = teste
        }
        if (!item) { FRENTE.recusadas++; continue }
        const altura = rnd.chance(0.45) ? rnd.entre(7.2, 8.6) : rnd.entre(4.8, 5.8)
        const cor = rnd.escolha(CORES_CASARIO)
        const feita = casaNaFolga(cas, item, altura, cor)
        if (feita) FRENTE.casas++
        else FRENTE.recusadas++
      }
    } else {
      // bairros: muro caiado, com portão de madeira. O muro também procura o
      // trecho livre: a casa da esquina avança sobre o vão da mesma rua.
      const rotMuro = Math.atan2(-uz, ux)
      const livre = (t) => {
        const cx = ax + dx * t
        const cz = az + dz * t
        return casaLivre({ x: cx - nx * (ESPESSURA_MURO / 2), z: cz - nz * (ESPESSURA_MURO / 2), w: 1.2, d: ESPESSURA_MURO, rot: rotMuro })
      }
      let t0 = 0
      let t1 = 1
      while (t0 < 1 && !livre(t0)) t0 += 0.02
      while (t1 > t0 && !livre(t1)) t1 -= 0.02
      if (t1 - t0 < 0.05) { FRENTE.recusadas++; continue }
      const c0x = ax + dx * t0
      const c0z = az + dz * t0
      const c1x = ax + dx * t1
      const c1z = az + dz * t1
      const yBase = Math.min(alturaTerreno(c0x, c0z), alturaTerreno(c1x, c1z))
      muros.push({
        x: (c0x + c1x) / 2 - nx * (ESPESSURA_MURO / 2),
        z: (c0z + c1z) / 2 - nz * (ESPESSURA_MURO / 2),
        y: yBase,
        comprimento: Math.hypot(c1x - c0x, c1z - c0z),
        rot: rotMuro,
        cor: rnd.escolha(['#efe6d2', '#e4d6bb', '#d9cbb0', '#e9dfc8', '#f2ebdc']),
        portao: rnd.entre(0.18, 0.82),
      })
      FRENTE.muros++
    }
  }
  return muros
}

export function criarCidade(cena, cfg) {
  const cas = new Lote(materialPredio({ celula: [2.3, 3.3], margem: [0.3, 0.2], loja: 3.4, vidro: '#3b2c26', telhado: CAL.telha, faixa: '#f4eee2', faixaAltura: 0.09, chanceAcesa: 0.55, moldura: '#f3ede0', cornija: 1, torto: 1, interior: '#33261f', madeira: 1, veneziana1: ESQUADRIAS[0], veneziana2: ESQUADRIAS[1], veneziana3: ESQUADRIAS[2], barra: 0.4, desgaste: 0.6, taipa: CAL.taipa }), 'casario')
  const sim = new Lote(materialPredio({ celula: [2.6, 2.8], margem: [0.36, 0.33], terreo: 0, vidro: '#3b2c26', telhado: '#a3836a', faixa: '#efe6d2', faixaAltura: 0, luz: '#ffb85c', chanceAcesa: 0.6, moldura: '#e4d6bb', torto: 1.6, madeira: 1, veneziana2: ESQUADRIAS[2], veneziana3: ESQUADRIAS[3], veneziana1: ESQUADRIAS[1], barra: 0.55, desgaste: 0.9, taipa: CAL.taipa }), 'favela')
  const quadras = cidade(cas, sim)
  // a frente contínua: as folgas da testada viram casa (Centro) ou muro (bairros)
  const muros = preencheVaus(cas, cfg)

  // casas com geometria de verdade (src/mundo/quarteirao.js); de longe, a caixa com fachada pintada
  const casas = criarCasas(cena, cas.itens, sim.itens)
  casas.registrarLonge(cas.criar(cena, 'casario-longe', false), false)
  casas.registrarLonge(sim.criar(cena, 'favela-longe', false), true)
  // os muros dos bairros, com o portão de madeira
  criarMuros1932(cena, muros)

  return { predios: [...cas.itens, ...sim.itens], casas, quadras, grade: GRADE, frente: FRENTE }
}
