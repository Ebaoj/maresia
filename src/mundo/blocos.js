// Divide um monte de cópias (InstancedMesh) em blocos de chão.
// Assim o three consegue pular o bloco inteiro quando ele está fora da câmera
// ou fora da área da sombra; com uma malha só cobrindo o mapa, nada era pulado.

import * as THREE from 'three'
import { congelar } from './congelar.js'
import { solidosCamera } from './solidos.js'

const p = new THREE.Vector3()

export function instanciarEmBlocos(cena, geo, material, matrizes, cores = null, opcoes = {}) {
  const { tam = 96, nome = '', sombra = true, recebe = true, peso, solido = false, semNormal = false } = opcoes
  const grupos = new Map()
  matrizes.forEach((m, i) => {
    p.setFromMatrixPosition(m)
    const k = `${Math.floor(p.x / tam)},${Math.floor(p.z / tam)}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(i)
  })
  const malhas = []
  const c = new THREE.Color()
  for (const indices of grupos.values()) {
    const im = new THREE.InstancedMesh(geo, material, indices.length)
    indices.forEach((i, j) => {
      im.setMatrixAt(j, matrizes[i])
      if (cores && cores[i]) im.setColorAt(j, c.set(cores[i]))
    })
    im.computeBoundingSphere()
    im.castShadow = sombra
    im.receiveShadow = recebe
    im.name = nome
    if (peso !== undefined) im.userData.peso = peso
    if (semNormal) im.userData.semNormal = true
    if (solido) solidosCamera.push(im)
    cena.add(congelar(im))
    malhas.push(im)
  }
  return malhas
}
