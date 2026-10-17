// Objetos que nunca se movem depois de criados (blocos de cópias, pedaços do terreno) ficam com a matriz
// congelada: o three deixa de recompor a matriz e de multiplicar pela do pai em todo quadro. Eram 3.321
// de 3.323 objetos recalculados por quadro (inventário na L4, 17/10/2026). A imagem não muda: a matriz
// guardada é a mesma que o three calcularia.
// No modo dev, um vigia confere de 2 em 2 s se algum congelado foi movido e avisa no console (aí é só
// tirar o objeto daqui ou chamar o.updateMatrix() depois de mover).

import * as THREE from 'three'

const congelados = []

export function congelar(o) {
  o.updateMatrix()
  o.matrixAutoUpdate = false
  congelados.push(o)
  return o
}

// para medir com e sem (perfil.py): false devolve o recálculo por quadro a todos, true congela de novo
export function alternarCongelamento(ligado) {
  for (const o of congelados) {
    o.matrixAutoUpdate = !ligado
    if (ligado) o.updateMatrix()
  }
}

if (import.meta.env.DEV) {
  window.__alternarCongelamento = alternarCongelamento
  const m = new THREE.Matrix4()
  const avisados = new Set()
  setInterval(() => {
    for (const o of congelados) {
      if (avisados.has(o)) continue
      m.compose(o.position, o.quaternion, o.scale)
      const a = m.elements
      const b = o.matrix.elements
      for (let i = 0; i < 16; i++) {
        if (Math.abs(a[i] - b[i]) > 1e-6) {
          avisados.add(o)
          console.warn('Congelado e movido (congelar.js):', o.name || o.type, o)
          break
        }
      }
    }
  }, 2000)
}
