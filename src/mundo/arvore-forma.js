// Forma das árvores pintadas (21/10/2026): o jeito padrão de fazer árvore estilizada "pintada".
// Cada espécie (especies.js) monta uma ESTRUTURA (galhos com afinamento e forquilhas, cachos de folhagem e o volume
// da copa) e daqui saem três malhas indexadas com a mesma estrutura:
//   corpo  : tronco, galhos e cachos. A normal do cacho é puxada para a normal do VOLUME da copa (esfera achatada),
//            então a luz lê a copa inteira como uma massa macia pintada, não como bolas facetadas. A cor por vértice
//            já vem pintada: topo quente e claro, baixo frio e escuro, miolo mais fundo (oclusão), variação por cacho
//   longe  : o mesmo, com menos polígonos e o cacho um pouco maior (substitui os cartões de longe)
//   cartões: quadrados com a textura do ramo de folhas (folha-textura.js), na casca de cada cacho, que no shader
//            viram para a câmera (vento-arvores.js): quebram a silhueta e dão o detalhe do meio. A normal é a do
//            volume da copa; a posição guardada (fixa) serve à sombra
// Atributo aVento (vec4) em todo vértice: x = quanto a altura dobra com o vento (0 no pé), y = peso do galho
// (0 no tronco, 1 no cacho), z = fase do galho/cacho, w = folha que tremula (1 no cartão).

import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ruido } from './mapa.js'
import { cantoQuadrante } from './folha-textura.js'

export const V = (x, y, z) => new THREE.Vector3(x, y, z)
const CORPO = { position: 3, normal: 3, color: 3, aVento: 4, aTexAlt: 1 }
const CARTOES = { position: 3, normal: 3, color: 3, uv: 2, aVento: 4, aCentro: 3, aCanto: 3 }

// acumulador de malha indexada
export class Malha {
  constructor(attrs) {
    this.attrs = Object.entries(attrs).map(([k, n]) => ({ k, n, v: [] }))
    this.idx = []
    this.nv = 0
  }
  vert(d) {
    for (const a of this.attrs) { const x = d[a.k]; for (let i = 0; i < a.n; i++) a.v.push(x[i]) }
    return this.nv++
  }
  tri(a, b, c) { this.idx.push(a, b, c) }
  // juntos: atributos que vão num buffer só (o WebGPU aceita no máximo 8 buffers de vértice por desenho, e as
  // matrizes e a cor das cópias já usam dois)
  geometria(juntos = []) {
    const g = new THREE.BufferGeometry()
    for (const a of this.attrs) if (!juntos.includes(a.k)) g.setAttribute(a.k, new THREE.Float32BufferAttribute(a.v, a.n))
    if (juntos.length) {
      const as = juntos.map((k) => this.attrs.find((a) => a.k === k))
      const passo = as.reduce((t, a) => t + a.n, 0)
      const dados = new Float32Array(passo * this.nv)
      for (let i = 0; i < this.nv; i++) {
        let o = i * passo
        for (const a of as) for (let j = 0; j < a.n; j++) dados[o++] = a.v[i * a.n + j]
      }
      const buf = new THREE.InterleavedBuffer(dados, passo)
      let desl = 0
      for (const a of as) { g.setAttribute(a.k, new THREE.InterleavedBufferAttribute(buf, a.n, desl)); desl += a.n }
    }
    g.setIndex(this.idx)
    g.computeBoundingSphere()
    g.computeBoundingBox()
    return g
  }
}

const sm = THREE.MathUtils.smoothstep
const cor = new THREE.Color()
const tmp = new THREE.Vector3()

// estrutura vazia; opcoes = { pal: { luz, meio, sombra, casca, acento? }, cartao: { tam, quadrantes, dens }, esfera, oclusao }
export function novaEstrutura(rnd, opcoes) {
  const pal = {}
  for (const [k, v] of Object.entries(opcoes.pal)) pal[k] = new THREE.Color(v)
  // variação por árvore desde a semente: um pouco mais amarela ou mais azulada, mais clara ou mais escura
  const mat = rnd.entre(-1, 1)
  const val = rnd.entre(0.93, 1.06)
  for (const k of ['luz', 'meio', 'sombra']) pal[k].offsetHSL(mat * 0.018, mat * 0.03, 0).multiplyScalar(val)
  return { rnd, pal, galhos: [], cachos: [], H: 1, copa: null, esfera: 0.72, oclusao: 0.88, cartao: { tam: 0.9, quadrantes: [0], dens: 0.6 }, ...opcoes, pal: pal }
}

// galho curvo: de "origem" na direção "dir", com curva para cima (sobe) e caída na ponta (cai); devolve os pontos
export function galho(est, origem, dir, comp, r0, r1, { sobe = 0.2, cai = 0, torce = 0.25, peso0 = 0, peso1 = 1, fase = 0, raiz = false, casca = null, n = 4 } = {}) {
  const rnd = est.rnd
  const pts = [origem.clone()]
  const d = dir.clone().normalize()
  const p = origem.clone()
  for (let i = 1; i <= n; i++) {
    const t = i / n
    d.x += rnd.entre(-torce, torce); d.z += rnd.entre(-torce, torce); d.y += rnd.entre(-torce, torce) * 0.5
    d.y += sobe / n - cai * t * t / n * 2
    d.normalize()
    p.addScaledVector(d, comp / n)
    pts.push(p.clone())
  }
  est.galhos.push({ pts, r0, r1, peso0, peso1, fase, raiz, casca })
  return pts
}

// galho por uma lista de pontos dada (raiz-escora do mangue, estipe da carnaúba)
// escamas = { ate, passo }: as bases das folhas velhas em espiral no pé do estipe (carnaúba), em relevo baixo no
// próprio tubo até a fração "ate" do comprimento, uma volta a cada "passo" metros
export function galhoPts(est, pts, r0, r1, { peso0 = 0, peso1 = 1, fase = 0, raiz = false, casca = null, escamas = null } = {}) {
  est.galhos.push({ pts: pts.map((p) => p.clone()), r0, r1, peso0, peso1, fase, raiz, casca, escamas })
  return pts
}

// junta uma geometria qualquer à malha, com uma cor só e o mesmo vento (escamas da carnaúba)
export function anexar(est, m, geo, hex, { peso = 0, fase = 0, texAlt = 0 } = {}) {
  const g = geo.index ? geo : mergeVertices(geo)
  if (!g.attributes.normal) g.computeVertexNormals()
  const p = g.attributes.position
  const n = g.attributes.normal
  const c = new THREE.Color(hex)
  const base = m.nv
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    m.vert({ position: [p.getX(i), y, p.getZ(i)], normal: [n.getX(i), n.getY(i), n.getZ(i)], color: [c.r, c.g, c.b], aVento: [flex(est, y), peso, fase, 0], aTexAlt: [texAlt] })
  }
  const ix = g.index.array
  for (let i = 0; i < ix.length; i += 3) m.tri(base + ix[i], base + ix[i + 1], base + ix[i + 2])
}

// cacho de folhagem: centro, raio, achatado embaixo; topo = cor de acento (folha nova, flor, fruto)
export function cacho(est, centro, raio, { fase = 0, peso = 1, achatar = 0.8, topo = null, forca = 0.38 } = {}) {
  est.cachos.push({ centro: centro.clone(), raio, fase, peso, achatar, topo, forca, semente: est.rnd.entre(0, 100), tom: est.rnd.entre(0.92, 1.08) })
}

// volume da copa: a caixa dos cachos, um pouco folgada
export function fecharCopa(est) {
  const box = new THREE.Box3()
  for (const c of est.cachos) box.union(new THREE.Box3(tmp.copy(c.centro).subScalar(c.raio), c.centro.clone().addScalar(c.raio)))
  const c = box.getCenter(new THREE.Vector3())
  const r = box.getSize(new THREE.Vector3()).multiplyScalar(0.5)
  est.copa = { c, r: r.max(V(0.3, 0.3, 0.3)) }
  est.H = Math.max(box.max.y, 0.5)
  return est
}

function normalCopa(est, p, alvo = new THREE.Vector3()) {
  const { c, r } = est.copa
  return alvo.set((p.x - c.x) / (r.x * r.x), (p.y - c.y) / (r.y * r.y), (p.z - c.z) / (r.z * r.z)).normalize()
}

// cor pintada de um ponto da folhagem
function corFolha(est, p, k, saida) {
  const { c, r } = est.copa
  const ny = normalCopa(est, p, tmp).y
  const quebra = ruido(p.x * 0.8 + k.semente, p.y * 0.8, p.z * 0.8) * 0.28 // borda das manchas pintada, não reta
  const t = sm(ny + quebra, -0.75, 0.85)
  const pal = est.pal
  if (t < 0.5) saida.copy(pal.sombra).lerp(pal.meio, t * 2)
  else saida.copy(pal.meio).lerp(pal.luz, (t - 0.5) * 2)
  // miolo da copa mais fundo: a luz não entra
  const d = Math.hypot((p.x - c.x) / r.x, (p.y - c.y) / r.y, (p.z - c.z) / r.z)
  saida.multiplyScalar((est.oclusao + (1 - est.oclusao) * sm(d, 0.3, 1.0)) * k.tom)
  if (k.topo && ny > 0.35 && ruido(p.x * 2.1 + k.semente, p.z * 2.1, k.semente) > 0.15) saida.lerp(k.topo, 0.55)
  return saida
}

// quanto o ponto dobra com o vento, em fração de uma árvore de 8 m: arbusto baixo balança pouco, palmeira alta muito
const flex = (est, y) => Math.pow(Math.min(Math.max(y / est.H, 0), 1.2), 1.5) * Math.min(est.H, 14) / 8

// tronco e galhos como tubos de anéis afinando, casca com veios e manchas, pé alargado em raízes
function tubos(est, m, longe) {
  for (const g of est.galhos) {
    const curva = new THREE.CatmullRomCurve3(g.pts)
    const comp = curva.getLength()
    const esc = !longe && g.escamas
    const seg = Math.max(2, Math.ceil(comp / (longe ? 1.3 : 0.45)) + (esc ? Math.ceil((comp * esc.ate) / (esc.passo / 5)) : 0))
    const rm = (g.r0 + g.r1) / 2
    const lados = longe ? (rm > 0.2 ? 5 : rm > 0.08 ? 4 : 3) : (rm > 0.25 ? 10 : rm > 0.1 ? 7 : 5)
    const quadros = curva.computeFrenetFrames(seg, false)
    const casca = g.casca ? new THREE.Color(g.casca) : est.pal.casca
    const base = m.nv
    for (let i = 0; i <= seg; i++) {
      const t = i / seg
      const p = curva.getPointAt(t)
      const N = quadros.normals[i]
      const B = quadros.binormals[i]
      let r = g.r0 + (g.r1 - g.r0) * Math.pow(t, 0.8)
      for (let j = 0; j < lados; j++) {
        const a = (j / lados) * Math.PI * 2
        const n = N.clone().multiplyScalar(Math.cos(a)).addScaledVector(B, Math.sin(a))
        let rr = r
        if (g.raiz && t < 0.14) rr *= 1 + 0.7 * Math.pow(1 - t / 0.14, 2) * (0.45 + 0.55 * Math.max(0, Math.cos(a * 5 + 0.7)))
        // escama em espiral: anel inclinado que sobe com o ângulo, mais alto embaixo e sumindo em cima
        let sulco = 0
        if (esc && t < esc.ate) {
          const fase = ((t * comp) / esc.passo + a / (Math.PI * 2)) % 1
          sulco = (1 - t / esc.ate) * Math.pow(Math.sin(fase * Math.PI), 2)
          rr *= 1 + 0.16 * sulco
        }
        const v = p.clone().addScaledVector(n, rr)
        // veios: listras ao longo do tronco, manchas grandes e o lado de cima mais claro
        const veio = ruido(Math.cos(a) * 2.2 + g.r0 * 9, v.y * 0.35, Math.sin(a) * 2.2)
        const mancha = ruido(v.x * 0.9, v.y * 0.7, v.z * 0.9)
        cor.copy(casca).multiplyScalar((0.86 + 0.22 * veio + 0.12 * mancha) * (1 + 0.1 * n.y) * (v.y < 0.5 ? 0.82 + 0.36 * v.y : 1) * (esc ? 0.86 + 0.2 * sulco : 1))
        m.vert({ position: [v.x, v.y, v.z], normal: [n.x, n.y, n.z], color: [cor.r, cor.g, cor.b], aVento: [flex(est, v.y), g.peso0 + (g.peso1 - g.peso0) * t, g.fase, 0], aTexAlt: [0] })
      }
    }
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < lados; j++) {
        const a = base + i * lados + j
        const b = base + i * lados + ((j + 1) % lados)
        const c = a + lados
        const d = b + lados
        m.tri(a, b, c); m.tri(b, d, c)
      }
    }
  }
}

// cachos: icosaedro amassado pelo ruído, base mais reta, normal puxada para a da copa
function cachos(est, m, longe) {
  const nC = new THREE.Vector3()
  for (const k of est.cachos) {
    const raio = k.raio * (longe ? 1.07 : 1)
    const det = longe ? 0 : (raio > 1.3 ? 2 : 1)
    let g = new THREE.IcosahedronGeometry(raio, det)
    g.deleteAttribute('normal'); g.deleteAttribute('uv')
    g = mergeVertices(g)
    const p = g.attributes.position
    const v = new THREE.Vector3()
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      const kk = 1 + ruido(v.x * 1.1 + k.semente, v.y * 1.1 + k.semente * 0.3, v.z * 1.1) * k.forca * 1.3
      v.multiplyScalar(kk)
      v.y *= k.achatar
      if (v.y < -raio * 0.25) v.y = -raio * 0.25 + (v.y + raio * 0.25) * 0.35
      p.setXYZ(i, v.x + k.centro.x, v.y + k.centro.y, v.z + k.centro.z)
    }
    g.computeVertexNormals()
    const n = g.attributes.normal
    const base = m.nv
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i)
      normalCopa(est, v, nC)
      const nl = new THREE.Vector3().fromBufferAttribute(n, i).lerp(nC, est.esfera).normalize()
      corFolha(est, v, k, cor)
      m.vert({ position: [v.x, v.y, v.z], normal: [nl.x, nl.y, nl.z], color: [cor.r, cor.g, cor.b], aVento: [flex(est, v.y), k.peso, k.fase, 0], aTexAlt: [1] })
    }
    const ix = g.index.array
    for (let i = 0; i < ix.length; i += 3) m.tri(base + ix[i], base + ix[i + 1], base + ix[i + 2])
  }
}

// cartões de folha na casca de cada cacho (mais do lado de fora da copa que do miolo)
function cartoes(est, m) {
  const rnd = est.rnd
  const { tam, quadrantes, dens } = est.cartao
  const nC = new THREE.Vector3()
  const T = new THREE.Vector3()
  const B = new THREE.Vector3()
  for (const k of est.cachos) {
    normalCopa(est, k.centro, nC)
    const fora = nC.clone()
    const n = dens > 0 ? Math.max(3, Math.round(dens * 4 * Math.PI * k.raio * k.raio / (tam * tam))) : 0
    for (let i = 0; i < n; i++) {
      const u = V(rnd.entre(-1, 1), rnd.entre(-1, 1), rnd.entre(-1, 1)).normalize()
      if (u.dot(fora) < -0.3) u.addScaledVector(fora, 0.9).normalize()
      const c = k.centro.clone().addScaledVector(u, k.raio * rnd.entre(0.78, 1.18) * V(1, k.achatar, 1).dot(V(u.x * u.x, u.y * u.y, u.z * u.z)) ** 0.5)
      const nn = u.clone().lerp(normalCopa(est, c, tmp), est.esfera).normalize()
      corFolha(est, c, k, cor)
      // manchas de sol dentro da copa: alguns ramos do lado de fora e de cima pegam luz direta e acendem quente
      if (normalCopa(est, c, tmp).y > -0.15 && rnd.chance(0.2)) cor.lerp(est.pal.luz, 0.55)
      const s = tam * rnd.entre(0.75, 1.25) / 2
      const giro = rnd.entre(0, Math.PI * 2)
      const cs = Math.cos(giro) * s
      const sn = Math.sin(giro) * s
      T.crossVectors(nn, Math.abs(nn.y) > 0.9 ? V(1, 0, 0) : V(0, 1, 0)).normalize()
      B.crossVectors(nn, T)
      const [u0, v0] = cantoQuadrante(rnd.escolha(quadrantes))
      const fase = k.fase + rnd.entre(-0.4, 0.4)
      const base = m.nv
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = sx * cs - sy * sn
        const cy = sx * sn + sy * cs
        const pf = c.clone().addScaledVector(T, cx).addScaledVector(B, cy)
        m.vert({ position: [pf.x, pf.y, pf.z], normal: [nn.x, nn.y, nn.z], color: [cor.r, cor.g, cor.b], uv: [u0 + (sx + 1) * 0.25, v0 + (sy + 1) * 0.25],
          aVento: [flex(est, c.y), Math.max(k.peso, 0.85), fase, 1], aCentro: [c.x, c.y, c.z], aCanto: [cx, cy, 1] })
      }
      m.tri(base, base + 1, base + 2); m.tri(base, base + 2, base + 3)
    }
  }
}

// as três malhas da estrutura; "extra(m)" acrescenta peças próprias da espécie nos cartões (o leque da carnaúba)
// extraCartoesLonge: uma versão simples dessas peças para longe (onde a espécie não pode ficar sem elas)
export function montar(est, { extraCorpo = null, extraCartoes = null, extraCartoesLonge = null } = {}) {
  if (!est.copa) fecharCopa(est)
  const corpo = new Malha(CORPO)
  const longe = new Malha(CORPO)
  const cart = new Malha(CARTOES)
  tubos(est, corpo, false); cachos(est, corpo, false)
  tubos(est, longe, true); cachos(est, longe, true)
  if (extraCorpo) { extraCorpo(corpo, false); extraCorpo(longe, true) }
  cartoes(est, cart)
  if (extraCartoes) extraCartoes(cart)
  const pecas = { corpo: corpo.geometria(), longe: longe.geometria(), cartoes: cart.nv ? cart.geometria(['aCentro', 'aCanto']) : null }
  if (extraCartoesLonge) {
    const cl = new Malha(CARTOES)
    extraCartoesLonge(cl)
    pecas.cartoesLonge = cl.geometria(['aCentro', 'aCanto'])
  }
  return pecas
}

export { CORPO, CARTOES, normalCopa, flex, corFolha }
