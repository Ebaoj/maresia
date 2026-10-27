// Mapa de perto desligado (27/10/2026): o shader declara directionalShadowMap[ 1 ] como sampler2DShadow mesmo com o
// mapa de perto desligado; sem mapa criado, o three liga ali a textura vazia RGBA e o ANGLE sobre Metal recusa todo
// desenho ("Mismatch between texture format and sampler type"). Desligado, o mapa ainda tem de ser criado uma vez.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { SombraPerto } from '../../src/render/sombra-perto.js'

function montar(sombraPerto) {
  const cena = new THREE.Scene()
  const sol = new THREE.DirectionalLight(0xffffff, 1)
  const cfg = { mundo: { sombras: true, sombraPerto, sombraPertoTamanho: 48, sombraPertoResolucao: 1024, sombraPertoACada: 2 } }
  return { sp: new SombraPerto({ cena, sol, cfg }), cfg }
}

describe('SombraPerto (WebGL) desligada', () => {
  it('pede um passe enquanto o mapa não existe, e nenhum depois', () => {
    const { sp } = montar(false)
    const dir = new THREE.Vector3(0.3, 1, 0.2), centro = new THREE.Vector3()
    sp.atualizar(dir, centro)
    expect(sp.luz.castShadow).toBe(true)
    expect(sp.luz.shadow.needsUpdate).toBe(true)
    sp.luz.shadow.map = { dispose() {} } // o three criou o mapa no passe
    sp.atualizar(dir, centro)
    expect(sp.luz.shadow.needsUpdate).toBe(false)
    expect(sp.luz.shadow.intensity).toBe(0)
  })

  it('sem sombras, não pede passe', () => {
    const { sp, cfg } = montar(false)
    cfg.mundo.sombras = false
    sp.atualizar(new THREE.Vector3(0.3, 1, 0.2), new THREE.Vector3())
    expect(sp.luz.shadow.needsUpdate).toBe(false)
  })
})
