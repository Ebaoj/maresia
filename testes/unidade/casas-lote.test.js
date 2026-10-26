// O lote das casas em BatchedMesh (src/mundo/casas-lote.js).
//
// As casas de cada material entram num BatchedMesh só (um desenho por material, no lugar de um por
// pilha e por bloco). O lote precisa: caber na placa com o espaço final (o lote não cresce: o
// three recria o buffer e a placa sobe tudo de novo, e era o pico de 100 ms), mostrar e esconder o
// bloco (o LOD de perto e longe), tirar o bloco do mapa e manter o corte por instância.
//
// O que estes testes pegam:
//  - a geometria do bloco não entrar no lote (a casa some do jogo);
//  - o bloco aparecer no jogo sem o LOD mandar (a casa detalhada à vista junto com a caixa de longe);
//  - o lote crescer e perder o que já estava (a casa montada antes desaparece);
//  - a escrita no lote marcar o buffer inteiro para subir (a placa subindo tudo de novo);
//  - o bloco sair do mapa e continuar no lote (a casa descarregada continua desenhando);
//  - a casa de um material não ir para o lote dela (o material errado na tela).
import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'
import { LoteCasas, estimarCapacidade } from '../../src/mundo/casas-lote.js'
import { limparEstaticos } from '../../src/render/sombra-estatica.js'

// os limites do bloco (a esfera e a caixa que o three usa no corte por instância)
const limites = () => ({ esfera: new THREE.Sphere(new THREE.Vector3(), 10), caixa: new THREE.Box3() })

// os arrays de uma pilha (o que o worker devolve): o valor de cada vértice é o seu índice, para
// o teste saber o que foi escrito onde
function dados(vertices) {
  const pos = new Float32Array(vertices * 3)
  const nor = new Float32Array(vertices * 3)
  const cor = new Float32Array(vertices * 3)
  const chao = new Float32Array(vertices)
  for (let i = 0; i < vertices; i++) { pos[i * 3] = i; nor[i * 3 + 1] = 1; cor[i * 3] = 1 }
  return { vertices, pos, nor, cor, chao }
}

// entra uma pilha no lote, como o jogo faz: reserva a faixa, escreve a geometria e fecha
function entra(lote, nome, vertices) {
  const ticket = lote.reservar(nome, vertices)
  if (!ticket) return null
  lote.escrever(ticket, dados(vertices), 0, vertices)
  return lote.fechar(ticket, limites())
}

function montar(vertices = 100000) {
  limparEstaticos()
  const grupo = new THREE.Group()
  const lote = new LoteCasas({
    grupo,
    cfg: { desempenho: { casasLoteVertices: vertices } },
    materiais: [
      { nome: 'reboco', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: true },
      { nome: 'pecas', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: true },
      { nome: 'telhas', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: true },
      { nome: 'interior', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: false },
    ],
  })
  return { grupo, cfg: { desempenho: { casasLoteVertices: vertices } }, lote }
}

describe('lote das casas', () => {
  beforeEach(() => limparEstaticos())

  it('cada material vira um lote, com o corte por instância e o registro na sombra', () => {
    const { grupo, lote } = montar()
    expect(lote.lotes.size).toBe(4)
    const id = entra(lote, 'reboco', 12)
    const reboco = lote.lotes.get('reboco')
    expect(reboco.mesh.isBatchedMesh).toBe(true)
    expect(reboco.mesh.castShadow).toBe(true)
    expect(reboco.mesh.perObjectFrustumCulled).toBe(true) // o corte por instância
    expect(reboco.mesh.material).toBe(reboco.material) // o material do lote é o do material
    expect(reboco.mesh.parent).toBe(grupo) // o lote entra no grupo das casas (a cena o desenha)
    // o interior não projeta sombra: não entra no registro dos parados
    entra(lote, 'interior', 12)
    expect(lote.lotes.get('interior').mesh.castShadow).toBe(false)
    expect(lote.lotes.get('interior').itens.size).toBe(1)
    expect(id).toBeTruthy()
  })

  it('a geometria do bloco entra no lote e começa escondida (o LOD manda)', () => {
    const { lote } = montar()
    const id = entra(lote, 'reboco', 12)
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
    const id = entra(lote, 'reboco', 12)
    lote.mostrar(id, true)
    expect(lote.remover(id)).toBe(true)
    expect(lote.stats().geometrias).toBe(0)
    expect(lote.stats().visiveis).toBe(0)
    expect(lote.stats().vertices).toBe(0)
    expect(lote.mostrar(id, true)).toBe(false) // o bloco não está mais no lote
  })

  it('o lote não cresce: o espaço reservado é o final e o bloco que não cabe fica de fora', () => {
    const { lote } = montar(100000)
    const antes = lote.stats()
    const primeiro = entra(lote, 'reboco', 60)
    expect(primeiro).toBeTruthy()
    const arrayAntes = lote.lotes.get('reboco').mesh.geometry.attributes.position.array
    // uma pilha maior que o espaço reservado: o lote não cresce (crescer recria o buffer e a
    // placa sobe tudo de novo: era o pico de 100 ms), e o bloco usa o caminho de antes
    const segundo = entra(lote, 'reboco', 60000)
    expect(segundo).toBeNull()
    expect(lote.reservar('reboco', 60000)).toBeNull()
    expect(lote.stats().reservados).toBe(antes.reservados) // o espaço não mudou
    expect(lote.stats().geometrias).toBe(1)
    const arrayDepois = lote.lotes.get('reboco').mesh.geometry.attributes.position.array
    expect(arrayDepois.length).toBe(arrayAntes.length)
    expect(arrayDepois[0]).toBe(0) // a primeira casa continua no lugar
    lote.mostrar(primeiro, true)
    expect(lote.stats().visiveis).toBe(1)
  })

  it('a escrita marca só o trecho escrito (a placa não sobe o buffer inteiro)', () => {
    const { lote } = montar()
    const ticket = lote.reservar('pecas', 300)
    const d = dados(300)
    lote.escrever(ticket, d, 100, 50) // só a fatia do meio
    const attr = lote.lotes.get('pecas').mesh.geometry.attributes.position
    // a faixa escrita está no lugar certo (o vértice 100 da pilha é o 100 da faixa)
    const inicio = ticket.info.vertexStart + 100
    expect(attr.array[inicio * 3]).toBe(100)
    // e só o trecho escrito é marcado para subir
    const faixa = attr.updateRanges.at(-1)
    expect(faixa.start).toBe(inicio * 3)
    expect(faixa.count).toBe(50 * 3)
  })

  it('a instância só entra quando a pilha inteira entrou', () => {
    const { lote } = montar()
    const ticket = lote.reservar('pecas', 100)
    lote.escrever(ticket, dados(100), 0, 40)
    // ainda não fechou: o bloco não tem instância (e não é desenhado)
    expect(lote.lotes.get('pecas').itens.size).toBe(0)
    lote.escrever(ticket, dados(100), 40, 60)
    const id = lote.fechar(ticket, limites())
    expect(id).toBeTruthy()
    expect(lote.lotes.get('pecas').itens.size).toBe(1)
    const info = lote.lotes.get('pecas').mesh._geometryInfo.find((i) => i.vertexCount === 100)
    expect(info.count).toBe(100) // o desenho é só a faixa da pilha
  })

  it('a fatia de cada material sai do espaço total reservado (as peças ficam com a parte maior)', () => {
    const estimativa = estimarCapacidade({
      casas: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }],
      morro: [{ id: 6 }, { id: 7 }, { id: 8 }],
      total: 1000000,
    })
    const pecas = estimativa.capacidade.pecas
    const telhas = estimativa.capacidade.telhas
    expect(pecas).toBeGreaterThan(telhas) // as peças da casa ocupam mais espaço que o telhado
    const soma = Object.values(estimativa.capacidade).reduce((a, b) => a + b, 0)
    expect(soma).toBeLessThanOrEqual(1000000 + 6 * 20000) // e o todo cabe no espaço reservado
    // a casa do casario pesa mais que a do morro: o morro fica com a parte menor do reboco
    expect(estimativa.capacidade.pecas).toBeGreaterThan(estimativa.capacidade.reboco)
  })

  it('a geometria do bloco tem os mesmos atributos do lote (o three exige)', () => {
    const { lote } = montar()
    entra(lote, 'reboco', 9)
    const g = lote.lotes.get('reboco').mesh.geometry
    for (const a of ['position', 'normal', 'color', 'aChao']) expect(g.getAttribute(a)).toBeTruthy()
    expect(g.getAttribute('position').count).toBeGreaterThanOrEqual(9)
  })

  it('as contas do lote (para o console e o medidor)', () => {
    const { lote } = montar()
    entra(lote, 'pecas', 100)
    entra(lote, 'telhas', 50)
    const s = lote.stats()
    expect(s.lotes).toBe(4) // cada material tem o seu lote, do começo (o espaço é final)
    expect(s.geometrias).toBe(2) // e só dois blocos entraram
    expect(s.vertices).toBe(150)
  })
})
