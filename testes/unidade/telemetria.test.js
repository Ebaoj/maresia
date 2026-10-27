// Telemetria (src/telemetria/gravador.js): opt-out, percentis e causa provável das travadas.
import { describe, it, expect } from 'vitest'
import { telemetriaDesligada, percentil, causaProvavel, instrumentarDesenho } from '../../src/telemetria/gravador.js'

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
  it('causa (27/10/2026): shader e textura antes do desenho; tarefa longa de fora; thread livre = espera da placa', () => {
    expect(causaProvavel(80, { cena: 60 }, false, true)).toBe('shader')
    expect(causaProvavel(80, { cena: 50, atualizar: 3 }, false, false)).toBe('cena')
    expect(causaProvavel(90, { cena: 6, atualizar: 4 }, false, false, { longaFora: 60 })).toBe('gc-ou-tarefa')
    expect(causaProvavel(90, { cena: 6, atualizar: 4 }, false, false)).toBe('gpu-ou-espera')
  })
  it('instrumentarDesenho separa sombra, cena e pós', () => {
    const marcas = {}
    const cena = {}
    const r = { shadowMap: { render() {} }, render(c) { if (c === cena) this.shadowMap.render(); else this.render(cena) } }
    instrumentarDesenho(r, cena, (k, d) => { marcas[k] = (marcas[k] || 0) + d })
    r.render(cena)
    r.render({})
    expect(Object.keys(marcas).sort()).toEqual(['cena', 'pos', 'sombra'])
  })
})
