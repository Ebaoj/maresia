// KAN-70 T2 (17/10/2026): cópias espalhadas (árvores) davam 1177 blocos de 2 ou 3 cópias; cada bloco é um objeto
// e no WebGPU do three cada objeto custa CPU por quadro. Com a junção, célula rala sobe para uma célula maior até
// juntar o mínimo de cópias; aglomerado denso continua no bloco dele; nenhuma cópia se perde nem se repete.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { definirTamBloco, instanciarEmBlocos } from '../../src/mundo/blocos.js'
import { criarAleatorio } from '../../src/utils.js'

function cenario() {
  const rnd = criarAleatorio(70)
  const mats = []
  // 120 cópias espalhadas por 1500 x 1500 m (cerca de 1 por célula de 192 m)
  for (let i = 0; i < 120; i++) mats.push(new THREE.Matrix4().makeTranslation(rnd.entre(0, 1500), 0, rnd.entre(0, 1500)))
  // 40 cópias juntas numa praça de 20 m
  for (let i = 0; i < 40; i++) mats.push(new THREE.Matrix4().makeTranslation(1700 + rnd.entre(0, 20), 0, 1700 + rnd.entre(0, 20)))
  return mats
}

function blocos(min, max) {
  definirTamBloco(192, min, max)
  const cena = new THREE.Scene()
  const malhas = instanciarEmBlocos(cena, new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), cenario(), null, { nome: 'teste' })
  return malhas
}

const posicoes = (malhas) => malhas.flatMap((im) => Array.from({ length: im.count }, (_, j) => {
  const m = new THREE.Matrix4()
  im.getMatrixAt(j, m)
  return `${m.elements[12].toFixed(3)},${m.elements[14].toFixed(3)}`
})).sort()

describe('blocos de cópias', () => {
  it('sem junção: um bloco por célula de 192 m (o jeito antigo)', () => {
    const malhas = blocos(0, 192)
    expect(malhas.length).toBeGreaterThan(40)
  })

  it('com junção: cópias espalhadas viram poucos blocos e o aglomerado denso fica sozinho', () => {
    const antigos = blocos(0, 192)
    const malhas = blocos(12, 768)
    expect(malhas.length).toBeLessThan(antigos.length / 3)
    // o aglomerado de 40 cópias continua num bloco só dele
    const denso = malhas.filter((im) => im.count >= 40)
    expect(denso.length).toBe(1)
    // nenhuma cópia perdida nem repetida
    expect(posicoes(malhas)).toEqual(posicoes(antigos))
  })
})
