// Sombra "mal definida, piscando, pixelada" (Joabe, 21/10/2026). Cada bloco pega uma das causas medidas no jogo
// (docs/motor-f4-cache-sombra.md, seção "Sombra nítida"). Os de viés, passo e cache com duas luzes rodam também no
// código de antes (04cd764) e lá reprovam.
import { describe, expect, it, beforeEach } from 'vitest'
import * as THREE from 'three'
import { criarCeu } from '../../src/mundo/ceu.js'
import { PADRAO, migrarPadroes } from '../../src/config.js'
import { CacheSombra } from '../../src/render/cache-sombra.js'
import { registrarEstatico, limparEstaticos } from '../../src/render/sombra-estatica.js'

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
    expect(s).toContain('- shadowRadius * texelSize')
    expect(instalarFiltroWebgl(chunks)).toBe(true) // segunda vez não duplica
    expect(chunks.shadowmap_pars_fragment.split('Maresia: grade 3 x 3').length).toBe(2)
  })
})

describe('mapa de perto', () => {
  it('a mistura entra no laço das luzes do three 0.186 (sol = 0, perto = 1)', async () => {
    const { instalarMisturaWebgl } = await import('../../src/render/sombra-perto.js')
    const chunks = { ...THREE.ShaderChunk }
    expect(instalarMisturaWebgl(chunks)).toBe(true)
    expect(chunks.lights_fragment_begin).toContain('sombraSolPertoLonge( directionalLightShadow, directionalShadowMap[ 0 ]')
    expect(chunks.lights_fragment_begin).toContain('#elif NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 1')
    // com uma luz só (cenas de teste, laboratório) o laço de sempre continua
    expect(chunks.lights_fragment_begin).toContain('getShadow( directionalShadowMap[ i ]')
    expect(chunks.shadowmap_pars_fragment).toContain('float sombraSolPertoLonge(')
  })

  // o mapa único de 346 m em 4096 dava 8,5 cm por texel em volta do jogador (10 pixels por texel a 5 m da câmera)
  // 24/10/2026: o perfil padrão passou a 1024 (o mapa de perto é refeito a cada 2 quadros, para tirar o pico de
  // quadro): o texel em volta do jogador passou de 2,3 cm para 4,7 cm. A garantia da sombra nítida (3 cm) continua
  // valendo no perfil alto, o de 2048 (src/qualidade.js).
  it('em volta do jogador o texel tem no máximo 3 cm no perfil alto, e a janela anda presa à grade de texels', async () => {
    const { SombraPerto } = await import('../../src/render/sombra-perto.js')
    const cena = new THREE.Scene()
    const sol = new THREE.DirectionalLight()
    cena.add(sol)
    const dir = new THREE.Vector3(0.3, 0.6, -0.5).normalize()
    // perfil padrão: 1024 (4,7 cm por texel)
    const cfg = cfgPadrao()
    expect(cfg.mundo.sombraPertoResolucao).toBe(1024)
    const sp = new SombraPerto({ cena, sol, cfg })
    sp.atualizar(dir, new THREE.Vector3(700, 2, 0))
    expect(sp.stats.texelCm).toBeLessThanOrEqual(5)
    // perfil alto: 2048 (2,3 cm por texel): a sombra nítida continua
    const cfgAlto = cfgPadrao()
    cfgAlto.mundo.sombraPertoResolucao = 2048
    const spAlto = new SombraPerto({ cena, sol, cfg: cfgAlto })
    spAlto.atualizar(dir, new THREE.Vector3(700, 2, 0))
    expect(spAlto.stats.texelCm).toBeLessThanOrEqual(3)
    expect(sp.luz.castShadow).toBe(true)
    expect(cena.children.indexOf(sp.luz)).toBeGreaterThan(cena.children.indexOf(sol)) // índice 1 no shader
    // anda 1 mm: a câmera da luz fica no mesmo texel (no plano da luz), nada de borda tremendo
    const p0 = sp.luz.position.clone()
    sp.atualizar(dir, new THREE.Vector3(700.001, 2, 0))
    const texel = cfg.mundo.sombraPertoTamanho / cfg.mundo.sombraPertoResolucao
    const d = sp.luz.position.clone().sub(p0)
    const lateral = d.clone().sub(dir.clone().multiplyScalar(d.dot(dir))).length()
    expect(lateral === 0 || Math.abs(lateral / texel - Math.round(lateral / texel)) < 1e-3).toBe(true)
    // desligado: a faixa vai a 0 (o shader só lê o de longe) e o mapa não é redesenhado
    cfg.mundo.sombraPerto = false
    sp.atualizar(dir, new THREE.Vector3(700, 2, 0))
    expect(sp.luz.shadow.intensity).toBe(0)
    expect(sp.luz.shadow.autoUpdate).toBe(false)
  })
})

// Renderizador falso (o mesmo jeito de cache-sombra.test.js): o shadowMap.render "original" escolhe os objetos como o
// three e anota, por luz, o que desenhou.
function montar() {
  limparEstaticos()
  const passes = []
  const r = {
    shadowMap: { enabled: true, autoUpdate: false, needsUpdate: false },
    clear() {},
    getRenderTarget: () => null,
    setRenderTarget() {},
    autoClear: true,
    info: { autoReset: true, render: { calls: 0 } },
    render(cena) { if (cena.children.some((o) => o.isMesh && o.material.isShaderMaterial)) passes.push({ tipo: 'copia', objetos: [] }) },
  }
  r.shadowMap.render = function (luzes, cena, cam) {
    if (!r.shadowMap.needsUpdate) return
    for (const luz of luzes) {
      const passe = { tipo: cam.layers.mask === 1 << 1 ? 'estatico' : 'vivo', luz: luz.name, objetos: [] }
      passes.push(passe)
      if (!luz.shadow.map) luz.shadow.map = { width: luz.shadow.mapSize.x, height: luz.shadow.mapSize.x, depthTexture: {} }
      cena.traverse((o) => { if (o.isMesh && o.visible && o.castShadow && o.layers.test(cam.layers)) passe.objetos.push(o.name) })
    }
    r.shadowMap.needsUpdate = false
  }
  const sol = new THREE.DirectionalLight(); sol.name = 'sol'; sol.castShadow = true; sol.shadow.mapSize.set(64, 64)
  const perto = new THREE.DirectionalLight(); perto.name = 'perto'; perto.castShadow = true
  const cena = new THREE.Scene(); cena.add(sol, perto)
  const cam = new THREE.PerspectiveCamera()
  const cfg = { mundo: { cacheSombra: true, cacheSombraRaio: 15 } }
  const cache = new CacheSombra(r, cena, cam, sol, cfg)
  const malha = (nome, parado) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); m.name = nome; m.castShadow = true; cena.add(m)
    if (parado) registrarEstatico(m)
    return m
  }
  const quadro = () => {
    passes.length = 0
    cache.pose({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    r.shadowMap.needsUpdate = true
    r.shadowMap.render([sol, perto], cena, cam) // o three manda as duas luzes que projetam sombra
    return passes.map((p) => ({ ...p }))
  }
  return { cache, malha, quadro }
}

describe('cache dos parados com o mapa de perto (WebGL)', () => {
  beforeEach(() => limparEstaticos())
  // antes, outra luz projetando sombra desligava o cache inteiro (refazia todos os parados todo quadro)
  it('o sol segue em cache e o mapa de perto desenha parados e dinâmicos todo quadro', () => {
    const t = montar()
    const casa = t.malha('casa', true); t.malha('neto', false)
    t.quadro()
    for (let i = 0; i < 4; i++) {
      const p = t.quadro()
      expect(p.some((x) => x.tipo === 'estatico')).toBe(false) // os parados do sol não são refeitos
      const doSol = p.filter((x) => x.luz === 'sol' && x.tipo === 'vivo')
      for (const v of doSol) expect(v.objetos).toEqual(['neto']) // o sol: só quem se mexe por cima da cópia
      const dePerto = p.filter((x) => x.luz === 'perto')
      expect(dePerto).toHaveLength(1)
      expect(dePerto[0].objetos.sort()).toEqual(['casa', 'neto'])
      expect(casa.castShadow).toBe(false) // o cache continua valendo depois do passe de perto
    }
    expect(t.cache.stats.refeitos).toBe(1)
  })
})
