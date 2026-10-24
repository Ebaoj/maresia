// O rastreador de picos (24/10/2026): diz o que aconteceu num quadro lento a partir das pistas.
import { describe, it, expect } from 'vitest'
import { explicarQuadro } from '../../src/debug/rastreador.js'
import { marcar, marcasEntre, limparMarcas } from '../../src/debug/marcas.js'

describe('rastreador de picos', () => {
  it('junta marca, arquivo, tarefa longa, shader, geometria e coleta de lixo do quadro', () => {
    const p = explicarQuadro({
      de: 100, ate: 260,
      marcas: [{ t: 150, nome: 'teleporte', dados: { x: 1, z: 2 } }, { t: 300, nome: 'fora' }],
      recursos: [{ nome: 'neto.glb', fim: 200 }, { nome: 'velho.glb', fim: 50 }],
      longas: [{ ini: 90, dur: 150 }],
      antes: { programas: 10, geometrias: 5, texturas: 2, heapMB: 900 },
      depois: { programas: 12, geometrias: 9, texturas: 2, heapMB: 850 },
    })
    expect(p).toEqual(['teleporte {"x":1,"z":2}', 'arquivo neto.glb', 'tarefa longa 150 ms', 'shaders novos: 2', 'geometrias novas: 4', 'heap caiu 50 MB (coleta de lixo?)'])
  })

  it('quadro sem nada devolve lista vazia', () => {
    expect(explicarQuadro({ de: 0, ate: 16 })).toEqual([])
  })

  it('as marcas ficam num anel e saem pela janela de tempo', () => {
    limparMarcas()
    marcar('a')
    const t = performance.now()
    marcar('b')
    expect(marcasEntre(t - 1, t + 1000).map((e) => e.nome)).toContain('b')
  })
})
