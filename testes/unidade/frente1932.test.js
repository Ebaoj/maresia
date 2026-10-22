// A frente contínua (src/mundo/frente1932.js, revisão do WIP 0fc5207).
// Pega três defeitos do WIP, vistos no jogo em 21/10/2026:
//   1. a folga entre dois quarteirões (a rua transversal) virava muro ou casa: a parede cega
//      atravessando a rua (casario1932.js, folgaCruzaRua / frenteOlhaParaFolga);
//   2. a casa nova da folga nascia no largo da Sé, na frente da fachada (o ponto de vista do "Ir para");
//   3. um muro novo fechava a vista do Mercado de Ferro.
// Os dois últimos: folgaProibida (marcos, reservas, praça, corredor das vistas).
import { describe, it, expect } from 'vitest'
import { frenteOlhaParaFolga, VAOS } from '../../src/mundo/casario1932.js'
import { folgaProibida } from '../../src/mundo/frente1932.js'
import { VISTAS } from '../../src/mundo/marcos1932/vistas.js'
import { VISTAS_MARCOS } from '../../src/mundo/vistas-marcos.js'
import { CENTRO } from '../../src/mundo/praca1932.js'

// uma rua lés-oeste: os lotes do quarteirão ficam ao sul (z negativo), a rua ao norte (normal +z).
// A folga vai de x = 0 a x = 12.
const A = [0, 0]
const B = [12, 0]
const N = [0, 1]
const frente = (x0, z0, x1, z1, nx, nz) => ({ a: [x0, z0], b: [x1, z1], normal: [nx, nz] })

describe('a folga da testada que é rua', () => {
  it('a rua transversal: os lotes de esquina dão a frente para dentro da folga', () => {
    // o lote da esquina oeste, na rua transversal: a frente corre para o sul e olha para leste (+x)
    expect(frenteOlhaParaFolga(frente(0, -2, 0, -14, 1, 0), A, B, N, 20)).toBe(true)
    // o da esquina leste olha para oeste
    expect(frenteOlhaParaFolga(frente(12, -2, 12, -14, -1, 0), A, B, N, 20)).toBe(true)
  })
  it('o lote vazio no meio do quarteirão: ninguém olha para ele', () => {
    // a vizinha da mesma rua (olha para a rua, +z)
    expect(frenteOlhaParaFolga(frente(-10, 0, 0, 0, 0, 1), A, B, N, 20)).toBe(false)
    // um lote de fundos, de costas para a folga (olha para oeste, longe dela)
    expect(frenteOlhaParaFolga(frente(14, -2, 14, -14, 1, 0), A, B, N, 20)).toBe(false)
    // uma frente do outro lado da rua (fora do quarteirão)
    expect(frenteOlhaParaFolga(frente(0, 6, 0, 18, 1, 0), A, B, N, 20)).toBe(false)
  })
  it('na planta de 1932 uma parte das folgas é rua transversal, mas não todas', () => {
    const ruas = VAOS.filter((v) => v.rua).length
    expect(ruas / VAOS.length).toBeGreaterThan(0.1)
    expect(ruas / VAOS.length).toBeLessThan(0.9)
  })
})

describe('onde a frente contínua não entra', () => {
  const casa = (x, z) => ({ x, z, w: 8, d: 10, rot: 0 })
  it('nenhuma casa nova no ponto de vista de um marco nem no caminho até ele', () => {
    for (const v of [...Object.values(VISTAS), ...Object.values(VISTAS_MARCOS)]) {
      expect(folgaProibida(casa(v.x, v.z))).toBe(true)
      expect(folgaProibida(casa((v.x + v.alvo[0]) / 2, (v.z + v.alvo[1]) / 2))).toBe(true)
    }
  })
  it('nem dentro da Praça do Ferreira', () => {
    expect(folgaProibida(casa(...CENTRO))).toBe(true)
  })
  it('mas uma casa longe dos marcos e das vistas pode', () => {
    expect(folgaProibida(casa(CENTRO[0] + 900, CENTRO[1] + 700))).toBe(false)
  })
})

describe('as folgas entre cadeias (hipótese de 21/10/2026)', () => {
  const hip = VAOS.filter((v) => v.hipotese)
  it('existem, e a maioria das folgas entre cadeias é rua transversal (fica aberta)', () => {
    expect(hip.length).toBeGreaterThan(100)
    expect(hip.filter((v) => v.rua).length / hip.length).toBeGreaterThan(0.5)
  })
  it('a folga entre cadeias é da mesma face de quarteirão: de 7 a 120 m', () => {
    for (const v of hip) {
      expect(v.largura).toBeGreaterThanOrEqual(7)
      expect(v.largura).toBeLessThanOrEqual(120)
    }
  })
})
