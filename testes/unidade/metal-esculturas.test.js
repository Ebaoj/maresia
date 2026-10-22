// Esculturas da Praça dos Leões lidas como massa escura sem volume a 5 m (branch metal-claro, 22/10/2026): o ferro e o
// bronze escuros caíam na faixa de sombra do jogo (0,34) e viravam breu, a luz do sol lia o relevo miúdo e não a forma, e
// o realce virava placa no dorso do tigre. A correção (metal.js): faixas próprias do metal (userData.arcNiveis, nos dois
// renderizadores), a luz do sol pela normal da forma, a cavidade e a crista pela curvatura (aCurva) e a luz própria
// depois das faixas (realce nas cristas só onde o sol chega, céu frio e chão quente na sombra, volume na luz). Este teste
// pega o metal perder alguma parte no GLSL ou no TSL (os dois precisam ter a mesma luz) e os níveis voltarem aos do
// jogo. A prova visual fica em docs/capturas/metal-claro/. No código de antes (705a3d3) ele falha: o metal só tinha o
// brilho próprio (emissivo), sem arcNiveis nem as partes normal, cor e luz.

import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'

// a textura pintada carrega imagem (precisa do DOM): aqui só importa o código do shader
vi.mock('../../src/materiais.js', async (original) => ({ ...(await original()), texturizar: (m) => m }))

const { materialMetal, uMetal } = await import('../../src/mundo/marcos1932/metal.js')
const { PADRAO } = await import('../../src/config.js')

// o que o three entrega ao onBeforeCompile do MeshToonMaterial
function compilar(mat) {
  const lib = THREE.ShaderLib.toon
  const sh = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, defines: {} }
  mat.onBeforeCompile(sh, {})
  return sh
}

describe('metal das esculturas: a mesma luz no WebGL e no WebGPU', () => {
  const m = materialMetal('#5f5a48')
  const sh = compilar(m)
  const f = sh.fragmentShader

  it('as faixas do metal têm níveis próprios, mais altos que os do jogo, nos dois', () => {
    expect(m.userData.arcNiveis).toBe(uMetal.niveis)
    expect(sh.uniforms.uArcNiveis).toBe(uMetal.niveis)
    expect(PADRAO.marcos.metalNivelSombra).toBeGreaterThan(PADRAO.estilo.arcNivelSombra)
    expect(PADRAO.marcos.metalNivelMeio).toBeGreaterThan(PADRAO.estilo.arcNivelMeio)
  })

  it('GLSL: luz do sol pela forma, cavidade na cor e a luz própria depois das faixas (antes do aomap)', () => {
    expect(f).toContain('#define RE_Direct RE_Direct_Metal')
    expect(f).toMatch(/nLuzMetal = normalize\(mix\(normal,/)
    expect(f).toContain('vCurvaM')
    const faixas = f.indexOf('reflectedLight.directDiffuse = material.diffuseColor * RECIPROCAL_PI * faixa')
    const propria = f.indexOf('uMetalCorChao * chaoM')
    expect(faixas).toBeGreaterThan(0)
    expect(propria).toBeGreaterThan(faixas)
    expect(propria).toBeLessThan(f.indexOf('#include <aomap_fragment>'))
    // a segunda saída continua escrita pelo pintar
    expect(f).toContain('gLuz = vec4(')
    // nada mais no brilho próprio: a luz do metal entra depois das faixas, igual ao TSL
    expect(f).not.toContain('totalEmissiveRadiance +=')
    expect(sh.vertexShader).toContain('attribute float aCurva;')
  })

  it('TSL: as mesmas três partes (normal da luz, cor, luz própria) e nenhum brilho próprio', () => {
    const t = m.userData.tsl
    expect(typeof t.normal).toBe('function')
    expect(typeof t.cor).toBe('function')
    expect(typeof t.luz).toBe('function')
    expect(t.emissivo).toBeUndefined()
  })
})
