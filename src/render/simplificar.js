// Simplificação por grade (27/10/2026, perf-governador): a versão de longe de uma peça, feita no carregamento a partir
// da própria geometria. Agrupamento de vértices (vertex clustering): cada vértice cai numa célula de `grade` (no espaço
// da peça); a célula vira um ponto só (a média dos vértices dela), o triângulo que fica com dois cantos na mesma célula
// some e os repetidos também. Tudo o mais (cor, normal, uv, atributos próprios) vem do vértice original de cada canto.
// O(n), sem dependência. O que é mais fino que a grade (a haste do lampião, um galho) some: de longe ele já é menos
// de um pixel. Sai sem índice.
import * as THREE from 'three'

export function simplificarPorGrade(geo, grade) {
  const pos = geo.attributes.position
  const idx = geo.index
  const nTri = (idx ? idx.count : pos.count) / 3
  const v = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k)
  const inv = 1 / grade
  const chaveDe = new Int32Array(pos.count)
  const celulas = new Map() // chave -> índice da célula
  const soma = []
  for (let i = 0; i < pos.count; i++) {
    const x = Math.floor(pos.getX(i) * inv), y = Math.floor(pos.getY(i) * inv), z = Math.floor(pos.getZ(i) * inv)
    const k = `${x},${y},${z}`
    let c = celulas.get(k)
    if (c === undefined) { c = celulas.size; celulas.set(k, c); soma.push(0, 0, 0, 0) }
    chaveDe[i] = c
    soma[c * 4] += pos.getX(i); soma[c * 4 + 1] += pos.getY(i); soma[c * 4 + 2] += pos.getZ(i); soma[c * 4 + 3]++
  }
  const ficam = []
  const vistos = new Set()
  for (let t = 0; t < nTri; t++) {
    const a = v(t, 0), b = v(t, 1), c = v(t, 2)
    const ca = chaveDe[a], cb = chaveDe[b], cc = chaveDe[c]
    if (ca === cb || cb === cc || ca === cc) continue
    // o mesmo triângulo (mesmas células, mesma volta) só uma vez; a volta contrária é a outra face e fica
    const m = Math.min(ca, cb, cc)
    const k = m === ca ? `${ca},${cb},${cc}` : m === cb ? `${cb},${cc},${ca}` : `${cc},${ca},${cb}`
    if (vistos.has(k)) continue
    vistos.add(k)
    ficam.push(a, b, c)
  }
  const out = new THREE.BufferGeometry()
  for (const nome in geo.attributes) {
    const at = geo.attributes[nome]
    const n = at.itemSize
    const arr = new (at.isInterleavedBufferAttribute ? at.data.array : at.array).constructor(ficam.length * n)
    for (let j = 0; j < ficam.length; j++) {
      const i = ficam[j]
      if (nome === 'position') {
        const c = chaveDe[i]
        const q = soma[c * 4 + 3]
        arr[j * 3] = soma[c * 4] / q; arr[j * 3 + 1] = soma[c * 4 + 1] / q; arr[j * 3 + 2] = soma[c * 4 + 2] / q
      } else {
        if (at.isInterleavedBufferAttribute) {
          const d = at.data
          for (let e = 0; e < n; e++) arr[j * n + e] = d.array[i * d.stride + at.offset + e]
        } else {
          for (let e = 0; e < n; e++) arr[j * n + e] = at.array[i * n + e]
        }
      }
    }
    out.setAttribute(nome, new THREE.BufferAttribute(arr, n, at.normalized))
  }
  out.computeBoundingBox()
  out.computeBoundingSphere()
  out.userData.simplificada = { de: nTri, para: ficam.length / 3, grade }
  return out
}

// Sombra leve (27/10/2026, perf-governador): gente animada (o neto, o avô, os atores) projeta sombra todo quadro, nos
// dois mapas (o de perto e o passe dinâmico do sol), com a malha cheia: o corpo do neto sozinho eram ~150 mil
// triângulos no desenho e ~230 mil nos mapas de sombra. Aqui a malha ganha uma versão por grade (tam / divisoes; com 24,
// ~7,5 cm num corpo de 1,8 m, perto do texel de 4,7 cm do mapa de perto) e só durante o desenho das sombras a
// geometria é trocada pela leve. Esqueleto, cópias e material ficam: o three só desenha outra geometria.
const leves = new Set()
const _cacheLeve = new Map()

export function registrarSombraLeve(o, divisoes = 24) {
  const g = o.geometry
  if (!g || !g.attributes?.position || o.userData.sombraLeve !== undefined) return false
  if (g.morphAttributes && Object.keys(g.morphAttributes).length) { o.userData.sombraLeve = null; return false }
  let s = _cacheLeve.get(g.uuid)
  if (s === undefined) {
    if (!g.boundingBox) g.computeBoundingBox()
    const b = g.boundingBox
    const tam = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z)
    const nTri = (g.index ? g.index.count : g.attributes.position.count) / 3
    s = tam > 0 ? simplificarPorGrade(g, tam / divisoes) : null
    if (s && s.userData.simplificada.para > nTri * 0.7) s = null // não ganhou o bastante
    if (s) { s.boundingSphere = g.boundingSphere?.clone() ?? s.boundingSphere; s.boundingBox = g.boundingBox.clone() }
    _cacheLeve.set(g.uuid, s)
  }
  o.userData.sombraLeve = s
  if (s) leves.add(o)
  return !!s
}

// procura gente animada com sombra (SkinnedMesh de mais de minTri triângulos) e registra, uma malha por vez, no tempo
// ocioso do navegador (cada uma custa ~5-20 ms para simplificar: no quadro viraria travada)
export function procurarSombraLeve(raiz, { minTri = 2500, divisoes = 24 } = {}) {
  const fila = []
  raiz.traverse((o) => {
    if (!o.isSkinnedMesh || !o.castShadow || o.userData.sombraLeve !== undefined) return
    const g = o.geometry
    const nTri = (g.index ? g.index.count : g.attributes.position.count) / 3
    if (nTri >= minTri) fila.push(o)
  })
  // com timeout: com o laço de quadros sempre ocupado o navegador pode nunca ficar ocioso; uma malha por vez no mínimo
  const ocioso = globalThis.requestIdleCallback ? (f) => globalThis.requestIdleCallback(f, { timeout: 1000 }) : (f) => setTimeout(() => f({ timeRemaining: () => 0 }), 30)
  const passo = (prazo) => {
    do registrarSombraLeve(fila.shift(), divisoes)
    while (fila.length && prazo.timeRemaining() > 20)
    if (fila.length) ocioso(passo)
  }
  if (fila.length) ocioso(passo)
  return fila.length
}

let ligadaLeve = true
export function sombraLeveLigada(sim) { ligadaLeve = sim }
export function statsSombraLeve() { return { malhas: leves.size } }

// troca a geometria das malhas leves só enquanto o three desenha as sombras
export function instalarSombraLeve(renderer) {
  const sm = renderer.shadowMap
  if (!sm || sm.__sombraLeve) return
  const original = sm.render
  sm.render = function (...args) {
    if (!ligadaLeve || !leves.size) return original.apply(this, args)
    const trocadas = []
    for (const o of leves) {
      if (!o.parent) { leves.delete(o); continue }
      const s = o.userData.sombraLeve
      if (!s || o.geometry === s) continue
      trocadas.push(o, o.geometry)
      o.geometry = s
    }
    try { return original.apply(this, args) } finally {
      for (let i = 0; i < trocadas.length; i += 2) trocadas[i].geometry = trocadas[i + 1]
    }
  }
  sm.__sombraLeve = true
}
