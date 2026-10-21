// Sombra "mal definida, piscando, pixelada" (Joabe, 21/10/2026). Cada bloco pega uma das causas medidas no jogo
// (docs/motor-f4-cache-sombra.md, seção "Sombra nítida"). Os de viés e passo rodam também no código de antes
// (04cd764) e lá reprovam: 0,864 m de viés e salto de 0,94° num quadro.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { criarCeu } from '../../src/mundo/ceu.js'
import { PADRAO, migrarPadroes } from '../../src/config.js'

const cfgPadrao = () => JSON.parse(JSON.stringify(PADRAO))
const graus = (a, b) => (Math.acos(Math.min(1, a.dot(b) / (a.length() * b.length()))) * 180) / Math.PI

describe('viés da sombra do sol', () => {
  // o bias -0,0006 com near 1 e far 1.441 eram 0,86 m: a perna de quem está em pé não fazia sombra e a sombra
  // descolava do pé (ao meio-dia quase sumia)
  it('fica abaixo de 10 cm de profundidade, ao meio-dia e na hora dourada', () => {
    const ceu = criarCeu(new THREE.Scene())
    const cfg = cfgPadrao()
    for (const hora of [12, 16.6]) {
      ceu.atualizar(hora, new THREE.Vector3(700, 0, 0), 1 / 60, cfg)
      const sc = ceu.sol.shadow.camera
      expect(Math.abs(ceu.sol.shadow.bias) * (sc.far - sc.near)).toBeLessThan(0.1)
    }
  })
})

describe('passo do sol na sombra', () => {
  // com passoSombraMin = 4 (1 min de jogo por segundo real) a sombra inteira pulava ~1° a cada 4 s: tranco de
  // 2 a 3% da tela num quadro só (medido em vídeo com a câmera parada)
  it('quadro a quadro, a direção da luz não pula mais que 0,06°', () => {
    const ceu = criarCeu(new THREE.Scene())
    const cfg = cfgPadrao()
    const dir = () => ceu.sol.position.clone().sub(ceu.sol.target.position).normalize()
    let hora = 16.5
    ceu.atualizar(hora, new THREE.Vector3(), 1 / 60, cfg)
    let antes = dir()
    let maior = 0
    for (let i = 0; i < 600; i++) { // 10 s de jogo a 60 quadros
      hora += cfg.tempo.velocidade / 60 / 60
      ceu.atualizar(hora, new THREE.Vector3(), 1 / 60, cfg)
      const d = dir()
      maior = Math.max(maior, graus(antes, d))
      antes = d
    }
    expect(maior).toBeLessThan(0.06)
  })

  it('quem salvou o painel com o passo antigo (4) passa a ter o novo; outro valor escolhido fica', () => {
    expect(migrarPadroes({ mundo: { passoSombraMin: 4 } }).mundo.passoSombraMin).toBeUndefined()
    expect(migrarPadroes({ mundo: { passoSombraMin: 7 } }).mundo.passoSombraMin).toBe(7)
    expect(migrarPadroes({ tempo: { hora: 3 } })).toEqual({ tempo: { hora: 3 } })
  })
})

describe('filtro da borda (WebGL)', () => {
  it('troca o PCF do three 0.186 por uma grade fixa no mapa, sem ruído de tela no caminho padrão', async () => {
    const { instalarFiltroWebgl } = await import('../../src/render/filtro-sombra.js')
    const chunks = { ...THREE.ShaderChunk }
    expect(instalarFiltroWebgl(chunks)).toBe(true)
    const s = chunks.shadowmap_pars_fragment
    const ini = s.indexOf('Maresia: grade 3 x 3')
    const fim = s.indexOf('return mix( 1.0, shadow, shadowIntensity );', ini)
    expect(ini).toBeGreaterThan(0)
    expect(s.slice(ini, fim)).not.toContain('gl_FragCoord')
    // o ruído de tela continua só no ramo de raio negativo (o filtro de antes, para comparar)
    expect(s).toContain('- shadowRadius * texelSize.x')
    expect(instalarFiltroWebgl(chunks)).toBe(true) // segunda vez não duplica
    expect(chunks.shadowmap_pars_fragment.split('Maresia: grade 3 x 3').length).toBe(2)
  })
})
