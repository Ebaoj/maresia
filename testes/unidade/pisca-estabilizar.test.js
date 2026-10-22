// Pisca (22/10/2026, docs/pisca-22-10.md): a estabilização no tempo (src/pos/estabilizar.js) traz a cor do quadro
// anterior para o mesmo ponto do mundo. Pega: (1) a câmera do quadro tem de ser a deste quadro, não a matriz de mundo
// velha (o three só a refaz dentro do render(), depois de atualizar(): a primeira versão lia a velha e a imagem
// amolecia andando); (2) sem quadro anterior válido (primeiro quadro, tamanho novo, teletransporte) não mistura;
// (3) 0 desliga o passe.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { uniformsEstabilizar, criarEstadoEstabilizar, atualizarEstabilizar } from '../../src/pos/estabilizar.js'

const camera = () => {
  const c = new THREE.PerspectiveCamera(50, 16 / 9, 0.3, 6000)
  c.position.set(3158, 2, 1467)
  c.lookAt(3150, 1.5, 1480)
  c.updateMatrixWorld()
  return c
}
const e = { estabilizar: 0.85, estabilizarGama: 1.25 }

describe('estabilização no tempo', () => {
  it('o primeiro quadro não mistura; o seguinte usa a câmera do anterior, já andada', () => {
    const u = uniformsEstabilizar(THREE), est = criarEstadoEstabilizar(), cam = camera()
    expect(atualizarEstabilizar(u, est, e, cam, 1280, 577, THREE)).toBe(true)
    expect(u.uValido.value).toBe(0)
    // a câmera anda 0,1 m e o jogo NÃO chama updateMatrixWorld (como em passo(): o three chama dentro do render)
    const vpAntes = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorld.clone().invert())
    cam.position.x += 0.1
    atualizarEstabilizar(u, est, e, cam, 1280, 577, THREE)
    expect(u.uValido.value).toBe(1)
    expect(u.uVPAnterior.value.equals(vpAntes)).toBe(true)
    // a matriz de mundo deste quadro já é a da posição nova
    expect(u.uCamMundo.value.elements[12]).toBeCloseTo(3158.1, 6)
    // o ponto do mundo no centro da tela deste quadro cai na tela do anterior deslocado (não no mesmo lugar)
    const p = new THREE.Vector3(3150, 1.5, 1480)
    const agora = p.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorld.clone().invert()))
    const antes = p.clone().applyMatrix4(u.uVPAnterior.value)
    expect(Math.abs(agora.x - antes.x)).toBeGreaterThan(1e-3)
  })

  it('teletransporte, tamanho novo ou força 0: sem a cor de antes', () => {
    const u = uniformsEstabilizar(THREE), est = criarEstadoEstabilizar(), cam = camera()
    atualizarEstabilizar(u, est, e, cam, 1280, 577, THREE)
    cam.position.x += 40
    atualizarEstabilizar(u, est, e, cam, 1280, 577, THREE)
    expect(u.uValido.value).toBe(0)
    atualizarEstabilizar(u, est, e, cam, 1280, 577, THREE)
    expect(u.uValido.value).toBe(1)
    atualizarEstabilizar(u, est, e, cam, 1600, 721, THREE)
    expect(u.uValido.value).toBe(0)
    expect(atualizarEstabilizar(u, est, { estabilizar: 0 }, cam, 1600, 721, THREE)).toBe(false)
    // religado: começa de novo sem quadro anterior
    atualizarEstabilizar(u, est, e, cam, 1600, 721, THREE)
    expect(u.uValido.value).toBe(0)
  })
})
