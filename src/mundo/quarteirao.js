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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pintar, gradienteToon, luzFixa, texturizar } from '../materiais.js'
import { globais } from '../globais.js'
import { CAL, ESQUADRIAS } from '../paleta.js'
import { adicionarDeck } from './colisao.js'
import { TAM_LOD, instanciarEmBlocos } from './blocos.js'
import { criarAleatorio } from '../utils.js'

// rua de referência da fatia vertical (z ≈ 152, x -72 a -36): bom lugar para comparar com os filmes
export const FATIA = { x0: -73, x1: -35, z0: 134, z1: 170 }

const CALCADA = 0.25 // altura da calçada sobre o chão
const LARG_CALCADA = 1.6
const PAREDE = 0.32 // espessura da fachada (o recuo dos vãos)

const cor = new THREE.Color()
const m4 = new THREE.Matrix4()

// junta geometrias com cor por vértice
class Pilha {
  constructor() { this.geos = []; this.chao = 0 }
  add(geo, matriz, hex) {
    if (SO_PLANEJAR || !geo) return
    const g = (geo.index ? geo.toNonIndexed() : geo.clone())
    g.deleteAttribute('uv')
    g.applyMatrix4(matriz)
    cor.set(hex)
    const n = g.attributes.position.count
    const c = new Float32Array(n * 3)
    const ch = new Float32Array(n).fill(this.chao) // chão da casa: o salitre sobe a partir dele
    for (let i = 0; i < n; i++) { c[i * 3] = cor.r; c[i * 3 + 1] = cor.g; c[i * 3 + 2] = cor.b }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.setAttribute('aChao', new THREE.BufferAttribute(ch, 1))
    this.geos.push(g)
  }
  caixa(base, x, y, z, sx, sy, sz, hex) {
    if (SO_PLANEJAR) return
    this.add(new THREE.BoxGeometry(sx, sy, sz), m4.copy(base).multiply(new THREE.Matrix4().makeTranslation(x, y, z)), hex)
  }
  malha(material, nome) {
    if (!this.geos.length) return null
    const g = mergeGeometries(this.geos)
    g.computeBoundingSphere()
    const m = new THREE.Mesh(g, material)
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

function casa(it, P, rnd, simples) {
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

  // vãos: térreo com porta e janelas; sobrado com portas-janelas em cima
  const slots = simples ? Math.max(1, Math.min(3, Math.floor(F / 2.2))) : Math.max(2, Math.floor(F / 1.85))
  const passo = F / slots
  const porta = Math.floor(rnd.entre(0, slots))
  const vaos = []
  for (let i = 0; i < slots; i++) {
    const cx = -F / 2 + passo * (i + 0.5)
    const ehPorta = i === porta
    if (simples) {
      vaos.push({ cx, y0: ehPorta ? 0.05 : 0.95, w: ehPorta ? 0.9 : 0.75, h: ehPorta ? 2.1 : 1.0, porta: ehPorta })
      if (sobrado) vaos.push({ cx, y0: H - 1.9, w: 0.75, h: 1.0, porta: false })
      continue
    }
    vaos.push({ cx, y0: calcada + (ehPorta ? 0 : 0.95), w: ehPorta ? 1.12 : 1.0, h: ehPorta ? 2.75 : 1.85, porta: ehPorta })
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

  // embasamento (barrado em relevo) e cunhais nas quinas
  // o barrado é interrompido nas portas do térreo
  const portasTerreo = vaos.filter((v) => v.porta && !v.alto).map((v) => [v.cx - v.w / 2 - 0.13, v.cx + v.w / 2 + 0.13]).sort((a, b) => a[0] - b[0])
  let xb = -F / 2
  for (const [a, b] of [...portasTerreo, [F / 2, F / 2]]) {
    if (a - xb > 0.05) pecas.caixa(base, (xb + a) / 2, calcada + 0.4, zf + 0.025, a - xb, 0.8, 0.05, barra)
    xb = b
  }
  if (!simples) for (const s of [-1, 1]) pecas.caixa(base, s * (F / 2 - 0.17), (H - 0.6) / 2 + 0.4, zf + 0.03, 0.34, H - 0.6 - 0.8, 0.06, moldura)

  for (const v of vaos) {
    // interior escuro e quente no fundo do vão
    interior.caixa(base, v.cx, v.y0 + v.h / 2, zf - PAREDE + 0.03, v.w + 0.1, v.h + 0.3, 0.04, interior === interiorAceso ? '#e6d6bc' : '#3a2a22')
    // moldura saliente em volta do vão
    const fora = new THREE.Shape()
    contornoVao(fora, v.cx, v.y0 - 0.12, v.w + 0.26, v.h + 0.24, arco ? arco + 0.05 : 0)
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
  pecas.caixa(base, 0, CALCADA / 2, zc, F, CALCADA, LARG_CALCADA, rnd.escolha(['#cdbb9c', '#c8b596', '#d3c3a5']))
  pecas.caixa(base, 0, CALCADA / 2 - 0.02, zf + LARG_CALCADA - 0.08, F, calcada + 0.04, 0.16, '#a99b84')
  const centro = new THREE.Vector3(0, 0, zc).applyMatrix4(base)
  if (SO_PLANEJAR) adicionarDeck(centro.x, centro.z, F / 2, LARG_CALCADA / 2, ang + it.rot, chao + CALCADA)
}

// Material de reboco: cor por vértice, pincelada (pintar) e desgaste preso ao mundo:
// salitre subindo da base e cal descascada mostrando a taipa.
function materialReboco(desgaste) {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDesgQ = { value: desgaste }
    sh.uniforms.uTaipa = { value: new THREE.Color(CAL.taipa) }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aChao; varying float vChaoQ; varying vec3 vMundoQ; varying vec3 vNormalQ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMundoQ = (modelMatrix * vec4(transformed, 1.0)).xyz; vNormalQ = normal; vChaoQ = aChao;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vMundoQ; varying vec3 vNormalQ; varying float vChaoQ; uniform float uDesgQ; uniform vec3 uTaipa;
        float hashQ(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float ruidoQ(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hashQ(vec3(i, 1.0)), hashQ(vec3(i + vec2(1, 0), 1.0)), f.x), mix(hashQ(vec3(i + vec2(0, 1), 1.0)), hashQ(vec3(i + vec2(1, 1), 1.0)), f.x), f.y);
        }`)
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
          float casca = smoothstep(lim, lim + 0.015, n);
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
        }`)
  }
  mat.customProgramCacheKey = () => 'reboco-casas'
  return texturizar(pintar(mat, 'reboco-casas'), { topo: 'cal', lado: 'cal', tam: 2.5, contraste: 2.5 }) // reboco caiado pintado (visual Arcane)
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
  return texturizar(pintar(mat, 'telhas-1932'), { topo: 'telha', lado: 'telha', tam: 1.5 }) // telha canal pintada (visual Arcane)
}

export function criarCasas(cena, casario, morro) {
  const rnd = criarAleatorio(1932)
  const matReboco = materialReboco(0.4)
  const matRebocoMorro = materialReboco(0.85)
  const matPecas = texturizar(pintar(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() }), 'toon-pintado'), { topo: 'madeira', lado: 'madeira', tam: 1 }) // portas, janelas, beirais
  const matTelhas = materialTelhas()
  const grupo = new THREE.Group()
  grupo.name = 'casas-1932'
  const blocos = new Map()
  const bloco = (it, simples) => {
    const k = `${simples ? 'm' : 'c'}${Math.floor(it.x / TAM_BLOCO)},${Math.floor(it.z / TAM_BLOCO)}`
    if (!blocos.has(k)) {
      const kx = Math.floor(it.x / TAM_BLOCO)
      const kz = Math.floor(it.z / TAM_BLOCO)
      blocos.set(k, { simples, reboco: new Pilha(), pecas: new Pilha(), interior: new Pilha(), aceso: new Pilha(), malhas: [], longe: [], x0: kx * TAM_BLOCO, z0: kz * TAM_BLOCO, perto: true })
    }
    return blocos.get(k)
  }
  // cada casa tem o próprio sorteio: montar agora ou depois dá a mesma casa
  const semente = (i) => criarAleatorio(1932 + i * 7919)
  const todas = [...casario.map((it) => [it, false]), ...morro.map((it) => [it, true])]
  SO_PLANEJAR = true
  const vazio = () => ({ reboco: new Pilha(), pecas: new Pilha(), interior: new Pilha(), aceso: new Pilha(), telhas: new Pilha() })
  todas.forEach(([it, simples], i) => {
    const b = bloco(it, simples)
    casa(it, vazio(), semente(i), simples)
    ;(b.itens ||= []).push([it, i])
  })
  SO_PLANEJAR = false
  void rnd
  // interior aceso: escuro de dia, candeeiro quente à noite (não recebe luz; brilha no filtro)
  const matAceso = luzFixa(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.6, globais.uNoite)
  const montarBloco = (b) => {
    const pilhas = vazio()
    for (const [it, i] of b.itens) casa(it, pilhas, semente(i), b.simples)
    const r = pilhas.reboco.malha(b.simples ? matRebocoMorro : matReboco, 'casas-reboco')
    const p = pilhas.pecas.malha(matPecas, 'casas-pecas')
    const i = pilhas.interior.malha(matPecas, 'casas-interior')
    const a = pilhas.aceso.malha(matAceso, 'casas-interior-aceso')
    const t = pilhas.telhas.malha(matTelhas, 'casas-telhas')
    for (const m of [i, a]) if (m) m.castShadow = false
    for (const m of [r, p, i, a, t]) if (m) { m.visible = b.perto; grupo.add(m); b.malhas.push(m) }
    b.montado = true
    if (b.perto) for (const m of b.longe) m.visible = false
  }
  for (const b of blocos.values()) { b.perto = false; b.montado = false }
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
  for (const m of instanciarEmBlocos(grupo, geoCaixa, matInvisivel, caixas, null, { nome: 'casas-colisao-camera', sombra: false, recebe: false, solido: true, tam: TAM_LOD })) m.visible = false
  cena.add(grupo)
  const escuro = new THREE.Color('#4a3a30')
  const quente = new THREE.Color('#ffb860').multiplyScalar(2.2)
  // LOD por bloco: perto da câmera a casa detalhada; longe, a caixa com fachada pintada (Lote.criar)
  const PERTO = 70
  return {
    grupo,
    // malhas instanciadas das caixas de longe (instanciarEmBlocos usa os mesmos blocos de 96 m)
    registrarLonge(malhas, simples) {
      const v = new THREE.Vector3()
      const mt = new THREE.Matrix4()
      for (const im of malhas) {
        im.getMatrixAt(0, mt)
        v.setFromMatrixPosition(mt)
        const b = blocos.get(`${simples ? 'm' : 'c'}${Math.floor(v.x / TAM_BLOCO)},${Math.floor(v.z / TAM_BLOCO)}`)
        if (b) { b.longe.push(im); im.visible = !(b.perto && b.montado) } else im.visible = true
      }
    },
    atualizar(camera) {
      matAceso.color.copy(escuro).lerp(quente, globais.uNoite.value)
      if (!camera) return
      const cx = camera.position.x
      const cz = camera.position.z
      let montou = 0
      for (const b of blocos.values()) {
        const dx = Math.max(b.x0 - cx, 0, cx - (b.x0 + TAM_BLOCO))
        const dz = Math.max(b.z0 - cz, 0, cz - (b.z0 + TAM_BLOCO))
        const d = Math.hypot(dx, dz)
        const perto = b.perto ? d < PERTO + 8 : d < PERTO // folga para não piscar na divisa
        // bloco perto e ainda não montado: monta agora (no máximo dois por quadro)
        if (perto && !b.montado) {
          if (montou >= 2) continue
          b.perto = true
          montarBloco(b)
          montou++
          continue
        }
        if (perto === b.perto) continue
        b.perto = perto
        for (const m of b.malhas) m.visible = perto
        for (const m of b.longe) m.visible = !(perto && b.montado)
      }
    },
  }
}
