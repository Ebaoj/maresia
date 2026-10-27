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
import { LongeMascarado, definirMuitoLonge, LOD_MANCHA } from '../../src/mundo/muito-longe.js'
LOD_MANCHA.ligado = false // a mancha (27/10/2026) tem teste próprio em lod-longe.test.js
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

// fluido, 22/10/2026: o corte por tamanho na tela vale para a malha de longe mascarada, por faixa (bloco de uma
// unidade): o mangue de longe a 3,5 km da Coluna da Hora (411 mil triângulos) tinha 7 m, ~2 px
describe('longe mascarado: corte por tamanho na tela', () => {
  it('a faixa menor que cortePx sai da malha grande e volta perto', () => {
    const cfg = { desempenho: { muitoLonge: true, cortePequenos: true, cortePx: 3 } }
    definirMuitoLonge(cfg)
    const cena = new THREE.Scene()
    const geo = new THREE.BoxGeometry(7, 7, 7)
    const mat = new THREE.MeshBasicMaterial()
    const mascara = new LongeMascarado()
    const unidades = []
    for (const x of [0, 3000]) {
      const im = new THREE.InstancedMesh(geo, mat, 4)
      for (let i = 0; i < 4; i++) im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + i * 10, 0, 0))
      cena.add(im)
      const u = { longe: [im] }
      unidades.push(u)
      mascara.adicionar(u)
    }
    mascara.montar()
    const malha = mascara.malhas[0]
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 6000)
    cam.position.set(-500, 0, 0) // a 500 m da primeira (13 px) e a 3,5 km da segunda (1,9 px)
    for (const u of unidades) mascara.mostrar(u, true)
    mascara.atualizar(cam)
    mascara.aplicar()
    expect(malha.count).toBe(4)
    cam.position.set(2000, 0, 0) // agora a segunda a ~1 km (6,7 px) e a primeira a ~1,97 km (3,4 px)
    mascara.atualizar(cam)
    mascara.aplicar()
    expect(malha.count).toBe(8)
    cfg.desempenho.cortePequenos = false
    cam.position.set(-500, 0, 0)
    mascara.atualizar(cam)
    mascara.aplicar()
    expect(malha.count).toBe(8)
  })
})

// Junção com a gente (23/10/2026): a multidão (mundo/multidao.js) usa a mesma bandeira. Com o envoltório de
// quantidade fixa, a cidade desenhava a multidão inteira na capacidade (3,3 M triângulos na Coluna da Hora) e o
// corte por distância e por quadro dela não valia. Um mecanismo só: a bandeira, sem tirar o envoltório depois.
import { criarMultidao } from '../../src/mundo/multidao.js'
describe('multidão no WebGPU', () => {
  it('a malha da multidão desenha só a contagem viva depois da conversão do WebGPU', () => {
    const md = criarMultidao(new THREE.Scene(), new THREE.MeshBasicMaterial(), { nome: 'teste', ate: 60 })
    const t = md.tipo(new THREE.BoxGeometry())
    for (const x of [0, 10, 50, 100]) md.adicionar(t, new THREE.Matrix4().makeTranslation(x, 0, 0))
    md.montar()
    md.atualizar(new THREE.Vector3(0, 0, 0)) // a de 100 m fica de fora
    expect(t.malha.userData.contagemViva).toBe(true)
    converterObjeto(t.malha, (m) => m)
    expect(Object.getOwnPropertyDescriptor(t.malha, 'count')?.get).toBeUndefined()
    expect(t.malha.count).toBe(3)
    md.atualizar(new THREE.Vector3(200, 0, 0)) // ninguém a menos de 60 m
    expect(t.malha.count).toBeLessThan(3)
  })
})
