// Recorte da sombra de perto por cópia (fluido, 22/10/2026, src/render/sombra-perto-recorte.js): o bloco grande de
// cópias entra no mapa de perto só com as cópias cuja esfera cruza o volume da câmera de sombra, numa malha por
// família; nada que cruza fica de fora (a esfera é aumentada da folga), e a escolha só é refeita quando a câmera de
// sombra anda ou o conjunto de blocos à vista muda.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { RecortePerto } from '../../src/render/sombra-perto-recorte.js'

function luzDePerto(cx, cz) {
  const luz = new THREE.DirectionalLight(0xffffff, 0)
  const sc = luz.shadow.camera
  sc.left = -24; sc.right = 24; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 410
  sc.updateProjectionMatrix()
  luz.position.set(cx + 100, 230, cz + 40)
  luz.target.position.set(cx, 0, cz)
  luz.updateMatrixWorld()
  luz.target.updateMatrixWorld()
  luz.shadow.updateMatrices(luz)
  return luz
}

function bloco(geo, mat, x0, z0) {
  const n = 31 * 31
  const b = new THREE.InstancedMesh(geo, mat, n)
  let k = 0
  for (let i = 0; i < 31; i++) for (let j = 0; j < 31; j++) b.setMatrixAt(k++, new THREE.Matrix4().makeTranslation(x0 + i * 20, 0, z0 + j * 20))
  b.computeBoundingSphere()
  return b
}

describe('recorte da sombra de perto', () => {
  const cena = new THREE.Scene()
  const geo = new THREE.SphereGeometry(3)
  const mat = new THREE.MeshBasicMaterial()
  // dois blocos de 600 m da mesma família (uma cópia a cada 20 m) e um bloco pequeno
  const a = bloco(geo, mat, -300, -300)
  const b = bloco(geo, mat, 320, -300)
  const pequeno = new THREE.InstancedMesh(geo, mat, 4)
  for (let i = 0; i < 4; i++) pequeno.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i * 5, 0, 0))
  pequeno.computeBoundingSphere()
  cena.add(a, b, pequeno)
  cena.updateMatrixWorld(true)
  const recorte = new RecortePerto()

  it('bloco pequeno entra inteiro; os grandes viram uma família só', () => {
    expect(recorte.grande(pequeno)).toBe(false)
    expect(recorte.grande(a)).toBe(true)
    expect(recorte.grande(b)).toBe(true)
    expect(recorte.stats.familias).toBe(1)
  })

  it('o primeiro quadro aquece a família (uma cópia de escala zero)', () => {
    const p = recorte.preparar([a, b], luzDePerto(0, 0).shadow, [a, b, pequeno])
    expect(p.length).toBe(1)
    expect(p[0].count).toBe(1)
  })

  it('só as cópias que o three desenharia no mapa de perto entram, e nenhuma fica de fora', () => {
    const luz = luzDePerto(0, 0)
    const [proxy] = recorte.preparar([a, b], luz.shadow)
    expect(proxy.count).toBeGreaterThan(0)
    expect(proxy.count).toBeLessThan((31 * 31 * 2) / 10)
    const fr = luz.shadow.getFrustum()
    const s = new THREE.Sphere()
    const m = new THREE.Matrix4()
    const dentro = new Set()
    for (let i = 0; i < proxy.count; i++) { proxy.getMatrixAt(i, m); dentro.add(new THREE.Vector3().setFromMatrixPosition(m).toArray().join(',')) }
    for (const bl of [a, b]) {
      for (let i = 0; i < bl.count; i++) {
        bl.getMatrixAt(i, m)
        s.copy(geo.boundingSphere).applyMatrix4(m)
        if (fr.intersectsSphere(s)) expect(dentro.has(s.center.toArray().join(','))).toBe(true)
      }
    }
  })

  it('a câmera andando pouco não refaz; andando mais ou mudando o conjunto, refaz', () => {
    const antes = recorte.stats.refeitos
    recorte.preparar([a, b], luzDePerto(1, 0).shadow)
    expect(recorte.stats.refeitos).toBe(antes)
    recorte.preparar([a, b], luzDePerto(40, 0).shadow)
    expect(recorte.stats.refeitos).toBe(antes + 1)
    // o bloco b sumiu (LOD): refaz, e as cópias dele saem
    const [p] = recorte.preparar([a], luzDePerto(40, 0).shadow)
    expect(recorte.stats.refeitos).toBe(antes + 2)
    const m = new THREE.Matrix4()
    const v = new THREE.Vector3()
    for (let i = 0; i < (p ? p.count : 0); i++) { p.getMatrixAt(i, m); expect(v.setFromMatrixPosition(m).x).toBeLessThan(320) }
  })
})
