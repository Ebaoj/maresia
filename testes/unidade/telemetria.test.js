// Telemetria (src/telemetria/gravador.js): opt-out, percentis e causa provável das travadas.
import { describe, it, expect } from 'vitest'
import { telemetriaDesligada, percentil, causaProvavel } from '../../src/telemetria/gravador.js'

describe('telemetria', () => {
  it('?semTelemetria desliga, o resto não', () => {
    expect(telemetriaDesligada('?semTelemetria')).toBe(true)
    expect(telemetriaDesligada('?qualidade=baixa&semTelemetria=1')).toBe(true)
    expect(telemetriaDesligada('?qualidade=baixa')).toBe(false)
  })
  it('percentis de uma lista ordenada', () => {
    const a = Float32Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentil(a, 100, 0.5)).toBe(51)
    expect(percentil(a, 100, 0.99)).toBe(100)
    expect(percentil(a, 0, 0.5)).toBe(0)
  })
  it('causa: o sistema que pesou, senão shader/textura', () => {
    expect(causaProvavel(80, { casas: 40, chunks: 2 }, false, false)).toBe('casas')
    expect(causaProvavel(80, { casas: 1 }, true, true)).toBe('shader')
    expect(causaProvavel(80, { casas: 1 }, true, false)).toBe('textura')
    expect(causaProvavel(80, {}, false, false)).toBe('desconhecida')
  })
})
