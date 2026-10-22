// Esculturas da Praça dos Leões lidas como massa escura sem volume a 5 m (branch metal-claro, 22/10/2026): faltava ao
// metal a dobra escura (a pátina guardada no fundo da juba) e a crista clara. A curvatura de cada vértice sai uma vez,
// quando o modelo carrega, da mesma vizinhança das normais da forma (normais-suaves.js, aCurva): positiva no côncavo,
// negativa no convexo, em frações do raio. Este teste pega: (1) a curvatura sumir ou sair com o sinal trocado; (2) o
// plano em volta de um sulco escurecer; (3) a cavidade dos modelos virar camuflagem (fração grande do corpo marcada como
// dobra: a 5 m às 15h a juba virava pintas). No código de antes (705a3d3) ele falha: curvatura e aCurva não existem.

import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import * as THREE from 'three'
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { suavizarNormais, vizinhanca, curvatura } from '../../src/mundo/marcos1932/normais-suaves.js'
import { PADRAO } from '../../src/config.js'

const soldada = (geo) => {
  const g = mergeVertices(geo.deleteAttribute('normal').deleteAttribute('uv'), 1e-6)
  g.computeVertexNormals()
  return g
}

describe('curvatura das esculturas', () => {
  it('convexo dá negativo (esfera vista de fora), côncavo dá positivo (a mesma esfera por dentro)', () => {
    const g = soldada(new THREE.IcosahedronGeometry(0.3, 20))
    const raio = PADRAO.marcos.metalSuave
    const v = vizinhanca(g.attributes.position.array, raio)
    const fora = curvatura(g.attributes.position.array, g.attributes.normal.array, v, raio)
    const dentro = curvatura(g.attributes.position.array, g.attributes.normal.array.map((x) => -x), v, raio)
    expect(Math.max(...fora)).toBeLessThan(0)
    expect(Math.min(...dentro)).toBeGreaterThan(0)
  })

  it('o sulco aparece como dobra e o plano em volta fica neutro', () => {
    // um plano de 0,6 m com um sulco de 5 cm de fundo e 8 cm de largura no meio (o fundo da juba)
    const g = new THREE.PlaneGeometry(0.6, 0.6, 60, 60).rotateX(-Math.PI / 2)
    const p = g.attributes.position.array
    for (let i = 0; i < p.length; i += 3) p[i + 1] = -0.05 * Math.exp(-(p[i] * p[i]) / (2 * 0.02 * 0.02))
    const s = soldada(g)
    suavizarNormais(s, PADRAO.marcos.metalSuave, 2, 1)
    const c = s.attributes.aCurva.array
    const q = s.attributes.position.array
    let fundo = -1, plano = 0
    for (let i = 0; i < c.length; i++) {
      const x = q[i * 3], z = q[i * 3 + 2]
      if (Math.abs(z) > 0.2) continue // longe da borda da folha
      if (Math.abs(x) < 0.005) fundo = Math.max(fundo, c[i])
      if (Math.abs(x) > 0.2) plano = Math.max(plano, Math.abs(c[i]))
    }
    const { metalCavIni, metalCavFim } = PADRAO.marcos
    expect(fundo).toBeGreaterThan((metalCavIni + metalCavFim) / 2) // o fundo do sulco escurece mais que pela metade
    expect(plano).toBeLessThan(metalCavIni) // o plano não escurece
  })

  it('raio 0 dá curvatura zero (o metal fica como sem a cavidade)', () => {
    const g = soldada(new THREE.IcosahedronGeometry(0.3, 4))
    suavizarNormais(g, 0, 2, 1)
    expect(Array.from(g.attributes.aCurva.array).every((x) => x === 0)).toBe(true)
  })

  // os modelos ficam fora do git (arte/finais): onde não houver, o teste do modelo não roda
  const ARQ = 'arte/finais/marcos1932/leao-pe-jogo.glb'
  it.skipIf(!existsSync(ARQ))('nos quatro modelos a dobra marcada é pouca (sem camuflagem) e existe', async () => {
    const { prepararModelo, MODELOS } = await import('../../src/mundo/marcos1932/esculturas.js')
    const { metalCavIni, metalSuave, metalBrilhoForma } = PADRAO.marcos
    for (const def of Object.values(MODELOS)) {
      const buf = readFileSync('arte/finais' + def.arquivo.replace('/arte/finais', ''))
      const gltf = await new Promise((r, e) => new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', r, e))
      const c = prepararModelo(gltf, def, metalSuave, metalBrilhoForma).attributes.aCurva.array
      // a fração do corpo que escurece alguma coisa: com a dobra começando cedo demais, a juba e o dorso viravam
      // pintas (visto a 5 m às 15h com a cavidade em 1,5 cm); o General, de farda lisa, tem poucas dobras fundas
      let dobra = 0
      for (const x of c) if (x > metalCavIni) dobra++
      const fracao = dobra / c.length
      expect(fracao).toBeGreaterThan(0.005)
      expect(fracao).toBeLessThan(0.2)
    }
  }, 60000)
})
