// Bug (22/10/2026, branch bugs-22): as ruas tinham postes de madeira com cruzeta e dois fios em toda a
// extensão, que liam como iluminação elétrica. Em Fortaleza a iluminação pública foi a GÁS até 25/10/1935
// (docs/mapa-1932.md); decisão do Joabe: lampião a gás de coluna no lugar do poste. O poste e o fio aéreo do
// bonde (vida1932.js) ficam, porque o bonde elétrico roda desde 1913. Correção: commit "Lampiões a gás nas ruas".
//
// Monta a rua de verdade (a rede de 1932 de casario1932.js) e a cenografia, e confere: nenhum poste nem fio
// de rua, um lampião de coluna onde cada poste ficava, com o vidro que acende e a luz no mapa de luz.

import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { globais } from '../../src/globais.js'

// o calçadão carrega textura pelo TextureLoader, que pede um elemento <img>: no Node basta um de mentira
if (!globalThis.document) {
  globalThis.document = { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, setAttribute() {}, style: {} }) }
}

const cena = new THREE.Scene()
const conta = {}
const pos = {}
beforeAll(async () => {
  const { criarRua } = await import('../../src/mundo/rua.js')
  const { criarCenografia } = await import('../../src/mundo/cenografia.js')
  criarRua(cena, [], null)
  criarCenografia(cena, [], [])
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  cena.traverse((o) => {
    if (!o.name) return
    conta[o.name] = (conta[o.name] || 0) + (o.isInstancedMesh ? o.count : 1)
    if (o.isInstancedMesh) {
      pos[o.name] = pos[o.name] || []
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m)
        p.setFromMatrixPosition(m).applyMatrix4(o.matrixWorld)
        pos[o.name].push([p.x, p.y, p.z])
      }
    }
  })
})

describe('iluminação das ruas de 1932: lampião a gás, não poste de luz', () => {
  it('nenhum poste de madeira nem fio de rua', () => {
    expect(conta.postes || 0).toBe(0)
    expect(conta.fios || 0).toBe(0)
  })

  it('as ruas têm lampiões de coluna, cada um com o seu vidro', () => {
    expect(conta['lampioes-coluna'] || 0).toBeGreaterThan(500)
    expect(conta['lampioes-coluna-vidro']).toBe(conta['lampioes-coluna'])
  })

  it('nenhum lampião repetido no mesmo lugar', () => {
    const chaves = new Set((pos['lampioes-coluna'] || []).map(([x, , z]) => `${x.toFixed(2)},${z.toFixed(2)}`))
    expect(chaves.size).toBe((pos['lampioes-coluna'] || []).length)
  })

  it('cada lampião acende o chão em volta (está no mapa de luz dos lampiões)', () => {
    const tex = globais.tLampioes.value
    const { width: W, height: H, data } = tex.image
    const min = globais.uLampMin.value
    const tam = globais.uLampTam.value
    let apagados = 0
    for (const [x, , z] of pos['lampioes-coluna-vidro'] || []) {
      const i = Math.floor(((x - min.x) / tam.x) * W)
      const j = Math.floor(((z - min.y) / tam.y) * H)
      if (i < 0 || j < 0 || i >= W || j >= H || data[(j * W + i) * 4] < 0.5) apagados++
    }
    expect(apagados).toBe(0)
  })
})
