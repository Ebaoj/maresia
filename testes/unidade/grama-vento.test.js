// Bug (21/10/2026, revisão das árvores pintadas): a grama deitava para leste, com a direção fixa vec2(1.0, 0.45) no
// shader, enquanto as árvores e o coqueiro balançam no alísio de lés-sudeste (cfg.vento, de 110 graus: para oeste).
// O teste lê o shader da grama nos dois renderizadores: a direção, a força e as rajadas têm de vir dos mesmos
// uniforms do vento das árvores (globais.uVentoDir, uVentoForca, uVentoRaj, uVentoRajVel). Correção: o commit
// "Grama no mesmo vento das árvores".
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const fonte = readFileSync(new URL('../../src/mundo/grama.js', import.meta.url), 'utf8')

describe('grama no vento das árvores', () => {
  it('nenhuma direção de vento fixa no shader (GLSL e TSL)', () => {
    expect(fonte).not.toMatch(/normalize\(vec2\(1\.0, 0\.45\)\)/)
  })
  it('a curva da folha segue a direção, a força e a rajada do vento comum', () => {
    expect(fonte).toMatch(/vec2 curva = dirV \* .*uVentoForcaG \* rajG/)
    expect(fonte).toMatch(/const curva = dirV\.mul\(.*R\.uVentoForcaG\)\.mul\(rajG\)/)
    for (const k of ['uVentoDir', 'uVentoForca', 'uVentoRaj', 'uVentoRajVel']) expect(fonte).toContain(`globais.${k}`)
  })
})
