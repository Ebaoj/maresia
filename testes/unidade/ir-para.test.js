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

// Os pontos de vista dos marcos de 1932 (src/mundo/vistas-marcos.js): o botão leva para onde o conceito foi
// pintado, olhando para o marco, na hora do quadro (e não para o meio do marco, onde o jogador caía dentro da Sé)
import { VISTAS_MARCOS } from '../../src/mundo/vistas-marcos.js'
import { marcoSob } from '../../src/mundo/lotes-marcos.js'
import { VISTAS as VISTAS_CENTRO } from '../../src/mundo/marcos1932/vistas.js'
describe('painel: Ir para os marcos de 1932', () => {
  it('toda vista citada existe, fica fora do prédio e olha para ele', () => {
    for (const [nome, , vista] of DESTINOS) {
      if (!vista) continue
      // depois da junção com os marcos do centro (21/10), uma vista pode ser de qualquer uma das duas tabelas;
      // as do centro são conferidas em marcos1932.test.js, as do norte aqui, com os mesmos critérios de antes
      expect([nome, !!(VISTAS_MARCOS[vista] || VISTAS_CENTRO[vista])]).toEqual([nome, true])
      const v = VISTAS_MARCOS[vista]
      if (!v) continue
      // olhando para o marco: o alvo fica bem à frente da câmera (ela olha para -(sen yaw, cos yaw)), e o alvo
      // é do marco certo (dentro do terreno dele)
      const dx = v.alvo[0] - v.x
      const dz = v.alvo[1] - v.z
      expect(-(Math.sin(v.yaw) * dx + Math.cos(v.yaw) * dz) / Math.hypot(dx, dz)).toBeGreaterThan(0.99)
      expect(marcoSob(v.alvo[0], v.alvo[1], 8)).toBe(v.marco)
    }
    expect(marcoSob(VISTAS_MARCOS.se.x, VISTAS_MARCOS.se.z)).toBe('se') // no largo da Sé (o largo é do terreno dela)
  })
  it('o botão da vista teleporta com o giro e a hora do conceito', () => {
    const cfg = { fatia: { travar: true } }
    const chamadas = []
    const cam = { pitch: 0 }
    irParaLugar(cfg, 'se', { irPara: (...a) => chamadas.push(a), cam }, 'se')
    const v = VISTAS_MARCOS.se
    expect(chamadas).toEqual([[v.x, v.z, v.yaw, v.hora]])
    expect(cam.pitch).toBe(v.pitch)
  })
})
