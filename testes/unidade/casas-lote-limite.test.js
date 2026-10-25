// Fase 2 (25/10/2026): o lote das casas aguenta o mapa inteiro.
//
// O three tem um limite de instâncias por BatchedMesh (o mapa de 1932 tem mais de mil blocos de casas,
// e cada bloco é uma instância do lote do seu material). Se o limite for pequeno demais, o three lança
// um erro no meio da montagem do bloco e o jogo cai.
//
// Bugs que estes testes pegam:
//  - o limite de instâncias do lote ser pequeno demais (o jogo cair ao montar o mapa inteiro);
//  - o lote encher e a casa nova não entrar (a casa some do jogo);
//  - o lote encher e o que já estava dentro se perder (as casas montadas somem).
import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'
import { LoteCasas } from '../../src/mundo/casas-lote.js'
import { limparEstaticos } from '../../src/render/sombra-estatica.js'

function geometria(n = 3) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('aChao', new THREE.BufferAttribute(new Float32Array(n), 1))
  return g
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

  it('mais casas que o limite não derrubam o jogo: o lote ganha outra malha do mesmo material', () => {
    const { lote } = montar()
    const limite = lote.instanciasReservadas
    const ids = []
    for (let i = 0; i < limite + 10; i++) {
      const id = lote.adicionar('pecas', geometria(3))
      expect(id).toBeTruthy() // nenhuma casa pode se perder
      ids.push(id)
    }
    const s = lote.stats()
    expect(s.geometrias).toBe(limite + 10)
    expect(s.malhas).toBe(2) // duas malhas do mesmo material (a primeira encheu)
    // o que entrou na primeira malha continua lá
    const primeiro = lote.lotes.get('pecas').itens.get(ids[0])
    expect(primeiro.mesh.getVisibleAt(primeiro.instancia)).toBe(false)
    lote.mostrar(ids[0], true)
    expect(primeiro.mesh.getVisibleAt(primeiro.instancia)).toBe(true)
    // e a casa que entrou na malha nova também
    const ultimo = lote.lotes.get('pecas').itens.get(ids.at(-1))
    lote.mostrar(ids.at(-1), true)
    expect(ultimo.mesh.getVisibleAt(ultimo.instancia)).toBe(true)
    expect(lote.stats().visiveis).toBe(2)
  })
})
