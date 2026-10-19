// KAN-74 (F4): sombra dos objetos parados em cache. Sem GPU: a política é pura, e a composição roda contra um
// renderizador falso que escolhe os objetos como o three escolhe (castShadow, visible, camadas da câmera) e anota
// o que cada passe desenhou.
//
// Bugs que estes testes pegam:
//  - sombra de parado sumir ou duplicar (parado desenhado no passe dinâmico, ou fora do estático);
//  - sombra de quem se mexe congelar no cache (dinâmico ou não registrado entrar no passe estático);
//  - passe dinâmico limpar o mapa e apagar os parados;
//  - refazer o cache todo quadro (o ganho inteiro), ou nunca refazer (sombra velha);
//  - desligar o cache deixar parado sem projetar sombra.
import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'
import { PoliticaCacheSombra } from '../../src/render/politica-sombra.js'
import { registrarEstatico, assinaturaEstaticos, limparEstaticos } from '../../src/render/sombra-estatica.js'
import { CacheSombra } from '../../src/render/cache-sombra.js'

const sol = (x, y, z) => ({ x, y, z })
const graus = (g) => { const a = (g * Math.PI) / 180; return sol(Math.sin(a), Math.cos(a), 0) }

describe('política: quando refazer o mapa dos parados', () => {
  it('o primeiro quadro refaz; sol e centro iguais depois não refazem e devolvem a pose congelada', () => {
    const p = new PoliticaCacheSombra({ raio: 15 })
    expect(p.decidir(sol(0, 0, 0), graus(30)).motivo).toBe('inicial')
    // o jogador andou 10 m (dentro do raio): a pose devolvida continua a do primeiro quadro
    const d = p.decidir(sol(10, 0, 0), graus(30))
    expect(d.refazer).toBe(false)
    expect(d.centro).toEqual(sol(0, 0, 0))
    expect(p.refeitos).toBe(1)
  })

  it('refaz e recentra quando o jogador passa do raio (e só aí)', () => {
    const p = new PoliticaCacheSombra({ raio: 15 })
    p.decidir(sol(0, 0, 0), graus(30))
    expect(p.decidir(sol(0, 0, 14.9), graus(30)).refazer).toBe(false)
    const d = p.decidir(sol(0, 0, 15.1), graus(30))
    expect(d.motivo).toBe('janela')
    expect(d.centro).toEqual(sol(0, 0, 15.1))
    // agora o centro é o novo: 10 m dali ainda vale
    expect(p.decidir(sol(0, 0, 25), graus(30)).refazer).toBe(false)
  })

  it('a altura do jogador não conta: a janela é medida no chão', () => {
    const p = new PoliticaCacheSombra({ raio: 15 })
    p.decidir(sol(0, 0, 0), graus(30))
    expect(p.decidir(sol(0, 200, 0), graus(30)).refazer).toBe(false)
  })

  it('refaz quando o sol muda de verdade e não com variação minúscula', () => {
    const p = new PoliticaCacheSombra({ limiarSolGraus: 0.05 })
    p.decidir(sol(0, 0, 0), graus(30))
    expect(p.decidir(sol(0, 0, 0), graus(30.01)).refazer).toBe(false)
    expect(p.decidir(sol(0, 0, 0), graus(31)).motivo).toBe('sol')
  })

  it('invalidar de fora refaz uma vez e some', () => {
    const p = new PoliticaCacheSombra()
    p.decidir(sol(0, 0, 0), graus(30))
    p.invalidar('conjunto')
    expect(p.decidir(sol(0, 0, 0), graus(30)).motivo).toBe('conjunto')
    expect(p.decidir(sol(0, 0, 0), graus(30)).refazer).toBe(false)
    expect(p.motivos).toEqual({ inicial: 1, conjunto: 1 })
  })
})

describe('registro dos parados', () => {
  beforeEach(() => limparEstaticos())
  const cena = () => new THREE.Scene()
  const malha = (cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.castShadow = cast; return m }

  it('só registra quem projeta sombra, liga a camada dos parados e mantém a camada 0 (o desenho normal)', () => {
    const a = registrarEstatico(malha(true))
    const b = registrarEstatico(malha(false))
    expect(a.layers.isEnabled(1)).toBe(true)
    expect(a.layers.isEnabled(0)).toBe(true)
    expect(b.layers.isEnabled(1)).toBe(false)
  })

  it('a assinatura muda quando um parado some, volta, troca de cópias ou sai da cena; senão fica igual', () => {
    const c = cena()
    const m = malha(); c.add(m); registrarEstatico(m)
    const s0 = assinaturaEstaticos()
    expect(assinaturaEstaticos()).toBe(s0)
    m.visible = false
    const s1 = assinaturaEstaticos()
    expect(s1).not.toBe(s0)
    m.visible = true
    expect(assinaturaEstaticos()).toBe(s0)
    c.remove(m) // bloco desmontado: já não projeta sombra
    expect(assinaturaEstaticos()).not.toBe(s0)
  })

  it('a visibilidade do grupo pai conta (LOD liga e desliga o grupo)', () => {
    const c = cena(); const g = new THREE.Group(); const m = malha()
    g.add(m); c.add(g); registrarEstatico(m)
    const s0 = assinaturaEstaticos()
    g.visible = false
    expect(assinaturaEstaticos()).not.toBe(s0)
  })

  it('a quantidade de cópias de um InstancedMesh conta', () => {
    const c = cena()
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 10)
    im.castShadow = true; c.add(im); registrarEstatico(im)
    const s0 = assinaturaEstaticos()
    im.count = 4
    expect(assinaturaEstaticos()).not.toBe(s0)
  })
})

// Renderizador falso: o shadowMap.render "original" faz o que o three faz na escolha dos objetos e anota o passe.
function montar() {
  limparEstaticos()
  const passes = []
  const r = {
    shadowMap: { enabled: true, autoUpdate: false, needsUpdate: false }, // como no jogo: o pós pede a sombra uma vez por quadro
    clear() { passes.at(-1)?.limpou.push(true) },
    getRenderTarget: () => null,
    setRenderTarget() {},
    autoClear: true,
    info: { autoReset: true, render: { calls: 0 } },
    // o passe de cópia é um render() aninhado de uma cena só com o quadrado de tela cheia
    render(cena) { if (cena.children.some((o) => o.isMesh && o.material.isShaderMaterial)) passes.push({ tipo: 'copia', objetos: [], limpou: [], autoClear: r.autoClear, autoReset: r.info.autoReset }) },
  }
  r.shadowMap.render = function (luzes, cena, cam) {
    if (!r.shadowMap.needsUpdate) return
    const luz = luzes[0]
    // o passe dos parados é o único em que a câmera só enxerga a camada dos parados
    const passe = { tipo: cam.layers.mask === 1 << 1 ? 'estatico' : 'vivo', objetos: [], limpou: [], mascara: cam.layers.mask }
    passes.push(passe)
    if (!luz.shadow.map) luz.shadow.map = { width: luz.shadow.mapSize.x, height: luz.shadow.mapSize.x, depthTexture: {} }
    r.clear() // o three limpa o mapa no começo de cada passe
    cena.traverse((o) => {
      if (o.isMesh && o.visible && o.castShadow && o.layers.test(cam.layers)) passe.objetos.push(o.name)
    })
    r.shadowMap.needsUpdate = false
    luz.shadow.needsUpdate = false
  }
  const luz = new THREE.DirectionalLight(); luz.castShadow = true; luz.shadow.mapSize.set(64, 64)
  const cena = new THREE.Scene(); cena.add(luz)
  const cam = new THREE.PerspectiveCamera()
  const cfg = { mundo: { cacheSombra: true, cacheSombraRaio: 15 } }
  const cache = new CacheSombra(r, cena, cam, luz, cfg)
  const malha = (nome, parado) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.name = nome; m.castShadow = true; cena.add(m)
    if (parado) registrarEstatico(m)
    return m
  }
  const quadro = (centro = sol(0, 0, 0), dir = graus(30)) => {
    passes.length = 0
    cache.pose(centro, dir) // o céu faz isto antes do desenho
    r.shadowMap.needsUpdate = true // o pós faz isto todo quadro
    r.shadowMap.render([luz], cena, cam)
    return passes.map((p) => ({ ...p }))
  }
  return { r, cache, cena, cam, luz, cfg, malha, quadro }
}

describe('cache de sombra: composição dos passes', () => {
  it('no primeiro quadro: só os parados no mapa em cache, depois cópia e só os dinâmicos por cima, sem limpar', () => {
    const t = montar()
    t.malha('casa', true); t.malha('arvore', true); t.malha('neto', false)
    const p = t.quadro()
    const est = p.find((x) => x.tipo === 'estatico')
    expect(est.objetos.sort()).toEqual(['arvore', 'casa'])
    expect(est.mascara).toBe(1 << 1)
    const vivos = p.filter((x) => x.tipo === 'vivo')
    // parado nunca no passe dinâmico (o primeiro passe vivo só cria o mapa: o three o aloca no primeiro uso)
    for (const v of vivos) expect(v.objetos).toEqual(['neto'])
    const copia = p.findIndex((x) => x.tipo === 'copia')
    expect(copia).toBeGreaterThan(p.indexOf(est)) // a cópia vem depois do passe dos parados
    // a cópia não limpa o mapa nem zera as contagens do quadro em andamento, e devolve os dois ajustes
    expect(p[copia].autoClear).toBe(false)
    expect(p[copia].autoReset).toBe(false)
    expect(t.r.autoClear).toBe(true)
    expect(t.r.info.autoReset).toBe(true)
    const ultimo = p.at(-1)
    expect(ultimo.tipo).toBe('vivo')
    expect(p.indexOf(ultimo)).toBeGreaterThan(copia) // o dinâmico vem por cima da cópia
    expect(ultimo.limpou).toEqual([]) // e não limpa o mapa (senão apagaria os parados)
  })

  it('quadros seguintes sem mudança não refazem o mapa dos parados: só cópia e dinâmicos', () => {
    const t = montar()
    t.malha('casa', true); t.malha('neto', false)
    t.quadro()
    for (let i = 0; i < 5; i++) {
      const p = t.quadro(sol(i, 0, 3)) // o jogador anda dentro do raio
      expect(p.some((x) => x.tipo === 'estatico')).toBe(false)
      expect(p.some((x) => x.tipo === 'copia')).toBe(true)
      expect(p.find((x) => x.objetos.includes('neto'))).toBeTruthy()
    }
    expect(t.cache.stats.refeitos).toBe(1)
  })

  it('refaz quando um parado aparece (bloco montado) e quando o jogador sai da janela', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    t.malha('casa2', true) // bloco novo montado
    expect(t.quadro().some((x) => x.tipo === 'estatico')).toBe(true)
    expect(t.quadro().some((x) => x.tipo === 'estatico')).toBe(false)
    expect(t.quadro(sol(0, 0, 40)).some((x) => x.tipo === 'estatico')).toBe(true)
    expect(t.cache.stats.motivos).toEqual({ inicial: 1, conjunto: 1, janela: 1 })
  })

  it('a pose da luz fica congelada enquanto vale e muda só ao refazer', () => {
    const t = montar()
    t.malha('casa', true)
    const a = { ...t.cache.pose(sol(1, 0, 1), graus(30)).centro }
    const b = { ...t.cache.pose(sol(5, 0, 5), graus(30)).centro }
    expect(b).toEqual(a)
    const c = t.cache.pose(sol(0, 0, 50), graus(30)).centro
    expect(c.z).toBe(50)
  })

  it('o parado que some (LOD) tira a sombra dele do mapa em cache', () => {
    const t = montar()
    const casa = t.malha('casa', true)
    t.quadro()
    casa.visible = false
    const p = t.quadro()
    const est = p.find((x) => x.tipo === 'estatico')
    expect(est).toBeTruthy()
    expect(est.objetos).toEqual([])
  })

  it('desligar devolve a sombra a todos os parados e volta ao caminho de antes', () => {
    const t = montar()
    const casa = t.malha('casa', true); t.malha('neto', false)
    t.quadro()
    expect(casa.castShadow).toBe(false) // em cache, não projeta por conta própria
    t.cfg.mundo.cacheSombra = false
    const p = t.quadro()
    expect(casa.castShadow).toBe(true)
    expect(p).toHaveLength(1)
    expect(p[0].objetos.sort()).toEqual(['casa', 'neto'])
  })

  // Bug pego no navegador de verdade (KAN-74, 19/10/2026): o three chama shadowMap.render em todo render(), também nas
  // passadas do pós-processamento, que não têm luz nenhuma. O cache tratava isso como "incompatível", desligava e
  // refazia o mapa dos parados em 100% dos quadros: nenhum ganho.
  it('passadas sem luz (pós-processamento) no meio do quadro não desmancham o cache', () => {
    const t = montar()
    const casa = t.malha('casa', true); t.malha('neto', false)
    t.quadro()
    for (let i = 0; i < 4; i++) {
      t.cache.pose(sol(0, 0, 0), graus(30))
      t.r.shadowMap.needsUpdate = true
      t.r.shadowMap.render([t.luz], t.cena, t.cam) // o desenho principal
      t.r.shadowMap.render([], t.cena, t.cam) // as passadas do pós, uma atrás da outra
      t.r.shadowMap.render([], t.cena, t.cam)
      expect(casa.castShadow).toBe(false)
    }
    expect(t.cache.stats.refeitos).toBe(1)
    expect(t.cache.stats.motivos).toEqual({ inicial: 1 })
  })

  it('sem pedido de sombra no quadro (autoUpdate desligado e needsUpdate falso), não faz nada', () => {
    const t = montar()
    t.malha('casa', true); t.malha('neto', false)
    t.quadro()
    t.r.shadowMap.needsUpdate = false
    const antes = t.cache.stats.quadros
    t.r.shadowMap.render([t.luz], t.cena, t.cam)
    expect(t.cache.stats.quadros).toBe(antes)
  })

  it('com mapa de tamanho novo, refaz', () => {
    const t = montar()
    t.malha('casa', true)
    t.quadro()
    t.luz.shadow.mapSize.set(128, 128)
    t.luz.shadow.map = null // o céu descarta o mapa vivo ao trocar o tamanho
    expect(t.quadro().some((x) => x.tipo === 'estatico')).toBe(true)
  })
})
