// Os botões "Ir para" do painel (pedido do Joabe, 21/10/2026): todo destino precisa existir em LUGARES,
// senão o botão não faz nada calado (por exemplo, se um lugar for renomeado em fortaleza1932.js).
import { describe, it, expect } from 'vitest'
import { DESTINOS, irParaLugar } from '../../src/ui/painel/jogo.js'
import { lugaresJogo } from '../../src/mundo/fortaleza1932.js'

describe('painel: Ir para', () => {
  it('todo destino existe no mapa', () => {
    for (const [nome, chave] of DESTINOS) expect([nome, Array.isArray(lugaresJogo[chave])]).toEqual([nome, true])
  })
  it('o botão solta a fatia e teleporta para o lugar', () => {
    const cfg = { fatia: { travar: true } }
    const chamadas = []
    const ok = irParaLugar(cfg, 'pracaFerreira', { irPara: (x, z) => chamadas.push([x, z]) })
    expect(ok).toBe(true)
    expect(cfg.fatia.travar).toBe(false)
    expect(chamadas).toEqual([lugaresJogo.pracaFerreira])
  })
})
