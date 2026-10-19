// KAN-73 T1 (18/10/2026): o kit de peças de 1932 monta a mesma casa do gerador do jogo (casa() em quarteirao.js).
// Mesma semente, mesma lista de peças; o sorteio consumido é o mesmo de casa() (senão a casa seguinte de uma rua
// sairia diferente); toda peça pedida tem forma, e nenhuma matriz sai com número inválido.
import { describe, expect, it } from 'vitest'
import { pecasDaCasa, formaDaPeca, agruparPecas } from '../../src/mundo/kit1932.js'
import { planejarCasa } from '../../src/mundo/quarteirao.js'
import { criarAleatorio } from '../../src/utils.js'

const CORES = ['#efe6d2', '#e8c9a0', '#cfe0d8', '#f2ebdc', '#e7b9a4']
function lote(i, simples) {
  return { x: i * 12, z: 0, w: 6 + (i % 5), d: 10, frente: [0, 1], rot: 0, cor: CORES[i % CORES.length], chao: 0, y: 0, h: simples ? 3.4 : 5 }
}

describe('kit de 1932', () => {
  for (const simples of [false, true]) {
    it(`mesma semente, mesmas peças (${simples ? 'morro' : 'casario'})`, () => {
      for (let i = 0; i < 40; i++) {
        const a = pecasDaCasa(lote(i, simples), criarAleatorio(1932 + i * 7919), simples)
        const b = pecasDaCasa(lote(i, simples), criarAleatorio(1932 + i * 7919), simples)
        expect(a.map((p) => p.peca + p.matriz.elements.join(',') + p.cor)).toEqual(b.map((p) => p.peca + p.matriz.elements.join(',') + p.cor))
      }
    })

    it(`sorteia na mesma ordem de casa() (${simples ? 'morro' : 'casario'})`, () => {
      for (let i = 0; i < 40; i++) {
        const r1 = criarAleatorio(1932 + i * 7919)
        const r2 = criarAleatorio(1932 + i * 7919)
        planejarCasa(lote(i, simples), r1, simples)
        pecasDaCasa(lote(i, simples), r2, simples)
        expect(r2.proximo()).toBe(r1.proximo())
      }
    })
  }

  it('toda peça tem forma e nenhuma matriz é inválida; o kit é pequeno', () => {
    const listas = []
    for (let i = 0; i < 200; i++) listas.push(pecasDaCasa(lote(i, i % 4 === 0), criarAleatorio(1932 + i * 7919), i % 4 === 0))
    for (const l of listas) for (const p of l) expect(p.matriz.elements.every(Number.isFinite)).toBe(true)
    const grupos = agruparPecas(listas)
    for (const g of grupos) expect(formaDaPeca(g.peca).attributes.position.count).toBeGreaterThan(0)
    const modelos = new Set(grupos.map((g) => g.material + '|' + g.peca)).size
    expect(modelos).toBeLessThan(80) // 200 casas viram poucas dezenas de modelos, não 200
  })
})
