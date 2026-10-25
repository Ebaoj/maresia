// A geometria das casas de 1932 (Fase 1 do plano de performance, 25/10/2026).
//
// Antes, cada peça da casa virava uma geometria nova (BoxGeometry, toNonIndexed, clone) e as
// pilhas eram juntadas no fim com mergeGeometries: milhares de alocações por bloco, e o bloco
// inteiro era montado dentro de um quadro (150 a 300 ms na T4). Agora cada pilha escreve direto
// nos seus arrays.
//
// Este teste prende a equivalência: a geometria nova tem de ser igual, vértice a vértice, à
// geometria que o caminho antigo produzia (posição, normal, cor e o chão da casa). Se a
// refatoração mudar um vértice, a casa muda na tela e este teste avisa.
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { pilhasVazias, montarCasa } from '../../src/mundo/quarteirao.js'
import { criarAleatorio } from '../../src/utils.js'

// A pilha de antes: geometria nova por peça e junção no fim
class PilhaAntiga {
  constructor() { this.geos = []; this.chao = 0 }
  add(geo, matriz, hex) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone())
    g.deleteAttribute('uv')
    g.applyMatrix4(matriz)
    const cor = new THREE.Color(hex)
    const n = g.attributes.position.count
    const c = new Float32Array(n * 3)
    const ch = new Float32Array(n).fill(this.chao)
    for (let i = 0; i < n; i++) { c[i * 3] = cor.r; c[i * 3 + 1] = cor.g; c[i * 3 + 2] = cor.b }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3))
    g.setAttribute('aChao', new THREE.BufferAttribute(ch, 1))
    this.geos.push(g)
  }
  caixa(base, x, y, z, sx, sy, sz, hex) {
    this.add(new THREE.BoxGeometry(sx, sy, sz), new THREE.Matrix4().copy(base).multiply(new THREE.Matrix4().makeTranslation(x, y, z)), hex)
  }
  junte() { return this.geos.length ? mergeGeometries(this.geos) : null }
}

const pilhasAntigas = () => ({
  reboco: new PilhaAntiga(), pecas: new PilhaAntiga(), interior: new PilhaAntiga(), aceso: new PilhaAntiga(), telhas: new PilhaAntiga(),
})

function lote(i, simples) {
  return { x: i * 12, z: 0, w: 6 + (i % 5), d: 10, frente: [0, 1], rot: 0, cor: '#efe6d2', chao: 0, y: 0, h: simples ? 3.4 : 5 }
}

const mesmo = (a, b) => {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) expect(a[i]).toBeCloseTo(b[i], 5)
}

describe('a geometria das casas (pilha direta contra a pilha de antes)', () => {
  for (const simples of [false, true]) {
    it(`a casa ${simples ? 'do morro' : 'do casario'} sai igual, pilha por pilha`, () => {
      for (let i = 0; i < 4; i++) {
        const it = lote(i, simples)
        const novas = pilhasVazias()
        montarCasa(it, criarAleatorio(1932 + i * 7919), simples, novas)
        const antigas = pilhasAntigas()
        montarCasa(it, criarAleatorio(1932 + i * 7919), simples, antigas)
        for (const chave of ['reboco', 'pecas', 'interior', 'aceso', 'telhas']) {
          const g = antigas[chave].junte()
          const p = novas[chave]
          if (!g) { expect(p.n).toBe(0); continue }
          expect(p.n).toBe(g.attributes.position.count)
          mesmo(p.pPos.subarray(0, p.n * 3), g.attributes.position.array)
          mesmo(p.pNor.subarray(0, p.n * 3), g.attributes.normal.array)
          mesmo(p.pCor.subarray(0, p.n * 3), g.attributes.color.array)
          mesmo(p.pChao.subarray(0, p.n), g.attributes.aChao.array)
        }
      }
    })
  }
})
