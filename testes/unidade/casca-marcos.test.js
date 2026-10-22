// Cal caída dos marcos de 1932 (branch acabamento, 22/10/2026): a regra do reboco caído das casas, aplicada à fachada
// de 22 x 30 m da velha Sé, espalhava tijolo pela parede inteira e pelo alto das torres. A correção dá aos marcos um
// reboco próprio (desgaste-marcos.js), com a placa em metros, embaixo e nas quinas de cada peça, e deixa o programa
// das casas como estava. Este teste pega: (1) o marco voltar a usar o material das casas; (2) o código dos marcos
// vazar para as casas; (3) a caixa da peça (a quina) sair errada. A prova visual fica em docs/capturas/acabamento/.
// No código de antes (f6bf9e6) ele falha: desgaste-marcos.js e materialRebocoMarco não existem.

import { describe, it, expect, vi } from 'vitest'
import * as THREE from 'three'

// a textura pintada carrega imagem (precisa do DOM): aqui só importa o código do shader
vi.mock('../../src/materiais.js', async (original) => ({ ...(await original()), texturizar: (m) => m }))

const { materiaisDasCasas, materialRebocoMarco } = await import('../../src/mundo/quarteirao.js')
const { caixaDaPeca } = await import('../../src/mundo/obra1932.js')
const { uCasca, sincronizarCasca } = await import('../../src/mundo/desgaste-marcos.js')
const { PADRAO } = await import('../../src/config.js')

// o que o three entrega ao onBeforeCompile do MeshToonMaterial
function compilar(mat) {
  const lib = THREE.ShaderLib.toon
  const sh = { uniforms: THREE.UniformsUtils.clone(lib.uniforms), vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, defines: {} }
  mat.onBeforeCompile(sh, {})
  return sh
}

describe('cal caída dos marcos', () => {
  it('as casas ficam com o programa de sempre, sem o código dos marcos', () => {
    const { reboco, rebocoMorro } = materiaisDasCasas()
    for (const m of [reboco, rebocoMorro]) {
      const sh = compilar(m)
      expect(m.customProgramCacheKey()).toBe('reboco-casas')
      // o envelhecer traz o #ifdef CASCA_MARCO, mas sem o #define o pré-processador deixa só a conta das casas
      expect(sh.fragmentShader).not.toContain('#define CASCA_MARCO')
      expect(sh.fragmentShader).not.toContain('float limCascaM(')
      expect(sh.vertexShader).not.toContain('aCaixa')
      expect(sh.uniforms.uCascaTam).toBeUndefined()
      expect(m.userData.tsl.posicao.toString()).toContain('aChao')
    }
  })

  it('o marco tem o programa próprio, com a caixa da peça e os números em metros do cfg', () => {
    const m = materialRebocoMarco(0.4)
    const sh = compilar(m)
    expect(m.customProgramCacheKey()).toBe('reboco-marcos')
    expect(sh.fragmentShader).toContain('#define CASCA_MARCO')
    expect(sh.fragmentShader).toContain('limCascaM')
    expect(sh.vertexShader).toContain('attribute vec4 aCaixa')
    expect(sh.uniforms.uCascaTam).toBe(uCasca.tam)
    // o envelhecer usa a regra dos marcos só dentro do CASCA_MARCO: fora dele, a conta das casas
    const desg = sh.fragmentShader.slice(sh.fragmentShader.indexOf('vec3 envelhecer('))
    expect(desg).toMatch(/#ifdef CASCA_MARCO[\s\S]*limCascaM[\s\S]*#else[\s\S]*mix\(0\.68, 0\.6, desg\)/)
  })

  it('o cfg chega aos uniforms; a altura em que some nunca fica abaixo da cheia', () => {
    const c = { ...PADRAO.mundo.marcosNorte }
    sincronizarCasca(c)
    expect(uCasca.tam.value).toBe(c.cascaTam)
    expect(uCasca.alta.value).toBe(c.cascaAlta)
    expect(c.cascaAlta).toBeGreaterThan(c.cascaBaixa)
    expect(c.cascaQuinaAlta).toBeGreaterThan(c.cascaAlta)
    sincronizarCasca({ ...c, cascaBaixa: 8, cascaAlta: 3, cascaQuinaAlta: 2 })
    expect(uCasca.alta.value).toBeGreaterThan(8)
    expect(uCasca.quinaAlta.value).toBeGreaterThan(8)
    sincronizarCasca(c)
  })

  it('a caixa da peça é a da geometria em planta, repetida em cada vértice', () => {
    const g = new THREE.BoxGeometry(6, 13, 0.7).translate(-7.7, 6.5, -0.35)
    const a = caixaDaPeca(g)
    expect(a.itemSize).toBe(4)
    expect(a.count).toBe(g.attributes.position.count)
    const v = Array.from(a.array.slice(0, 4)).map((x) => +x.toFixed(4) + 0)
    expect(v).toEqual([-10.7, -0.7, -4.7, 0])
    expect(Array.from(a.array.slice(-4)).map((x) => +x.toFixed(4) + 0)).toEqual(v)
  })
})
