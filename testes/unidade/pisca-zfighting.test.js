// Pisca (22/10/2026, docs/pisca-22-10.md): andando pela rua, a beira da calçada piscava numa faixa ao longo de toda a
// rua. A calçada e o meio-fio eram duas caixas até a mesma beira: a frente e o topo das duas no mesmo plano, cada uma
// com uma cor, e a profundidade decidia pixel a pixel qual aparecia (z-fighting). Aqui: nenhuma face de caixa da casa
// do kit de 1932 (o mesmo desenho de casa() em quarteirao.js) fica no mesmo plano, virada para o mesmo lado e por cima
// de outra de cor diferente. Visto falhando em 4195ad2 (o meio-fio contra a calçada em toda casa do casario, na frente e no topo; e a ponta do
// barrado contra a face de fora do cunhal).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { pecasDaCasa } from '../../src/mundo/kit1932.js'
import { criarAleatorio } from '../../src/utils.js'

const CORES = ['#efe6d2', '#e8c9a0', '#cfe0d8', '#f2ebdc', '#e7b9a4']
const lote = (i) => ({ x: 0, z: 0, w: 6 + (i % 5), d: 10, frente: [0, 1], rot: 0, cor: CORES[i % CORES.length], chao: 0, y: 0, h: 5 })

// caixa unitária esticada e deslocada (sem giro: o lote olha para +z): devolve [min, max]
function limites(matriz) {
  const b = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)).applyMatrix4(matriz)
  return [b.min.toArray(), b.max.toArray()]
}

// faces que brigam: mesmo eixo, mesmo lado, mesmo plano (1 mm) e área em comum de mais de 1 cm²
export function facesQueBrigam(caixas) {
  const brigas = []
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      const a = caixas[i], b = caixas[j]
      if (a.cor === b.cor && a.material === b.material) continue
      for (let eixo = 0; eixo < 3; eixo++) {
        for (const lado of [0, 1]) {
          if (Math.abs(a.lim[lado][eixo] - b.lim[lado][eixo]) > 1e-3) continue
          let area = 1
          for (let k = 0; k < 3; k++) {
            if (k === eixo) continue
            area *= Math.max(0, Math.min(a.lim[1][k], b.lim[1][k]) - Math.max(a.lim[0][k], b.lim[0][k]))
          }
          if (area > 1e-4) brigas.push({ a: a.cor, b: b.cor, eixo: 'xyz'[eixo], lado: lado ? '+' : '-', em: +a.lim[lado][eixo].toFixed(3), area: +area.toFixed(4) })
        }
      }
    }
  }
  return brigas
}

describe('faces no mesmo plano (z-fighting) na casa de 1932', () => {
  it('nenhuma face visível de caixa briga com outra de cor diferente', () => {
    const todas = []
    for (let i = 0; i < 40; i++) {
      const caixas = pecasDaCasa(lote(i), criarAleatorio(1932 + i * 7919), false)
        .filter((p) => p.peca === 'caixa')
        .map((p) => ({ cor: p.cor, material: p.material, lim: limites(p.matriz) }))
      // não aparecem: as de baixo enterradas no chão (y = 0 para baixo) e as de trás encostadas na fachada (z = 5, a
      // frente da parede deste lote, virada para dentro da casa)
      for (const br of facesQueBrigam(caixas)) {
        if (br.eixo === 'y' && br.lado === '-' && br.em <= 0.001) continue
        if (br.eixo === 'z' && br.lado === '-' && Math.abs(br.em - 5) < 0.001) continue
        todas.push(br)
      }
    }
    expect(todas.slice(0, 8)).toEqual([])
  })
})
