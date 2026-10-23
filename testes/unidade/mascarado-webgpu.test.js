// Bug (fluido, 22/10/2026): no WebGPU a malha de longe mascarada (muito-longe.js, LongeMascarado) desenhava TODAS as
// cópias do mapa em todo quadro. converterObjeto (render/renderizador.js) trata bloco com count abaixo da capacidade
// como "quantidade que muda" (bolas, poeira): o three passa a ver sempre a capacidade e as cópias além do count viram
// escala zero, que não aparece mas roda o vértice. As árvores dos quintais nascem quase todas "fora" (count baixo no
// primeiro desenho): na Coluna da Hora eram 659 mil triângulos zerados por quadro, no Campo do Urubu 746 mil (todos).
// A malha mascarada grava o count de verdade; desde o three 0.186 o buffer de matrizes do shader é do tamanho da
// capacidade (nodes/accessors/Instance.js), então o count pode mudar sem a escala zero.
// Correção: commit "Longe mascarado no WebGPU desenha só as cópias à vista".
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { LongeMascarado, definirMuitoLonge } from '../../src/mundo/muito-longe.js'
import { converterObjeto } from '../../src/render/renderizador.js'

describe('longe mascarado no WebGPU', () => {
  it('o count da malha é o das cópias à vista, sem escala zero no resto', () => {
    definirMuitoLonge({ desempenho: { muitoLonge: true } })
    const cena = new THREE.Scene()
    const geo = new THREE.BoxGeometry()
    const mat = new THREE.MeshBasicMaterial()
    const mascara = new LongeMascarado()
    const unidades = []
    for (let b = 0; b < 4; b++) {
      const im = new THREE.InstancedMesh(geo, mat, 5)
      for (let i = 0; i < 5; i++) im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(b * 100 + i, 0, 0))
      cena.add(im)
      const u = { longe: [im] }
      unidades.push(u)
      mascara.adicionar(u)
    }
    mascara.montar()
    const malha = mascara.malhas[0]
    // o primeiro desenho do WebGPU: uma unidade só à vista
    mascara.mostrar(unidades[1], true)
    mascara.aplicar()
    converterObjeto(malha, (m) => m)
    expect(malha.count).toBe(5)
    // mais uma unidade à vista: 10 cópias, nenhuma zerada
    mascara.mostrar(unidades[3], true)
    mascara.aplicar()
    expect(malha.count).toBe(10)
    const m4 = new THREE.Matrix4()
    const s = new THREE.Vector3()
    for (let i = 0; i < 10; i++) {
      malha.getMatrixAt(i, m4)
      s.setFromMatrixScale(m4)
      expect(s.x).toBeGreaterThan(0.5)
    }
    // ninguém à vista: zero cópias desenhadas (o three não desenha count 0)
    mascara.mostrar(unidades[1], false)
    mascara.mostrar(unidades[3], false)
    mascara.aplicar()
    expect(malha.count).toBe(0)
  })
})

