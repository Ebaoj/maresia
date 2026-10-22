// O mapa de luz dos lampiões (src/mundo/cenografia.js) cabe num buffer do WebGPU.
// Pega: a textura tinha 0,5 m por pixel fixo, em RGBA float (16 bytes por pixel), do tamanho da caixa
// de todos os lampiões. Com o Campo do Urubu em tamanho real o mundo cresceu e a textura passou a
// 290 MB, acima dos 256 MB do limite de buffer do WebGPU: o cenário semErros reprovou com
// "Buffer size (289916448) exceeds the max buffer size limit". Correção: resolucaoMapaDeLuz.
import { describe, it, expect } from 'vitest'
import { resolucaoMapaDeLuz } from '../../src/mundo/cenografia.js'
import { LIMITES } from '../../src/mundo/fortaleza1932.js'

const LIMITE_BUFFER = 268435456

describe('mapa de luz dos lampiões', () => {
  it('nem o mundo inteiro passa do limite de buffer do WebGPU', () => {
    const w = LIMITES.x1 - LIMITES.x0
    const h = LIMITES.z1 - LIMITES.z0
    const res = resolucaoMapaDeLuz(w, h)
    const bytes = Math.ceil(w / res) * Math.ceil(h / res) * 16
    expect(bytes).toBeLessThan(LIMITE_BUFFER)
  })
  it('numa caixa pequena continua com 0,5 m por pixel', () => {
    expect(resolucaoMapaDeLuz(800, 600)).toBe(0.5)
  })
})
