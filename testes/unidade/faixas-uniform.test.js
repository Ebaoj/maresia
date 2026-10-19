// Briefing 7 (KAN-70): uma gravação por binding de uniforms no WebGPU. Sem GPU: um renderizador falso conta as
// chamadas do updateBinding original do three e as de device.queue.writeBuffer.
//
// Bugs que estes testes pegam:
//  - várias faixas gravadas uma a uma (o custo que o remendo existe para tirar);
//  - buffer grande regravado inteiro a cada quadro (mais caro do que as faixas);
//  - caso de uma faixa ou nenhuma desviado do três;
//  - o remendo limpar as faixas (quem limpa é o chamador) ou ser instalado duas vezes.
import { describe, expect, it } from 'vitest'
import { gravaInteiro, instalarFaixasUnicas } from '../../src/render/gpu/faixas-uniform.js'

function montar() {
  const gravacoes = []
  const chamadasOriginal = []
  const bufferGpu = { id: 'gpu' }
  const original = function (binding) { chamadasOriginal.push({ binding, este: this }) }
  const renderer = {
    backend: {
      device: { queue: { writeBuffer: (...args) => gravacoes.push(args) } },
      get: () => ({ buffer: bufferGpu }),
      bindingUtils: { updateBinding: original },
    },
  }
  const binding = (nFaixas, floats) => ({
    buffer: new Float32Array(floats),
    updateRanges: Array.from({ length: nFaixas }, (_, i) => ({ start: i * 8, count: 4 })),
  })
  return { renderer, gravacoes, chamadasOriginal, bufferGpu, binding, utils: renderer.backend.bindingUtils, original }
}

describe('gravaInteiro', () => {
  it('só com mais de uma faixa e buffer até o limite', () => {
    expect(gravaInteiro(0, 144, 4096)).toBe(false)
    expect(gravaInteiro(1, 144, 4096)).toBe(false)
    expect(gravaInteiro(2, 144, 4096)).toBe(true)
    expect(gravaInteiro(7, 4096, 4096)).toBe(true)
    expect(gravaInteiro(7, 4097, 4096)).toBe(false)
  })
  it('o limite padrão é 4096', () => {
    expect(gravaInteiro(3, 4096)).toBe(true)
    expect(gravaInteiro(3, 4100)).toBe(false)
  })
})

describe('instalarFaixasUnicas', () => {
  it('1 faixa: chama o original e o remendo não grava', () => {
    const t = montar()
    instalarFaixasUnicas(t.renderer)
    const b = t.binding(1, 64)
    t.utils.updateBinding(b)
    expect(t.chamadasOriginal).toHaveLength(1)
    expect(t.chamadasOriginal[0].binding).toBe(b)
    expect(t.gravacoes).toHaveLength(0)
  })

  it('3 faixas e buffer pequeno: não chama o original e grava o buffer inteiro uma vez, com offset 0', () => {
    const t = montar()
    instalarFaixasUnicas(t.renderer)
    const b = t.binding(3, 64)
    t.utils.updateBinding(b)
    expect(t.chamadasOriginal).toHaveLength(0)
    expect(t.gravacoes).toHaveLength(1)
    const [buf, offset, dados, dataOffset, tamanho] = t.gravacoes[0]
    expect(buf).toBe(t.bufferGpu)
    expect(offset).toBe(0)
    expect(dados).toBe(b.buffer)
    expect(dataOffset).toBe(0)
    expect(tamanho).toBeUndefined() // sem tamanho: o buffer inteiro
  })

  it('3 faixas e buffer maior que o limite: chama o original', () => {
    const t = montar()
    instalarFaixasUnicas(t.renderer, { limite: 128 })
    const b = t.binding(3, 64) // 256 B
    t.utils.updateBinding(b)
    expect(t.chamadasOriginal).toHaveLength(1)
    expect(t.gravacoes).toHaveLength(0)
  })

  it('0 faixas: chama o original (que grava tudo)', () => {
    const t = montar()
    instalarFaixasUnicas(t.renderer)
    t.utils.updateBinding(t.binding(0, 64))
    expect(t.chamadasOriginal).toHaveLength(1)
    expect(t.gravacoes).toHaveLength(0)
  })

  it('mantém o this do original e não limpa as faixas', () => {
    const t = montar()
    instalarFaixasUnicas(t.renderer)
    const b = t.binding(1, 64)
    t.utils.updateBinding(b)
    expect(t.chamadasOriginal[0].este).toBe(t.utils)
    const c = t.binding(3, 64)
    t.utils.updateBinding(c)
    expect(c.updateRanges).toHaveLength(3)
  })

  it('instalar duas vezes não embrulha duas vezes', () => {
    const t = montar()
    instalarFaixasUnicas(t.renderer)
    const primeiro = t.utils.updateBinding
    instalarFaixasUnicas(t.renderer)
    expect(t.utils.updateBinding).toBe(primeiro)
    t.utils.updateBinding(t.binding(1, 64))
    expect(t.chamadasOriginal).toHaveLength(1)
  })
})
