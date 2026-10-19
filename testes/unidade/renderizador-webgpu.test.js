// KAN-70: conversão de material no primeiro desenho e sincronização das propriedades sem getters (renderizador.js).
// Sem GPU: objetos e materiais falsos, conversor falso que devolve um "node material" novo por material.
//
// Bugs que estes testes pegam:
//  - o three receber o material velho (do WebGL) na lista de desenho e compilar o shader errado;
//  - material de array trocado pelo de outro índice;
//  - objeto já convertido ser convertido de novo a cada desenho;
//  - propriedade que o jogo muda (opacity do facho, map do rosto) não chegar à versão do WebGPU;
//  - sincronização escrevendo à toa (os setters do three subiriam a versão do material).
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { DINAMICAS, converterObjeto, materialParaDesenho, seguidos, seguirOriginal, sincronizarSeguidos } from '../../src/render/renderizador.js'

const velho = (nome) => ({ nome, isNodeMaterial: false })
function conversorFalso() {
  const trocas = new Map()
  const converte = vi.fn((m) => {
    if (!trocas.has(m)) trocas.set(m, { nome: m.nome + '-tsl', isNodeMaterial: true })
    return trocas.get(m)
  })
  return { converte, trocas, convertidoDe: (m) => trocas.get(m) }
}

describe('conversão no primeiro desenho', () => {
  it('material de array: o argumento de mesmo índice vira o convertido', () => {
    const { converte, convertidoDe } = conversorFalso()
    const a = velho('a'), b = velho('b'), c = velho('c')
    const obj = { material: [a, b, c] }
    const antes = obj.material
    expect(converterObjeto(obj, converte)).toBe(true)
    expect(obj.material.map((m) => m.nome)).toEqual(['a-tsl', 'b-tsl', 'c-tsl'])
    expect(materialParaDesenho(obj, a, antes, convertidoDe)).toBe(obj.material[0])
    expect(materialParaDesenho(obj, b, antes, convertidoDe)).toBe(obj.material[1])
    expect(materialParaDesenho(obj, c, antes, convertidoDe)).toBe(obj.material[2])
  })

  it('material simples trocado: o argumento velho vira o convertido', () => {
    const { converte, convertidoDe } = conversorFalso()
    const m = velho('m')
    const obj = { material: m }
    expect(converterObjeto(obj, converte)).toBe(true)
    expect(obj.material.nome).toBe('m-tsl')
    expect(materialParaDesenho(obj, m, m, convertidoDe)).toBe(obj.material)
  })

  it('objeto já visto com o mesmo material não converte de novo', () => {
    const { converte } = conversorFalso()
    const obj = { material: velho('m') }
    expect(converterObjeto(obj, converte)).toBe(true)
    expect(converterObjeto(obj, converte)).toBe(false)
    expect(converterObjeto(obj, converte)).toBe(false)
    expect(converte).toHaveBeenCalledTimes(1)
  })

  it('material trocado em jogo converte de novo', () => {
    const { converte } = conversorFalso()
    const obj = { material: velho('a') }
    converterObjeto(obj, converte)
    obj.material = velho('b')
    expect(converterObjeto(obj, converte)).toBe(true)
    expect(obj.material.nome).toBe('b-tsl')
  })

  it('lista de desenho montada antes da conversão (outro passe já converteu): o velho ainda vira o convertido', () => {
    const { converte, convertidoDe } = conversorFalso()
    const a = velho('a'), b = velho('b')
    const obj = { material: [a, b] }
    converterObjeto(obj, converte) // primeiro passe do quadro
    const antes = obj.material // segundo passe: o objeto já está convertido, mas o argumento da lista é o velho
    expect(materialParaDesenho(obj, b, antes, convertidoDe)).toBe(obj.material[1])
  })

  it('material que não é do objeto (o da sombra) segue como veio', () => {
    const { converte, convertidoDe } = conversorFalso()
    const obj = { material: velho('a') }
    const antes = obj.material
    converterObjeto(obj, converte)
    const sombra = { nome: 'sombra', isNodeMaterial: true }
    expect(materialParaDesenho(obj, sombra, antes, convertidoDe)).toBe(sombra)
  })
})

describe('propriedades sem getters', () => {
  it('seguirOriginal copia por valor, sem getter, e registra o par com as chaves dinâmicas', () => {
    const m = new THREE.MeshToonMaterial({ color: '#ff0000', opacity: 0.5, transparent: true })
    const nm = new THREE.MeshBasicMaterial() // faz as vezes da versão do WebGPU
    const antes = seguidos.length
    seguirOriginal(m, nm)
    expect(nm.opacity).toBe(0.5)
    expect(nm.transparent).toBe(true)
    expect(nm.color).toBe(m.color) // Color por referência: color.copy(...) no original chega sozinho
    const d = Object.getOwnPropertyDescriptor(nm, 'opacity')
    expect(d.get).toBeUndefined()
    expect(seguidos.length).toBe(antes + 1)
    const [m2, nm2, chaves] = seguidos[antes]
    expect(m2).toBe(m)
    expect(nm2).toBe(nm)
    expect(chaves).toContain('opacity')
    expect(chaves).toContain('color')
    expect(chaves).not.toContain('emissive') // o MeshBasic não tem
    seguidos.length = antes
  })

  it('sincronizarSeguidos copia opacity e map mudados', () => {
    const m = { opacity: 0, map: null, color: { v: 1 } }
    const nm = { opacity: 0, map: null, color: m.color }
    const lista = [[m, nm, ['color', 'opacity', 'map']]]
    const tex = {}
    m.opacity = 0.22
    m.map = tex
    sincronizarSeguidos(lista)
    expect(nm.opacity).toBe(0.22)
    expect(nm.map).toBe(tex)
  })

  it('sincronizarSeguidos não escreve no que não mudou', () => {
    const escritas = []
    const m = { opacity: 1, map: null }
    const nm = {}
    for (const k of ['opacity', 'map']) {
      let v = m[k]
      Object.defineProperty(nm, k, { get: () => v, set: (x) => { escritas.push(k); v = x } })
    }
    const lista = [[m, nm, ['opacity', 'map']]]
    sincronizarSeguidos(lista)
    expect(escritas).toEqual([])
    m.opacity = 0.3
    sincronizarSeguidos(lista)
    sincronizarSeguidos(lista)
    expect(escritas).toEqual(['opacity']) // uma vez só: na segunda passada já está igual
  })

  it('DINAMICAS cobre o que o jogo escreve em tempo de jogo', () => {
    for (const k of ['opacity', 'map', 'color', 'emissive']) expect(DINAMICAS).toContain(k)
  })
})
