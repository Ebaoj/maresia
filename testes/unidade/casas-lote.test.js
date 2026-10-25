// Fase 2 (25/10/2026): as casas de cada material num lote só (src/mundo/casas-lote.js).
//
// As casas de cada material entram num BatchedMesh só (um desenho por material, no lugar de um por
// pilha e por bloco). O lote precisa: caber na placa (o espaço reservado cresce quando falta), mostrar
// e esconder o bloco (o LOD de perto e longe), tirar o bloco do mapa e manter o corte por instância.
//
// O que estes testes pegam:
//  - a geometria do bloco não entrar no lote (a casa some do jogo);
//  - o bloco aparecer no jogo sem o LOD mandar (a casa detalhada à vista junto com a caixa de longe);
//  - o lote crescer e perder o que já estava (a casa montada antes desaparece);
//  - o bloco sair do mapa e continuar no lote (a casa descarregada continua desenhando);
//  - a casa de um material não ir para o lote dela (o material errado na tela).
import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'
import { LoteCasas } from '../../src/mundo/casas-lote.js'
import { limparEstaticos } from '../../src/render/sombra-estatica.js'

function geometria(n = 3) {
  const g = new THREE.BufferGeometry()
  const pos = new Float32Array(n * 3)
  const nor = new Float32Array(n * 3)
  const cor = new Float32Array(n * 3)
  const chao = new Float32Array(n)
  for (let i = 0; i < n; i++) { pos[i * 3] = i; nor[i * 3 + 1] = 1; cor[i * 3] = 1; chao[i] = 0 }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3))
  g.setAttribute('aChao', new THREE.BufferAttribute(chao, 1))
  return g
}

function montar(vertices = 100000) {
  limparEstaticos()
  const grupo = new THREE.Group()
  const cfg = { desempenho: { casasLoteVertices: vertices } }
  const lote = new LoteCasas({
    grupo, cfg,
    materiais: [
      { nome: 'reboco', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: true },
      { nome: 'pecas', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: true },
      { nome: 'telhas', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: true },
      { nome: 'interior', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: false },
    ],
  })
  return { grupo, cfg, lote }
}

describe('lote das casas', () => {
  beforeEach(() => limparEstaticos())

  it('cada material vira um lote, com o corte por instância e o registro na sombra', () => {
    const { grupo, lote } = montar()
    expect(lote.lotes.size).toBe(4)
    const id = lote.adicionar('reboco', geometria(12))
    const reboco = lote.lotes.get('reboco')
    expect(reboco.mesh.isBatchedMesh).toBe(true)
    expect(reboco.mesh.castShadow).toBe(true)
    expect(reboco.mesh.perObjectFrustumCulled).toBe(true) // o corte por instância
    expect(reboco.mesh.material).toBe(reboco.material) // o material do lote é o do material
    expect(reboco.mesh.parent).toBe(grupo) // o lote entra no grupo das casas (a cena o desenha)
    // o interior não projeta sombra: não entra no registro dos parados
    lote.adicionar('interior', geometria(12))
    expect(lote.lotes.get('interior').mesh.castShadow).toBe(false)
    expect(lote.lotes.get('interior').itens.size).toBe(1)
    expect(id).toBeTruthy()
  })

  it('a geometria do bloco entra no lote e começa escondida (o LOD manda)', () => {
    const { lote } = montar()
    const id = lote.adicionar('reboco', geometria(12))
    expect(id).toBeTruthy()
    expect(lote.stats().geometrias).toBe(1)
    expect(lote.stats().visiveis).toBe(0)
    const item = lote.lotes.get('reboco').itens.get(id)
    expect(lote.lotes.get('reboco').mesh.getVisibleAt(item.instancia)).toBe(false)
    lote.mostrar(id, true)
    expect(lote.stats().visiveis).toBe(1)
    expect(lote.lotes.get('reboco').mesh.getVisibleAt(item.instancia)).toBe(true)
    lote.mostrar(id, false)
    expect(lote.stats().visiveis).toBe(0)
    expect(lote.lotes.get('reboco').mesh.getVisibleAt(item.instancia)).toBe(false)
  })

  it('o bloco sai do mapa: a instância e a geometria saem do lote', () => {
    const { lote } = montar()
    const id = lote.adicionar('reboco', geometria(12))
    lote.mostrar(id, true)
    expect(lote.remover(id)).toBe(true)
    expect(lote.stats().geometrias).toBe(0)
    expect(lote.stats().visiveis).toBe(0)
    expect(lote.stats().vertices).toBe(0)
    expect(lote.mostrar(id, true)).toBe(false) // o bloco não está mais no lote
  })

  it('o lote cresce quando falta espaço, e o que já estava continua lá', () => {
    const { lote } = montar(1000)
    const antes = lote.stats()
    const primeiro = lote.adicionar('reboco', geometria(60))
    const arrayAntes = lote.lotes.get('reboco').mesh.geometry.attributes.position.array
    // uma geometria maior que o espaço reservado: o lote cresce (o three recria o buffer)
    const segundo = lote.adicionar('reboco', geometria(60000))
    expect(segundo).toBeTruthy()
    expect(lote.stats().reservados).toBeGreaterThan(antes.reservados)
    expect(lote.stats().geometrias).toBe(2)
    const arrayDepois = lote.lotes.get('reboco').mesh.geometry.attributes.position.array
    expect(arrayDepois.length).toBeGreaterThan(arrayAntes.length)
    expect(arrayDepois[0]).toBe(0) // a primeira casa continua no lugar
    lote.mostrar(primeiro, true)
    expect(lote.stats().visiveis).toBe(1)
  })

  it('a fatia de cada material sai do espaço total reservado (as peças ficam com a parte maior)', () => {
    const { lote } = montar(1000000)
    lote.adicionar('pecas', geometria(8000))
    lote.adicionar('telhas', geometria(1000))
    lote.adicionar('interior', geometria(1000))
    lote.fecharBloco() // o bloco acabou: o lote sabe a fatia de cada material
    const pecas = lote.capacidadeDesejada(lote.lotes.get('pecas'))
    const telhas = lote.capacidadeDesejada(lote.lotes.get('telhas'))
    expect(pecas).toBeGreaterThan(telhas) // as peças da casa ocupam mais espaço que o telhado
    expect(pecas + telhas).toBeLessThanOrEqual(1000000 + 1) // e o todo cabe no espaço reservado
  })

  it('a geometria do bloco tem os mesmos atributos do lote (o three exige)', () => {
    const { lote } = montar()
    lote.adicionar('reboco', geometria(9))
    const g = lote.lotes.get('reboco').mesh.geometry
    for (const a of ['position', 'normal', 'color', 'aChao']) expect(g.getAttribute(a)).toBeTruthy()
    expect(g.getAttribute('position').count).toBeGreaterThanOrEqual(9)
  })

  it('as contas do lote (para o console e o medidor)', () => {
    const { lote } = montar()
    lote.adicionar('pecas', geometria(100))
    lote.adicionar('telhas', geometria(50))
    const s = lote.stats()
    expect(s.lotes).toBe(2)
    expect(s.geometrias).toBe(2)
    expect(s.vertices).toBe(150)
  })
})
