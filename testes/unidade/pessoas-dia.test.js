// A gente do Centro de dia (src/mundo/pessoas.js, 21/10/2026): o movimento do dia existe e some à noite,
// saindo também do registro que os atores animados usam (senão um ator aparecia na praça vazia de noite).
import { describe, it, expect } from 'vitest'
import { criarPessoas } from '../../src/mundo/pessoas.js'
import { GRADE } from '../../src/mundo/cidade.js'
import { PADRAO } from '../../src/config.js'

describe('gente do Centro de dia', () => {
  const cena = { add() {} }
  const p = criarPessoas(cena, GRADE, PADRAO)
  it('de dia o registro tem o movimento do Centro; à noite, só a gente de sempre', () => {
    p.atualizar(1 / 60, 0, 12)
    const dia = p.registro.length
    p.atualizar(1 / 60, 0, 22)
    const noite = p.registro.length
    // (no Node o raster da planta não carrega: quem anda na calçada precisa dele; os grupos parados, não)
    expect(dia - noite).toBeGreaterThan(200)
    p.atualizar(1 / 60, 0, 9)
    expect(p.registro.length).toBe(dia)
  })
  it('sem o cfg, nada muda (a gente de antes)', () => {
    const q = criarPessoas(cena, GRADE)
    q.atualizar(1 / 60, 0, 12)
    const a = q.registro.length
    q.atualizar(1 / 60, 0, 22)
    expect(q.registro.length).toBe(a)
  })
})
