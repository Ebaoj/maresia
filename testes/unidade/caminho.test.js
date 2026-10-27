import { describe, it, expect } from 'vitest'
import { daBase } from '../../src/caminho.js'

describe('daBase', () => {
  it('no base / deixa o caminho como está', () => {
    expect(daBase('/arte/finais/neto-mpfb.glb')).toBe('/arte/finais/neto-mpfb.glb')
  })
  it('não mexe em URL relativa, absoluta ou de outro host', () => {
    expect(daBase('arte/x.glb')).toBe('arte/x.glb')
    expect(daBase('https://a.b/x.glb')).toBe('https://a.b/x.glb')
    expect(daBase('//a.b/x.glb')).toBe('//a.b/x.glb')
  })
})
