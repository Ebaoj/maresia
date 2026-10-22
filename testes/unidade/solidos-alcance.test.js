// Desempenho do mapa grande (22/10/2026, docs/desempenho-22-10.md): os 11 raios por quadro da câmera testavam todos
// os sólidos do mapa (~900 malhas, a esfera de cada uma). solidosAoAlcance tira antes quem não pode ser tocado (a
// esfera inteira mais longe que o alcance do raio). O que não pode mudar: o primeiro ponto em que o raio bate.
import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { solidosAoAlcance, solidosCamera, prepararSolidos } from '../../src/mundo/solidos.js'
import { congelar } from '../../src/mundo/congelar.js'
import { criarAleatorio } from '../../src/utils.js'

afterEach(() => { solidosCamera.length = 0 })

function cidade(rnd) {
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  const mat = new THREE.MeshBasicMaterial()
  // blocos de casas (cópias) e malhas soltas, uma delas com filho, espalhados por 600 m
  for (let b = 0; b < 30; b++) {
    const im = new THREE.InstancedMesh(geo, mat, 20)
    const bx = rnd.entre(0, 600), bz = rnd.entre(0, 600)
    for (let i = 0; i < 20; i++) im.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(bx + rnd.entre(0, 90), 0, bz + rnd.entre(0, 90)), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd.entre(0, 3)), new THREE.Vector3(rnd.entre(4, 10), rnd.entre(3, 8), rnd.entre(4, 10))))
    im.computeBoundingSphere()
    solidosCamera.push(congelar(im))
  }
  for (let k = 0; k < 40; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(rnd.entre(2, 12), rnd.entre(2, 20), rnd.entre(2, 12)), mat)
    m.position.set(rnd.entre(0, 600), 4, rnd.entre(0, 600))
    if (k === 0) m.add(new THREE.Mesh(new THREE.BoxGeometry(3, 3, 3), mat))
    m.updateMatrixWorld(true)
    solidosCamera.push(k % 2 ? congelar(m) : m)
  }
  for (const o of solidosCamera) o.updateMatrixWorld(true)
  prepararSolidos()
}

describe('sólidos ao alcance da câmera', () => {
  it('o raio bate no mesmo ponto com a lista inteira e com a lista ao alcance', () => {
    const rnd = criarAleatorio(2210)
    cidade(rnd)
    const rc = new THREE.Raycaster()
    let batidas = 0
    const lista = []
    for (let i = 0; i < 4000; i++) {
      const alvo = new THREE.Vector3(rnd.entre(0, 690), rnd.entre(0.5, 6), rnd.entre(0, 690))
      const alcance = rnd.entre(2, 12)
      solidosAoAlcance(alvo, alcance + 0.6, lista)
      // origem até 0,5 m do alvo, comprimento até o alcance (como o feixe da câmera)
      const o = alvo.clone().add(new THREE.Vector3(rnd.entre(-0.3, 0.3), rnd.entre(-0.3, 0.3), rnd.entre(-0.3, 0.3)))
      const d = new THREE.Vector3(rnd.entre(-1, 1), rnd.entre(-0.4, 0.6), rnd.entre(-1, 1)).normalize()
      rc.set(o, d)
      rc.far = alcance
      const a = rc.intersectObjects(solidosCamera, true)[0]
      const b = rc.intersectObjects(lista, true)[0]
      if (a) batidas++
      expect(b?.object).toBe(a?.object)
      expect(b?.distance).toBe(a?.distance)
    }
    expect(batidas).toBeGreaterThan(100)
  })

  it('a lista ao alcance é bem menor que a do mapa', () => {
    const rnd = criarAleatorio(7)
    cidade(rnd)
    const n = solidosAoAlcance(new THREE.Vector3(300, 2, 300), 8).length
    expect(n).toBeLessThan(solidosCamera.length / 4)
  })

  it('quem se mexe (sem congelar) tem a esfera refeita', () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial())
    m.position.set(100, 0, 0)
    m.updateMatrixWorld(true)
    solidosCamera.push(m)
    expect(solidosAoAlcance(new THREE.Vector3(0, 0, 0), 5)).toEqual([])
    m.position.set(3, 0, 0)
    m.updateMatrixWorld(true)
    expect(solidosAoAlcance(new THREE.Vector3(0, 0, 0), 5)).toEqual([m])
  })
})
