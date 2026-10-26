// A geometria da casa de 1932: a parte que não sabe de material, de cena nem de placa.
// Vive num arquivo só porque é o mesmo código na thread do jogo e no worker que monta o
// bloco de casas (src/mundo/gerador-bloco.worker.js): os dois precisam gerar a casa
// igual, vértice a vértice, e o worker não pode puxar nada de material (que fala com a
// tela e com o three).
//
// A casa é um gerador: cada yield é um ponto onde a montagem pode ser interrompida e
// retomada no quadro seguinte (Fase 1 do plano de performance). Uma casa sozinha leva
// alguns ms; o bloco inteiro levava 150 a 300 ms na T4 e travava o quadro. O sorteio
// é o mesmo de sempre: o yield não come números.
// (a chamada planejarCasa drena o gerador inteiro, com o mesmo sorteio)

import * as THREE from 'three'
import { CAL, ESQUADRIAS } from '../paleta.js'

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
      tri.setAttribute('position', new THREE.Float32BufferAttribute([x, y0, zz, x, y0, -zz, x, y0 + alto * (zz / meiaD) + 0.02, 0, x, y0, -zz, x, y0 + alto * (zz / meiaD) + 0.02, 0, x, y0, zz], 3))
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
export function* casa(it, P, rnd, simples) {
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
  // calçada alta com meio-fio (é um deck: o personagem sobe nela). O deck em si é registrado por
  // quem monta o bloco (a casa não registra sozinha: o worker não tem a colisão da thread do jogo)
  // a calçada acaba onde o meio-fio começa (pisca, 22/10/2026): com as duas caixas até a mesma beira, a frente e o topo
  // ficavam no mesmo plano e as duas cores brigavam pixel a pixel (z-fighting) ao longo da rua
  pecas.caixa(base, 0, CALCADA / 2, zf + (LARG_CALCADA - MEIO_FIO) / 2, F, CALCADA, LARG_CALCADA - MEIO_FIO, rnd.escolha(['#cdbb9c', '#c8b596', '#d3c3a5']))
  pecas.caixa(base, 0, CALCADA / 2 - 0.02, zf + LARG_CALCADA - MEIO_FIO / 2, F, calcada + 0.04, MEIO_FIO, '#a99b84')
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

// o modo de planejamento (a casa é gerada sem geometria: só o sorteio e a fachada)
export function planejar(teto) { SO_PLANEJAR = teto }

// as cinco pilhas de uma casa (reboco, peças, interior, interior aceso e telhas)
export function pilhasVazias() {
  return { reboco: new Pilha(), pecas: new Pilha(), interior: new Pilha(), aceso: new Pilha(), telhas: new Pilha() }
}

// só para os testes: monta a casa nas pilhas dadas (o gerador é drenado inteiro)
export function montarCasa(it, rnd, simples, pilhas) {
  for (const _ of casa(it, pilhas, rnd, simples)) { /* nada */ }
  return pilhas
}

// a geometria de uma casa, dos arrays (o caminho de antes: uma malha por pilha, quando o
// bloco não cabe no lote)
export function geometriaDeDados(dados, limites) {
  if (!dados || !dados.vertices) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(dados.pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(dados.nor, 3))
  g.setAttribute('color', new THREE.BufferAttribute(dados.cor, 3))
  g.setAttribute('aChao', new THREE.BufferAttribute(dados.chao, 1))
  if (limites) { g.boundingSphere = limites.esfera; g.boundingBox = limites.caixa }
  return g
}

// A calçada alta da casa: o deck que o personagem sobe (o morro não tem calçada).
// A casa não registra o deck sozinha (o worker não tem a colisão da thread do jogo):
// quem monta o bloco registra, depois que a geometria chega.
export function deckDaCasa(it) {
  const frenteX = it.frente && it.frente[0] !== 0
  const F = frenteX ? it.d : it.w
  const D = frenteX ? it.w : it.d
  const ang = it.frente ? Math.atan2(it.frente[0], it.frente[1]) : 0
  const rot = ang + it.rot
  const zc = D / 2 + LARG_CALCADA / 2
  return {
    x: it.x + zc * Math.sin(rot),
    z: it.z + zc * Math.cos(rot),
    hx: F / 2,
    hz: LARG_CALCADA / 2,
    rot,
    y: it.chao + CALCADA,
  }
}
