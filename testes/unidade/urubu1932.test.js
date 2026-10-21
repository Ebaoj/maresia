// O Campo do Urubu no mundo (src/mundo/urubu1932.js).
//
// Este teste segura duas coisas que já quebraram:
//   1. a escala do mapa: ela é invertida com facilidade (unidades por metro em vez de metro por
//      unidade), e com a escala errada os galpões nascem com tamanho zero e ninguém vê nada;
//   2. o tamanho das peças do campo em unidades de jogo.
//
// A guarda de "a cidade não constrói em cima do campo" é o cenário campoDoUrubuVazio, em
// testes/jogo/cenarios.js: ela precisa do raster, que só se lê no navegador.
import { describe, it, expect } from 'vitest'
import { CAMPO_URUBU } from '../../src/mundo/mapa1932.js'
import { escalaNoCampo } from '../../src/mundo/urubu1932.js'

describe('o Campo do Urubu', () => {
  it('tem as peças que a história registra: 20 tarefas, 4 galpões, 3 construções', () => {
    expect(CAMPO_URUBU.tarefas.length).toBe(20)
    expect(CAMPO_URUBU.galpoes.length).toBe(4)
    expect(CAMPO_URUBU.construcoes.length).toBe(3)
    expect(CAMPO_URUBU.poligono.length).toBeGreaterThanOrEqual(4)
  })

  it('a escala do mapa é metro por unidade, não o contrário', () => {
    // o centro do campo, mais ou menos onde as tarefas se juntam
    const cx = CAMPO_URUBU.tarefas.reduce((s, t) => s + t.ponto[0], 0) / CAMPO_URUBU.tarefas.length
    const cz = CAMPO_URUBU.tarefas.reduce((s, t) => s + t.ponto[1], 0) / CAMPO_URUBU.tarefas.length
    const escala = escalaNoCampo(cx, cz)
    // o mapa é comprimido: uma unidade vale alguns metros, nunca menos de 2 nem mais de 30
    expect(escala.x).toBeGreaterThan(2)
    expect(escala.x).toBeLessThan(30)
    expect(escala.z).toBeGreaterThan(2)
    expect(escala.z).toBeLessThan(30)
    // e o galpão de 240 m por 110 m tem que dar uma medida de casa na tela, não zero
    const l = CAMPO_URUBU.galpoes[0].largura / escala.x
    const p = CAMPO_URUBU.galpoes[0].profundidade / escala.z
    expect(l).toBeGreaterThan(8)
    expect(l).toBeLessThan(60)
    expect(p).toBeGreaterThan(5)
    expect(p).toBeLessThan(60)
  })

})

// Bug: os três controles "Campo do Urubu" do painel não faziam nada; urubu1932.js lia PADRAO.mundo.urubu em vez do
// cfg do jogo (corrigido no commit do chão e da terra seca, 21/10/2026). Com o cfg, a gente do campo segue o número.
describe('o Campo do Urubu lê o config do jogo', () => {
  it('a quantidade de gente vem de cfg.mundo.urubu.gente', async () => {
    const THREE = await import('three')
    const { criarUrubu1932 } = await import('../../src/mundo/urubu1932.js')
    const conta = (gente) => {
      const cena = new THREE.Scene()
      criarUrubu1932(cena, { mundo: { urubu: { alturaGalpao: 5.2, alturaCerca: 1.8, gente } } })
      let n = 0
      cena.traverse((o) => { if (o.name === 'urubu-gente') n += o.count })
      return n
    }
    expect(conta(0)).toBe(0)
    expect(conta(10)).toBe(10)
  })
})
