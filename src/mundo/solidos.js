// Objetos que a câmera não pode atravessar (prédios, igreja, farol...).
// Os raios da câmera testam a malha de verdade; com uma BVH por geometria (three-mesh-bvh) o teste vira
// busca em árvore em vez de triângulo por triângulo, com o mesmo ponto de batida. Era ~20% da thread
// principal com a câmera parada perto das casas (perfil na L4, 17/10/2026).

import * as THREE from 'three'
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh'

export const solidosCamera = []

// guardado para a prova de equivalência (ver src/debug/prova-raios.js)
export const raycastOriginal = THREE.Mesh.prototype.raycast
const _esfera = new THREE.Sphere()
const _raio = new THREE.Ray()
const _bate = new THREE.Vector3()

// Com BVH: antes da árvore, o mesmo descarte barato do Mesh.raycast do three (o raio não chega na esfera
// que envolve a malha, dentro do alcance). Sem ele a BVH saía mais lenta: as casas de palha são centenas
// de cópias, e cada cópia ia para a árvore. Geometria sem BVH segue no raycast original.
function raycastSolido(raycaster, intersects) {
  const g = this.geometry
  if (!g.boundsTree) return raycastOriginal.call(this, raycaster, intersects)
  if (this.material === undefined) return
  if (g.boundingSphere === null) g.computeBoundingSphere()
  _esfera.copy(g.boundingSphere).applyMatrix4(this.matrixWorld)
  _raio.copy(raycaster.ray).recast(raycaster.near)
  if (!_esfera.containsPoint(_raio.origin)) {
    if (_raio.intersectSphere(_esfera, _bate) === null) return
    if (_raio.origin.distanceToSquared(_bate) > (raycaster.far - raycaster.near) ** 2) return
  }
  acceleratedRaycast.call(this, raycaster, intersects)
}
// as cópias de um InstancedMesh passam por um Mesh interno, por isso a troca é no protótipo
THREE.Mesh.prototype.raycast = raycastSolido

let preparados = 0

// Os sólidos que um raio pode tocar (22/10/2026, docs/desempenho-22-10.md): os raios da câmera saem de até `folga` m
// de `centro` e andam no máximo `alcance` m, então quem tem a esfera inteira mais longe que isso não pode ser tocado e
// não precisa ir para o intersectObjects (que testaria a esfera de cada um, 11 raios por quadro). Com o mapa 2,5 vezes
// maior eram ~900 sólidos por raio; o resultado do raio é o mesmo. Quem tem filhos (o raio é recursivo) vai sempre.
const _esferas = new WeakMap()
function esferaNoMundo(o) {
  let s = _esferas.get(o)
  // congelado com a matriz do mundo já feita: a esfera não muda mais
  if (s && s.fixa) return s
  let local
  if (o.isInstancedMesh) { if (o.boundingSphere === null) o.computeBoundingSphere(); local = o.boundingSphere }
  else if (o.isMesh) { if (o.geometry.boundingSphere === null) o.geometry.computeBoundingSphere(); local = o.geometry.boundingSphere }
  else return null
  if (!s) { s = new THREE.Sphere(); _esferas.set(o, s) }
  s.copy(local).applyMatrix4(o.matrixWorld)
  s.fixa = o.static === true && o.matrixAutoUpdate === false && o.matrixWorldNeedsUpdate === false
  return s
}

export function solidosAoAlcance(centro, alcance, saida = []) {
  saida.length = 0
  for (const o of solidosCamera) {
    const s = o.children.length ? null : esferaNoMundo(o)
    if (!s || s.center.distanceTo(centro) - s.radius <= alcance) saida.push(o)
  }
  return saida
}

// monta a BVH das geometrias que entraram em solidosCamera desde a última chamada
export function prepararSolidos() {
  if (preparados === solidosCamera.length) return
  for (let i = preparados; i < solidosCamera.length; i++) {
    solidosCamera[i].traverse((o) => {
      if (o.isMesh && o.geometry && !o.geometry.boundsTree) o.geometry.boundsTree = computeBoundsTree.call(o.geometry)
    })
  }
  preparados = solidosCamera.length
}
