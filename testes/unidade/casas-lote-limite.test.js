// Fase 2 (25/10/2026): o lote das casas aguenta o mapa inteiro.
//
// O three tem um limite de instâncias por BatchedMesh (o mapa de 1932 tem mais de mil blocos de casas,
// e cada bloco é uma instância do lote do seu material). Se o limite for pequeno demais, o three lança
// um erro no meio da montagem do bloco e o jogo cai.
//
// 26/10/2026: o lote tem o espaço final e nunca cresce. Quando o espaço (ou as instâncias) acaba, o
// bloco que não cabe usa o caminho de antes (uma malha por pilha): o jogo continua, e o que já está no
// lote continua lá.
//
// Bugs que estes testes pegam:
//  - o limite de instâncias do lote ser pequeno demais (o jogo cair ao montar o mapa inteiro);
//  - o lote encher e a casa nova não entrar (a casa some do jogo);
//  - o lote encher e o que já estava dentro se perder (as casas montadas somem).
import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'
import { LoteCasas } from '../../src/mundo/casas-lote.js'
import { limparEstaticos } from '../../src/render/sombra-estatica.js'

const limites = () => ({ esfera: new THREE.Sphere(new THREE.Vector3(), 10), caixa: new THREE.Box3() })

function dados(vertices) {
  const pos = new Float32Array(vertices * 3)
  const nor = new Float32Array(vertices * 3)
  const cor = new Float32Array(vertices * 3)
  const chao = new Float32Array(vertices)
  for (let i = 0; i < vertices; i++) { pos[i * 3] = i; nor[i * 3 + 1] = 1; cor[i * 3] = 1 }
  return { vertices, pos, nor, cor, chao }
}

// entra uma pilha no lote (reserva, escreve e fecha); devolve null quando não cabe
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
    materiais: [{ nome: 'pecas', material: new THREE.MeshToonMaterial({ vertexColors: true }), castShadow: true }],
  })
  return { grupo, lote }
}

describe('o limite de instâncias do lote', () => {
  beforeEach(() => limparEstaticos())

  it('o lote reserva instâncias para o mapa inteiro (o three lança quando o limite estoura)', () => {
    const { lote } = montar()
    // o mapa de 1932 tem mais de mil blocos de casas: o lote precisa de folga para todos
    expect(lote.instanciasReservadas).toBeGreaterThanOrEqual(1024)
  })

  it('mais casas que o limite não derrubam o jogo: o que não cabe usa o caminho de antes', () => {
    const { lote } = montar()
    const limite = lote.instanciasReservadas
    const ids = []
    for (let i = 0; i < limite + 10; i++) {
      const id = entra(lote, 'pecas', 3)
      // nenhuma casa pode se perder: as que não cabem no lote saem para o caminho de antes
      if (id) ids.push(id)
    }
    expect(ids.length).toBe(limite) // as que couberam
    const s = lote.stats()
    expect(s.geometrias).toBe(limite)
    expect(s.malhas).toBe(1) // o lote não ganha outra malha (o espaço é final)
    // o que entrou na malha continua lá
    const primeiro = lote.lotes.get('pecas').itens.get(ids[0])
    expect(primeiro.mesh.getVisibleAt(primeiro.instancia)).toBe(false)
    lote.mostrar(ids[0], true)
    expect(primeiro.mesh.getVisibleAt(primeiro.instancia)).toBe(true)
    lote.mostrar(ids.at(-1), true)
    expect(lote.stats().visiveis).toBe(2)
  })

  it('o espaço do lote é o final: uma pilha maior que ele não entra (o bloco fica de fora)', () => {
    const { lote } = montar(60000)
    expect(entra(lote, 'pecas', 40000)).toBeTruthy()
    expect(entra(lote, 'pecas', 40000)).toBeNull() // o espaço acabou: o lote não cresce
    expect(lote.stats().reservados).toBe(60000)
    expect(lote.stats().geometrias).toBe(1)
  })
})
