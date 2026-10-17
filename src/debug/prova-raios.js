// Prova de que a BVH da câmera (mundo/solidos.js) bate no mesmo lugar que o raycast original do three.
// No console, com o jogo aberto em npm run dev:
//   const { provaRaios } = await import('/src/debug/prova-raios.js'); provaRaios()
// Sorteia raios de até 6 m (a distância da câmera) saindo de perto de cada sólido, lança cada um nos dois
// modos e compara: bateu ou não, em qual objeto, a que distância. Também cronometra os dois.

import * as THREE from 'three'
import { prepararSolidos, raycastOriginal, solidosCamera } from '../mundo/solidos.js'
import { criarAleatorio } from '../utils.js'

export function provaRaios({ n = 3000, alcance = 6, semente = 1932 } = {}) {
  prepararSolidos()
  const acelerado = THREE.Mesh.prototype.raycast
  const rnd = criarAleatorio(semente).proximo
  const rc = new THREE.Raycaster()
  rc.far = alcance
  // origens perto dos sólidos (cópias de InstancedMesh e malhas soltas), para os raios baterem de verdade
  const perto = []
  const m = new THREE.Matrix4()
  const v = new THREE.Vector3()
  for (const s of solidosCamera) {
    s.updateWorldMatrix(true, true)
    if (s.isInstancedMesh) {
      for (let j = 0; j < s.count; j++) { s.getMatrixAt(j, m); perto.push(v.setFromMatrixPosition(m).applyMatrix4(s.matrixWorld).clone()) }
    } else {
      s.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingSphere(); perto.push(o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld)) } })
    }
  }
  const raios = []
  for (let i = 0; i < n; i++) {
    const c = perto[Math.floor(rnd() * perto.length)]
    const o = new THREE.Vector3(c.x + (rnd() * 2 - 1) * 8, c.y + (rnd() * 2 - 1) * 3 + 1.5, c.z + (rnd() * 2 - 1) * 8)
    const d = new THREE.Vector3(rnd() * 2 - 1, (rnd() * 2 - 1) * 0.6, rnd() * 2 - 1).normalize()
    raios.push([o, d])
  }
  const lancar = (raycast, primeiro) => {
    THREE.Mesh.prototype.raycast = raycast
    rc.firstHitOnly = primeiro
    const t0 = performance.now()
    const r = raios.map(([o, d]) => { rc.set(o, d); return rc.intersectObjects(solidosCamera, true)[0] || null })
    return { r, ms: performance.now() - t0 }
  }
  try {
    const a = lancar(raycastOriginal, false)
    const b = lancar(acelerado, true)
    let batidas = 0
    const diferentes = []
    a.r.forEach((x, i) => {
      const y = b.r[i]
      if (x) batidas++
      const igual = (!x && !y) || (x && y && x.object === y.object && Math.abs(x.distance - y.distance) < 1e-5)
      if (!igual) diferentes.push({ i, original: x && [x.object.name, x.distance], bvh: y && [y.object.name, y.distance] })
    })
    return { raios: n, solidos: solidosCamera.length, batidas, diferentes: diferentes.length, exemplos: diferentes.slice(0, 5),
             msOriginal: Math.round(a.ms), msBvh: Math.round(b.ms) }
  } finally {
    THREE.Mesh.prototype.raycast = acelerado
  }
}
