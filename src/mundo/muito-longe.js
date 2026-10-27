// Camada de muito longe (22/10/2026, docs/desempenho-22-10.md).
//
// Os sistemas com LOD por bloco (terreno, casario, palhoças, árvores) trocam perto e longe bloco a bloco, com blocos de
// 96 a 768 m: de longe sobra um objeto por bloco e por peça. Com o mapa 2,5 vezes maior (o Campo do Urubu em 1:1) eram
// ~700 objetos de longe por quadro na vista da Coluna da Hora, e no WebGPU do three cada objeto custa CPU por quadro.
//
// Aqui os blocos de LOD de um sistema (as "unidades") se juntam em células grandes (cfg.desempenho.muitoLongeTam).
// Quando todas as unidades de uma célula estão longe com folga, a célula troca as malhas de longe delas por uma malha só
// por peça: as mesmas cópias, a mesma geometria e o mesmo material, então o desenho é o mesmo. As unidades ficam
// suspensas (o laço de LOD delas pula). Chegando perto de qualquer unidade, a célula se abre e cada unidade volta ao
// LOD de sempre no mesmo quadro.
//
// Unidade: { x, z, r, longe: [malhas de longe], todas: [todas as malhas dela], distancia(camera), retomar() }
// - (x, z, r): círculo no chão tal que distancia(camera) >= dist2D(camera, (x, z)) - r (a conta rápida da célula);
// - distancia(camera): a mesma medida que o sistema compara com o limite dele;
// - retomar(): volta a unidade ao estado "longe" (a malha de longe à vista) e obriga o laço do sistema a decidir de novo.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { congelar } from './congelar.js'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { registrarCorte, pecaSai } from '../render/corte-tela.js'
import { simplificarPorGrade } from '../render/simplificar.js'

// cfg.desempenho.muitoLonge (liga e desliga ao vivo) e muitoLongeTam (lado da célula, recarregar)
let CFG = null
let TAM = 768
export function definirMuitoLonge(cfg) { CFG = cfg; TAM = cfg?.desempenho?.muitoLongeTam ?? TAM; LOD_COPIAS.ligado = cfg?.desempenho?.lodCopias !== false }
const ligado = () => CFG?.desempenho?.muitoLonge !== false

const _m = new THREE.Matrix4()
const _c = new THREE.Color()

// várias InstancedMesh da mesma geometria e material numa só, cópias na mesma ordem
export function juntarCopias(malhas, nome) {
  const total = malhas.reduce((s, im) => s + im.count, 0)
  const base = malhas[0]
  // geoMuitoLonge: a peça pede uma geometria mais simples para a junta de longe (as caixas das casas, cidade.js)
  const im = new THREE.InstancedMesh(base.userData.geoMuitoLonge || base.geometry, base.material, total)
  const comCor = malhas.some((x) => x.instanceColor)
  let k = 0
  for (const x of malhas) {
    for (let j = 0; j < x.count; j++, k++) {
      x.getMatrixAt(j, _m)
      im.setMatrixAt(k, _m)
      if (comCor) im.setColorAt(k, x.instanceColor ? (x.getColorAt(j, _c), _c) : _c.setRGB(1, 1, 1))
    }
  }
  copiarJeito(base, im, nome)
  return im
}

// várias Mesh do mesmo material (pedaços de terreno) numa geometria só
export function juntarMalhas(malhas, nome) {
  const geos = malhas.map((x) => x.geometry.clone().applyMatrix4(x.matrixWorld))
  const g = mergeGeometries(geos)
  for (const x of geos) x.dispose()
  const m = new THREE.Mesh(g, malhas[0].material)
  copiarJeito(malhas[0], m, nome)
  return m
}

function copiarJeito(de, para, nome) {
  para.name = nome
  para.castShadow = de.castShadow
  para.receiveShadow = de.receiveShadow
  para.renderOrder = de.renderOrder
  para.frustumCulled = de.frustumCulled
  for (const k of ['peso', 'semNormal']) if (de.userData[k] !== undefined) para.userData[k] = de.userData[k]
  para.userData.muitoLonge = true
  para.computeBoundingSphere?.()
  if (!para.isInstancedMesh) para.geometry.computeBoundingSphere()
}

export class MuitoLonge {
  // folga: quanto além do limite do sistema a unidade mais perto precisa estar para a célula se fechar (abre na metade)
  constructor(cena, { nome = 'muito-longe', folga = 40, tam = null } = {}) {
    this.cena = cena
    this.nome = nome
    this.folga = folga
    this.tam = tam ?? TAM
    this.celulas = new Map()
    this.lista = []
    this.montada = false
  }

  adicionar(u) {
    u.suspenso = false
    const ci = Math.floor(u.x / this.tam)
    const cj = Math.floor(u.z / this.tam)
    const k = `${ci},${cj}`
    let c = this.celulas.get(k)
    if (!c) { c = { k, unidades: [], malhas: [], familias: [], junta: false, x: 0, z: 0, r: 0 }; this.celulas.set(k, c); this.lista.push(c) }
    c.unidades.push(u)
  }

  // as malhas juntas de cada célula (uma por geometria e material das malhas de longe), escondidas até a célula fechar
  montar() {
    for (const c of this.lista) {
      c.x = c.unidades.reduce((s, u) => s + u.x, 0) / c.unidades.length
      c.z = c.unidades.reduce((s, u) => s + u.z, 0) / c.unidades.length
      c.r = Math.max(...c.unidades.map((u) => Math.hypot(u.x - c.x, u.z - c.z) + u.r))
      // célula de uma unidade só não ganha nada
      if (c.unidades.length < 2) continue
      const familias = new Map()
      for (const u of c.unidades) {
        for (const m of u.longe) {
          // a mesma geometria e o mesmo material, debaixo do mesmo pai (as matrizes das cópias são do espaço dele)
          const chave = (m.isInstancedMesh ? m.geometry.uuid : 'malha') + ':' + m.material.uuid + ':' + (m.parent?.uuid ?? '')
          if (!familias.has(chave)) familias.set(chave, [])
          familias.get(chave).push(m)
        }
      }
      for (const lista of familias.values()) {
        const nome = `${lista[0].name}-muito-longe`
        const j = lista[0].isInstancedMesh ? juntarCopias(lista, nome) : juntarMalhas(lista, nome)
        j.visible = false
        ;(lista[0].parent || this.cena).add(congelar(j))
        // cópia a cópia (27/10/2026): a peça de longe vira a versão simplificada e a menor que cortePx sai
        // (o material que sorteia pelo gl_InstanceID, como o das casas, não pode ter as cópias reordenadas)
        const f = j.isInstancedMesh && LOD_COPIAS.ligado && !j.material.userData?.usaInstancia ? familiaPorCopia(j) : null
        if (f) { c.familias.push(f); c.malhas.push(...f.desenho) }
        if (j.castShadow) registrarEstatico(j)
        // a célula de miúdos (lampião, vaso, dormente) sai do desenho quando a peça fica menor que cortePx na tela
        // (com o LOD cópia a cópia o corte é por cópia, em distribuir)
        if (j.isInstancedMesh && !f) registrarCorte(j)
        c.malhas.push(j)
      }
    }
    this.montada = true
    return this
  }

  // chamada todo quadro, antes do laço de LOD do sistema; limite = a distância em que o sistema troca perto e longe
  atualizar(camera, limite) {
    if (!this.montada) return
    const px = camera.position.x
    const pz = camera.position.z
    const abrirTodas = !ligado()
    for (const c of this.lista) {
      if (!c.malhas.length) continue
      let junta
      if (abrirTodas) junta = false
      else {
        const corte = limite + (c.junta ? this.folga / 2 : this.folga)
        if (Math.hypot(px - c.x, pz - c.z) - c.r > corte) junta = true
        else {
          junta = true
          for (const u of c.unidades) if (u.distancia(camera) <= corte) { junta = false; break }
        }
      }
      if (junta === c.junta) continue
      c.junta = junta
      for (const f of c.familias) f.mudou = true
      for (const m of c.malhas) m.visible = junta
      for (const u of c.unidades) {
        u.suspenso = junta
        if (junta) for (const m of u.todas) m.visible = false
        else u.retomar()
      }
    }
    this.atualizarCopias(camera)
  }

  // cópia a cópia nas células juntas: só quando a câmera anda 12 m (ou a célula acabou de fechar)
  atualizarCopias(camera) {
    const p = camera.position
    const anda = !this.camCopias || this.camCopias.distanceToSquared(p) > 144 || this.fovCopias !== camera.fov || this.corteCopias !== CFG?.desempenho?.cortePx
    if (anda) { (this.camCopias ||= p.clone()).copy(p); this.fovCopias = camera.fov; this.corteCopias = CFG?.desempenho?.cortePx }
    for (const c of this.lista) {
      if (!c.junta) continue
      for (const f of c.familias) if (anda || f.mudou) { f.mudou = false; distribuir(f, p, camera.fov) }
    }
  }

  stats() {
    let juntas = 0, suspensas = 0
    for (const c of this.lista) if (c.junta) { juntas++; suspensas += c.unidades.length }
    return { celulas: this.lista.length, juntas, unidadesSuspensas: suspensas }
  }
}

// LOD cópia a cópia nas células de muito longe (27/10/2026, perf-governador). A célula de 768 m juntava as cópias
// numa malha só, com a geometria cheia: na vista da Praça do Ferreira eram ~560 mil triângulos de lampião de coluna
// (264 cada) a 0,2-2 km, 440 mil de coqueiro, 250 mil de buganvília. Agora cada família da célula tem três malhas:
//   - a SOMBRA: a junta de sempre (todas as cópias, geometria cheia), só na camada dos parados (sombra-estatica.js);
//     a contagem dela não muda, então o mapa de sombra em cache não é refeito quando a câmera anda;
//   - a CHEIA: as cópias que ainda aparecem grandes na tela (>= LOD_COPIAS.px), geometria cheia, sem sombra;
//   - a SIMPLES: as pequenas, com a geometria simplificada por grade (render/simplificar.js), sem sombra.
// A cópia menor que cortePx sai das duas (corte-tela.js: pecaSai). A grade é tam / LOD_COPIAS.divisoes: na troca,
// um canto anda no máximo ~px/divisoes pixels (na tela de referência de 900 px), e menos quanto mais longe.
// Peça com até LOD_COPIAS.minTri triângulos (a caixa das casas de longe, 52) fica como está.
export const LOD_COPIAS = { ligado: true, px: 48, divisoes: 14, minTri: 64 }
// a mancha das copas de longe (LongeMascarado): a peça menor que px (tela de referência de 900 px) vira a mancha
export const LOD_MANCHA = { ligado: true, px: 28 }
const _manchas = new Map()
// elipsoide de 20 triângulos na caixa da copa (os vértices do terço de cima para cima), com a cor média dela e os
// atributos médios (o vento das árvores lê aVento; aTexAlt = 1, a textura da copa). Peça de cartão (aCentro) não tem
function manchaDe(geo) {
  if (_manchas.has(geo.uuid)) return _manchas.get(geo.uuid)
  let g = null
  const pos = geo.attributes.position
  if (pos && !geo.attributes.aCentro && geo.attributes.normal) {
    if (!geo.boundingBox) geo.computeBoundingBox()
    const bb = geo.boundingBox
    const y0 = bb.min.y + (bb.max.y - bb.min.y) * 0.33
    const mn = new THREE.Vector3(Infinity, Infinity, Infinity), mx = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    const soma = {}
    let n = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < y0) continue
      mn.min(_v3.set(pos.getX(i), y, pos.getZ(i))); mx.max(_v3)
      n++
      for (const nome in geo.attributes) {
        if (nome === 'position' || nome === 'normal') continue
        const at = geo.attributes[nome]
        const s = soma[nome] ||= new Float64Array(at.itemSize)
        for (let e = 0; e < at.itemSize; e++) s[e] += at.getComponent ? at.getComponent(i, e) : at.array[i * at.itemSize + e]
      }
    }
    if (n > 8 && mx.x > mn.x) {
      g = new THREE.IcosahedronGeometry(0.5, 0)
      g = g.index ? g.toNonIndexed() : g
      const c = mn.clone().add(mx).multiplyScalar(0.5)
      const t = mx.clone().sub(mn)
      g.scale(t.x, t.y, t.z).translate(c.x, c.y, c.z)
      g.computeVertexNormals()
      // normal de esfera (suave): a luz da copa vira volume e não facetas
      const p2 = g.attributes.position, n2 = g.attributes.normal
      for (let i = 0; i < p2.count; i++) {
        _v3.set((p2.getX(i) - c.x) / t.x, (p2.getY(i) - c.y) / t.y, (p2.getZ(i) - c.z) / t.z).normalize()
        n2.setXYZ(i, _v3.x, _v3.y, _v3.z)
      }
      for (const nome in soma) {
        const at = geo.attributes[nome]
        const arr = new Float32Array(p2.count * at.itemSize)
        for (let i = 0; i < p2.count; i++) for (let e = 0; e < at.itemSize; e++) arr[i * at.itemSize + e] = soma[nome][e] / n
        g.setAttribute(nome, new THREE.BufferAttribute(arr, at.itemSize))
      }
      if (g.attributes.uv) g.deleteAttribute('uv')
      g.computeBoundingSphere()
    }
  }
  _manchas.set(geo.uuid, g)
  return g
}
const _v3 = new THREE.Vector3()
const _simplificadas = new Map() // geometria.uuid -> geometria simplificada (uma por peça, para todas as células)

function geometriaSimples(geo, tamLocal) {
  let g = _simplificadas.get(geo.uuid)
  if (g === undefined) {
    const nTri = (geo.index ? geo.index.count : geo.attributes.position.count) / 3
    g = null
    if (nTri > LOD_COPIAS.minTri) {
      const s = simplificarPorGrade(geo, tamLocal / LOD_COPIAS.divisoes)
      // não ganhou nada (peça já simples): fica a cheia
      if (s.userData.simplificada.para < nTri * 0.7) g = s
    }
    _simplificadas.set(geo.uuid, g)
  }
  return g
}

function familiaPorCopia(j) {
  if (!j.geometry.boundingBox) j.geometry.computeBoundingBox()
  const bb = j.geometry.boundingBox
  const tamLocal = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z)
  const a = j.instanceMatrix.array
  const n = j.count
  if (!n) return null
  const esc = Math.max(Math.hypot(a[0], a[1], a[2]), Math.hypot(a[4], a[5], a[6]), Math.hypot(a[8], a[9], a[10]))
  const geoS = geometriaSimples(j.geometry, tamLocal)
  const nova = (geo, sufixo) => {
    const m = new THREE.InstancedMesh(geo, j.material, n)
    m.name = j.name + sufixo
    m.castShadow = false
    m.receiveShadow = j.receiveShadow
    m.renderOrder = j.renderOrder
    for (const k of ['peso', 'semNormal']) if (j.userData[k] !== undefined) m.userData[k] = j.userData[k]
    m.userData.muitoLonge = true
    m.userData.contagemViva = true
    m.instanceMatrix.array.set(a)
    if (j.instanceColor) { m.setColorAt(0, _c.setRGB(1, 1, 1)); m.instanceColor.array.set(j.instanceColor.array) }
    m.computeBoundingSphere() // com todas as cópias: cobre a célula
    m.count = 0
    m.visible = false
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    ;(j.parent).add(congelar(m))
    return m
  }
  const cheia = nova(j.geometry, '')
  const simples = geoS ? nova(geoS, '-simples') : null
  // a junta original vira só sombra (camada dos parados); sem sombra, ela some do desenho
  j.layers.disable(0)
  // posição de cada cópia no mundo (a célula está no espaço do pai, congelado)
  j.parent?.updateWorldMatrix(true, false)
  const mw = j.parent ? j.parent.matrixWorld.elements : null
  const xyz = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    let x = a[i * 16 + 12], y = a[i * 16 + 13], z = a[i * 16 + 14]
    if (mw) { const X = mw[0] * x + mw[4] * y + mw[8] * z + mw[12], Y = mw[1] * x + mw[5] * y + mw[9] * z + mw[13], Z = mw[2] * x + mw[6] * y + mw[10] * z + mw[14]; x = X; y = Y; z = Z }
    xyz[i * 3] = x; xyz[i * 3 + 1] = y; xyz[i * 3 + 2] = z
  }
  const escMundo = mw ? Math.hypot(mw[0], mw[1], mw[2]) : 1
  return { j, cheia, simples, desenho: simples ? [cheia, simples] : [cheia], xyz, n, tam: tamLocal * esc * escMundo, mudou: true,
    matrizes: a, cores: j.instanceColor ? j.instanceColor.array : null }
}

// reparte as cópias entre a cheia e a simples (e o corte), pela distância de cada uma
function distribuir(f, p, fov) {
  const k = 450 / Math.tan((fov * Math.PI) / 360) // pixels por metro a 1 m (tela de referência de 900 px)
  const dCheia = (f.tam * k) / LOD_COPIAS.px // até aqui a cópia é grande na tela
  const corteLigado = CFG?.desempenho?.cortePequenos !== false
  const dCorte = corteLigado ? (f.tam * k) / (CFG?.desempenho?.cortePx ?? 3) : Infinity
  const am = f.cheia.instanceMatrix.array, ac = f.cheia.instanceColor?.array
  const bm = f.simples?.instanceMatrix.array, bc = f.simples?.instanceColor?.array
  let nc = 0, ns = 0
  const xyz = f.xyz
  for (let i = 0; i < f.n; i++) {
    const d = Math.hypot(xyz[i * 3] - p.x, xyz[i * 3 + 1] - p.y, xyz[i * 3 + 2] - p.z) - f.tam / 2
    if (d > dCorte) continue
    if (d <= dCheia || !f.simples) {
      am.set(f.matrizes.subarray(i * 16, i * 16 + 16), nc * 16)
      if (ac) ac.set(f.cores.subarray(i * 3, i * 3 + 3), nc * 3)
      nc++
    } else {
      bm.set(f.matrizes.subarray(i * 16, i * 16 + 16), ns * 16)
      if (bc) bc.set(f.cores.subarray(i * 3, i * 3 + 3), ns * 3)
      ns++
    }
  }
  const por = (m, cont) => {
    if (!m) return
    m.count = cont
    if (!cont) return
    m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, cont * 16); m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, cont * 3); m.instanceColor.needsUpdate = true }
  }
  por(f.cheia, nc)
  por(f.simples, ns)
}

// Longe mascarado (22/10/2026): para as espécies de árvore e as palhoças, que têm 3 ou 4 formas (cada forma é uma
// geometria) e poucas cópias espalhadas pelo mapa todo. A junção de blocos (blocos.js) já faz blocos de até 768 m
// para elas, e a célula de muito longe não tinha o que juntar: sobrava um objeto por bloco e por forma (na Coluna da
// Hora, ~260 copas simples de árvore e 36 palhoças por quadro). Aqui a versão de longe de cada forma vira UMA malha
// para o mapa inteiro, e a malha de longe original de cada bloco nunca mais é desenhada. A malha grande guarda só as
// cópias dos blocos que estão "longe", juntas no começo (count = quantas): quem está perto não passa nem pelo vértice.
// Mesmas cópias, geometria e material: o desenho é o mesmo (a ordem das cópias não muda nada num material opaco).
// Unidade: { longe: [malhas de longe] }; o sistema chama mostrar(u, sim) onde antes fazia u.longe[i].visible = sim,
// e aplicar() depois do laço (refaz as famílias que mudaram).

export class LongeMascarado {
  constructor({ nome = 'longe-mascarado' } = {}) {
    this.nome = nome
    this.unidades = []
    this.malhas = []
    this.familias = []
    this.sujas = new Set()
    this.montada = false
    this.ligadoAntes = null
    this.cameraAntes = null
    this.corteAntes = null
  }

  adicionar(u) { u.visivelLonge = false; this.unidades.push(u) }

  montar() {
    const familias = new Map()
    for (const u of this.unidades) {
      u.faixas = []
      for (const m of u.longe) {
        const chave = m.geometry.uuid + ':' + m.material.uuid + ':' + (m.parent?.uuid ?? '')
        if (!familias.has(chave)) familias.set(chave, { lista: [], faixas: [], total: 0 })
        const f = familias.get(chave)
        const fx = { f, u, inicio: f.total, n: m.count }
        u.faixas.push(fx)
        f.faixas.push(fx)
        f.lista.push(m)
        f.total += m.count
      }
    }
    for (const f of familias.values()) {
      const j = juntarCopias(f.lista, `${f.lista[0].name}-mascarado`)
      j.computeBoundingSphere() // com todas as cópias: a esfera cobre o mapa
      j.frustumCulled = false
      f.malha = j
      f.matrizes = j.instanceMatrix.array.slice() // todas as cópias, na ordem das faixas
      f.cores = j.instanceColor ? j.instanceColor.array.slice() : null
      // corte por tamanho na tela (render/corte-tela.js) por faixa: o tamanho da peça (uma cópia) e o círculo das
      // cópias de cada faixa; a faixa que fica menor que cortePx some da malha grande
      if (!j.geometry.boundingBox) j.geometry.computeBoundingBox()
      const bb = j.geometry.boundingBox
      const a = f.matrizes
      const esc = a.length ? Math.max(Math.hypot(a[0], a[1], a[2]), Math.hypot(a[4], a[5], a[6]), Math.hypot(a[8], a[9], a[10])) : 1
      f.tam = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) * esc
      for (const fx of f.faixas) {
        let x = 0, y = 0, z = 0
        for (let i = fx.inicio; i < fx.inicio + fx.n; i++) { x += a[i * 16 + 12]; y += a[i * 16 + 13]; z += a[i * 16 + 14] }
        const n = Math.max(1, fx.n)
        fx.cx = x / n; fx.cy = y / n; fx.cz = z / n
        let r = 0
        for (let i = fx.inicio; i < fx.inicio + fx.n; i++) r = Math.max(r, Math.hypot(a[i * 16 + 12] - fx.cx, a[i * 16 + 13] - fx.cy, a[i * 16 + 14] - fx.cz))
        fx.r = r + f.tam / 2
        fx.cortada = false
      }
      // a mancha (27/10/2026): a copa de longe a mais de LOD_MANCHA.px vira um elipsoide de 20 triângulos com a cor
      // média da copa (impostor geométrico; a cópia continua tendo posição, escala e tinta próprias)
      const geoM = LOD_MANCHA.ligado ? manchaDe(j.geometry) : null
      if (geoM) {
        const b = new THREE.InstancedMesh(geoM, j.material, f.total)
        copiarJeito(j, b, `${j.name}-mancha`)
        b.castShadow = false // além de ~300 m: fora do mapa de sombra de longe (346 m em volta da câmera)
        b.frustumCulled = false
        if (j.instanceColor) { b.setColorAt(0, _c.setRGB(1, 1, 1)) }
        b.count = 0
        b.userData.contagemViva = true
        f.mancha = b
      }
      j.userData.semAssinatura = true // as cópias que vão para a mancha estão longe do mapa de sombra
      j.count = 0 // nada à vista até o sistema dizer quem está longe
      j.userData.contagemViva = true // o count é o de verdade: o WebGPU não troca o resto por escala zero (renderizador.js)
      ;(f.lista[0].parent).add(congelar(j))
      if (j.castShadow) registrarEstatico(j)
      this.malhas.push(j)
      if (f.mancha) { f.lista[0].parent.add(congelar(f.mancha)); this.malhas.push(f.mancha) }
      this.familias.push(f)
    }
    this.montada = true
    return this
  }

  // a unidade passa a mostrar (ou não) a versão de longe; vale no aplicar()
  mostrar(u, sim) {
    if (u.visivelLonge === sim) return
    u.visivelLonge = sim
    if (!this.montada || !ligado()) { for (const m of u.longe) m.visible = sim; return }
    for (const fx of u.faixas) this.sujas.add(fx.f)
  }

  // junta no começo da malha grande as cópias das unidades à vista, nas famílias que mudaram
  aplicar() {
    for (const f of this.sujas) {
      const a = f.malha.instanceMatrix.array
      const c = f.cores ? f.malha.instanceColor.array : null
      const am = f.mancha?.instanceMatrix.array
      const cm = f.cores && f.mancha ? f.mancha.instanceColor.array : null
      let k = 0, km = 0
      for (const fx of f.faixas) {
        if (!fx.u.visivelLonge || fx.cortada) continue
        if (fx.mancha && f.mancha) {
          am.set(f.matrizes.subarray(fx.inicio * 16, (fx.inicio + fx.n) * 16), km * 16)
          if (cm) cm.set(f.cores.subarray(fx.inicio * 3, (fx.inicio + fx.n) * 3), km * 3)
          km += fx.n
          continue
        }
        a.set(f.matrizes.subarray(fx.inicio * 16, (fx.inicio + fx.n) * 16), k * 16)
        if (c) c.set(f.cores.subarray(fx.inicio * 3, (fx.inicio + fx.n) * 3), k * 3)
        k += fx.n
      }
      f.malha.count = k
      f.malha.instanceMatrix.needsUpdate = true
      if (c) f.malha.instanceColor.needsUpdate = true
      if (f.mancha) {
        f.mancha.count = km
        f.mancha.instanceMatrix.needsUpdate = true
        if (cm) f.mancha.instanceColor.needsUpdate = true
      }
    }
    this.sujas.clear()
  }

  // corte por tamanho na tela, por faixa (só refaz a conta quando a câmera anda 8 m ou o painel muda): a faixa que
  // muda de lado suja a família, e o aplicar() do mesmo quadro refaz a malha
  cortar(camera) {
    const d = CFG?.desempenho
    const chave = d ? `${d.cortePequenos !== false}:${d.cortePx}:${camera.fov}` : ''
    const p = camera.position
    if (chave === this.corteAntes && this.cameraAntes && this.cameraAntes.distanceToSquared(p) < 64) return
    this.corteAntes = chave
    ;(this.cameraAntes ||= p.clone()).copy(p)
    for (const f of this.familias) {
      for (const fx of f.faixas) {
        const dist = Math.hypot(p.x - fx.cx, p.y - fx.cy, p.z - fx.cz) - fx.r
        const corta = pecaSai(f.tam, dist, camera.fov, CFG)
        const mancha = !!f.mancha && dist > 1 && (f.tam * 450 / Math.tan((camera.fov * Math.PI) / 360)) / dist < LOD_MANCHA.px
        if (corta === fx.cortada && mancha === !!fx.mancha) continue
        fx.cortada = corta
        fx.mancha = mancha
        if (fx.u.visivelLonge) this.sujas.add(f)
      }
    }
  }

  // todo quadro, antes do laço: a chave do painel (cfg.desempenho.muitoLonge) troca ao vivo entre a malha grande e as
  // de sempre; com a câmera, o corte por tamanho na tela
  atualizar(camera = null) {
    if (!this.montada) return
    if (camera && ligado()) this.cortar(camera)
    const lig = ligado()
    if (lig === this.ligadoAntes) return
    this.ligadoAntes = lig
    for (const j of this.malhas) j.visible = lig
    for (const u of this.unidades) for (const m of u.longe) m.visible = lig ? false : u.visivelLonge
    if (lig) for (const f of this.familias) this.sujas.add(f)
    this.aplicar()
  }
}
