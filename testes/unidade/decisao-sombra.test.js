// Fase 2 (25/10/2026): o mapa de sombra do sol refeito só quando alguma coisa muda.
//
// Antes, todo quadro o three refazia o mapa de sombra do sol com todos os objetos da cena: era o peso de
// tela cheia que pesava no M1. Agora (cfg.mundo.sombraEstatica, o padrão) o mapa do sol é refeito inteiro
// (parados e o que se mexe, num passe só) só quando alguma coisa muda de verdade:
//   - o sol gira além do limiar (0,05 grau, em politica-sombra.js);
//   - o jogador sai da janela (cfg.mundo.cacheSombraRaio): a janela se recentra na grade de texels;
//   - aparece ou some uma casa (o bloco de casas avisa, por invalida('casas'));
//   - o jogo é teletransportado (invalida('teleporte'));
//   - o tamanho do mapa muda.
//
// O que se mexe perto da câmera (o jogador, a gente, o bicho) continua com sombra nova pelo mapa de perto
// (render/sombra-perto.js), refeito a cada cfg.mundo.sombraPertoACada quadros.
//
// Desligado (cfg.mundo.sombraEstatica = false), volta o caminho de camadas do F4: os parados num mapa à
// parte, copiado para o mapa vivo todo quadro.
//
// O que estes testes pegam:
//  - o mapa ser refeito todo quadro (o ganho inteiro da Fase 2 se perde);
//  - o mapa nunca ser refeito (a sombra fica velha: o sol gira, a casa aparece, o teleporte);
//  - a casa que aparece (o bloco de casas montado) não refazer o mapa (no lote das casas a assinatura
//    dos parados não muda: o aviso vem do bloco, por isso o invalidar('casas'));
//  - a sombra do jogador sumir (o passe de perto tem de continuar);
//  - a marca 'sombra:refeita' não sair com o motivo do refazer.
import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'
import { PoliticaCacheSombra } from '../../src/render/politica-sombra.js'
import { registrarEstatico, limparEstaticos } from '../../src/render/sombra-estatica.js'
import { CacheSombra } from '../../src/render/cache-sombra.js'
import { limparMarcas, marcasEntre } from '../../src/debug/marcas.js'

const sol = (x, y, z) => ({ x, y, z })
const graus = (g) => { const a = (g * Math.PI) / 180; return sol(Math.sin(a), Math.cos(a), 0) }

// Renderizador falso: o shadowMap.render "original" faz o que o three faz na escolha dos objetos e anota o passe.
function montar({ pertoACada = 2, estatica = true } = {}) {
  limparEstaticos()
  limparMarcas()
  const passes = []
  const r = {
    shadowMap: { enabled: true, autoUpdate: false, needsUpdate: false },
    clear() { passes.at(-1)?.limpou.push(true) },
    getRenderTarget: () => null,
    setRenderTarget() {},
    autoClear: true,
    info: { autoReset: true, render: { calls: 0 } },
    // o passe de cópia é um render() aninhado de uma cena só com o quadrado de tela cheia
    render(cena) { if (cena.children.some((o) => o.isMesh && o.material.isShaderMaterial)) passes.push({ tipo: 'copia', objetos: [], limpou: [] }) },
  }
  r.shadowMap.render = function (luzes, cena, cam) {
    if (!r.shadowMap.needsUpdate) return
    const luz = luzes[0]
    // o passe dos parados é o único em que a câmera só enxerga a camada dos parados
    const passe = { tipo: cam.layers.mask === 1 << 1 ? 'estatico' : 'vivo', luz: luz.name, objetos: [], limpou: [] }
    passes.push(passe)
    if (!luz.shadow.map) luz.shadow.map = { width: luz.shadow.mapSize.x, height: luz.shadow.mapSize.x, depthTexture: {} }
    r.clear() // o three limpa o mapa no começo de cada passe
    cena.traverse((o) => {
      if (o.isMesh && o.visible && o.castShadow && o.layers.test(cam.layers)) passe.objetos.push(o.name)
    })
    r.shadowMap.needsUpdate = false
    luz.shadow.needsUpdate = false
  }
  const luz = new THREE.DirectionalLight(); luz.name = 'sol'; luz.castShadow = true; luz.shadow.mapSize.set(64, 64)
  const perto = new THREE.DirectionalLight(); perto.name = 'perto'; perto.castShadow = true
  perto.shadow.mapSize.set(64, 64)
  perto.shadow.autoUpdate = false
  perto.shadow.needsUpdate = false
  const cena = new THREE.Scene(); cena.add(luz, perto)
  const cam = new THREE.PerspectiveCamera()
  const cfg = { mundo: { cacheSombra: true, cacheSombraRaio: 15, sombraEstatica: estatica, sombraPertoACada: pertoACada } }
  const cache = new CacheSombra(r, cena, cam, luz, cfg)
  const malha = (nome, parado) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.name = nome; m.castShadow = true; cena.add(m)
    if (parado) registrarEstatico(m)
    return m
  }
  let contador = 0
  const quadro = (centro = sol(0, 0, 0), dir = graus(30)) => {
    passes.length = 0
    cache.pose(centro, dir) // o céu faz isto antes do desenho
    // o mapa de perto tem o ritmo dele (sombra-perto.js): a cada N quadros
    contador++
    perto.shadow.needsUpdate = contador % pertoACada === 0
    r.shadowMap.needsUpdate = true // o pós faz isto todo quadro
    r.shadowMap.render([luz, perto], cena, cam)
    return passes.map((p) => ({ ...p }))
  }
  return { r, cache, cena, cam, luz, perto, cfg, malha, quadro }
}

describe('sombra do sol refeita só na mudança (Fase 2)', () => {
  beforeEach(() => limparEstaticos())

  it('o primeiro quadro refaz o mapa inteiro (parados e o que se mexe) e os seguintes não', () => {
    const t = montar()
    t.malha('casa', true); t.malha('neto', false)
    const p = t.quadro()
    const solPasse = p.find((x) => x.luz === 'sol')
    expect(solPasse).toBeTruthy()
    expect(solPasse.objetos.sort()).toEqual(['casa', 'neto']) // o mapa inteiro, num passe só
    expect(t.cache.stats.refeitos).toBe(1)
    for (let i = 0; i < 10; i++) {
      expect(t.quadro(sol(i, 0, 3)).find((x) => x.luz === 'sol')).toBeFalsy() // nada mudou: o passe some do quadro
    }
    expect(t.cache.stats.refeitos).toBe(1)
  })

  it('o jogador sair da janela refaz (a janela se recentra) e o sol girar além do limiar também', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    expect(t.quadro(sol(0, 0, 14)).find((x) => x.luz === 'sol')).toBeFalsy() // dentro do raio
    const longe = t.quadro(sol(0, 0, 40))
    expect(longe.find((x) => x.luz === 'sol')).toBeTruthy()
    expect(t.cache.stats.motivos.janela).toBe(1)
    t.quadro(sol(0, 0, 40)) // nada mudou: o jogador está na janela nova
    const d = t.quadro(sol(0, 0, 40), graus(45)) // o sol girou
    expect(d.find((x) => x.luz === 'sol')).toBeTruthy()
    expect(t.cache.stats.motivos.sol).toBe(1)
  })

  it('a casa que aparece (o bloco montado) refaz: o aviso vem do bloco, não da assinatura', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    // no lote das casas a assinatura dos parados não muda: quem avisa é o bloco de casas
    t.cache.invalidar('casas')
    const p = t.quadro()
    expect(p.find((x) => x.luz === 'sol')).toBeTruthy()
    expect(t.cache.stats.motivos.casas).toBe(1)
  })

  it('o teleporte refaz (o mundo à volta é outro)', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    t.cache.invalidar('teleporte')
    expect(t.quadro().find((x) => x.luz === 'sol')).toBeTruthy()
    expect(t.cache.stats.motivos.teleporte).toBe(1)
  })

  it('o mapa mudar de tamanho refaz', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    t.luz.shadow.mapSize.set(128, 128)
    t.luz.shadow.map = null // o céu descarta o mapa vivo ao trocar o tamanho
    expect(t.quadro().find((x) => x.luz === 'sol')).toBeTruthy()
    expect(t.cache.stats.motivos.tamanho).toBe(1)
  })

  it('entre um refazer e outro a sombra do que se mexe continua no mapa de perto', () => {
    const t = montar()
    t.malha('casa', true); t.malha('neto', false)
    t.quadro()
    // o passe do sol some, mas o mapa de perto (sombra-perto.js) é que dá a sombra de quem está perto
    expect(t.quadro().find((x) => x.luz === 'sol')).toBeFalsy()
    expect(t.cache.stats.quadros).toBe(2) // os dois quadros passaram pelo cache
  })

  it('o mapa de perto continua no ritmo dele (a cada N quadros), com os parados de volta', () => {
    const t = montar({ pertoACada: 2 })
    t.malha('casa', true)
    const p1 = t.quadro()
    expect(p1.find((x) => x.luz === 'perto')).toBeFalsy() // ainda não é a vez dele
    const p2 = t.quadro()
    const perto = p2.find((x) => x.luz === 'perto')
    expect(perto).toBeTruthy()
    expect(perto.objetos).toContain('casa') // o mapa de perto desenha os parados também
  })

  it('a marca sombra:refeita sai com o motivo do refazer', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    const marcas = marcasEntre(0, performance.now() + 1).filter((m) => m.nome === 'sombra:refeita')
    expect(marcas.length).toBeGreaterThan(0)
    expect(marcas.at(-1).dados.motivo).toBe('inicial')
  })

  it('desligado (cfg.mundo.sombraEstatica = false), volta o caminho de camadas do F4', () => {
    const t = montar({ estatica: false })
    t.malha('casa', true); t.malha('neto', false)
    const p = t.quadro()
    expect(p.some((x) => x.tipo === 'estatico')).toBe(true) // os parados num mapa à parte
    expect(p.some((x) => x.tipo === 'copia')).toBe(true) // a cópia para o mapa vivo, todo quadro
    expect(t.cache.stats.refeitos).toBe(1) // o mapa em cache dos parados não é refeito a cada quadro
    const p2 = t.quadro()
    expect(p2.some((x) => x.tipo === 'copia')).toBe(true) // e ela continua todo quadro
  })
})

describe('política: o que mudou fora da pose da luz', () => {
  beforeEach(() => limparMarcas())

  it('o conjunto de parados e o tamanho do mapa só valem depois do primeiro refazer', () => {
    const p = new PoliticaCacheSombra()
    expect(p.estado(123, 'a')).toBe(null) // ainda não houve refazer: nada a comparar
    p.marcar(123, 'a')
    expect(p.estado(123, 'a')).toBe(null)
    expect(p.estado(124, 'a')).toBe('conjunto') // uma casa apareceu
    expect(p.estado(123, 'b')).toBe('tamanho') // o mapa mudou de tamanho
    p.marcar(124, 'b')
    expect(p.estado(124, 'b')).toBe(null)
  })

  it('a invalidação de fora vale uma vez só', () => {
    const p = new PoliticaCacheSombra()
    p.decidir(sol(0, 0, 0), graus(30))
    p.invalidar('casas')
    expect(p.decidir(sol(0, 0, 0), graus(30)).motivo).toBe('casas')
    expect(p.decidir(sol(0, 0, 0), graus(30)).refazer).toBe(false)
  })
})
