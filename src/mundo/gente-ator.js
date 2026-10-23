// O corpo dos atores animados (atores.js) vestido pelas mesmas fichas da gente parada (gente-figurino.js): quando o
// ator ocupa uma pessoa, ele tem a roupa, o chapéu, a carga e as cores dela, e a troca de figura por ator não aparece.
//
// As peças de todas as fichas que podem virar ator vão numa geometria por papel (pele, camisa, listra, calca, chapeu,
// cabelo; o mesmo de ossos-textura.js), na pose em T do esqueleto, cada vértice preso a um osso só (peso 1, como o
// boneco antigo: a textura de ossos e o skinning do three leem igual). Peça igual em fichas diferentes entra uma vez.
// Fichas com as mesmas peças (só as cores mudam) são a mesma forma. Cada vértice leva a máscara das formas que usam a
// peça (bit k = forma k; até 15 formas: o WebGPU lê o Uint16 com sinal, e o bit 15 virava número negativo) no
// skinIndex.y, que o peso 1 num osso só deixa livre: o WebGPU tem 8 buffers de vértice por desenho e o ator já usava os 8. A ficha de
// cada cópia vai num uniforme por cópia (atores-vat-material.js) e o material some com o que não é dela.
// No WebGL (um SkinnedMesh por ator, o skinning do three lê o skinIndex inteiro), porFicha(f) devolve só as peças da
// ficha, com o skinIndex.y de volta a 0.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { vestir, juntasEmT } from './gente-corpo.js'
import { NOMES } from '../jogador/esqueleto.js'

export const PAPEIS_ATOR = ['pele', 'camisa', 'listra', 'calca', 'chapeu', 'cabelo']
const INDICE = new Map(NOMES.map((n, i) => [n, i]))

// uma assinatura da geometria: a mesma peça (mesmos vértices) em duas fichas dá a mesma chave
function chave(rotulo, papel, g) {
  const p = g.attributes.position.array
  let a = 0, b = 0, c = 0
  for (let i = 0; i < p.length; i += 3) { a += p[i] * (1 + (i % 7)); b += p[i + 1] * (1 + (i % 5)); c += p[i + 2] * (1 + (i % 3)) }
  return `${rotulo}|${papel}|${p.length}|${a.toFixed(4)}|${b.toFixed(4)}|${c.toFixed(4)}`
}

export function pecasDosAtores(fichas) {
  const j = juntasEmT()
  const pecas = new Map()
  const formas = new Map() // as chaves das peças de uma ficha -> o número da forma
  const formaDe = fichas.map((fig) => {
    const minhas = []
    vestir(fig, j, { detalhe: 'perto' }, (geo, papel, osso, rotulo) => {
      const g = geo.index ? geo : geo.setIndex([...Array(geo.attributes.position.count).keys()]) // com índice: o vértice da junta é um só (o M1 é limitado pelo vértice)
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
      if (!g.attributes.normal) g.computeVertexNormals()
      const k = chave(rotulo, papel, g)
      if (!pecas.has(k)) pecas.set(k, { g, papel, osso, mascara: 0 })
      minhas.push(k)
    })
    const assinatura = minhas.join('\n')
    if (!formas.has(assinatura)) formas.set(assinatura, formas.size)
    const forma = formas.get(assinatura)
    for (const k of minhas) pecas.get(k).mascara |= 1 << forma
    return forma
  })
  if (formas.size > 15) throw new Error(`pecasDosAtores: ${formas.size} formas; no máximo 15 (máscara no skinIndex.y)`)
  // os atributos de pele de cada peça: osso por vértice (o tronco escolhe o gomo pela altura) e a máscara
  const porPapel = Object.fromEntries(PAPEIS_ATOR.map((p) => [p, []]))
  for (const { g, papel, osso, mascara } of pecas.values()) {
    const n = g.attributes.position.count
    const si = new Uint16Array(n * 4)
    const sw = new Float32Array(n * 4)
    const pos = g.attributes.position
    for (let i = 0; i < n; i++) {
      const nome = typeof osso === 'function' ? osso(pos.getX(i), pos.getY(i), pos.getZ(i)) : osso
      const idx = INDICE.get(nome)
      if (idx === undefined) throw new Error(`pecasDosAtores: osso ${nome} não existe`)
      si[i * 4] = idx
      si[i * 4 + 1] = mascara
      sw[i * 4] = 1
    }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
    g.userData.mascara = mascara
    porPapel[papel].push(g)
  }
  // papel sem peça em nenhuma ficha: um triângulo nulo (a malha existe, não desenha nada)
  const vazio = () => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(9), 3))
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(12), 4))
    return g
  }
  const todas = Object.fromEntries(PAPEIS_ATOR.map((p) => [p, porPapel[p].length ? mergeGeometries(porPapel[p]) : vazio()]))
  // só as peças da ficha f, por papel (o caminho do WebGL)
  const cache = new Map()
  const porFicha = (f) => {
    if (cache.has(formaDe[f])) return cache.get(formaDe[f])
    const bit = 1 << formaDe[f]
    const r = Object.fromEntries(PAPEIS_ATOR.map((p) => {
      const lista = porPapel[p].filter((g) => g.userData.mascara & bit)
      if (!lista.length) return [p, vazio()]
      const m = mergeGeometries(lista)
      const si = m.attributes.skinIndex.array
      for (let i = 1; i < si.length; i += 4) si[i] = 0
      return [p, m]
    }))
    cache.set(formaDe[f], r)
    return r
  }
  return { pecas: todas, porFicha, fichas, formaDe, formas: formas.size }
}
