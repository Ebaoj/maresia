// KAN-74 (F4) no WebGPU do jogo. Sem GPU: um ShadowNode falso escolhe os objetos como o three escolhe (castShadow, visible,
// camadas da câmera da luz) e anota cada passe, o alvo e se limpou.
//
// Bugs que estes testes pegam:
//  - parado desenhado no passe dinâmico (sombra duplicada) ou dinâmico no mapa em cache (sombra congelada);
//  - passe dinâmico limpar o mapa e apagar a cópia dos parados;
//  - mapa de sombra sem profundidade de 32 bits (a cópia do WebGPU não existe e o cache quebraria);
//  - cache mexendo na sombra de outras luzes;
//  - refazer todo quadro, ou nunca;
//  - desligar deixar parado sem projetar sombra.
import { beforeEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CacheSombraGpu } from '../../src/render/cache-sombra-gpu.js'
import { limparEstaticos, registrarEstatico } from '../../src/render/sombra-estatica.js'

const FloatType = 1015
const sol3 = (x, y, z) => ({ x, y, z })
const graus = (g) => { const a = (g * Math.PI) / 180; return sol3(Math.sin(a), Math.cos(a), 0) }

function montar({ tipoProfundidade = FloatType } = {}) {
  limparEstaticos()
  const passes = []
  const r = {
    autoClear: true,
    atual: null,
    setRenderTarget(rt) { this.atual = rt },
    copyTextureToTexture(de, para) { passes.push({ tipo: 'copia', de, para }) },
  }
  const cena = new THREE.Scene()
  const sol = new THREE.DirectionalLight(); sol.castShadow = true; sol.shadow.mapSize.set(64, 64); cena.add(sol)
  const outra = new THREE.DirectionalLight(); outra.castShadow = true; cena.add(outra)
  class ShadowNode {
    constructor(luz) { this.light = luz; this.shadow = luz.shadow; this.shadowMap = null }
    setupRenderTarget() { return { depthTexture: { type: 1014 } } }
    // o renderShadow "de sempre": desenha no alvo atual, limpando se autoClear
    renderShadow() {
      const cam = this.shadow.camera
      const objetos = []
      cena.traverse((o) => { if (o.isMesh && o.visible && o.castShadow && o.layers.test(cam.layers)) objetos.push(o.name) })
      passes.push({ tipo: 'sombra', alvo: r.atual, mascara: cam.layers.mask, autoClear: r.autoClear, objetos })
    }
  }
  class DepthTexture { constructor(w, h) { this.width = w; this.height = h; this.type = null } dispose() {} }
  class RenderTarget { constructor(w, h) { this.width = w; this.height = h; this.texture = {}; this.depthTexture = null } dispose() {} }
  const W = { ShadowNode, FloatType, DepthTexture, RenderTarget }
  const cfg = { mundo: { cacheSombra: true, cacheSombraRaio: 15 } }
  const cam = new THREE.PerspectiveCamera()
  const cache = new CacheSombraGpu(r, cena, cam, sol, cfg, W)
  const noSol = new ShadowNode(sol)
  noSol.shadowMap = { width: 64, height: 64, depthTexture: { type: tipoProfundidade } }
  const malha = (nome, parado) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.name = nome; m.castShadow = true; cena.add(m)
    if (parado) registrarEstatico(m)
    return m
  }
  const quadro = (centro = sol3(0, 0, 0), dir = graus(30)) => {
    passes.length = 0
    cache.pose(centro, dir) // o céu faz isto antes do desenho
    ShadowNode.prototype.renderShadow.call(noSol, { renderer: r }) // o ShadowNode chama isto uma vez por quadro
    return passes.map((p) => ({ ...p }))
  }
  return { r, cache, cena, sol, outra, ShadowNode, noSol, cfg, malha, quadro, W }
}

describe('cache de sombra no WebGPU', () => {
  beforeEach(() => limparEstaticos())

  it('o mapa de sombra do sol ganha profundidade de 32 bits (cópia do WebGPU); o de outra luz não', () => {
    const t = montar()
    expect(new t.ShadowNode(t.sol).setupRenderTarget().depthTexture.type).toBe(FloatType)
    expect(new t.ShadowNode(t.outra).setupRenderTarget().depthTexture.type).toBe(1014)
  })

  it('primeiro quadro: só os parados no alvo em cache, depois a cópia, depois só os dinâmicos por cima, sem limpar', () => {
    const t = montar()
    t.malha('casa', true); t.malha('arvore', true); t.malha('neto', false)
    const p = t.quadro()
    expect(p.map((x) => x.tipo)).toEqual(['sombra', 'copia', 'sombra'])
    const [est, copia, din] = p
    expect(est.alvo).toBe(t.cache.alvoEstatico)
    expect(est.mascara).toBe(1 << 1)
    expect(est.objetos.sort()).toEqual(['arvore', 'casa'])
    expect(copia.de).toBe(t.cache.alvoEstatico.depthTexture)
    expect(copia.para).toBe(t.noSol.shadowMap.depthTexture)
    expect(din.alvo).toBe(t.noSol.shadowMap)
    expect(din.objetos).toEqual(['neto']) // parado nunca no passe dinâmico
    expect(din.autoClear).toBe(false) // limpar apagaria a cópia dos parados
    expect(t.r.autoClear).toBe(true) // e o ajuste volta
    expect(est.autoClear).toBe(true) // o passe dos parados limpa o alvo em cache
  })

  it('o alvo em cache tem a profundidade de 32 bits e o tamanho do mapa vivo', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    expect(t.cache.alvoEstatico.depthTexture.type).toBe(FloatType)
    expect(t.cache.alvoEstatico.width).toBe(64)
  })

  // Bug 21/10/2026 (sombra nítida): trocar a qualidade da sombra no painel com o WebGPU deixava o alvo em cache no
  // tamanho velho; a cópia de 4096 para 2048 era recusada pelo WebGPU em todo quadro (sem sombra de parado).
  it('com o mapa em tamanho novo, o alvo em cache e o mapa vivo ficam do mesmo tamanho antes da cópia', () => {
    const t = montar()
    t.malha('casa', true)
    t.noSol.shadowMap.setSize = function (w, h) { this.width = w; this.height = h }
    t.quadro()
    t.sol.shadow.mapSize.set(32, 32) // o céu troca o tamanho pedido; o mapa vivo do ShadowNode ainda é o velho
    const p = t.quadro()
    const copia = p.find((x) => x.tipo === 'copia')
    expect(copia).toBeTruthy()
    expect(t.cache.alvoEstatico.width).toBe(32)
    expect(t.noSol.shadowMap.width).toBe(32)
    expect(t.cache.stats.motivos.tamanho).toBe(1)
  })

  it('quadros seguintes sem mudança não refazem o mapa dos parados: só cópia e dinâmicos', () => {
    const t = montar()
    t.malha('casa', true); t.malha('neto', false)
    t.quadro()
    for (let i = 0; i < 5; i++) {
      const p = t.quadro(sol3(i, 0, 3))
      expect(p.map((x) => x.tipo)).toEqual(['copia', 'sombra'])
      expect(p[1].objetos).toEqual(['neto'])
    }
    expect(t.cache.stats.refeitos).toBe(1)
  })

  it('refaz quando um parado aparece, quando o jogador sai da janela e quando o sol muda', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    t.malha('casa2', true)
    expect(t.quadro().some((x) => x.mascara === 2)).toBe(true)
    expect(t.quadro().some((x) => x.mascara === 2)).toBe(false)
    expect(t.quadro(sol3(0, 0, 40)).some((x) => x.mascara === 2)).toBe(true)
    expect(t.quadro(sol3(0, 0, 40), graus(35)).some((x) => x.mascara === 2)).toBe(true)
    expect(t.cache.stats.motivos).toEqual({ inicial: 1, conjunto: 1, janela: 1, sol: 1 })
  })

  it('parado que some (LOD) sai do mapa em cache', () => {
    const t = montar()
    const casa = t.malha('casa', true)
    t.quadro()
    casa.visible = false
    const est = t.quadro().find((x) => x.mascara === 2)
    expect(est.objetos).toEqual([])
  })

  it('desligar devolve a sombra aos parados e volta ao passe único de sempre', () => {
    const t = montar()
    const casa = t.malha('casa', true); t.malha('neto', false)
    t.quadro()
    expect(casa.castShadow).toBe(false)
    t.cfg.mundo.cacheSombra = false
    const p = t.quadro()
    expect(casa.castShadow).toBe(true)
    expect(p.map((x) => x.tipo)).toEqual(['sombra'])
    expect(p[0].objetos.sort()).toEqual(['casa', 'neto'])
  })

  it('com o mapa de sombra sem profundidade de 32 bits, não usa o cache e não quebra', () => {
    const t = montar({ tipoProfundidade: 1014 })
    t.malha('casa', true); t.malha('neto', false)
    const p = t.quadro()
    expect(p.map((x) => x.tipo)).toEqual(['sombra'])
    expect(p[0].objetos.sort()).toEqual(['casa', 'neto'])
  })

  it('a sombra de outra luz segue o caminho de sempre', () => {
    const t = montar()
    t.malha('casa', true)
    const no = new t.ShadowNode(t.outra)
    t.r.atual = 'alvo-da-outra'
    const antes = []
    t.ShadowNode.prototype.renderShadow.call(no, { renderer: t.r })
    expect(t.cache.stats.refeitos).toBe(0)
    expect(antes).toEqual([])
  })
})

// fluido, 23/10/2026: com a hora andando o sol pede mapa novo ~5 vezes por segundo, e cada refazer desenhava todos os
// parados num quadro só (13 a 140 ms de processador, medidos andando). Em fatias: o mapa novo é desenhado num segundo
// alvo, uma fatia por quadro, com a pose nova; o velho vale (com a pose velha) até o novo ficar pronto, e os dois trocam
// juntos. Estes testes pegam: pose nova antes do mapa novo (sombra deslocada), fatia que limpa o que a anterior
// desenhou, parado que fica de fora, obra largada a cada pedido (o mapa nunca troca com quadro lento).
describe('cache de sombra no WebGPU, refeito em fatias', () => {
  beforeEach(() => limparEstaticos())

  it('o mapa novo sai em fatias e só troca, junto com a pose, quando fica pronto', () => {
    const t = montar()
    t.cfg.mundo.cacheSombraFatias = 2
    for (const n of ['a', 'b', 'c', 'd']) t.malha(n, true)
    t.malha('neto', false)
    t.quadro() // o primeiro mapa: de uma vez
    const velho = t.cache.alvoEstatico
    // o sol mudou: primeira fatia no alvo novo, limpando; o mapa vivo continua vindo do velho
    let p = t.quadro(sol3(0, 0, 0), graus(35))
    expect(t.cache.poseAtiva.dir.x).toBeCloseTo(graus(30).x, 6)
    expect(p.map((x) => x.tipo)).toEqual(['sombra', 'copia', 'sombra'])
    expect(p[0].alvo).toBe(t.cache.alvoNovo)
    expect(p[0].autoClear).toBe(true)
    expect(p[0].mascara).toBe(1 << 1)
    const primeira = p[0].objetos
    expect(primeira.length).toBe(2)
    expect(p[1].de).toBe(velho.depthTexture)
    expect(p[2].objetos).toEqual(['neto'])
    // segunda fatia, sem limpar; o resto dos parados
    p = t.quadro(sol3(0, 0, 0), graus(35))
    expect(p[0].alvo).toBe(t.cache.alvoNovo)
    expect(p[0].autoClear).toBe(false)
    expect([...primeira, ...p[0].objetos].sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(t.cache.poseAtiva.dir.x).toBeCloseTo(graus(30).x, 6)
    // pronto: troca de mapa e de pose no mesmo quadro
    const novo = t.cache.alvoNovo
    p = t.quadro(sol3(0, 0, 0), graus(35))
    expect(t.cache.poseAtiva.dir.x).toBeCloseTo(graus(35).x, 6)
    expect(t.cache.alvoEstatico).toBe(novo)
    expect(p.map((x) => x.tipo)).toEqual(['copia', 'sombra'])
    expect(p[0].de).toBe(novo.depthTexture)
    // nenhum parado ficou com castShadow ligado fora da fatia
    t.cena.traverse((o) => { if (o.isMesh && o.name !== 'neto') expect(o.castShadow).toBe(false) })
  })

  it('pedido novo no meio da obra espera ela acabar (o mapa troca mesmo com pedidos seguidos)', () => {
    const t = montar()
    t.cfg.mundo.cacheSombraFatias = 3
    for (const n of ['a', 'b', 'c']) t.malha(n, true)
    t.quadro()
    let g = 30
    let trocou = 0
    let antes = t.cache.alvoEstatico
    for (let i = 0; i < 12; i++) {
      g += 1 // o sol pede mapa novo em todo quadro
      t.quadro(sol3(0, 0, 0), graus(g))
      if (t.cache.alvoEstatico !== antes) { trocou++; antes = t.cache.alvoEstatico }
    }
    expect(trocou).toBeGreaterThanOrEqual(2)
  })
})
