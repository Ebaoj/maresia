// Corte por tamanho na tela (fluido, 22/10/2026, src/render/corte-tela.js): a peça que fica menor que cortePx numa
// tela de 900 px sai do desenho pela camada 0, volta quando a câmera chega perto, e a chave do painel desliga tudo.
// Também: o corte nunca mexe em `visible` (a assinatura do cache de sombra e os LOD leem `visible`).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { registrarCorte, atualizarCorte } from '../../src/render/corte-tela.js'

function copias(geo, x, n, escala = 1) {
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), n)
  for (let i = 0; i < n; i++) im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(x + i, 0, 0), new THREE.Quaternion(), new THREE.Vector3(escala, escala, escala)))
  im.computeBoundingSphere()
  return im
}

describe('corte por tamanho na tela', () => {
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 6000)
  const cfg = { desempenho: { cortePequenos: true, cortePx: 3 } }
  // a 1 m, 1 m = 450 / tan(25°) = 965 px; uma peça de 1 m sai além de ~322 m
  const vaso = registrarCorte(copias(new THREE.BoxGeometry(1, 1, 1), 1000, 3))
  // a mesma geometria em escala 4 (peça de 4 m): só sai além de ~1,29 km
  const grande = registrarCorte(copias(new THREE.BoxGeometry(1, 1, 1), 1000, 3, 4))
  // malha junta com o tamanho da peça dado à mão (o campo do Urubu: blocos de 120 m de peças de 5 m)
  const obra = registrarCorte(new THREE.Mesh(new THREE.BoxGeometry(120, 5, 80)), { tam: 5 })
  obra.position.set(-2000, 0, 0)
  obra.updateMatrixWorld()

  it('de longe a peça pequena sai, a grande fica', () => {
    cam.position.set(1000 - 500, 0, 0)
    atualizarCorte(cam, cfg)
    expect(vaso.layers.isEnabled(0)).toBe(false)
    expect(grande.layers.isEnabled(0)).toBe(true)
    expect(vaso.visible).toBe(true) // nunca pelo visible
  })

  it('perto a peça volta', () => {
    cam.position.set(1000 - 200, 0, 0)
    atualizarCorte(cam, cfg)
    expect(vaso.layers.isEnabled(0)).toBe(true)
  })

  it('o tamanho dado à mão vale para a malha junta', () => {
    cam.position.set(1000, 0, 0) // a obra está a ~2,9 km: 5 m viram 1,6 px
    atualizarCorte(cam, cfg)
    expect(obra.layers.isEnabled(0)).toBe(false)
    cam.position.set(-2000 + 900, 0, 0) // a ~830 m da borda: 5,8 px
    atualizarCorte(cam, cfg)
    expect(obra.layers.isEnabled(0)).toBe(true)
  })

  it('desligado no painel, tudo volta', () => {
    cam.position.set(1000 - 2000, 0, 0)
    atualizarCorte(cam, cfg)
    expect(vaso.layers.isEnabled(0)).toBe(false)
    atualizarCorte(cam, { desempenho: { cortePequenos: false, cortePx: 3 } })
    expect(vaso.layers.isEnabled(0)).toBe(true)
    expect(grande.layers.isEnabled(0)).toBe(true)
  })
})
