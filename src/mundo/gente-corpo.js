// O corpo da gente de 1932 (22/10/2026, docs/gente-22-10.md): uma receita só que veste a figura parada da cidade e
// do Campo do Urubu (pessoas.js, urubu-gente.js) e o ator animado perto do jogador (atores.js). A figura antiga era
// cápsula e bola (cabeça de 1/5 da altura, corpo de 44 cm de largura e 32 de fundo): de perto lia boneco.
//
// Aqui o corpo sai das juntas do esqueleto padrão do jogo (esqueleto.js, 1,71 m até o alto da cabeça, cabeça de 1/8):
// o tronco é um torno com cintura, peito e ombro (o V do conceito), as pernas e os braços afinam até o tornozelo e o
// pulso, a roupa é forma (paletó com aba, camisa por fora, vestido em sino no meio da canela, saia até o tornozelo),
// o chapéu tem o feitio de cada um (palheta, feltro, palha de carnaúba, couro), e a carga vai na cabeça.
//
// Nenhuma pose é inventada: a figura parada continua na pose de sempre (de pé, braços caídos; sentada no chão, pernas
// para a frente) e o ator usa a pose em T do esqueleto, que os clipes de mocap movem (rotoscopia, CLAUDE.md).
//
// vestir(fig, juntas, opcoes, emitir): para cada peça chama emitir(geo, papel, osso, rotulo). papel é a cor da peça
// (pele, camisa, listra, calca, chapeu, cabelo; os mesmos de ossos-textura.js), osso é o nome do osso que leva a peça
// (ou uma função da posição do vértice, para o tronco que dobra em três), rotulo é o nome da peça (os atores ligam e
// desligam peças por rótulo).

import * as THREE from 'three'
import { OSSOS } from '../jogador/esqueleto.js'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

// ---------------------------------------------------------------------------------------------------------------
// juntas: posição de cada osso no mundo, na pose em T (repouso do esqueleto) e nas duas poses paradas de sempre

export function juntasEmT() {
  const j = {}
  for (const [nome, pai, p] of OSSOS) j[nome] = V(...p).add(pai ? j[pai] : V())
  return j
}

// de pé, braços caídos ao lado do corpo (a pose da figura parada desde sempre), com o cotovelo um pouco à frente
export function juntasDePe() {
  const j = juntasEmT()
  for (const [L, s] of [['Left', 1], ['Right', -1]]) {
    const A = j[L + 'Arm']
    const E = A.clone().addScaledVector(V(s * 0.12, -1, -0.01).normalize(), 0.27)
    const W = E.clone().addScaledVector(V(s * 0.03, -1, 0.16).normalize(), 0.25)
    const H = W.clone().addScaledVector(V(s * 0.01, -1, 0.06).normalize(), 0.17)
    j[L + 'ForeArm'] = E
    j[L + 'Hand'] = W
    j[L + 'HandEnd'] = H
  }
  j.palma = (s) => V(1, 0, 0) // a palma virada para a coxa: a mão é fina no eixo x
  return j
}

// sentada no chão (a de sempre: quadril a 0,3 m, pernas para a frente, joelho um pouco alto)
export function juntasSentado() {
  const j = juntasDePe()
  const dy = 0.3 - j.Hips.y
  for (const k of Object.keys(j)) {
    if (typeof j[k] === 'function' || /UpLeg|Leg|Foot|Toe/.test(k)) continue
    j[k].y += dy
  }
  for (const [L, s] of [['Left', 1], ['Right', -1]]) {
    j[L + 'UpLeg'] = V(s * 0.09, 0.26, 0.02)
    j[L + 'Leg'] = V(s * 0.1, 0.3, 0.42)
    j[L + 'Foot'] = V(s * 0.1, 0.08, 0.8)
    j[L + 'ToeBase'] = V(s * 0.1, 0.14, 0.86)
    j[L + 'Toe_End'] = V(s * 0.1, 0.2, 0.88)
    // o braço apoia: a mão no chão, ao lado da coxa
    j[L + 'Hand'].set(s * 0.22, 0.2, 0.1)
    j[L + 'HandEnd'].set(s * 0.23, 0.07, 0.17)
  }
  j.sentado = true
  return j
}

// ---------------------------------------------------------------------------------------------------------------
// formas

// gira a geometria (feita ao longo de +y, com a espessura em z) para ir de A a B, com a espessura no eixo `fino`
const _m = new THREE.Matrix4()
function orientar(g, A, B, fino = null) {
  const y = V().subVectors(B, A).normalize()
  let z = fino ? fino.clone() : (Math.abs(y.y) > 0.9 ? V(0, 0, 1) : V(0, 1, 0))
  z.addScaledVector(y, -z.dot(y))
  if (z.lengthSq() < 1e-6) z = Math.abs(y.x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1)
  z.normalize()
  const x = V().crossVectors(y, z)
  _m.makeBasis(x, y, z).setPosition(A)
  return g.applyMatrix4(_m)
}

// tubo que afina de rA (em A) até rB (em B); prolonga um pouco nas pontas para não abrir fresta na junta
function tubo(A, B, rA, rB, seg, { fino = null, achata = 1, folga = 0.35, tampa = seg > 4 } = {}) {
  const L = A.distanceTo(B)
  const eA = rA * folga
  const eB = rB * folga
  const g = new THREE.CylinderGeometry(rB, rA, L + eA + eB, seg, 1, !tampa)
  g.translate(0, (L + eA + eB) / 2 - eA, 0)
  if (achata !== 1) g.scale(1, 1, achata)
  return orientar(g, A, B, fino)
}

// torno: perfil [[raio, y], ...] de baixo para cima, girado em volta de y; sx/sz achatam
function torno(perfil, seg, { sx = 1, sz = 1, phi0 = 0, phi = Math.PI * 2, centro = V() } = {}) {
  const g = new THREE.LatheGeometry(perfil.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y)), seg, phi0, phi)
  g.scale(sx, 1, sz)
  return g.translate(centro.x, centro.y, centro.z)
}

function bola(c, r, ws, hs, sx = 1, sy = 1, sz = 1) {
  return new THREE.SphereGeometry(r, ws, hs).scale(sx, sy, sz).translate(c.x, c.y, c.z)
}

// calota: o alto de uma esfera (cabelo, lenço), inclinada para trás para deixar o rosto
function calota(c, r, ws, hs, theta, inclina, sx = 1, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, theta).scale(sx, sy, sz)
  g.rotateX(-inclina)
  return g.translate(c.x, c.y, c.z)
}

// ---------------------------------------------------------------------------------------------------------------
// o osso de cada altura do tronco (o tronco do ator dobra nos três gomos da coluna)
function ossoDoTronco(j) {
  const y1 = (j.Spine.y + j.Spine1.y) / 2
  const y2 = (j.Spine1.y + j.Spine2.y) / 2
  return (x, y) => (y < j.Hips.y + 0.03 ? 'Hips' : y < y1 ? 'Spine' : y < y2 ? 'Spine1' : 'Spine2')
}

// detalhe: 'perto' (o padrão: rosto, mão, fita do chapéu) ou 'longe' (menos lados, sem nariz nem orelha), os dois
// níveis da multidão (multidao.js)
const LADOS = {
  perto: { tubo: 7, torno: 10, bola: [10, 7], mao: 6, aba: 14, copa: 10 },
  longe: { tubo: 4, torno: 6, bola: [6, 4], mao: 3, aba: 8, copa: 5 },
}
export function vestir(fig, j, { detalhe = 'perto', cabeca = 1 } = {}, emitir) {
  const perto = detalhe === 'perto'
  const S = LADOS[detalhe] || LADOS.perto
  const mulher = fig.corpo === 'mulher' || fig.corpo === 'menina'
  const crianca = fig.corpo === 'menino' || fig.corpo === 'menina'
  const sentado = !!j.sentado
  const H = j.Head
  const tronco = ossoDoTronco(j)
  const ec = cabeca // a criança tem a cabeça maior em proporção (ver juntasCrianca)
  const hy = (d) => H.clone().add(V(0, d * ec, 0))

  // ---- cabeça: crânio alongado, queixo, nariz, orelhas; pescoço
  emitir(tubo(j.Neck, H.clone().add(V(0, 0.04 * ec, 0)), 0.048 * ec, 0.045 * ec, S.tubo), 'pele', 'Neck', 'cabeca')
  emitir(bola(H.clone().add(V(0, 0.105 * ec, 0.004 * ec)), 0.096 * ec, ...S.bola, 0.9, 1.12, 1.0), 'pele', 'Head', 'cabeca')
  if (perto) {
    emitir(bola(H.clone().add(V(0, 0.056 * ec, 0.022 * ec)), 0.064 * ec, ...S.bola, 0.95, 0.95, 1.0), 'pele', 'Head', 'cabeca')
    emitir(orientar(new THREE.ConeGeometry(0.017 * ec, 0.045 * ec, 5).translate(0, 0.022 * ec, 0), H.clone().add(V(0, 0.086 * ec, 0.088 * ec)), H.clone().add(V(0, 0.072 * ec, 0.14 * ec)), V(0, 1, 0)), 'pele', 'Head', 'cabeca')
    for (const s of [1, -1]) emitir(bola(H.clone().add(V(s * 0.086 * ec, 0.095 * ec, -0.004)), 0.022 * ec, 6, 5, 0.45, 1, 0.75), 'pele', 'Head', 'cabeca')
  }

  // ---- cabelo
  const cab = fig.cabelo || (mulher ? 'coque' : 'curto')
  if (cab !== 'raspado') {
    emitir(calota(hy(0.112), 0.103 * ec, ...S.bola, mulher ? 1.75 : 1.5, 0.45, 0.94, 1.08, 1.04), 'cabelo', 'Head', 'cabelo-' + (mulher ? 'm' : 'h'))
    if (cab === 'coque') emitir(bola(H.clone().add(V(0, 0.115 * ec, -0.1 * ec)), 0.048 * ec, ...S.bola, 1, 0.9, 0.85), 'cabelo', 'Head', 'coque')
    if (cab === 'solto') emitir(calota(hy(0.09), 0.108 * ec, ...S.bola, 2.1, 0.75, 0.98, 1.2, 1.0), 'cabelo', 'Head', 'cabelo-solto')
  }

  // ---- chapéu e o que cobre a cabeça
  const topo = hy(0.17)
  const ch = fig.chapeu
  if (ch === 'palheta') {
    // palheta: copa baixa e reta, fita escura, aba reta (foto da Praça do Ferreira, 1930)
    emitir(torno([[0.18, -0.006], [0.18, 0.006], [0.104, 0.008], [0.104, 0.07], [0.0, 0.072]], S.aba, { sx: 1.06, centro: topo }), 'chapeu', 'Head', 'palheta')
    if (perto) emitir(torno([[0.109, 0.008], [0.109, 0.032]], S.aba, { sx: 1.06, centro: topo }), 'cabelo', 'Head', 'palheta')
  } else if (ch === 'feltro') {
    // feltro: copa com vinco em cima, aba que cai na frente
    emitir(torno([[0.168, -0.012], [0.17, 0.0], [0.1, 0.012], [0.098, 0.08], [0.06, 0.1], [0.0, 0.085]], S.aba, { sx: 1.08, centro: topo }), 'chapeu', 'Head', 'feltro')
    if (perto) emitir(torno([[0.103, 0.012], [0.102, 0.032]], S.aba, { sx: 1.08, centro: topo }), 'cabelo', 'Head', 'feltro')
  } else if (ch === 'palha') {
    // palha de carnaúba: copa alta e redonda, aba larga e mole, levantada nas bordas (Percy Lau, 1941)
    emitir(torno([[0.27, 0.05], [0.24, 0.012], [0.16, -0.004], [0.105, 0.0], [0.1, 0.09], [0.075, 0.13], [0.0, 0.14]], S.aba, { sx: 1.04, centro: topo.clone().add(V(0, -0.008, 0)) }), 'chapeu', 'Head', 'palha')
  } else if (ch === 'couro') {
    // couro liso de vaqueiro (sem ornamento: o de cangaceiro não é do retirante comum, docs/figurino.md)
    emitir(torno([[0.2, 0.07], [0.17, 0.02], [0.105, 0.0], [0.1, 0.07], [0.05, 0.11], [0.0, 0.115]], S.aba, { sx: 0.95, sz: 1.08, centro: topo }), 'chapeu', 'Head', 'couro')
  } else if (ch === 'touca') {
    // o chapéu pequeno de moça, inclinado (1932)
    const g = torno([[0.135, -0.005], [0.12, 0.012], [0.098, 0.02], [0.092, 0.07], [0.0, 0.085]], S.copa, { centro: V() })
    g.rotateZ(0.14).rotateX(-0.08).translate(topo.x + 0.01, topo.y - 0.012, topo.z + 0.01)
    emitir(g, 'chapeu', 'Head', 'touca')
  } else if (ch === 'lenco') {
    // lenço amarrado: cobre o cabelo, nó atrás
    emitir(calota(hy(0.108), 0.108 * ec, ...S.bola, 1.85, 0.5, 0.96, 1.1, 1.06), 'listra', 'Head', 'lenco')
    emitir(bola(H.clone().add(V(0, 0.08 * ec, -0.11 * ec)), 0.035 * ec, 6, 5, 1.3, 0.8, 0.7), 'listra', 'Head', 'lenco')
  } else if (ch === 'xale') {
    // o pano claro cobrindo a cabeça e os ombros, aberto na frente do rosto (o traço mais forte das fotos de
    // retirante, docs/figurino.md)
    const c = j.Spine2.clone()
    const yb = j.Spine2.y + 0.09 - c.y
    const yt = H.y + 0.23 * ec - c.y
    emitir(torno([[0.235, yb], [0.2, yb + 0.06], [0.13, (H.y - c.y) + 0.01], [0.12, (H.y - c.y) + 0.12 * ec], [0.07, yt - 0.02], [0.0, yt]], S.torno, { sx: 1.05, sz: 1.0, phi0: Math.PI * 0.2, phi: Math.PI * 1.6, centro: V(c.x, c.y, c.z - 0.012) }), 'listra', 'Spine2', 'xale')
  } else if (ch === 'pano') {
    // pano branco amarrado na cabeça (homem, foto do Pirambu, 1932)
    emitir(calota(hy(0.115), 0.106 * ec, ...S.bola, 1.6, 0.25, 0.96, 1.0, 1.04), 'listra', 'Head', 'pano')
  }

  // ---- carga na cabeça: rodilha + cesto (com fruta), trouxa, fardo, lata
  // a rodilha (o pano enrolado) assenta no alto da cabeça, sobre o cabelo; a carga em cima dela
  const alto = hy(fig.chapeu === 'palha' ? 0.25 : 0.205)
  if (fig.carga === 'cesto') {
    emitir(torno([[0.05, -0.012], [0.085, 0.004], [0.075, 0.024], [0.04, 0.03]], S.copa, { centro: alto }), 'calca', 'Head', 'cesto')
    emitir(torno([[0.15, 0.02], [0.2, 0.14], [0.205, 0.15], [0.19, 0.15], [0.0, 0.13]], S.copa, { centro: alto }), 'chapeu', 'Head', 'cesto')
    for (let k = 0; k < (perto ? 5 : 2); k++) {
      const a = k * 2.4
      emitir(bola(alto.clone().add(V(Math.cos(a) * 0.09 * (k ? 1 : 0), 0.17, Math.sin(a) * 0.08 * (k ? 1 : 0))), 0.055, 6, 5), 'listra', 'Head', 'cesto')
    }
  } else if (fig.carga === 'trouxa') {
    emitir(bola(alto.clone().add(V(0, 0.08, 0)), 0.2, ...S.bola, 1.15, 0.5, 0.95), 'listra', 'Head', 'trouxa')
    if (perto) emitir(bola(alto.clone().add(V(0.02, 0.16, 0.02)), 0.05, 6, 5, 1.2, 0.7, 1), 'listra', 'Head', 'trouxa')
  } else if (fig.carga === 'fardo') {
    emitir(new THREE.BoxGeometry(0.5, 0.2, 0.34, 1, 1, 1).translate(alto.x, alto.y + 0.1, alto.z), 'listra', 'Head', 'fardo')
  } else if (fig.carga === 'lata') {
    emitir(torno([[0.05, -0.012], [0.085, 0.004], [0.075, 0.024], [0.04, 0.03]], S.copa, { centro: alto }), 'listra', 'Head', 'lata')
    // a lata de querosene quadrada, a mesma do chão do campo (urubu-pecas.js)
    emitir(new THREE.BoxGeometry(0.24, 0.34, 0.24).translate(alto.x, alto.y + 0.195, alto.z), 'calca', 'Head', 'lata')
  }

  // ---- tronco: o V (ombro largo, cintura fina); no homem 40 cm de ombro a ombro, na mulher 34
  const yc = j.Hips.y // cintura
  const yo = j.Neck.y // base do pescoço
  const roupa = fig.roupa || (mulher ? 'vestido' : 'camisa')
  const escTronco = crianca ? 0.82 : 1
  const RS = mulher ? { cintura: 0.112, peito: 0.15, ombro: 0.148, sx: 1.13, sz: 0.82 } : { cintura: 0.13, peito: 0.163, ombro: 0.168, sx: 1.2, sz: 0.74 }
  const perfilTronco = (folga = 0, baixo = yc - 0.04, rBaixo = null) => [
    [(rBaixo ?? RS.cintura + 0.01) * escTronco + folga, baixo],
    [RS.cintura * escTronco + folga, yc + 0.06],
    [(RS.cintura + 0.01) * escTronco + folga, yc + 0.15],
    [RS.peito * escTronco + folga, j.Spine2.y + 0.02],
    [RS.ombro * escTronco + folga, yo - 0.06],
    [(RS.ombro - 0.03) * escTronco + folga, yo - 0.015],
    [0.07 * escTronco + folga, yo + 0.012],
    [0.045, yo + 0.02],
  ]
  const comTronco = (perfil, papel, rot) => emitir(torno(perfil, S.torno, { sx: RS.sx, sz: RS.sz }), papel, tronco, rot)

  // a parte de baixo: calça (pelve e pernas) ou saia
  const calca = roupa === 'terno' || roupa === 'camisa' || roupa === 'camisaFora' || roupa === 'calcao'
  if (calca) {
    emitir(torno([[0.115, yc - 0.14], [0.138, yc - 0.05], [0.138, yc + 0.03]], S.torno, { sx: 1.2 * escTronco, sz: 0.8 * escTronco }), 'calca', 'Hips', 'calca')
  }

  if (roupa === 'terno') {
    // paletó aberto na frente: a camisa clara e a gravata escura aparecem no vão; aba até o quadril
    comTronco(perfilTronco(0.003, yc - 0.06), 'listra', 'camisa-terno')
    emitir(torno(perfilTronco(0.016, yc - 0.16, RS.cintura + 0.03), S.torno, { sx: RS.sx, sz: RS.sz, phi0: 0.3, phi: Math.PI * 2 - 0.6 }), 'camisa', tronco, 'terno')
    if (perto && fig.gravata !== false) emitir(new THREE.BoxGeometry(0.026, 0.2, 0.01).translate(0, yo - 0.13, (RS.peito + 0.003) * RS.sz - 0.004), 'cabelo', 'Spine2', 'gravata')
  } else if (roupa === 'camisa' || roupa === 'calcao') {
    // camisa por dentro da calça, com o cinto de couro (carregador do porto, Platt 1935)
    comTronco(perfilTronco(0.004, yc - 0.05, RS.cintura - 0.01), 'camisa', 'camisa')
    if (perto && !crianca) emitir(torno([[0.14, yc], [0.14, yc + 0.028]], S.torno, { sx: 1.2, sz: 0.8 }), 'cabelo', 'Hips', 'cinto-couro')
  } else if (roupa === 'camisaFora' || roupa === 'camisolao') {
    // camisa grande e solta por fora, caindo sobre o quadril (carregadores, Platt 1935; retirantes, 1932)
    const ate = roupa === 'camisolao' ? (sentado ? yc - 0.08 : j.LeftLeg.y + 0.04) : yc - (sentado ? 0.07 : 0.2)
    comTronco(perfilTronco(0.022, ate, RS.cintura + 0.075), 'camisa', 'camisaFora')
  } else {
    // vestido e blusa da mulher
    comTronco(perfilTronco(0.004, yc - 0.03), 'camisa', 'corpete')
    emitir(torno([[RS.cintura * escTronco + 0.012, yc + 0.035], [RS.cintura * escTronco + 0.014, yc - 0.01]], S.torno, { sx: RS.sx, sz: RS.sz }), 'listra', 'Hips', 'cinto')
  }

  // saia: vestido em sino no meio da canela (1932); saia de algodão até o tornozelo (retirante, empregada)
  const saia = roupa === 'vestido' || roupa === 'saia' || roupa === 'vestidoLongo'
  if (saia) {
    const papel = roupa === 'saia' ? 'calca' : 'camisa'
    if (sentado) {
      // sentada: a saia cobre as coxas e cai até a canela
      const c = V(0, j.Hips.y, 0)
      const g = new THREE.CylinderGeometry(0.2, 0.24, 0.62, S.torno, 1, false).rotateX(Math.PI / 2).scale(1.05, 0.55, 1).translate(0, c.y - 0.04, 0.24)
      emitir(g, papel, 'Hips', 'saia')
    } else {
      const hem = roupa === 'vestido' ? (crianca ? j.LeftLeg.y - 0.04 : j.LeftLeg.y - 0.17) : 0.09
      const rh = roupa === 'vestido' ? (crianca ? 0.22 : 0.29) : 0.3
      const perfil = [[rh, hem], [rh - 0.015, hem + 0.02], [(rh + 0.18) / 2, (hem + yc) / 2 - 0.05], [0.18 * escTronco, yc - 0.12], [RS.cintura * escTronco + 0.016, yc + 0.02]]
      emitir(torno(perfil, S.torno, { sx: 1.04, sz: 0.94 }), papel, 'Hips', roupa === 'vestido' ? 'saia' : 'saiaLonga')
    }
  }

  // ---- pernas
  const pes = fig.pes || 'sapato'
  for (const [L, s] of [['Left', 1], ['Right', -1]]) {
    const UL = j[L + 'UpLeg']
    const K = j[L + 'Leg']
    const F = j[L + 'Foot']
    const T = j[L + 'Toe_End']
    const larga = fig.calcaLarga ? 1.12 : 1
    if (calca) {
      const curta = roupa === 'calcao'
      const arregacada = fig.arregacada && !curta
      emitir(tubo(UL, K, 0.078 * larga * escTronco, 0.064 * larga * escTronco, S.tubo), 'calca', L + 'UpLeg', 'calca')
      if (!curta) {
        const fim = arregacada ? K.clone().lerp(F, 0.6) : F.clone().add(V(0, 0.035, 0))
        emitir(tubo(K, fim, 0.064 * larga * escTronco, 0.06 * larga * escTronco, S.tubo), 'calca', L + 'Leg', 'calca')
        if (arregacada) emitir(tubo(fim, F, 0.045 * escTronco, 0.04 * escTronco, S.tubo), 'pele', L + 'Leg', 'canela')
      } else {
        emitir(tubo(K, F, 0.045 * escTronco, 0.036 * escTronco, S.tubo), 'pele', L + 'Leg', 'canela')
      }
    } else {
      // de saia: a perna aparece embaixo da barra (no vestido do meio da canela)
      if (!sentado) emitir(tubo(K, F.clone().add(V(0, 0.03, 0)), 0.048 * escTronco, 0.036 * escTronco, S.tubo), 'pele', L + 'Leg', 'canela')
      else emitir(tubo(K.clone().lerp(F, 0.45), F, 0.045, 0.036, S.tubo), 'pele', L + 'Leg', 'canela')
    }
    // pé: sapato (escuro) ou pé descalço
    const ft = pes === 'descalco' ? 0.034 : 0.044
    const pe = tubo(sentado ? F : V(F.x, ft * 0.62 * escTronco, F.z - 0.045 * escTronco), sentado ? T : V(T.x, ft * 0.5 * escTronco, T.z), ft * escTronco, ft * 0.85 * escTronco, S.mao, { fino: V(0, 1, 0), achata: 0.62, folga: 0.6 })
    emitir(pe, pes === 'descalco' ? 'pele' : 'cabelo', L + 'Foot', pes === 'descalco' ? 'descalco' : 'sapato')
  }

  // ---- braços: manga longa (paletó, camisa) ou curta (vestido, camisa arregaçada); mão fina
  const manga = fig.manga || (mulher ? 'curta' : 'longa')
  for (const [L, s] of [['Left', 1], ['Right', -1]]) {
    const A = j[L + 'Arm']
    const E = j[L + 'ForeArm']
    const W = j[L + 'Hand']
    const HE = j[L + 'HandEnd']
    const rb = (mulher ? 0.046 : 0.054) * escTronco
    const pm = 'camisa'
    if (perto) emitir(bola(A, rb * 1.12, S.mao + 1, S.mao, 1, 1, 1), pm, L + 'Arm', 'braco')
    if (manga === 'curta') {
      const fimManga = A.clone().lerp(E, 0.45)
      emitir(tubo(A, fimManga, rb * 1.05, rb * 1.1, S.tubo), pm, L + 'Arm', 'braco')
      emitir(tubo(fimManga, E, rb * 0.82, rb * 0.76, S.tubo), 'pele', L + 'Arm', 'braco-pele')
      emitir(tubo(E, W, rb * 0.76, rb * 0.6, S.tubo), 'pele', L + 'ForeArm', 'braco-pele')
    } else {
      emitir(tubo(A, E, rb, rb * 0.88, S.tubo), pm, L + 'Arm', 'braco')
      if (manga === 'arregacada') {
        const fim = E.clone().lerp(W, 0.25)
        emitir(tubo(E, fim, rb * 0.92, rb * 0.9, S.tubo), pm, L + 'ForeArm', 'braco')
        emitir(tubo(fim, W, rb * 0.74, rb * 0.6, S.tubo), 'pele', L + 'ForeArm', 'braco-pele')
      } else {
        emitir(tubo(E, W, rb * 0.86, rb * 0.74, S.tubo), pm, L + 'ForeArm', 'braco')
      }
    }
    // a mão: larga e fina, o polegar à frente
    const fino = j.palma ? j.palma(s) : V(0, 1, 0)
    emitir(tubo(W, HE, 0.036 * escTronco, 0.03 * escTronco, S.mao, { fino, achata: 0.48, folga: 0.5 }), 'pele', L + 'Hand', 'mao')
  }

  // ---- o que se leva: sombrinha no ombro, bornal a tiracolo, rede enrolada
  if (fig.sombrinha && !sentado) {
    // apoiada no ombro direito, o cabo na mão que cai ao lado do corpo
    // no ator (pose em T) a sombrinha é desenhada na pose parada e vai presa ao peito: fica no ombro enquanto anda
    const jp = j.palma ? j : juntasDePe()
    const mao = jp.RightHand.clone().lerp(jp.RightHandEnd, 0.5)
    const ombro = jp.RightArm.clone()
    const dir = V().subVectors(ombro, mao).normalize()
    const centro = ombro.clone().addScaledVector(dir, 0.42).add(V(0, 0.04, -0.06))
    emitir(tubo(mao, centro, 0.008, 0.008, 4, { folga: 0 }), 'cabelo', 'Spine2', 'sombrinha')
    const copa = torno([[0.4, -0.1], [0.3, -0.03], [0.16, 0.02], [0.0, 0.04]], S.aba)
    emitir(orientar(copa.rotateX(0).translate(0, 0, 0), centro, centro.clone().add(dir), null), 'listra', 'Spine2', 'sombrinha')
  }
  if (fig.bornal && !sentado) {
    const a = j.LeftArm.clone().add(V(-0.05, 0.02, 0))
    const b = V(-0.17, j.Hips.y - 0.05, 0.02)
    emitir(tubo(a, b, 0.014, 0.014, 4, { fino: V(0, 0, 1), achata: 0.3, folga: 0 }), 'calca', tronco, 'bornal')
    emitir(bola(b.clone().add(V(0, -0.06, 0.02)), 0.11, ...S.bola, 0.9, 1, 0.45), 'calca', 'Hips', 'bornal')
  }
}

// a criança: as juntas do adulto encolhidas (1,13 m) e a cabeça proporcionalmente maior
export function juntasCrianca(base) {
  const k = 0.66
  const j = {}
  for (const [n, v] of Object.entries(base)) j[n] = typeof v === 'object' && v.isVector3 ? v.clone().multiplyScalar(k) : v
  return j
}
export const CABECA_CRIANCA = 1.28
