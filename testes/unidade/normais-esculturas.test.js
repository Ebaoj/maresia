// Esculturas da Praça dos Leões com manchas claras de camuflagem a 5 m (branch acabamento, 22/10/2026): o modelo
// esculpido dizimado tem a normal virando ~20 graus de um vértice para o vizinho, e no toon pintado cada calombo caía
// de um lado da faixa de luz e acendia um pingo do realce do metal. A correção (normais-suaves.js) dá ao modelo as
// normais da forma, num raio em metros. Este teste pega: a suavização sumir ou ficar fraca; a suavização anular a
// normal das partes finas (cauda, perna, espada: o outro lado a 2 cm não pode entrar na média); e o modelo do jogo
// voltar a sair com o relevo miúdo. No código de antes (f6bf9e6) ele falha: normais-suaves.js não existe.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { suavizarNormais, anguloEntreVizinhos } from '../../src/mundo/marcos1932/normais-suaves.js'
import { criarAleatorio } from '../../src/utils.js'
import { PADRAO } from '../../src/config.js'

// uma forma lisa com relevo miúdo de 1 cm por cima (como a dizimação), soldada
function comCalombos(geo, amp, semente = 7) {
  const g = mergeVertices(geo.deleteAttribute('normal').deleteAttribute('uv'), 1e-6)
  g.computeVertexNormals()
  const rnd = criarAleatorio(semente)
  const p = g.attributes.position.array
  const n = g.attributes.normal.array
  for (let i = 0; i < p.length; i += 3) {
    const d = rnd.entre(-amp, amp)
    p[i] += n[i] * d; p[i + 1] += n[i + 1] * d; p[i + 2] += n[i + 2] * d
  }
  g.computeVertexNormals()
  return g
}

describe('normais da forma nas esculturas', () => {
  it('o relevo miúdo some da normal e a forma grande fica', () => {
    const g = comCalombos(new THREE.IcosahedronGeometry(0.5, 24), 0.01)
    const antes = anguloEntreVizinhos(g)
    suavizarNormais(g, PADRAO.marcos.metalSuave)
    const depois = anguloEntreVizinhos(g)
    expect(antes).toBeGreaterThan(8)
    expect(depois).toBeLessThan(antes * 0.4)
    // a normal continua a da esfera (para fora)
    const p = g.attributes.position.array, n = g.attributes.normal.array
    let pior = 1
    for (let i = 0; i < p.length; i += 3) {
      const r = Math.hypot(p[i], p[i + 1], p[i + 2])
      pior = Math.min(pior, (p[i] * n[i] + p[i + 1] * n[i + 1] + p[i + 2] * n[i + 2]) / r)
    }
    expect(pior).toBeGreaterThan(0.9)
  })

  it('a parte fina (2 cm de raio, menor que o raio da média) não perde a normal', () => {
    const g = comCalombos(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 24, 30, true), 0.002)
    suavizarNormais(g, PADRAO.marcos.metalSuave)
    const p = g.attributes.position.array, n = g.attributes.normal.array
    let pior = 1
    for (let i = 0; i < p.length; i += 3) {
      const r = Math.hypot(p[i], p[i + 2])
      pior = Math.min(pior, (p[i] * n[i] + p[i + 2] * n[i + 2]) / r)
      expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 3)
    }
    expect(pior).toBeGreaterThan(0.7)
  })

  it('raio 0 deixa a normal como veio', () => {
    const g = comCalombos(new THREE.IcosahedronGeometry(0.5, 6), 0.01)
    const n0 = Float32Array.from(g.attributes.normal.array)
    suavizarNormais(g, 0)
    expect(Array.from(g.attributes.normal.array)).toEqual(Array.from(n0))
  })

  // os modelos ficam fora do git (arte/finais): onde não houver, o teste do modelo não roda
  const ARQ = 'arte/finais/marcos1932/leao-pe-jogo.glb'
  it.skipIf(!existsSync(ARQ))('o leão de pé do jogo sai com a normal da forma (prepararModelo)', async () => {
    const { prepararModelo, MODELOS } = await import('../../src/mundo/marcos1932/esculturas.js')
    const buf = readFileSync(ARQ)
    const gltf = await new Promise((r, e) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', r, e))
    const cru = anguloEntreVizinhos(prepararModelo(gltf, MODELOS.leao, 0))
    const liso = anguloEntreVizinhos(prepararModelo(gltf, MODELOS.leao, PADRAO.marcos.metalSuave))
    expect(cru).toBeGreaterThan(18)
    expect(liso).toBeLessThan(cru * 0.6)
  })
})
