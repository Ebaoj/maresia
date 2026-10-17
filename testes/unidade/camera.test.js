// Regressão: câmera tremendo com parede atrás do personagem (corrigido em 523bec7, 16/10/2026).
// Antes, a câmera voltava até passar da parede, batia, pulava para perto e repetia: ciclo de 3 quadros.
import * as THREE from 'three'
import { afterEach, describe, expect, it } from 'vitest'
import { CameraTerceiraPessoa } from '../../src/jogador/camera.js'
import { solidosCamera } from '../../src/mundo/solidos.js'

const domFalso = { addEventListener() {}, setPointerCapture() {}, classList: { add() {}, remove() {} } }
const semTeclas = { girarEsq: false, girarDir: false }

function montar(zParede) {
  // parede alta e larga atrás do personagem (yaw 0: a câmera fica para +z)
  const parede = new THREE.Mesh(new THREE.BoxGeometry(12, 30, 0.4), new THREE.MeshBasicMaterial())
  parede.position.set(0, 10, zParede)
  parede.updateMatrixWorld(true)
  solidosCamera.push(parede)
  const cfg = { camera: { distancia: 5, altura: 1, fov: 50, inclinacaoCorrida: 0.05 } }
  const cam = new CameraTerceiraPessoa(new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 1000), domFalso, cfg, 0)
  return { cam, parede }
}

afterEach(() => { solidosCamera.length = 0 })

describe('câmera com parede atrás', () => {
  it('encosta na parede e fica parada, sem tremer', () => {
    const { cam } = montar(2.5)
    const pos = new THREE.Vector3(0, 0, 0)
    const dist = []
    const zCamera = []
    for (let i = 0; i < 300; i++) {
      cam.update(1 / 60, pos, 0, semTeclas)
      dist.push(cam.dist)
      zCamera.push(cam.camera.position.z)
    }
    const depois = dist.slice(120) // passados 2 s, já assentou
    const variacao = Math.max(...depois) - Math.min(...depois)
    expect(variacao).toBeLessThan(0.01)
    // e não atravessa a parede (a face da frente fica em z = 2,3; a distância é medida ao longo do raio,
    // que sobe quando a câmera passa por cima, por isso a conferência é pela posição)
    expect(Math.max(...zCamera.slice(120))).toBeLessThan(2.3)
  })

  it('sem parede, volta para a distância configurada', () => {
    const { cam } = montar(500)
    const pos = new THREE.Vector3(0, 0, 0)
    for (let i = 0; i < 400; i++) cam.update(1 / 60, pos, 0, semTeclas)
    expect(cam.dist).toBeCloseTo(5, 2)
  })
})
