// Kit de peças de 1932 (KAN-73, motor de mundo M1). O mapa histórico de Fortaleza é desenhado com peças repetidas
// (decisão do Joabe, 18/10/2026): cada peça é um modelo só, desenhado por cópia na placa (three-virtual-geometry),
// e a casa é uma lista de "peça + posição + cor". A arquitetura é a das casas do jogo (quarteirao.js, casa()), com o
// mesmo sorteio na mesma ordem: a mesma semente dá a mesma casa nos dois jeitos.
//
// O que vira peça:
// - caixa unitária, esticada pela matriz da cópia (corpo, barrado, cunhais, frisos, cornija, platibanda, calçada,
//   meio-fio, peitoril, soleira, interior, janela dos fundos): uma por material
// - placa de parede com o vão furado (janela, porta, porta-janela; reta ou em arco): o resto do tramo é caixa
// - moldura do vão, folha de madeira (girada pela dobradiça na própria cópia: fechada, entreaberta e aberta), sacada,
//   frontão, telhado de duas e de quatro águas (esticado; a telha é desenhada pela posição no mundo) e empena
// A cor de cada casa vai como cor por cópia; tons dentro da peça (almofada mais escura) vão na cor por vértice.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { CAL, ESQUADRIAS } from '../paleta.js'

const CALCADA = 0.25
const LARG_CALCADA = 1.6
const MEIO_FIO = 0.16 // largura do meio-fio, na beira da calçada
const PAREDE = 0.32
const MX = 0.3 // folga da placa de parede dos lados do vão
const MT = 0.35 // folga em cima do vão

// ---------- formas das peças ----------

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

// geometria sem índice, com cor por vértice (tom dentro da peça) e o chão da casa em 0 (salitre, no caminho antigo)
function preparar(geo, tom = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g.attributes.uv) g.deleteAttribute('uv')
  const n = g.attributes.position.count
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(tom), 3))
  g.setAttribute('aChao', new THREE.BufferAttribute(new Float32Array(n), 1))
  return g
}

function juntar(partes) {
  return mergeGeometries(partes.map(([g, m, tom]) => { const p = preparar(g, tom); if (m) p.applyMatrix4(m); return p }))
}

const caixaEm = (x, y, z, sx, sy, sz) => [new THREE.BoxGeometry(sx, sy, sz), new THREE.Matrix4().makeTranslation(x, y, z)]

// medidas fixas dos vãos (as mesmas de casa()); simples = casa do morro
function medidasVao(tipo, simples) {
  if (simples) return tipo === 'porta' ? { w: 0.9, h: 2.1 } : { w: 0.75, h: 1.0 }
  return { porta: { w: 1.12, h: 2.75 }, janela: { w: 1.0, h: 1.85 }, alto: { w: 1.0, h: 2.35 } }[tipo]
}

const FORMAS = {
  // caixa unitária centrada; a cópia estica e posiciona
  caixa: () => preparar(new THREE.BoxGeometry(1, 1, 1)),
  // placa de parede com o vão: origem no meio do pé do vão, da face de dentro (z = 0) até a de fora (z = PAREDE)
  vao: (tipo, arco, simples, mb) => {
    const { w, h } = medidasVao(tipo, simples)
    const s = new THREE.Shape()
    s.moveTo(-w / 2 - MX, -mb); s.lineTo(w / 2 + MX, -mb); s.lineTo(w / 2 + MX, h + MT); s.lineTo(-w / 2 - MX, h + MT); s.lineTo(-w / 2 - MX, -mb)
    const furo = new THREE.Path()
    contornoVao(furo, 0, 0, w, h, arco)
    s.holes.push(furo)
    return preparar(new THREE.ExtrudeGeometry(s, { depth: PAREDE, bevelEnabled: false, curveSegments: 8 }))
  },
  moldura: (tipo, arco, simples) => {
    const { w, h } = medidasVao(tipo, simples)
    const fora = new THREE.Shape()
    contornoVao(fora, 0, -0.12, w + 0.26, h + 0.24, arco ? arco + 0.05 : 0)
    const dentro = new THREE.Path()
    contornoVao(dentro, 0, 0, w, h, arco)
    fora.holes.push(dentro)
    return preparar(new THREE.ExtrudeGeometry(fora, { depth: 0.06, bevelEnabled: false, curveSegments: 8 }))
  },
  // folha de madeira a partir da dobradiça (origem), estendendo-se para dentro do vão: lado +1 vai para -x
  folha: (lado, w, h, porta, simples) => {
    const cx = lado * -w / 2
    const partes = [[...caixaEm(cx, h / 2, 0, w, h, 0.045), 1]]
    if (simples) {
      partes.push([...caixaEm(cx, h * 0.5, 0.03, w - 0.06, 0.1, 0.02), 0.82])
    } else {
      const n = porta ? 3 : 2
      for (let i = 0; i < n; i++) {
        const ah = (h - 0.12 * (n + 1)) / n
        const ay = 0.12 + i * (ah + 0.12) + ah / 2
        partes.push([...caixaEm(cx, ay, 0.03, w - 0.16, ah, 0.02), 0.82])
        partes.push([...caixaEm(cx, ay, -0.03, w - 0.16, ah, 0.02), 0.82])
      }
    }
    return juntar(partes)
  },
  // grade de ferro da sacada (a laje vai como caixa na cor da moldura); origem no meio do pé da porta-janela
  grade: () => {
    const w = 1.0
    const partes = [[...caixaEm(0, 0.95, 0.68, w + 0.56, 0.04, 0.04), 1]]
    for (let k = 0; k <= 8; k++) partes.push([...caixaEm(-(w + 0.5) / 2 + ((w + 0.5) * k) / 8, 0.47, 0.68, 0.025, 0.95, 0.025), 1])
    for (const s of [-1, 1]) for (let k = 1; k <= 2; k++) partes.push([...caixaEm(s * (w + 0.56) / 2, 0.47, 0.35 + (k - 1.5) * 0.3, 0.025, 0.95, 0.025), 1])
    return juntar(partes)
  },
  frontao: () => {
    const fr = new THREE.Shape()
    fr.moveTo(-0.9, 0); fr.lineTo(0.9, 0); fr.lineTo(0, 0.55); fr.lineTo(-0.9, 0)
    return preparar(new THREE.ExtrudeGeometry(fr, { depth: 0.16, bevelEnabled: false }))
  },
  // telhado unitário: meia largura e meia profundidade 0,5, cumeeira em 0,5 x inclinação; recuo em fração da meia
  // largura (quatro águas). A inclinação vem no modelo e a cópia estica igual a profundidade e a altura: a normal das
  // águas não muda com a escala (a vg passa a normal pela matriz da cópia, sem a inversa transposta; com escala
  // diferente em y e z o telhado saía deitado e sem o desenho da telha). Só as águas das pontas do quatro águas
  // ficam com um desvio pequeno, porque a largura estica sozinha
  telhado: (recuo, inclinacao) => {
    const t = 0.5 * inclinacao
    const v = { a: [-0.5, 0, 0.5], b: [0.5, 0, 0.5], c: [0.5, 0, -0.5], d: [-0.5, 0, -0.5], r1: [-0.5 + recuo * 0.5, t, 0], r2: [0.5 - recuo * 0.5, t, 0] }
    const tris = [[v.a, v.b, v.r2], [v.a, v.r2, v.r1], [v.c, v.d, v.r1], [v.c, v.r1, v.r2]]
    if (recuo > 0) tris.push([v.b, v.c, v.r2], [v.d, v.a, v.r1])
    const pos = []
    for (const t of tris) for (const p of t) pos.push(...p)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.computeVertexNormals()
    return preparar(g)
  },
  // empena unitária no plano x = 0: base de z = -0,5 a 0,5, ponta em y = 1 (dos dois lados)
  empena: () => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, -0.5, 0, 1, 0, 0, 0, -0.5, 0, 0, 0.5, 0, 1, 0], 3))
    g.computeVertexNormals()
    return preparar(g)
  },
}

// recuos do quatro águas (fração da meia largura): o mais perto do pedido
const RECUOS = [0.3, 0.45, 0.6, 0.75, 0.9]

// ---------- a casa como lista de peças ----------

const m4 = () => new THREE.Matrix4()
const cor = new THREE.Color()

// Mesma assinatura e mesmo sorteio de casa() (quarteirao.js). Devolve [{ peca, material, matriz, cor }]:
// peca é a chave da forma (ver formaDaPeca), material um de reboco, pecas, interior, aceso, telhas.
export function pecasDaCasa(it, rnd, simples) {
  const lista = []
  const frenteX = it.frente && it.frente[0] !== 0
  const F = frenteX ? it.d : it.w
  const D = frenteX ? it.w : it.d
  const ang = it.frente ? Math.atan2(it.frente[0], it.frente[1]) : 0
  const chao = it.chao
  const base = m4().makeTranslation(it.x, chao, it.z).multiply(m4().makeRotationY(ang + it.rot))
  const por = (material, peca, local, hex) => lista.push({ peca, material, matriz: m4().copy(base).multiply(local), cor: hex })
  const caixa = (material, x, y, z, sx, sy, sz, hex, b = null) => {
    const local = m4().makeTranslation(x, y, z).multiply(m4().makeScale(sx, sy, sz))
    lista.push({ peca: 'caixa', material, matriz: m4().copy(b || base).multiply(local), cor: hex })
  }

  const interior = rnd.chance(simples ? 0.5 : 0.4) ? 'aceso' : 'interior'
  it.alturaLote ??= it.y + it.h - chao
  const H = simples ? Math.max(2.9, it.alturaLote) : (rnd.chance(0.5) ? rnd.entre(7.6, 8.6) : rnd.entre(4.8, 5.6))
  const sobrado = H > 6.8
  const platibanda = !simples && rnd.chance(0.55)
  const arco = !simples && rnd.chance(0.45) ? 0.22 : 0
  const calcada = simples ? 0 : CALCADA
  const parede = it.cor
  const ehCal = ['#efe6d2', '#f2ebdc', '#f4eee2', '#e9dfc8'].includes(parede)
  const moldura = ehCal ? rnd.escolha(['#e2c2a8', '#d9cbb0', '#cddbd6', '#e7d3a3']) : '#f3ede0'
  const esq = rnd.escolha(ESQUADRIAS)
  const barra = rnd.chance(0.5) ? new THREE.Color(esq).multiplyScalar(0.9).getHex() : new THREE.Color(parede).multiplyScalar(0.84).getHex()
  const zf = D / 2

  // corpo atrás da fachada
  caixa('reboco', 0, H / 2, -PAREDE / 2, F, H, D - PAREDE, parede)

  const slots = simples ? Math.max(1, Math.min(3, Math.floor(F / 2.2))) : Math.max(2, Math.floor(F / 1.85))
  const passo = F / slots
  const porta = Math.floor(rnd.entre(0, slots))
  const vaos = []
  for (let i = 0; i < slots; i++) {
    const cx = -F / 2 + passo * (i + 0.5)
    const ehPorta = i === porta
    if (simples) {
      vaos.push({ cx, y0: ehPorta ? 0.05 : 0.95, tipo: ehPorta ? 'porta' : 'janela', porta: ehPorta, slot: i })
      if (sobrado) vaos.push({ cx, y0: H - 1.9, tipo: 'janela', porta: false, slot: i })
      continue
    }
    vaos.push({ cx, y0: calcada + (ehPorta ? 0 : 0.95), tipo: ehPorta ? 'porta' : 'janela', porta: ehPorta, slot: i })
    if (sobrado) vaos.push({ cx, y0: calcada + 4.1, tipo: 'alto', porta: true, alto: true, slot: i })
  }
  for (const v of vaos) Object.assign(v, medidasVao(v.tipo, simples), { mb: Math.min(MX, v.y0) })

  // fachada: por tramo, as placas com vão e caixas enchendo o resto (lados, entre as placas, em cima)
  const zPar = zf - PAREDE / 2
  for (let i = 0; i < slots; i++) {
    const x0 = -F / 2 + passo * i
    const x1 = x0 + passo
    const doTramo = vaos.filter((v) => v.slot === i).sort((a, b) => a.y0 - b.y0)
    let y = 0
    for (const v of doTramo) {
      const yb = v.y0 - v.mb
      const yt = v.y0 + v.h + MT
      if (yb - y > 0.001) caixa('reboco', (x0 + x1) / 2, (y + yb) / 2, zPar, passo, yb - y, PAREDE, parede)
      const ve = v.cx - v.w / 2 - MX
      const vd = v.cx + v.w / 2 + MX
      if (ve - x0 > 0.001) caixa('reboco', (x0 + ve) / 2, (yb + yt) / 2, zPar, ve - x0, yt - yb, PAREDE, parede)
      if (x1 - vd > 0.001) caixa('reboco', (vd + x1) / 2, (yb + yt) / 2, zPar, x1 - vd, yt - yb, PAREDE, parede)
      por('reboco', `vao:${v.tipo}:${arco}:${simples ? 1 : 0}:${v.mb.toFixed(2)}`, m4().makeTranslation(v.cx, v.y0, zf - PAREDE), parede)
      y = yt
    }
    if (H - y > 0.001) caixa('reboco', (x0 + x1) / 2, (y + H) / 2, zPar, passo, H - y, PAREDE, parede)
  }

  // embasamento interrompido nas portas do térreo, e cunhais
  const portasTerreo = vaos.filter((v) => v.porta && !v.alto).map((v) => [v.cx - v.w / 2 - 0.13, v.cx + v.w / 2 + 0.13]).sort((a, b) => a[0] - b[0])
  // 2 mm aquém da quina (pisca, 22/10/2026): a ponta do barrado ficava no mesmo plano da face de fora do cunhal e as
  // duas cores brigavam (z-fighting) vistas da rua do lado
  let xb = -F / 2 + 0.002
  for (const [a, b] of [...portasTerreo, [F / 2 - 0.002, F / 2]]) {
    if (a - xb > 0.05) caixa('pecas', (xb + a) / 2, calcada + 0.4, zf + 0.025, a - xb, 0.8, 0.05, barra)
    xb = b
  }
  if (!simples) for (const s of [-1, 1]) caixa('pecas', s * (F / 2 - 0.17), (H - 0.6) / 2 + 0.4, zf + 0.03, 0.34, H - 0.6 - 0.8, 0.06, moldura)

  for (const v of vaos) {
    caixa(interior, v.cx, v.y0 + v.h / 2, zf - PAREDE + 0.03, v.w + 0.1, v.h + 0.3, 0.04, interior === 'aceso' ? '#e6d6bc' : '#3a2a22')
    por('pecas', `moldura:${v.tipo}:${arco}:${simples ? 1 : 0}`, m4().makeTranslation(v.cx, v.y0, zf), moldura)
    if (!v.porta) caixa('pecas', v.cx, v.y0 - 0.05, zf + 0.06, v.w + 0.36, 0.09, 0.2, moldura)
    else if (!v.alto) caixa('pecas', v.cx, calcada + 0.04, zf - 0.05, v.w + 0.1, 0.08, 0.4, '#b9ab90')
    const sorte = rnd.proximo()
    const abre = sorte < 0.45 ? 0 : (sorte < 0.8 ? rnd.entre(0.35, 0.9) : rnd.entre(1.3, 1.52))
    const hf = v.h - (arco ? arco * 0.6 : 0) - 0.04
    const zDob = zf - 0.1
    for (const lado of [-1, 1]) {
      const assimetria = lado === 1 ? 1 : rnd.entre(0.6, 1.1)
      const giro = m4().makeTranslation(v.cx + lado * v.w / 2, v.y0 + 0.02, zDob).multiply(m4().makeRotationY(lado * abre * assimetria))
      por('pecas', `folha:${lado}:${(v.w / 2 - 0.01).toFixed(3)}:${hf.toFixed(3)}:${v.porta ? 1 : 0}:${simples ? 1 : 0}`, giro, esq)
    }
    if (v.alto && !simples && rnd.chance(0.6)) {
      caixa('pecas', v.cx, v.y0 - 0.05, zf + 0.35, v.w + 0.6, 0.1, 0.7, moldura)
      por('pecas', 'grade', m4().makeTranslation(v.cx, v.y0, zf), '#2f2a2e')
    }
  }

  if (sobrado) {
    caixa('pecas', 0, calcada + 3.75, zf + 0.06, F, 0.14, 0.12, moldura)
    caixa('pecas', 0, calcada + 3.62, zf + 0.03, F, 0.1, 0.06, moldura)
  }

  // telhado (casa() chama telhado(); aqui a mesma conta vira telhado unitário esticado, beira e empenas)
  const telhado = (b, Ft, Dt, y0, beiral, inclinacao, quatroAguas, hex) => {
    const meiaF = Ft / 2 + beiral
    const meiaD = Dt / 2 + beiral
    const alto = meiaD * inclinacao
    const pedido = quatroAguas ? Math.min(meiaD, meiaF * 0.9) / meiaF : 0
    const recuo = quatroAguas ? RECUOS.reduce((a, r) => (Math.abs(r - pedido) < Math.abs(a - pedido) ? r : a)) : 0
    lista.push({ peca: `telhado:${recuo}:${inclinacao}`, material: 'telhas', matriz: m4().copy(b).multiply(m4().makeTranslation(0, y0, 0)).multiply(m4().makeScale(2 * meiaF, 2 * meiaD, 2 * meiaD)), cor: hex })
    caixa('telhas', 0, y0 - 0.04, meiaD - 0.03, Ft + 2 * beiral, 0.08, 0.06, new THREE.Color(hex).multiplyScalar(0.6).getHex(), b)
    if (!quatroAguas) {
      for (const sx of [-1, 1]) {
        const x = sx * (Ft / 2 - 0.02)
        const zz = Dt / 2 * (meiaD - 0.01) / meiaD
        lista.push({ peca: 'empena', material: 'reboco', matriz: m4().copy(b).multiply(m4().makeTranslation(x, y0, 0)).multiply(m4().makeScale(1, alto * (zz / meiaD) + 0.02, 2 * zz)), cor: parede })
      }
    }
  }

  if (platibanda) {
    const passos = [[0.08, 0.1], [0.16, 0.08], [0.26, 0.1], [0.34, 0.07]]
    let y = H - 0.5
    for (const [p, a] of passos) { caixa('pecas', 0, y + a / 2, zf + p / 2, F + p * 0.6, a, p, moldura); y += a }
    caixa('reboco', 0, H + 0.3, zf - 0.1, F, 0.6, 0.2, parede)
    caixa('pecas', 0, H + 0.63, zf - 0.07, F + 0.1, 0.07, 0.32, moldura)
    if (rnd.chance(0.5)) por('pecas', 'frontao', m4().makeTranslation(0, H + 0.65, zf - 0.17), moldura)
    const telhaP = new THREE.Color(CAL.telha).multiplyScalar(rnd.entre(0.78, 1.0)).getHex()
    telhado(m4().copy(base).multiply(m4().makeTranslation(0, 0, -0.35)), F - 0.4, D - 0.9, H + 0.05, 0.05, 0.36, rnd.chance(0.6), telhaP)
  } else {
    const beiral = simples ? 0.45 : 0.7
    const telhaB = new THREE.Color(CAL.telha).multiplyScalar(rnd.entre(0.75, 1.05)).getHex()
    telhado(base, F, D, H, beiral, simples ? 0.3 : 0.36, simples ? rnd.chance(0.3) : rnd.chance(0.5), telhaB)
    caixa('pecas', 0, H - 0.06, zf + 0.06, F, 0.12, 0.1, moldura)
  }

  // janelas dos fundos (fechadas)
  const costas = m4().copy(base).multiply(m4().makeRotationY(Math.PI))
  const nCostas = Math.max(1, Math.floor(F / 2.6))
  const andaresCostas = sobrado ? [simples ? 0.95 : calcada + 1.0, H - (simples ? 1.9 : 3.0)] : [simples ? 0.95 : calcada + 1.0]
  for (let i = 0; i < nCostas; i++) {
    if (rnd.chance(0.25)) continue
    const cx = -F / 2 + (F / nCostas) * (i + 0.5) + rnd.entre(-0.3, 0.3)
    for (const y0 of andaresCostas) {
      const w = simples ? 0.7 : 0.9
      const h = simples ? 0.9 : 1.4
      for (const [dx, dy, sx, sy] of [[0, -0.05, w + 0.2, 0.1], [0, h + 0.05, w + 0.2, 0.1], [-(w / 2 + 0.05), h / 2, 0.1, h + 0.2], [w / 2 + 0.05, h / 2, 0.1, h + 0.2]]) {
        caixa('pecas', cx + dx, y0 + dy, D / 2 + 0.03, sx, sy, 0.06, moldura, costas)
      }
      caixa('pecas', cx, y0 + h / 2, D / 2 + 0.02, w, h, 0.04, esq, costas)
      caixa('pecas', cx, y0 + h / 2, D / 2 + 0.045, 0.025, h, 0.01, new THREE.Color(esq).multiplyScalar(0.7).getHex(), costas)
    }
  }

  if (!simples) {
    // a calçada acaba onde o meio-fio começa (pisca, 22/10/2026): as duas caixas iam até a mesma beira, com a frente e o
    // topo no mesmo plano, e as duas cores brigavam pixel a pixel (z-fighting) numa faixa ao longo de toda a rua
    const zc = zf + (LARG_CALCADA - MEIO_FIO) / 2
    caixa('pecas', 0, CALCADA / 2, zc, F, CALCADA, LARG_CALCADA - MEIO_FIO, rnd.escolha(['#cdbb9c', '#c8b596', '#d3c3a5']))
    caixa('pecas', 0, CALCADA / 2 - 0.02, zf + LARG_CALCADA - MEIO_FIO / 2, F, calcada + 0.04, MEIO_FIO, '#a99b84')
  }
  return lista
}

// geometria de uma peça pela chave (a mesma chave é o mesmo modelo para todas as cópias)
const cacheFormas = new Map()
export function formaDaPeca(peca) {
  if (cacheFormas.has(peca)) return cacheFormas.get(peca)
  const [tipo, ...a] = peca.split(':')
  let g
  if (tipo === 'caixa') g = FORMAS.caixa()
  else if (tipo === 'vao') g = FORMAS.vao(a[0], +a[1], a[2] === '1', +a[3])
  else if (tipo === 'moldura') g = FORMAS.moldura(a[0], +a[1], a[2] === '1')
  else if (tipo === 'folha') g = FORMAS.folha(+a[0], +a[1], +a[2], a[3] === '1', a[4] === '1')
  else if (tipo === 'grade') g = FORMAS.grade()
  else if (tipo === 'frontao') g = FORMAS.frontao()
  else if (tipo === 'telhado') g = FORMAS.telhado(+a[0], +a[1])
  else if (tipo === 'empena') g = FORMAS.empena()
  else throw new Error('peça desconhecida: ' + peca)
  g.computeBoundingSphere()
  cacheFormas.set(peca, g)
  return g
}

// junta as peças de várias casas por (material, peça): [{ material, peca, matrizes: Matrix4[], cores: hex[] }]
export function agruparPecas(listas) {
  const grupos = new Map()
  for (const lista of listas) {
    for (const p of lista) {
      const k = p.material + '|' + p.peca
      if (!grupos.has(k)) grupos.set(k, { material: p.material, peca: p.peca, matrizes: [], cores: [] })
      const g = grupos.get(k)
      g.matrizes.push(p.matriz)
      g.cores.push(cor.set(p.cor).getHex())
    }
  }
  return [...grupos.values()]
}
