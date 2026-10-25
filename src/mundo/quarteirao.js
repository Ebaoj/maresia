// Casas de 1932 com geometria de verdade (nasceu como fatia vertical numa rua; hoje é todo o casario
// e, na variante simples, as casas do morro). Em vez de caixa com janela pintada:
//   - fachada com espessura e vãos recuados (porta e janela), alguns em arco abatido
//   - moldura saliente, peitoril, cunhais (pilastras nas quinas), embasamento
//   - folhas de madeira em 3D, fechadas, entreabertas ou abertas para a rua
//   - interior escuro e quente atrás dos vãos
//   - platibanda com cornija em degraus, ou beiral com telha canal (capa e canal)
//   - sacada de ferro em parte dos sobrados
//   - calçada alta com meio-fio (é um deck: o personagem sobe nela)
// As casas são juntadas por bloco de 96 m em 3 malhas (reboco, peças, interior): poucas chamadas de
// desenho, e o three pula o bloco inteiro fora da tela ou da sombra.

import * as THREE from 'three'
import { pintar, gradienteToon, luzFixa, texturizar } from '../materiais.js'
import { globais } from '../globais.js'
import { CAL, ESQUADRIAS } from '../paleta.js'
import { adicionarDeck } from './colisao.js'
import { MuitoLonge } from './muito-longe.js'
import { LoteCasas } from './casas-lote.js'
import { TAM_LOD, instanciarEmBlocos } from './blocos.js'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { criarAleatorio } from '../utils.js'
import { ref } from '../render/gpu/comum.js'
import { GLSL_DESGASTE, envelhecerTsl } from './desgaste.js'
import { GLSL_CASCA_MARCO, ligarCascaGlsl, cascaMarcoTsl } from './desgaste-marcos.js'
import { GerenciadorDeBlocos } from './bloco-casas.js'

// rua de referência da fatia vertical (z ≈ 152, x -72 a -36): bom lugar para comparar com os filmes
export const FATIA = { x0: -73, x1: -35, z0: 134, z1: 170 }

const CALCADA = 0.25 // altura da calçada sobre o chão
const LARG_CALCADA = 1.6
const MEIO_FIO = 0.16 // largura do meio-fio, na beira da calçada
const PAREDE = 0.32 // espessura da fachada (o recuo dos vãos)

const cor = new THREE.Color()
const m4 = new THREE.Matrix4()
const m4b = new THREE.Matrix4() // matriz do deslocamento (não aloca por peça)
const normalMatriz = new THREE.Matrix3() // a matriz normal (inversa transposta do 3x3)
// a caixa de 1 m, compartilhada por todas as peças (o tamanho entra na escala)
const CAIXA = new THREE.BoxGeometry(1, 1, 1).toNonIndexed()

// Junta geometrias com cor por vértice.
// Fase 1 (25/10/2026): cada peça virava uma geometria nova (BoxGeometry, toNonIndexed,
// clone) e as pilhas eram juntadas no fim com mergeGeometries. São milhares de alocações
// por bloco, e o bloco inteiro era montado dentro de um quadro (150 a 300 ms na T4).
// Agora cada pilha escreve direto nos seus arrays (posição, normal, cor e o chão da casa)
// e a geometria final sai deles: quatro alocações por pilha em vez de milhares.
// (o teste testes/unidade/quarteirao-geometria.test.js confere que a geometria sai igual)
export class Pilha {
  constructor() {
    this.pPos = new Float32Array(0)
    this.pNor = new Float32Array(0)
    this.pCor = new Float32Array(0)
    this.pChao = new Float32Array(0)
    this.n = 0 // vértices
    this.chao = 0 // o chão da casa: o salitre sobe a partir dele
  }

  // espaço para mais vértices (cresce dobrando: o custo é amortizado)
  crescer(vertices) {
    const precisa = (this.n + vertices) * 3
    if (precisa <= this.pPos.length) return
    let cap = Math.max(this.pPos.length, 3 * 1024)
    while (cap < precisa) cap *= 2
    const troca = (a) => { const b = new Float32Array(cap); b.set(a); return b }
    this.pPos = troca(this.pPos)
    this.pNor = troca(this.pNor)
    this.pCor = troca(this.pCor)
    this.pChao = troca(this.pChao)
  }

  // acrescenta uma geometria, transformada pela matriz, com a cor por vértice.
  // ex, ey, ez: escala da posição antes da matriz (a caixa de 1 m compartilhada).
  // A normal não é escalada: a matriz não tem escala (a casa é montada na base),
  // então a matriz normal é uma rotação e a normal continua unitária, como antes.
  add(geo, matriz, hex, ex = 1, ey = 1, ez = 1) {
    if (SO_PLANEJAR || !geo) return
    const pos = geo.attributes.position
    if (!pos) return
    const nor = geo.attributes.normal
    const n = pos.count
    if (!n) return
    this.crescer(n)
    const e = matriz.elements
    normalMatriz.getNormalMatrix(matriz)
    const nm = normalMatriz.elements
    cor.set(hex)
    const r = cor.r, g = cor.g, b = cor.b
    const chao = this.chao
    const P = this.pPos, N = this.pNor, C = this.pCor, A = this.pChao
    let d = this.n * 3
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i) * ex, y = pos.getY(i) * ey, z = pos.getZ(i) * ez
      P[d] = e[0] * x + e[4] * y + e[8] * z + e[12]
      P[d + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
      P[d + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
      if (nor) {
        const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i)
        let ax = nm[0] * nx + nm[3] * ny + nm[6] * nz
        let ay = nm[1] * nx + nm[4] * ny + nm[7] * nz
        let az = nm[2] * nx + nm[5] * ny + nm[8] * nz
        // a normal é normalizada, como o three faz (a matriz normal não é exatamente uma
        // rotação: ela sai da inversa transposta, e o comprimento sai 1 com alguns erros)
        const comp = Math.sqrt(ax * ax + ay * ay + az * az) || 1
        ax /= comp; ay /= comp; az /= comp
        N[d] = ax; N[d + 1] = ay; N[d + 2] = az
      }
      C[d] = r; C[d + 1] = g; C[d + 2] = b
      A[d / 3] = chao
      d += 3
    }
    this.n += n
  }
  caixa(base, x, y, z, sx, sy, sz, hex) {
    if (SO_PLANEJAR) return
    // a caixa de 1 m, compartilhada: o tamanho entra na escala, não numa geometria nova
    this.add(CAIXA, m4.copy(base).multiply(m4b.makeTranslation(x, y, z)), hex, sx, sy, sz)
  }
  // limites: a esfera e a caixa já calculadas (o bloco sabe a extensão dele):
  // assim o three não calcula a esfera no primeiro quadro que a malha aparece
  geometria(limites) {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos.slice(0, this.n * 3), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(this.pNor.slice(0, this.n * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.pCor.slice(0, this.n * 3), 3))
    g.setAttribute('aChao', new THREE.BufferAttribute(this.pChao.slice(0, this.n), 1))
    if (limites) { g.boundingSphere = limites.esfera; g.boundingBox = limites.caixa }
    return g
  }

  malha(material, nome, limites) {
    if (!this.n) return null
    const m = new THREE.Mesh(this.geometria(limites), material)
    m.name = nome
    m.castShadow = true
    m.receiveShadow = true
    return m
  }
}

// contorno de um vão (reto ou em arco abatido), no plano xy, centrado em x
function contornoVao(path, cx, y0, w, h, arco) {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  path.moveTo(x0, y0)
  path.lineTo(x1, y0)
  if (arco > 0) {
    path.lineTo(x1, y0 + h - arco)
    path.quadraticCurveTo(cx, y0 + h + arco * 0.9, x0, y0 + h - arco)
  } else {
    path.lineTo(x1, y0 + h)
    path.lineTo(x0, y0 + h)
  }
  path.lineTo(x0, y0)
}

let SO_PLANEJAR = false
function extrudar(shape, prof) {
  if (SO_PLANEJAR) return null
  return new THREE.ExtrudeGeometry(shape, { depth: prof, bevelEnabled: false, curveSegments: 8 })
}

// Telhado de telha à vista (fotos de 1925 a 1936: quase toda casa tem): cumeeira paralela à rua,
// duas águas (empenas fechadas) ou quatro águas, beiral avançando sobre a rua e os fundos.
function telhado(pilha, base, F, D, y0, beiral, inclinacao, quatroAguas, hex) {
  const meiaF = F / 2 + beiral
  const meiaD = D / 2 + beiral
  const alto = meiaD * inclinacao
  const recuo = quatroAguas ? Math.min(meiaD, meiaF * 0.9) : 0
  const v = {
    a: [-meiaF, 0, meiaD], b: [meiaF, 0, meiaD], c: [meiaF, 0, -meiaD], d: [-meiaF, 0, -meiaD],
    r1: [-meiaF + recuo, alto, 0], r2: [meiaF - recuo, alto, 0],
  }
  const tris = [
    [v.a, v.b, v.r2], [v.a, v.r2, v.r1], // água da rua
    [v.c, v.d, v.r1], [v.c, v.r1, v.r2], // água dos fundos
  ]
  if (quatroAguas) tris.push([v.b, v.c, v.r2], [v.d, v.a, v.r1])
  const pos = []
  for (const t of tris) for (const p of t) pos.push(p[0], p[1] + y0, p[2])
  // espessura da telha na beira (uma faixa vertical escura de 8 cm em volta)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  pilha.add(g, base, hex)
  pilha.caixa(base, 0, y0 - 0.04, meiaD - 0.03, F + 2 * beiral, 0.08, 0.06, new THREE.Color(hex).multiplyScalar(0.6).getHex())
  if (!quatroAguas) {
    // empenas: o triângulo de parede nas pontas, no plano da parede lateral
    for (const sx of [-1, 1]) {
      const tri = new THREE.BufferGeometry()
      const x = sx * (F / 2 - 0.02)
      const zz = D / 2 * (meiaD - 0.01) / meiaD
      tri.setAttribute('position', new THREE.Float32BufferAttribute([x, y0, zz, x, y0, -zz, x, y0 + alto * (zz / meiaD) + 0.02, 0, x, y0, -zz, x, y0, zz, x, y0 + alto * (zz / meiaD) + 0.02, 0], 3))
      tri.computeVertexNormals()
      pilha.empenas?.push([tri, base])
    }
  }
  return alto
}

// uma folha de madeira (janela ou porta) com almofadas em relevo, girada pela dobradiça
function folha(pecas, base, hx, y0, z, w, h, ang, lado, hex, porta, simples) {
  // dobradiça no lado de fora da folha; ang > 0 abre para a rua
  const giro = new THREE.Matrix4().makeTranslation(hx, 0, z)
    .multiply(new THREE.Matrix4().makeRotationY(lado * ang))
  const B = new THREE.Matrix4().copy(base).multiply(giro)
  const cx = lado * -w / 2 // a folha se estende da dobradiça para dentro do vão
  pecas.caixa(B, cx, y0 + h / 2, 0, w, h, 0.045, hex)
  if (simples) {
    // tábuas lisas com uma travessa (casa do morro)
    pecas.caixa(B, cx, y0 + h * 0.5, 0.03, w - 0.06, 0.1, 0.02, new THREE.Color(hex).multiplyScalar(0.82).getHex())
    return
  }
  // almofadas: duas (janela) ou três (porta), em relevo dos dois lados
  const n = porta ? 3 : 2
  const escuro = new THREE.Color(hex).multiplyScalar(0.82).getHex()
  for (let i = 0; i < n; i++) {
    const ah = (h - 0.12 * (n + 1)) / n
    const ay = y0 + 0.12 + i * (ah + 0.12) + ah / 2
    pecas.caixa(B, cx, ay, 0.03, w - 0.16, ah, 0.02, escuro)
    pecas.caixa(B, cx, ay, -0.03, w - 0.16, ah, 0.02, escuro)
  }
}

// A casa de 1932. É um gerador: cada yield é um ponto onde a montagem pode ser
// interrompida e retomada no quadro seguinte (Fase 1 do plano de performance).
// Uma casa sozinha leva alguns ms; o bloco inteiro levava 150 a 300 ms na T4 e
// travava o quadro. O sorteio é o mesmo de sempre: o yield não come números.
// (a chamada planejarCasa drena o gerador inteiro, com o mesmo sorteio)
function* casa(it, P, rnd, simples) {
  const { reboco, pecas, interior: interiorEscuro, aceso: interiorAceso, telhas } = P
  // eixo local: fachada voltada para +z
  const frenteX = it.frente && it.frente[0] !== 0
  const F = frenteX ? it.d : it.w // largura da fachada
  const D = frenteX ? it.w : it.d // profundidade
  const ang = it.frente ? Math.atan2(it.frente[0], it.frente[1]) : 0
  const chao = it.chao
  // parte das casas tem luz acesa lá dentro à noite (vista pelas folhas abertas)
  const interior = rnd.chance(simples ? 0.5 : 0.4) ? interiorAceso : interiorEscuro
  reboco.chao = pecas.chao = interiorEscuro.chao = interiorAceso.chao = telhas.chao = chao
  const base = new THREE.Matrix4().makeTranslation(it.x, chao, it.z).multiply(new THREE.Matrix4().makeRotationY(ang + it.rot))

  // no morro a casa mantém a altura que já tinha (há casas por cima de outras); sem calçada
  // altura original do lote (guardada na 1ª passada: depois it.y e it.h viram os da casa montada)
  it.alturaLote ??= it.y + it.h - chao
  const H = simples ? Math.max(2.9, it.alturaLote) : (rnd.chance(0.5) ? rnd.entre(7.6, 8.6) : rnd.entre(4.8, 5.6))
  const sobrado = H > 6.8
  const platibanda = !simples && rnd.chance(0.55)
  const arco = !simples && rnd.chance(0.45) ? 0.22 : 0
  const calcada = simples ? 0 : CALCADA
  const parede = it.cor
  // molduras: brancas em parede tingida, cor de contraste em parede de cal
  const ehCal = ['#efe6d2', '#f2ebdc', '#f4eee2', '#e9dfc8'].includes(parede)
  const moldura = ehCal ? rnd.escolha(['#e2c2a8', '#d9cbb0', '#cddbd6', '#e7d3a3']) : '#f3ede0'
  const esq = rnd.escolha(ESQUADRIAS)
  const barra = rnd.chance(0.5) ? new THREE.Color(esq).multiplyScalar(0.9).getHex() : new THREE.Color(parede).multiplyScalar(0.84).getHex()
  const zf = D / 2 // plano da fachada

  // corpo atrás da fachada
  reboco.caixa(base, 0, H / 2, -PAREDE / 2, F, H, D - PAREDE, parede)
  yield

  // vãos: térreo com porta e janelas; sobrado com portas-janelas em cima
  // a fachada pode ser bem estreita (o lote de 4 m da planta de 1932): os vãos
  // encolhem para caber, e a casa vira um quarto de janela e porta
  const portaL = Math.min(simples ? 0.9 : 1.12, F * 0.55)
  const janelaL = Math.min(simples ? 0.75 : 1.0, F * 0.38)
  const slots = F < 2.6 ? 1 : (simples ? Math.max(1, Math.min(3, Math.floor(F / 2.2))) : Math.max(2, Math.floor(F / 1.85)))
  const passo = F / slots
  const porta = Math.floor(rnd.entre(0, slots))
  const vaos = []
  for (let i = 0; i < slots; i++) {
    const cx = -F / 2 + passo * (i + 0.5)
    const ehPorta = i === porta
    if (simples) {
      vaos.push({ cx, y0: ehPorta ? 0.05 : 0.95, w: ehPorta ? portaL : janelaL, h: ehPorta ? 2.1 : 1.0, porta: ehPorta })
      if (sobrado) vaos.push({ cx, y0: H - 1.9, w: 0.75, h: 1.0, porta: false })
      continue
    }
    vaos.push({ cx, y0: calcada + (ehPorta ? 0 : 0.95), w: ehPorta ? portaL : janelaL, h: ehPorta ? 2.75 : 1.85, porta: ehPorta })
    if (sobrado) vaos.push({ cx, y0: calcada + 4.1, w: 1.0, h: 2.35, porta: true, alto: true })
  }

  // fachada com os vãos furados (espessura PAREDE)
  const fach = new THREE.Shape()
  fach.moveTo(-F / 2, 0); fach.lineTo(F / 2, 0); fach.lineTo(F / 2, H); fach.lineTo(-F / 2, H); fach.lineTo(-F / 2, 0)
  for (const v of vaos) {
    const furo = new THREE.Path()
    contornoVao(furo, v.cx, v.y0, v.w, v.h, arco)
    fach.holes.push(furo)
  }
  reboco.add(extrudar(fach, PAREDE), new THREE.Matrix4().copy(base).multiply(new THREE.Matrix4().makeTranslation(0, 0, zf - PAREDE)), parede)
  yield

  // embasamento (barrado em relevo) e cunhais nas quinas
  // o barrado é interrompido nas portas do térreo
  const portasTerreo = vaos.filter((v) => v.porta && !v.alto).map((v) => [v.cx - v.w / 2 - 0.13, v.cx + v.w / 2 + 0.13]).sort((a, b) => a[0] - b[0])
  // 2 mm aquém da quina (pisca, 22/10/2026): a ponta do barrado ficava no mesmo plano da face de fora do cunhal e as
  // duas cores brigavam (z-fighting) vistas da rua do lado
  let xb = -F / 2 + 0.002
  for (const [a, b] of [...portasTerreo, [F / 2 - 0.002, F / 2]]) {
    if (a - xb > 0.05) pecas.caixa(base, (xb + a) / 2, calcada + 0.4, zf + 0.025, a - xb, 0.8, 0.05, barra)
    xb = b
  }
  if (!simples) for (const s of [-1, 1]) pecas.caixa(base, s * (F / 2 - 0.17), (H - 0.6) / 2 + 0.4, zf + 0.03, 0.34, H - 0.6 - 0.8, 0.06, moldura)

  for (const v of vaos) {
    // interior escuro e quente no fundo do vão
    interior.caixa(base, v.cx, v.y0 + v.h / 2, zf - PAREDE + 0.03, v.w + 0.1, v.h + 0.3, 0.04, interior === interiorAceso ? '#e6d6bc' : '#3a2a22')
    // moldura saliente em volta do vão
    const fora = new THREE.Shape()
    const folga = Math.min(0.26, F * 0.05)
    contornoVao(fora, v.cx, v.y0 - 0.12, v.w + folga, v.h + 0.24, arco ? arco + 0.05 : 0)
    const dentro = new THREE.Path()
    contornoVao(dentro, v.cx, v.y0, v.w, v.h, arco)
    fora.holes.push(dentro)
    pecas.add(extrudar(fora, 0.06), new THREE.Matrix4().copy(base).multiply(new THREE.Matrix4().makeTranslation(0, 0, zf)), moldura)
    // peitoril (janela) ou soleira (porta)
    if (!v.porta) pecas.caixa(base, v.cx, v.y0 - 0.05, zf + 0.06, v.w + 0.36, 0.09, 0.2, moldura)
    else if (!v.alto) pecas.caixa(base, v.cx, calcada + 0.04, zf - 0.05, v.w + 0.1, 0.08, 0.4, '#b9ab90')
    // folhas de madeira: fechadas, entreabertas ou abertas
    const sorte = rnd.proximo()
    const abre = sorte < 0.45 ? 0 : (sorte < 0.8 ? rnd.entre(0.35, 0.9) : rnd.entre(1.3, 1.52))
    const hf = v.h - (arco ? arco * 0.6 : 0) - 0.04
    const zDob = zf - 0.1
    for (const lado of [-1, 1]) {
      const assimetria = lado === 1 ? 1 : rnd.entre(0.6, 1.1)
        folha(pecas, base, v.cx + lado * v.w / 2, v.y0 + 0.02, zDob, v.w / 2 - 0.01, hf, abre * assimetria, lado, esq, v.porta, simples)
    }
    // sacada de ferro nos vãos de cima de parte dos sobrados
    if (v.alto && !simples && rnd.chance(0.6)) {
      pecas.caixa(base, v.cx, v.y0 - 0.05, zf + 0.35, v.w + 0.6, 0.1, 0.7, moldura)
      const ferro = '#2f2a2e'
      pecas.caixa(base, v.cx, v.y0 + 0.95, zf + 0.68, v.w + 0.56, 0.04, 0.04, ferro)
      for (let k = 0; k <= 8; k++) {
        const bx = v.cx - (v.w + 0.5) / 2 + ((v.w + 0.5) * k) / 8
        pecas.caixa(base, bx, v.y0 + 0.47, zf + 0.68, 0.025, 0.95, 0.025, ferro)
      }
      for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) {
        pecas.caixa(base, v.cx + s * (v.w + 0.56) / 2, v.y0 + 0.47, zf + 0.35 + (k - 1.5) * 0.3, 0.025, 0.95, 0.025, ferro)
      }
    }
    yield // um vão por passo: a casa não trava o quadro
  }

  // friso entre os andares do sobrado
  if (sobrado) {
    pecas.caixa(base, 0, calcada + 3.75, zf + 0.06, F, 0.14, 0.12, moldura)
    pecas.caixa(base, 0, calcada + 3.62, zf + 0.03, F, 0.1, 0.06, moldura)
  }

  if (platibanda) {
    // cornija em degraus e platibanda escondendo o telhado
    const passos = [[0.08, 0.1], [0.16, 0.08], [0.26, 0.1], [0.34, 0.07]]
    let y = H - 0.5
    for (const [p, a] of passos) { pecas.caixa(base, 0, y + a / 2, zf + p / 2, F + p * 0.6, a, p, moldura); y += a }
    reboco.caixa(base, 0, H + 0.3, zf - 0.1, F, 0.6, 0.2, parede)
    pecas.caixa(base, 0, H + 0.63, zf - 0.07, F + 0.1, 0.07, 0.32, moldura)
    // ornamento no meio da platibanda (pináculo ou frontão baixo)
    if (rnd.chance(0.5)) {
      const fr = new THREE.Shape()
      fr.moveTo(-0.9, 0); fr.lineTo(0.9, 0); fr.lineTo(0, 0.55); fr.lineTo(-0.9, 0)
      pecas.add(extrudar(fr, 0.16), new THREE.Matrix4().copy(base).multiply(new THREE.Matrix4().makeTranslation(0, H + 0.65, zf - 0.17)), moldura)
    }
    // telhado atrás da platibanda: a cumeeira passa por cima dela (como nas fotos)
    const telhaP = new THREE.Color(CAL.telha).multiplyScalar(rnd.entre(0.78, 1.0)).getHex()
    const P1 = { add: (g, m, h) => telhas.add(g, m, h), caixa: (...a) => telhas.caixa(...a), empenas: [] }
    const baseP = new THREE.Matrix4().copy(base).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.35))
    telhado(P1, baseP, F - 0.4, D - 0.9, H + 0.05, 0.05, 0.36, rnd.chance(0.6), telhaP)
    for (const [tri, m] of P1.empenas) reboco.add(tri, m, parede)
  } else {
    // beiral: telhado de duas ou quatro águas com telha canal à vista
    const beiral = simples ? 0.45 : 0.7
    const telhaB = new THREE.Color(CAL.telha).multiplyScalar(rnd.entre(0.75, 1.05)).getHex()
    const P2 = { add: (g, m, h) => telhas.add(g, m, h), caixa: (...a) => telhas.caixa(...a), empenas: [] }
    telhado(P2, base, F, D, H, beiral, simples ? 0.3 : 0.36, simples ? rnd.chance(0.3) : rnd.chance(0.5), telhaB)
    for (const [tri, m] of P2.empenas) reboco.add(tri, m, parede)
    // testeira sob o beiral (sombra forte na parede)
    pecas.caixa(base, 0, H - 0.06, zf + 0.06, F, 0.12, 0.1, moldura)
  }
  yield // o telhado (com as empenas) é um passo só

  // fundos: casa de verdade tem janela para o quintal (fechada, sem furo na parede)
  const costas = new THREE.Matrix4().copy(base).multiply(new THREE.Matrix4().makeRotationY(Math.PI))
  const nCostas = Math.max(1, Math.floor(F / 2.6))
  const andaresCostas = sobrado ? [simples ? 0.95 : calcada + 1.0, H - (simples ? 1.9 : 3.0)] : [simples ? 0.95 : calcada + 1.0]
  for (let i = 0; i < nCostas; i++) {
    if (rnd.chance(0.25)) continue
    const cx = -F / 2 + (F / nCostas) * (i + 0.5) + rnd.entre(-0.3, 0.3)
    for (const y0 of andaresCostas) {
      const w = simples ? 0.7 : 0.9
      const h = simples ? 0.9 : 1.4
      for (const [dx, dy, sx, sy] of [[0, -0.05, w + 0.2, 0.1], [0, h + 0.05, w + 0.2, 0.1], [-(w / 2 + 0.05), h / 2, 0.1, h + 0.2], [w / 2 + 0.05, h / 2, 0.1, h + 0.2]]) {
        pecas.caixa(costas, cx + dx, y0 + dy, D / 2 + 0.03, sx, sy, 0.06, moldura)
      }
      pecas.caixa(costas, cx, y0 + h / 2, D / 2 + 0.02, w, h, 0.04, esq)
      pecas.caixa(costas, cx, y0 + h / 2, D / 2 + 0.045, 0.025, h, 0.01, new THREE.Color(esq).multiplyScalar(0.7).getHex())
    }
  }
  yield // os fundos

  // altura e base reais (árvores e vasos usam) e marca de que a casa já tem fachada própria
  it.y = chao
  it.h = H + (platibanda ? 1.6 : 2.0)
  it.detalhado = true
  // dados da fachada para a cenografia (lampião, cadeiras na calçada): ver cenografia.js
  const porta1 = vaos.find((v) => v.porta && !v.alto)
  it.fachada = { ang: ang + it.rot, F, D, chao, H, simples, sobrado, portaX: porta1 ? porta1.cx : 0, calcada }
  if (simples) return
  // calçada alta com meio-fio, e o deck para o personagem subir
  const zc = zf + LARG_CALCADA / 2
  // a calçada acaba onde o meio-fio começa (pisca, 22/10/2026): com as duas caixas até a mesma beira, a frente e o topo
  // ficavam no mesmo plano e as duas cores brigavam pixel a pixel (z-fighting) ao longo da rua
  pecas.caixa(base, 0, CALCADA / 2, zf + (LARG_CALCADA - MEIO_FIO) / 2, F, CALCADA, LARG_CALCADA - MEIO_FIO, rnd.escolha(['#cdbb9c', '#c8b596', '#d3c3a5']))
  pecas.caixa(base, 0, CALCADA / 2 - 0.02, zf + LARG_CALCADA - MEIO_FIO / 2, F, calcada + 0.04, MEIO_FIO, '#a99b84')
  const centro = new THREE.Vector3(0, 0, zc).applyMatrix4(base)
  if (SO_PLANEJAR) adicionarDeck(centro.x, centro.z, F / 2, LARG_CALCADA / 2, ang + it.rot, chao + CALCADA)
}

// só o planejamento de uma casa (sem geometria), para o teste do kit (testes/unidade/kit1932.test.js) conferir que
// pecasDaCasa sorteia na mesma ordem
export function planejarCasa(it, rnd, simples) {
  const antes = SO_PLANEJAR
  SO_PLANEJAR = true
  try {
    // o gerador é drenado inteiro: o planejamento precisa chegar até o fim da casa
    for (const _ of casa(it, { reboco: new Pilha(), pecas: new Pilha(), interior: new Pilha(), aceso: new Pilha(), telhas: new Pilha() }, rnd, simples)) { /* nada */ }
  } finally { SO_PLANEJAR = antes }
}

// Material de reboco: cor por vértice, pincelada (pintar) e desgaste preso ao mundo:
// salitre subindo da base e cal descascada mostrando a taipa.
// marco = true: o reboco dos marcos de 1932, com a cal caída em metros e presa à forma (desgaste-marcos.js); a
// geometria traz aCaixa. As casas ficam com o programa de sempre.
function materialReboco(desgaste, marco = false) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() })
  const chave = marco ? 'reboco-marcos' : 'reboco-casas'
  mat.onBeforeCompile = (sh) => {
    if (marco) ligarCascaGlsl(sh)
    sh.uniforms.uDesgQ = { value: desgaste }
    sh.uniforms.uTaipa = { value: new THREE.Color(CAL.taipa) }
    sh.uniforms.uArcDesgaste = globais.uArcDesgaste
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aChao; varying float vChaoQ; varying vec3 vMundoQ; varying vec3 vNormalQ;' + (marco ? '\nattribute vec4 aCaixa; varying vec3 vLocalQ; varying vec4 vCaixaQ;' : ''))
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_BATCHING
          // Fase 2: no lote das casas (BatchedMesh) a matriz da instância é a do lote
          vMundoQ = (modelMatrix * batchingMatrix * vec4(transformed, 1.0)).xyz;
          vNormalQ = normalize(mat3(batchingMatrix) * normal);
        #else
          vMundoQ = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vNormalQ = normal;
        #endif
        vChaoQ = aChao;` + (marco ? '\nvLocalQ = transformed; vCaixaQ = aCaixa;' : ''))
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMundoQ; varying vec3 vNormalQ; varying float vChaoQ; uniform float uDesgQ; uniform vec3 uTaipa; uniform float uArcDesgaste;
        float hashQ(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float ruidoQ(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hashQ(vec3(i, 1.0)), hashQ(vec3(i + vec2(1, 0), 1.0)), f.x), mix(hashQ(vec3(i + vec2(0, 1), 1.0)), hashQ(vec3(i + vec2(1, 1), 1.0)), f.x), f.y);
        }
        ${marco ? 'varying vec3 vLocalQ; varying vec4 vCaixaQ;' + GLSL_CASCA_MARCO : ''}
        ${GLSL_DESGASTE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (abs(vNormalQ.y) < 0.5) {
          float hq = vMundoQ.y - vChaoQ;
          float uq = vMundoQ.x + vMundoQ.z;
          // pinceladas de caiação: faixas largas da broxa, em várias direções por demão
          float broxa = ruidoQ(vec2(uq * 0.9 + hq * 0.35, hq * 5.5)) * 0.6 + ruidoQ(vec2(uq * 4.0, hq * 1.2 - uq * 0.6)) * 0.4;
          diffuseColor.rgb *= 0.95 + 0.1 * broxa;
          // degradê de pintura: mais clara e quente em cima, mais fria e escura embaixo
          diffuseColor.rgb *= mix(vec3(0.9, 0.9, 0.95), vec3(1.04, 1.02, 0.97), smoothstep(0.0, 7.0, hq));
          // salitre: mancha esverdeada subindo da calçada, borda irregular
          float alt = 0.6 + 0.9 * ruidoQ(vec2(uq * 0.5, 0.0));
          diffuseColor.rgb *= mix(vec3(0.76, 0.78, 0.7), vec3(1.0), smoothstep(alt * 0.5, alt, hq));
          // cal descascada: placas de taipa, mais embaixo
          float n = ruidoQ(vec2(uq * 0.22, hq * 0.3)) * 0.65 + ruidoQ(vec2(uq * 1.6, hq * 1.9)) * 0.35;
          float lim = mix(0.84, 0.7, uDesgQ) + 0.2 * smoothstep(0.3, 3.5, hq);
          // (a casca miúda de antes dá lugar à grande de desgaste.js quando arcDesgaste sobe)
          float casca = smoothstep(lim, lim + 0.015, n) * (1.0 - uArcDesgaste);
          // dentro: taipa com fiadas de tijolo e manchas; borda: o reboco grosso, claro em cima e com sombra embaixo
          float fiada = smoothstep(0.82, 0.9, fract(hq * 6.5)) * 0.25;
          vec3 miolo = uTaipa * (0.88 + 0.2 * ruidoQ(vec2(uq * 5.0, hq * 5.0))) * (1.0 - fiada);
          float aro = smoothstep(lim - 0.035, lim - 0.005, n) * (1.0 - casca);
          float ny = ruidoQ(vec2(uq * 0.22, (hq + 0.06) * 0.3)) * 0.65 + ruidoQ(vec2(uq * 1.6, (hq + 0.06) * 1.9)) * 0.35;
          float sombraAro = casca * (1.0 - smoothstep(lim, lim + 0.015, ny));
          diffuseColor.rgb = mix(diffuseColor.rgb, miolo, casca);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.08 + 0.03, aro);
          diffuseColor.rgb *= 1.0 - 0.35 * sombraAro;
          // escorrido vertical de chuva
          diffuseColor.rgb *= 1.0 - 0.07 * smoothstep(0.6, 0.9, ruidoQ(vec2(uq * 3.0, hq * 0.25)));
          // reboco envelhecido que se lê de longe (desgaste.js)
          float cascaE;
          diffuseColor.rgb = envelhecer(diffuseColor.rgb, hq, uq, uDesgQ, uArcDesgaste, uTaipa, cascaE);
        }`)
  }
  mat.customProgramCacheKey = () => chave
  mat.userData.tsl = rebocoTsl(desgaste, marco)
  return texturizar(pintar(mat, chave), { topo: 'cal', lado: 'cal', tam: 2.5, contraste: 2.5 }) // reboco caiado pintado (visual Arcane)
}

// Reboco e telhas em TSL, para o modo webgpu (motor F2, KAN-68): as mesmas contas, com a posição no mundo
// tirada como no GLSL (modelMatrix * posição crua, sem a matriz da cópia)
function rebocoTsl(desgaste, marco = false) {
  let V = null
  const vars = (W) => V || (V = { mundo: W.varyingProperty('vec3', 'vMundoQ'), normal: W.varyingProperty('vec3', 'vNormalQ'), chao: W.varyingProperty('float', 'vChaoQ'),
    ...(marco ? { local: W.varyingProperty('vec3', 'vLocalQ'), caixa: W.varyingProperty('vec4', 'vCaixaQ') } : {}) })
  const uTaipa = { value: new THREE.Color(CAL.taipa) }
  return {
    nome: 'reboco',
    posicao({ W }) {
      const v = vars(W)
      v.mundo.assign(W.modelWorldMatrix.mul(W.vec4(W.positionLocal, 1.0)).xyz)
      v.normal.assign(W.attribute('normal', 'vec3'))
      v.chao.assign(W.attribute('aChao', 'float'))
      if (marco) { v.local.assign(W.positionLocal); v.caixa.assign(W.attribute('aCaixa', 'vec4')) }
      return W.positionLocal
    },
    // peças do kit na three-virtual-geometry (KAN-73): posição e normal já no mundo; o chão da casa ainda não vai
    // com a peça (a vg não leva atributo próprio por cópia): salitre e degradê contam a partir de y = 0 (no jogo, a
    // altura do terreno sob a casa; M5)
    posicaoVg({ W, mundo, normalMundo }) {
      const v = vars(W)
      v.mundo.assign(mundo)
      v.normal.assign(normalMundo)
      v.chao.assign(W.float(0))
    },
    cor({ W }, rgb0) {
      const { Fn, vec2, vec3, float, abs, floor, fract, sin, dot, mix, smoothstep, If } = W
      const v = vars(W)
      const hashQ = (p) => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453))
      const ruidoQ = (p) => {
        const i = floor(p)
        const f0 = fract(p)
        const f = f0.mul(f0).mul(float(3.0).sub(f0.mul(2.0)))
        return mix(mix(hashQ(vec3(i, 1.0)), hashQ(vec3(i.add(vec2(1, 0)), 1.0)), f.x), mix(hashQ(vec3(i.add(vec2(0, 1)), 1.0)), hashQ(vec3(i.add(vec2(1, 1)), 1.0)), f.x), f.y)
      }
      const taipa = ref(uTaipa)
      return Fn(() => {
        const rgb = vec3(rgb0).toVar()
        If(abs(v.normal.y).lessThan(0.5), () => {
          const hq = v.mundo.y.sub(v.chao)
          const uq = v.mundo.x.add(v.mundo.z)
          // pinceladas de caiação: faixas largas da broxa
          const broxa = ruidoQ(vec2(uq.mul(0.9).add(hq.mul(0.35)), hq.mul(5.5))).mul(0.6).add(ruidoQ(vec2(uq.mul(4.0), hq.mul(1.2).sub(uq.mul(0.6)))).mul(0.4))
          rgb.mulAssign(broxa.mul(0.1).add(0.95))
          rgb.mulAssign(mix(vec3(0.9, 0.9, 0.95), vec3(1.04, 1.02, 0.97), smoothstep(0.0, 7.0, hq)))
          // salitre
          const alt = ruidoQ(vec2(uq.mul(0.5), 0.0)).mul(0.9).add(0.6)
          rgb.mulAssign(mix(vec3(0.76, 0.78, 0.7), vec3(1.0), smoothstep(alt.mul(0.5), alt, hq)))
          // cal descascada
          const n = ruidoQ(vec2(uq.mul(0.22), hq.mul(0.3))).mul(0.65).add(ruidoQ(vec2(uq.mul(1.6), hq.mul(1.9))).mul(0.35))
          const lim = float(mix(0.84, 0.7, desgaste)).add(smoothstep(0.3, 3.5, hq).mul(0.2))
          const casca = smoothstep(lim, lim.add(0.015), n).mul(float(1.0).sub(ref(globais.uArcDesgaste)))
          const fiada = smoothstep(0.82, 0.9, fract(hq.mul(6.5))).mul(0.25)
          const miolo = taipa.mul(ruidoQ(vec2(uq.mul(5.0), hq.mul(5.0))).mul(0.2).add(0.88)).mul(float(1.0).sub(fiada))
          const aro = smoothstep(lim.sub(0.035), lim.sub(0.005), n).mul(float(1.0).sub(casca))
          const hy = hq.add(0.06)
          const ny = ruidoQ(vec2(uq.mul(0.22), hy.mul(0.3))).mul(0.65).add(ruidoQ(vec2(uq.mul(1.6), hy.mul(1.9))).mul(0.35))
          const sombraAro = casca.mul(float(1.0).sub(smoothstep(lim, lim.add(0.015), ny)))
          rgb.assign(mix(rgb, miolo, casca))
          rgb.assign(mix(rgb, rgb.mul(1.08).add(0.03), aro))
          rgb.mulAssign(float(1.0).sub(sombraAro.mul(0.35)))
          // escorrido vertical de chuva
          rgb.mulAssign(float(1.0).sub(smoothstep(0.6, 0.9, ruidoQ(vec2(uq.mul(3.0), hq.mul(0.25)))).mul(0.07)))
          // reboco envelhecido que se lê de longe (desgaste.js)
          const cascaM = marco ? cascaMarcoTsl(W, ruidoQ, v, hq) : null
          rgb.assign(envelhecerTsl(W, ruidoQ, rgb, hq, uq, float(desgaste), ref(globais.uArcDesgaste), taipa, cascaM, cascaM ? W.materialColor : null).rgb)
        })
        return rgb
      })()
    },
  }
}

function telhasTsl() {
  let V = null
  const vars = (W) => V || (V = { mundo: W.varyingProperty('vec3', 'vMundoT'), norm: W.varyingProperty('vec3', 'vNormT') })
  return {
    nome: 'telhas',
    posicao({ W }) {
      const { mat3, normalize, modelWorldMatrix, attribute, vec4, positionLocal } = W
      const v = vars(W)
      const m = modelWorldMatrix
      v.mundo.assign(m.mul(vec4(positionLocal, 1.0)).xyz)
      v.norm.assign(normalize(mat3(m.element(0).xyz, m.element(1).xyz, m.element(2).xyz).mul(attribute('normal', 'vec3'))))
      return positionLocal
    },
    posicaoVg({ W, mundo, normalMundo }) {
      const v = vars(W)
      v.mundo.assign(mundo)
      v.norm.assign(normalMundo)
    },
    cor({ W }, rgb) {
      const { vec2, vec3, float, floor, fract, sin, dot, normalize, mix, smoothstep, step } = W
      const v = vars(W)
      const norm = v.norm
      const hashT = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453))
      const desce = normalize(norm.xz.add(vec2(1e-4)))
      const lado = vec2(desce.y.negate(), desce.x)
      const u = dot(v.mundo.xz, lado).div(0.23)
      const vv = dot(v.mundo.xz, desce).div(0.42).add(v.mundo.y.mul(0.6))
      const coluna = floor(u)
      const capa = coluna.sub(floor(coluna.div(2.0)).mul(2.0)) // mod do GLSL
      const fu = fract(u)
      const curva = sin(fu.mul(3.14159))
      const tom = hashT(vec2(coluna, floor(vv.add(capa.mul(0.5))))).mul(0.2).add(0.9)
      const t0 = rgb.mul(tom)
      const t1 = t0.mul(mix(curva.mul(0.18).add(0.7), curva.mul(0.22).add(0.9), capa))
      const t2 = t1.mul(float(1.0).sub(smoothstep(0.82, 0.98, fract(vv.add(capa.mul(0.5)))).mul(0.28)))
      const limo = hashT(floor(v.mundo.xz.mul(0.7))).mul(smoothstep(0.4, 0.0, norm.y.sub(0.75)))
      const t = mix(t2, t2.mul(vec3(0.72, 0.74, 0.62)), limo.mul(0.35))
      return mix(rgb, t, step(0.35, norm.y))
    },
  }
}

const TAM_BLOCO = TAM_LOD // o mesmo bloco das caixas de longe (registrarLonge acha a caixa pelo bloco)

// casario: itens do Lote 'casario'; morro: itens do Lote 'favela' (variante simples)
// Telha canal: colunas de capa (clara, abaulada) e canal (escuro), fiadas a cada ~40 cm, cada telha
// com seu tom, sujeira e limo mais embaixo. Direção tirada da própria inclinação de cada água.
function materialTelhas() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon(), side: THREE.DoubleSide })
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMundoT; varying vec3 vNormT;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMundoT = (modelMatrix * vec4(transformed, 1.0)).xyz; vNormT = normalize(mat3(modelMatrix) * normal);')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMundoT; varying vec3 vNormT;
        float hashT(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 desce = normalize(vNormT.xz + vec2(1e-4));
        vec2 lado = vec2(-desce.y, desce.x);
        float u = dot(vMundoT.xz, lado) / 0.23;
        float v = dot(vMundoT.xz, desce) / 0.42 + vMundoT.y * 0.6;
        float coluna = floor(u);
        float capa = mod(coluna, 2.0);
        float fu = fract(u);
        float curva = sin(fu * 3.14159);
        float tom = 0.9 + 0.2 * hashT(vec2(coluna, floor(v + capa * 0.5)));
        vec3 t = diffuseColor.rgb * tom;
        t *= mix(0.7 + 0.18 * curva, 0.9 + 0.22 * curva, capa); // canal escuro, capa clara e abaulada
        t *= 1.0 - 0.28 * smoothstep(0.82, 0.98, fract(v + capa * 0.5)); // sombra da telha de cima
        float limo = hashT(floor(vMundoT.xz * 0.7)) * smoothstep(0.4, 0.0, vNormT.y - 0.75);
        t = mix(t, t * vec3(0.72, 0.74, 0.62), limo * 0.35);
        diffuseColor.rgb = mix(diffuseColor.rgb, t, step(0.35, vNormT.y));`)
  }
  mat.customProgramCacheKey = () => 'telhas-1932'
  mat.userData.tsl = telhasTsl()
  return texturizar(pintar(mat, 'telhas-1932'), { topo: 'telha', lado: 'telha', tam: 1.5 }) // telha canal pintada (visual Arcane)
}

// o reboco dos marcos de 1932 (obra1932.js): o das casas com a cal caída medida em metros (desgaste-marcos.js)
export function materialRebocoMarco(desgaste) { return materialReboco(desgaste, true) }

// os materiais das casas (o kit de 1932 usa os mesmos, KAN-73)
export function materiaisDasCasas() {
  return {
    reboco: materialReboco(0.4),
    rebocoMorro: materialReboco(0.85),
    pecas: texturizar(pintar(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() }), 'toon-pintado'), { topo: 'madeira', lado: 'madeira', tam: 1 }), // portas, janelas, beirais
    telhas: materialTelhas(),
  }
}

// as cinco pilhas de uma casa (reboco, peças, interior, interior aceso e telhas)
export function pilhasVazias() {
  return { reboco: new Pilha(), pecas: new Pilha(), interior: new Pilha(), aceso: new Pilha(), telhas: new Pilha() }
}

// só para os testes: monta a casa nas pilhas dadas (o gerador é drenado inteiro)
export function montarCasa(it, rnd, simples, pilhas) {
  for (const _ of casa(it, pilhas, rnd, simples)) { /* nada */ }
  return pilhas
}

export function criarCasas(cena, casario, morro, cfg = null, opcoes = {}) {
  const { reboco: matReboco, rebocoMorro: matRebocoMorro, pecas: matPecas, telhas: matTelhas } = materiaisDasCasas()
  const grupo = new THREE.Group()
  grupo.name = 'casas-1932'
  const semente = (i) => criarAleatorio(1932 + i * 7919)
  const todas = [...casario.map((it) => [it, false]), ...morro.map((it) => [it, true])]
  SO_PLANEJAR = true
  const vazio = pilhasVazias
  // o gerenciador dos blocos (Fase 1): a fila com orçamento de tempo, o prefetch do destino,
  // a subida gradual para a placa e os limites já calculados (src/mundo/bloco-casas.js)
  const ger = new GerenciadorDeBlocos({ grupo, cfg, tamBloco: TAM_BLOCO, gerar: (b) => gerarBloco(b) })
  todas.forEach(([it, simples], i) => {
    const b = ger.bloco(it, simples)
    // o planejamento drena o gerador da casa inteira (o mesmo sorteio de sempre)
    for (const _ of casa(it, vazio(), semente(i), simples)) { /* nada */ }
    b.itens.push([it, i])
  })
  SO_PLANEJAR = false
  // interior aceso: escuro de dia, candeeiro quente à noite (não recebe luz; brilha no filtro)
  const matAceso = luzFixa(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.6, globais.uNoite)

  // Fase 2: as casas de cada material num lote só (um BatchedMesh por material: um desenho por
  // material em vez de cinco por bloco). Só no WebGL: o caminho do WebGPU desenha por objeto.
  // O renderizador que vale é o que o jogo está usando (o WebGPU pode cair para o WebGL).
  const emLote = cfg?.desempenho?.casasEmLote !== false && !opcoes.webgpu
  const loteCasas = emLote ? new LoteCasas({ grupo, cfg, materiais: [
    { nome: 'reboco', material: matReboco, castShadow: true, receiveShadow: true },
    { nome: 'rebocoMorro', material: matRebocoMorro, castShadow: true, receiveShadow: true },
    { nome: 'pecas', material: matPecas, castShadow: true, receiveShadow: true },
    { nome: 'interior', material: matPecas, castShadow: false, receiveShadow: true },
    { nome: 'aceso', material: matAceso, castShadow: false, receiveShadow: true },
    { nome: 'telhas', material: matTelhas, castShadow: true, receiveShadow: true },
  ] }) : null

  // o bloco inteiro, em etapas: cada casa (e cada etapa de casa) é um passo, e a
  // junção de cada pilha é outro. A pilha escreve direto nos arrays, sem geometrias
  // intermediárias (Fase 1): o bloco sai em quatro alocações por pilha.
  function* gerarBloco(b) {
    const pilhas = vazio()
    for (const [it, i] of b.itens) yield* casa(it, pilhas, semente(i), b.simples)
    const limites = ger.limites(b)
    if (loteCasas) {
      // Fase 2: cada pilha entra no lote do seu material (um desenho por material, no lugar
      // de um por pilha e por bloco). A geometria já está no lugar do mundo: a instância do
      // lote é a identidade.
      const nomes = [
        [pilhas.reboco, b.simples ? 'rebocoMorro' : 'reboco'],
        [pilhas.pecas, 'pecas'],
        [pilhas.interior, 'interior'],
        [pilhas.aceso, 'aceso'],
        [pilhas.telhas, 'telhas'],
      ]
      for (const [pilha, nome] of nomes) {
        const g = pilha.geometria(limites)
        if (!g || !pilha.n) continue
        const id = loteCasas.adicionar(nome, g)
        if (id) b.lote.push({ lote: loteCasas, id, bytes: LoteCasas.bytes(g) })
        yield
      }
      // o bloco acabou: o lote sabe agora a fatia de cada material no espaço reservado
      loteCasas.fecharBloco()
      return
    }
    // cada pilha vira uma malha num passo só (a junção copia os arrays: alguns ms)
    const r = pilhas.reboco.malha(b.simples ? matRebocoMorro : matReboco, 'casas-reboco', limites)
    yield
    const p = pilhas.pecas.malha(matPecas, 'casas-pecas', limites)
    yield
    const i2 = pilhas.interior.malha(matPecas, 'casas-interior', limites)
    yield
    const a = pilhas.aceso.malha(matAceso, 'casas-interior-aceso', limites)
    yield
    const t = pilhas.telhas.malha(matTelhas, 'casas-telhas', limites)
    yield
    for (const m of [i2, a]) if (m) m.castShadow = false
    for (const m of [r, p, i2, a, t]) if (m) { m.visible = false; grupo.add(m); b.malhas.push(m); registrarEstatico(m) }
  }
  // a câmera colide com caixas simples, uma por casa (invisíveis). Raio contra a malha detalhada
  // testava centenas de milhares de triângulos por quadro e derrubava o jogo para 40 ms.
  const caixas = []
  const eixo = new THREE.Vector3(0, 1, 0)
  for (const it of [...casario, ...morro]) {
    const f = it.fachada
    if (!f) continue
    caixas.push(new THREE.Matrix4().compose(
      new THREE.Vector3(it.x, f.chao, it.z),
      new THREE.Quaternion().setFromAxisAngle(eixo, f.ang),
      new THREE.Vector3(f.F, f.H + 0.8, f.D)
    ))
  }
  const geoCaixa = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  const matInvisivel = luzFixa(new THREE.MeshBasicMaterial()) // nunca é desenhado; luzFixa só por contrato
  // nuncaDesenha: o pré-aquecimento do WebGPU (render/renderizador.js) não liga estas caixas
  for (const m of instanciarEmBlocos(grupo, geoCaixa, matInvisivel, caixas, null, { nome: 'casas-colisao-camera', sombra: false, recebe: false, solido: true, tam: TAM_LOD })) { m.visible = false; m.userData.nuncaDesenha = true }
  cena.add(grupo)
  const escuro = new THREE.Color('#4a3a30')
  const quente = new THREE.Color('#ffb860').multiplyScalar(2.2)
  // LOD por bloco: perto da câmera a casa detalhada; longe, a caixa com fachada pintada (Lote.criar)
  const PERTO = 70
  // de muito longe, as caixas de fachada pintada dos blocos se juntam por célula grande (muito-longe.js)
  const muitoLonge = new MuitoLonge(grupo, { nome: 'casas' })
  // as malhas representativas dos materiais das casas, para o pré-aquecimento dos shaders
  // (Fase 1): os blocos são montados depois do jogo começar, e sem elas os shaders das casas
  // só entrariam no primeiro teleporte, no quadro em que o programa é compilado
  let representantes = null
  const geometriaRepresentante = () => {
    const p = new Pilha()
    p.caixa(new THREE.Matrix4(), 0, 0, 0, 1, 1, 1, '#ffffff')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p.pPos.slice(0, p.n * 3), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(p.pNor.slice(0, p.n * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(p.pCor.slice(0, p.n * 3), 3))
    g.setAttribute('aChao', new THREE.BufferAttribute(p.pChao.slice(0, p.n), 1))
    return g
  }
  const representantesAquecimento = () => {
    if (representantes) return representantes
    representantes = []
    const geo = geometriaRepresentante()
    for (const [mat, nome] of [[matReboco, 'aq-reboco'], [matRebocoMorro, 'aq-reboco-morro'], [matPecas, 'aq-pecas'], [matTelhas, 'aq-telhas'], [matAceso, 'aq-aceso']]) {
      const m = new THREE.Mesh(geo, mat)
      m.name = nome
      m.castShadow = true
      m.receiveShadow = true
      representantes.push(m)
    }
    // Fase 2: o lote das casas é um BatchedMesh, e o programa dele é outra variante do shader
    // (o three compila uma variante por tipo de objeto). Sem esta malha representativa, o
    // programa do lote só seria compilado no quadro em que o primeiro bloco de casas entrasse.
    if (loteCasas) {
      for (const [mat, nome] of [[matReboco, 'aq-lote-reboco'], [matRebocoMorro, 'aq-lote-reboco-morro'], [matPecas, 'aq-lote-pecas'], [matTelhas, 'aq-lote-telhas'], [matAceso, 'aq-lote-aceso']]) {
        const lote = new THREE.BatchedMesh(1, geo.getAttribute('position').count, geo.getAttribute('position').count, mat)
        lote.name = nome
        const id = lote.addGeometry(geo)
        lote.addInstance(id)
        lote.castShadow = true
        lote.receiveShadow = true
        representantes.push(lote)
      }
    }
    return representantes
  }
  return {
    grupo,
    muitoLonge,
    representantesAquecimento,
    lote: loteCasas, // o lote das casas em BatchedMesh (Fase 2); null no caminho de antes
    // Fase 2: quem avisa que o conjunto de casas mudou (o cache da sombra refaz o mapa)
    aoMudarCasas: (fn) => { ger.aoMudar = fn },
    // o estado dos blocos (o console e o medidor olham isto): quantos estão montados, perto (a casa
    // detalhada à vista) e prontos (a subida na placa já aconteceu)
    estatisticas: () => {
      let perto = 0, pronto = 0, montado = 0, malhas = 0, lote = 0
      for (const b of ger.blocos.values()) {
        if (b.perto) perto++
        if (b.pronto) pronto++
        if (b.montado) montado++
        malhas += b.malhas.length
        lote += b.lote.length
      }
      return { blocos: ger.blocos.size, perto, pronto, montado, malhas, lote }
    },
    // depois do registrarLonge do casario e do morro
    montarMuitoLonge() {
      for (const b of ger.blocos.values()) {
        b.unidade = {
          x: b.x0 + TAM_BLOCO / 2, z: b.z0 + TAM_BLOCO / 2, r: TAM_BLOCO * Math.SQRT1_2,
          longe: b.longe,
          get todas() { return [...b.malhas, ...b.longe] },
          distancia: (camera) => ger.distancia(b, camera.position.x, camera.position.z),
          // Fase 2: no lote a casa detalhada não é uma malha: esconder o bloco é esconder as
          // instâncias dele no lote (a célula de muito longe troca as malhas de longe no lugar).
          // A sombra da casa detalhada some com ela: o mapa do sol é refeito.
          esconder: () => {
            for (const e of b.lote) e.lote.mostrar(e.id, false)
            for (const m of b.malhas) m.visible = false
            for (const m of b.longe) m.visible = false // a caixa de longe também some (a célula unida fica no lugar)
            b.detalhe = false
            ger.aoMudar?.('casas')
          },
          // volta ao estado de longe (a caixa à vista); o laço decide de novo neste quadro
          retomar: () => { b.perto = false; ger.aplicarVisibilidade(b) },
        }
        muitoLonge.adicionar(b.unidade)
      }
      muitoLonge.montar()
    },
    // malhas instanciadas das caixas de longe (instanciarEmBlocos usa os mesmos blocos de 96 m)
    registrarLonge(malhas, simples) {
      const v = new THREE.Vector3()
      const mt = new THREE.Matrix4()
      for (const im of malhas) {
        im.getMatrixAt(0, mt)
        v.setFromMatrixPosition(mt)
        const b = ger.blocos.get(`${simples ? 'm' : 'c'}${Math.floor(v.x / TAM_BLOCO)},${Math.floor(v.z / TAM_BLOCO)}`)
        if (b) { b.longe.push(im); im.visible = !(b.perto && b.pronto) } else im.visible = true
      }
    },
    // Fase 1: o destino do teleporte entra na fila de montagem antes de todo o resto
    prefetch(x, z) { ger.prefetch(x, z) },
    // porQuadro (cfg.desempenho.casasPorQuadro): quantos blocos de casas detalhadas montar por quadro
    atualizar(camera, porQuadro = 2) {
      matAceso.color.copy(escuro).lerp(quente, globais.uNoite.value)
      muitoLonge.atualizar(camera, PERTO + 8)
      ger.atualizar(camera, porQuadro)
    },
  }
}
