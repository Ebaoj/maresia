// O neto (modelo da sessão do personagem: arte/finais/neto-mpfb.glb, MakeHuman/MPFB 2, ativos CC0)
// como corpo do jogador. Esqueleto Mixamo de 52 ossos com prefixo "mixamorig", repouso em T, 1,68 m,
// frente em +Z. Aqui: materiais no estilo do jogo (toon, peso de traço de personagem), o chapéu de
// palha como peça à parte no osso "Chapeu" (balança com as molas) e os eixos do repouso, que o
// animador usa para olhar, segurar e ajeitar o chapéu em qualquer modelo.

import * as THREE from 'three'
import { carregar, ossosPorNome } from './retarget.js'
import { toon, toonVertice } from '../materiais.js'
import { criarAleatorio } from '../utils.js'
import { daBase } from '../caminho.js'

export const ARQUIVO_NETO = '/arte/finais/neto-mpfb.glb'
// rosto liso (sem olhos, sobrancelhas, cílios nem lábios), para o rosto desenhado em 2D (rosto.js)
export const ARQUIVO_NETO_SEM_ROSTO = '/arte/finais/neto-mpfb-sem-rosto.glb'

// cores medidas pela sessão do personagem (docs/direcao-de-arte.md, seção 7)
const COR = { pele: '#96593a', labios: '#80493a', cabelo: '#16110f', pelos: '#120d0b', calca: '#e3d8c2', palha: '#d9b98a' }
const PERSONAGEM = { opacity: 0.5, blending: THREE.NoBlending, semCache: true } // alfa 0,5: traço de personagem

function materialPara(malha) {
  const nome = (malha.material?.name || malha.name).toLowerCase()
  // o arquivo pode trazer as peças como casca (no v6 a roupa é uma superfície em cima da pele): o lado
  // duplo do autor precisa ficar, senão a borda da peça abre buraco
  const lado = malha.material?.side === THREE.DoubleSide ? { side: THREE.DoubleSide } : {}
  if (malha.material?.map && !malha.geometry.attributes.color && (malha.userData.tripo || malha.geometry.attributes.position.count > 5000)) {
    // modelo inteiro numa textura pintada (Tripo): a textura é a cor
    const map = malha.material.map
    map.colorSpace = THREE.SRGBColorSpace
    return toon('#ffffff', { ...PERSONAGEM, ...lado, map })
  }
  if (nome.includes('camisa')) return toonVertice({ opacity: 0.5, blending: THREE.NoBlending, ...lado }) // listras nos vértices
  if (nome.includes('labio')) return toon(COR.labios, PERSONAGEM)
  if (nome.includes('calca')) return toon(COR.calca, PERSONAGEM)
  if (nome.includes('cabelo') || nome.includes('short')) return toon(COR.cabelo, PERSONAGEM)
  if (nome.includes('pelos') || nome.includes('eyebrow') || nome.includes('eyelash')) return toon(COR.pelos, PERSONAGEM)
  if (malha.material?.map) return toon('#ffffff', { ...PERSONAGEM, ...lado, map: malha.material.map }) // olhos
  // pele sem textura, mas com a cor pintada nos vértices (o tronco do v6): a cor vem do vértice
  if (malha.geometry.attributes.color) return toonVertice({ opacity: 0.5, blending: THREE.NoBlending, ...lado })
  return toon(COR.pele, PERSONAGEM)
}

// chapéu de palha de carnaúba: copa alta, aba larga e mole, levantada nas bordas e desfiada
// (docs/figurino.md e a ficha do neto). Feito em pé no mundo; o pivô compensa o giro do osso.
function chapeuDePalha() {
  const rnd = criarAleatorio(77)
  const copa = new THREE.LatheGeometry([[0.0, 0.13], [0.07, 0.13], [0.095, 0.11], [0.105, 0.04], [0.108, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 18)
  const aba = new THREE.RingGeometry(0.1, 0.23, 28, 2).rotateX(-Math.PI / 2)
  const p = aba.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const r = Math.hypot(x, z)
    if (r > 0.2) {
      const desfia = 1 + (rnd.proximo() - 0.5) * 0.08 // borda desfiada
      p.setXYZ(i, x * desfia, (r - 0.2) * 0.6 + Math.sin(Math.atan2(z, x) * 2) * 0.01, z * desfia) // levantada na borda
    }
  }
  aba.computeVertexNormals()
  const mat = toon(COR.palha, { ...PERSONAGEM, side: THREE.DoubleSide })
  const g = new THREE.Group()
  g.add(new THREE.Mesh(copa, mat), new THREE.Mesh(aba, mat))
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return g
}

// chapeu: false tira o chapéu (decisão do Joabe em 16/10/2026: o neto anda sem chapéu)
// ombros: encolhe a clavícula (1 = como veio do modelo). O modelo tem 36 cm entre os ombros, proporção
// de adulto; um menino de 14 anos fica perto de 33 cm (o Joabe achou largo, 16/10/2026)
// arquivo: outro modelo do neto (o do Tripo, 17/10/2026: uma malha com roupa e rosto pintados na textura)
export async function carregarNeto({ chapeu = false, semRosto = false, ombros = 0.9, folgaCamisa = 0.012, arquivo = null, maosAnimadas = false } = {}) {
  let g
  let liso = false
  if (arquivo) {
    try { g = await carregar(arquivo) } catch (e) { console.warn('Neto: não carregou', arquivo, e); return null }
  } else if (semRosto) {
    try { g = await carregar(ARQUIVO_NETO_SEM_ROSTO); liso = true } catch { console.info('Neto: a versão de rosto liso ainda não existe; uso a normal') }
  }
  if (!g) {
    try { g = await carregar(ARQUIVO_NETO) } catch (e) { console.warn('Neto: não carregou', e); return null }
  }
  const raiz = g.raiz
  const malhas = []
  raiz.traverse((o) => {
    if (!o.isSkinnedMesh) return
    if (arquivo) o.userData.tripo = true // do Tripo: tudo é textura pintada, até os pedaços pequenos
    o.material = materialPara(o)
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
    malhas.push(o)
  })
  if (!malhas.length) return null
  const ossos = ossosPorNome(raiz)
  raiz.updateMatrixWorld(true)
  const cabeca = ossos.get('Head')
  const qCabeca = cabeca.getWorldQuaternion(new THREE.Quaternion())
  const inv = qCabeca.clone().invert()
  // topo da cabeça pela malha (o modelo não tem o osso HeadTop_End): o chapéu senta um pouco abaixo
  const topo = new THREE.Box3().setFromObject(raiz).max.y
  const pc = cabeca.getWorldPosition(new THREE.Vector3())
  if (chapeu) {
    const pivo = new THREE.Object3D()
    pivo.name = 'Chapeu'
    pivo.position.copy(new THREE.Vector3(0, topo - 0.075 - pc.y, 0.0).applyQuaternion(inv))
    cabeca.add(pivo)
    const peca = chapeuDePalha()
    peca.quaternion.copy(inv) // em pé no repouso
    pivo.add(peca)
    ossos.set('Chapeu', pivo)
  }
  if (!maosAnimadas) {
    if (arquivo) relaxarMaosMedindo(ossos)
    else relaxarMaos(ossos)
  }
  apertarCamisa(malhas, folgaCamisa)
  // clavícula mais curta: o braço vem para dentro; o braço volta à escala 1 para não encolher junto
  for (const L of ['Left', 'Right']) {
    const cl = ossos.get(L + 'Shoulder'), br = ossos.get(L + 'Arm')
    if (cl && br && ombros !== 1) { cl.scale.setScalar(ombros); br.scale.setScalar(1 / ombros) }
  }
  raiz.updateMatrixWorld(true)
  // eixos do repouso, no espaço local de cada osso (o animador não pode supor como o modelo foi montado)
  const local = (osso, v) => v.clone().applyQuaternion(osso.getWorldQuaternion(new THREE.Quaternion()).invert())
  const eixos = {
    cabecaFrente: local(cabeca, new THREE.Vector3(0, 0, 1)),
    quadrilEsquerda: local(ossos.get('Hips'), new THREE.Vector3(1, 0, 0)),
    abaChapeu: new THREE.Vector3(-0.17, topo - 0.09 - pc.y, 0.07).applyQuaternion(inv), // aba do lado direito, um pouco à frente
  }
  let ancorasRosto = null
  if (liso) aplainarBoca(malhas)
  if (liso) ancorasRosto = (await ancorasMedidas(cabeca, malhas)) || ancorasDoRosto(raiz, cabeca, malhas)
  return { raiz, ossos, esqueleto: malhas[0].skeleton, malhas, eixos, ancorasRosto }
}

// A manga da camisa sai reta e larga como caixa (sobra ~3,5 cm além do braço no ombro) e alarga a
// silhueta. No repouso, cada vértice da camisa no ombro e na manga que está mais longe da pele do que
// "folga" é puxado para a pele até ficar a "folga" dela. Feito uma vez, nos vértices da malha.
function apertarCamisa(malhas, folga) {
  if (!folga) return
  const camisa = malhas.find((m) => /camisa/i.test(m.material?.name || m.name))
  const pele = malhas.find((m) => /^(Human|base)$/i.test(m.name))
  if (!camisa || !pele) return
  for (const m of [camisa, pele]) { m.updateMatrixWorld(true); m.skeleton.update() }
  const v = new THREE.Vector3()
  // pele do tronco e dos braços, em grade de 3 cm para achar o vizinho mais perto rápido
  const grade = new Map()
  const chave = (x, y, z) => `${Math.floor(x / 0.03)},${Math.floor(y / 0.03)},${Math.floor(z / 0.03)}`
  const pp = pele.geometry.attributes.position
  for (let i = 0; i < pp.count; i++) {
    pele.getVertexPosition(i, v).applyMatrix4(pele.matrixWorld)
    if (v.y < 0.95) continue
    const k = chave(v.x, v.y, v.z)
    if (!grade.has(k)) grade.set(k, [])
    grade.get(k).push(v.clone())
  }
  const perto = (w) => {
    let melhor = null, d = Infinity
    const [cx, cy, cz] = [Math.floor(w.x / 0.03), Math.floor(w.y / 0.03), Math.floor(w.z / 0.03)]
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) for (let c = -2; c <= 2; c++) {
      for (const q of grade.get(`${cx + a},${cy + b},${cz + c}`) || []) { const dd = q.distanceToSquared(w); if (dd < d) { d = dd; melhor = q } }
    }
    return melhor
  }
  const pc = camisa.geometry.attributes.position
  const inv = new THREE.Matrix3().setFromMatrix4(camisa.matrixWorld).invert()
  let n = 0
  for (let i = 0; i < pc.count; i++) {
    const w = camisa.getVertexPosition(i, v).applyMatrix4(camisa.matrixWorld).clone()
    if (w.y < 1.12 || Math.abs(w.x) < 0.11) continue // só ombro e manga
    const q = perto(w)
    if (!q) continue
    const d = w.distanceTo(q)
    if (d <= folga) continue
    const alvo = q.clone().addScaledVector(w.clone().sub(q).normalize(), folga)
    const delta = alvo.sub(w).applyMatrix3(inv)
    pc.setXYZ(i, pc.getX(i) + delta.x, pc.getY(i) + delta.y, pc.getZ(i) + delta.z)
    n++
  }
  pc.needsUpdate = true
  camisa.geometry.computeVertexNormals()
  return n
}

// Rosto liso: os lábios ainda têm volume, e o filtro de quadrinho contorna esse volume (fica uma "lente"
// de nanquim em volta da boca desenhada). Puxa os vértices da boca para a superfície que liga o nariz ao
// queixo, interpolando a frente da pele acima e abaixo da boca. Feito no repouso, nos vértices já
// deformados pelo esqueleto; a mudança volta para a malha original pela derivada de cada vértice.
function aplainarBoca(malhas) {
  const pele = malhas.find((m) => /^(Human|base)$/i.test(m.name)) || malhas.find((m) => !/camisa|calca|short|cabelo|tampao/i.test(m.name))
  if (!pele) return
  // boca (lábios de 1,469 a 1,493, ±3 cm) e cada olho (a amêndoa com as pálpebras, centro em ±3,9 cm)
  const regioes = [
    { x0: -0.044, x1: 0.044, y0: 1.455, y1: 1.508 }, // os cantos da boca vão até ±4 cm
    { x0: 0.008, x1: 0.066, y0: 1.527, y1: 1.584 },
    { x0: -0.066, x1: -0.008, y0: 1.527, y1: 1.584 },
  ].map((r) => aplainar(pele, r))
  pele.geometry.computeVertexNormals()
  // os dois lábios (e as pálpebras) eram peças com vértices separados no mesmo lugar: as normais
  // continuam diferentes e o filtro desenha um vinco. Cada vértice da região recebe a normal média
  // da pele do anel em volta (a região é pequena e quase plana)
  const nor = pele.geometry.attributes.normal
  for (const r of regioes) {
    if (!r) continue
    const m = new THREE.Vector3()
    for (const i of r.anel) m.add(new THREE.Vector3().fromBufferAttribute(nor, i))
    m.normalize()
    for (const i of r.alvo) nor.setXYZ(i, m.x, m.y, m.z)
  }
  nor.needsUpdate = true
  // o globo do olho (pintado de pele) fica atrás da pálpebra fechada: some
  for (const m of malhas) if (/tampao/i.test(m.name)) m.visible = false
}

function aplainar(pele, { x0, x1, y0, y1 }) {
  pele.updateMatrixWorld(true)
  pele.skeleton.update()
  const pos = pele.geometry.attributes.position
  const v = new THREE.Vector3()
  const mundo = (i) => pele.getVertexPosition(i, v).applyMatrix4(pele.matrixWorld).clone()
  const M = 0.008 // anel em volta da região: a pele boa que serve de referência
  const frente = []
  const alvo = []
  const anel = []
  for (let i = 0; i < pos.count; i++) {
    const w = mundo(i)
    if (w.z < 0.06 || w.x < x0 - M || w.x > x1 + M || w.y < y0 - M || w.y > y1 + M) continue // 6 cm: pega a parede de dentro
    const dentroDaCaixa = w.x >= x0 && w.x <= x1 && w.y >= y0 && w.y <= y1
    if (dentroDaCaixa) alvo.push([i, w])
    else if (w.z > 0.11) { frente.push(w); anel.push(i) }
  }
  if (!frente.length || !alvo.length) return null
  const zEm = (x, y) => { // média ponderada da pele do anel, mais peso para a mais perto
    let s = 0, p = 0
    for (const f of frente) { const d = (f.x - x) ** 2 + (f.y - y) ** 2; const k = 1 / (d + 1e-6) ** 2; s += f.z * k; p += k }
    return s / p
  }
  const dentro = new Set()
  for (const [i, w] of alvo) {
    const sup = zEm(w.x, w.y)
    // tudo vai para a superfície: o volume de fora e a parede de dentro (fecha a abertura; abaixo, os
    // triângulos de dentro são virados para fora para pegarem luz como pele)
    if (w.z < sup - 0.004) dentro.add(i)
    const z0 = pos.getZ(i) // quanto o vértice anda no mundo por unidade de z da malha original
    pos.setZ(i, z0 + 0.01)
    const dz = (mundo(i).z - w.z) / 0.01
    pos.setZ(i, z0)
    if (Math.abs(dz) > 0.1) pos.setZ(i, z0 + (sup - w.z) / dz)
  }
  pos.needsUpdate = true
  const idx = pele.geometry.index
  if (idx) {
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
    for (let t = 0; t < idx.count; t += 3) {
      const i0 = idx.getX(t), i1 = idx.getX(t + 1), i2 = idx.getX(t + 2)
      if (!dentro.has(i0) && !dentro.has(i1) && !dentro.has(i2)) continue
      a.copy(mundo(i0)); b.copy(mundo(i1)); c.copy(mundo(i2))
      const n = new THREE.Vector3().crossVectors(b.sub(a), c.sub(a))
      if (n.z < 0) { idx.setX(t + 1, i2); idx.setX(t + 2, i1) }
    }
    idx.needsUpdate = true
  }
  return { anel, alvo: alvo.map(([i]) => i) }
}

// âncoras medidas pela sessão do personagem no próprio modelo (pontos da pele à frente dos olhos e da
// boca, mundo em repouso): arte/finais/neto-mpfb-sem-rosto-ancoras.json
async function ancorasMedidas(cabeca, malhas) {
  try {
    const r = await fetch(daBase('/arte/finais/neto-mpfb-sem-rosto-ancoras.json'))
    if (!r.ok || (r.headers.get('content-type') || '').includes('html')) return null
    const a = await r.json()
    const inv = cabeca.matrixWorld.clone().invert()
    // o olho fica afundado na órbita: o desenho vem 1,2 cm para a frente, senão a testa cobre a sobrancelha
    const local = (p, dz) => new THREE.Vector3(...p).add(new THREE.Vector3(0, 0, dz)).applyMatrix4(inv).toArray()
    // a boca do JSON (y 1,515) caiu na altura do nariz. Medido nos vértices dos lábios do neto-mpfb.glb já
    // deformados pelo esqueleto: centro 7,6 cm abaixo e frente 1,6 cm adiante da superfície do olho
    // (raio contra a malha não serve: o three testa a malha antes da deformação)
    const [, yo, zo] = a.olho_esquerdo.superficie
    // o JSON foi corrigido em 16/10 (vem dos vértices dos lábios); a medida acima fica de reserva
    const boca = yo - a.boca.superficie[1] > 0.05 ? a.boca.superficie : [0, yo - 0.0765, zo + 0.016]
    // a boca desenhada saía acima da linha dos lábios: desce 4 mm para o meio dela
    const bocaAjustada = [boca[0], boca[1] - 0.004, boca[2]]
    return { olho: local(a.olho_esquerdo.superficie, 0.012), boca: local(bocaAjustada, 0.006), tamOlho: 0.042, tamBoca: 0.05, curva: 0.3 }
  } catch { return null }
}

// Mão relaxada: os movimentos vêm do esqueleto padrão, que não tem dedos, e a pose em T deixa a mão
// espalmada e o polegar aberto. Curva cada falange para dentro da palma (mais no mínimo que no
// indicador, como a mão de verdade descansando) e traz o polegar para perto da mão. Fica fixo.
function relaxarMaos(ossos) {
  const curva = { Index: [0.22, 0.32, 0.22], Middle: [0.3, 0.42, 0.28], Ring: [0.38, 0.48, 0.3], Pinky: [0.45, 0.52, 0.32] }
  const giros = []
  for (const [L, s] of [['Left', 1], ['Right', -1]]) {
    // repouso: dedos no eixo X do lado da mão, palma para baixo; dobrar = girar em torno de Z do mundo
    for (const [dedo, angs] of Object.entries(curva)) {
      angs.forEach((a, i) => {
        const o = ossos.get(`${L}Hand${dedo}${i + 1}`)
        if (o) giros.push([o, new THREE.Vector3(0, 0, 1), -s * a])
      })
    }
    const p1 = ossos.get(`${L}HandThumb1`)
    if (p1) giros.push([p1, new THREE.Vector3(0, 1, 0), s * 0.35]) // polegar para junto do indicador
    const p2 = ossos.get(`${L}HandThumb2`)
    if (p2) giros.push([p2, new THREE.Vector3(0, 0, 1), -s * 0.2])
  }
  // eixos locais calculados todos antes de girar qualquer um (girar o pai muda o mundo do filho)
  const locais = giros.map(([o, eixo, a]) => [o, eixo.clone().applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()).invert()), a])
  for (const [o, eixo, a] of locais) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(eixo, a))
}

// Mão relaxada para qualquer modelo: o eixo de dobra de cada dedo sai da própria mão (a direção do dedo e
// a linha que atravessa a palma, do indicador ao mindinho), e o lado da palma é o que fecha a ponta para
// baixo na pose em T. A versão de cima supõe os eixos do MakeHuman; na mão do Tripo dobrava os dedos de
// lado e a mão virava garra (17/10/2026).
function relaxarMaosMedindo(ossos) {
  const curva = { Index: [0.22, 0.32, 0.22], Middle: [0.3, 0.42, 0.28], Ring: [0.38, 0.48, 0.3], Pinky: [0.45, 0.52, 0.32] }
  const P = (o) => o.getWorldPosition(new THREE.Vector3())
  const giros = []
  for (const L of ['Left', 'Right']) {
    const i1 = ossos.get(`${L}HandIndex1`), p1 = ossos.get(`${L}HandPinky1`)
    if (!i1 || !p1) continue
    const atravessa = P(p1).sub(P(i1)).normalize()
    for (const [dedo, angs] of Object.entries(curva)) {
      angs.forEach((a, i) => {
        const o = ossos.get(`${L}Hand${dedo}${i + 1}`)
        const filho = ossos.get(`${L}Hand${dedo}${i + 2}`) || o?.children.find((c) => c.isBone)
        if (!o || !filho) return
        const d = P(filho).sub(P(o)).normalize()
        const eixo = atravessa.clone().addScaledVector(d, -atravessa.dot(d)).normalize()
        // sentido: o que leva a ponta do dedo para baixo (palma para baixo na pose em T)
        const ponta = d.clone().applyAxisAngle(eixo, a)
        giros.push([o, eixo, ponta.y < d.y ? a : -a])
      })
    }
  }
  const locais = giros.map(([o, eixo, a]) => [o, eixo.clone().applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()).invert()), a])
  for (const [o, eixo, a] of locais) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(eixo, a))
}

// Onde desenhar olhos e boca: procura a superfície do rosto (raio vindo da frente) na altura dos olhos
// e da boca, medidas a partir do topo da cabeça; devolve no espaço do osso Head, como rosto.js pede
function ancorasDoRosto(raiz, cabeca, malhas) {
  raiz.updateMatrixWorld(true)
  const topo = cabeca.children.find((o) => /HeadTop/i.test(o.name))?.getWorldPosition(new THREE.Vector3()).y
    ?? new THREE.Box3().setFromObject(raiz).max.y
  const pele = malhas.filter((m) => !/camisa|calca|short|cabelo/i.test(m.material?.name || m.name))
  const ray = new THREE.Raycaster()
  const frente = (x, y) => {
    ray.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1))
    const h = ray.intersectObjects(pele, false)[0]
    return h ? h.point : new THREE.Vector3(x, y, cabeca.getWorldPosition(new THREE.Vector3()).z + 0.09)
  }
  const olho = frente(0.032, topo - 0.11)
  const boca = frente(0, topo - 0.185)
  const inv = cabeca.matrixWorld.clone().invert()
  const local = (p) => p.clone().add(new THREE.Vector3(0, 0, 0.004)).applyMatrix4(inv).toArray() // 4 mm para fora da pele
  return { olho: local(olho), boca: local(boca), tamOlho: 0.05, tamBoca: 0.055, curva: 0.35 }
}
