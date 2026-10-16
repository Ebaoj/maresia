// Múltiplos (fase 3 do corpo): na corrida e no pulo, cópias do corpo nas poses anteriores, desenhadas
// em retícula de pontos da cor da roupa, ficando para trás como rastro. É o recurso do Aranhaverso para
// mostrar velocidade sem borrão: o desenho repete o membro em vez de borrar.
// Cada cópia é o mesmo boneco com esqueleto próprio; a cada pose nova, a mais nova herda a pose que o
// corpo tinha, e as outras passam a pose adiante.

import * as THREE from 'three'
import { clone as clonarComEsqueleto } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { luzFixa } from '../materiais.js'

function materialRetícula(cor, densidade) {
  const m = new THREE.MeshBasicMaterial({ color: cor })
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDensidade = densidade
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDensidade;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // retícula em tela: pontos numa grade a 45°, raio pela densidade (some quando a densidade é 0)
        vec2 g = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / 5.0;
        if (length(fract(g) - 0.5) > uDensidade * 0.72) discard;`)
  }
  luzFixa(m, 0.9)
  m.customProgramCacheKey = () => 'luz-fixa-reticula' // não pode dividir programa com os outros luzFixa
  return m
}

export function criarMultiplos(boneco, quantos = 2) {
  const copias = []
  for (let i = 0; i < quantos; i++) {
    const densidade = { value: 0 }
    const raiz = clonarComEsqueleto(boneco.raiz)
    raiz.matrixAutoUpdate = false
    raiz.visible = false
    const malhas = []
    raiz.traverse((o) => {
      if (o.isMesh) { // pele e roupa (com esqueleto) e peças presas, como o chapéu
        o.material = materialRetícula((o.material.color || new THREE.Color('#ffffff')).clone(), densidade)
        o.castShadow = false
        o.receiveShadow = false
        o.frustumCulled = false
        if (o.isSkinnedMesh) malhas.push(o)
      }
    })
    const ossos = malhas[0].skeleton.bones
    copias.push({ raiz, ossos, densidade, fator: 1 - i / quantos })
  }
  const original = boneco.esqueleto.bones
  const guardado = { q: original.map(() => new THREE.Quaternion()), p: original.map(() => new THREE.Vector3()), m: new THREE.Matrix4(), ok: false }

  return {
    raizes: copias.map((c) => c.raiz),
    // chamado logo antes de o corpo mudar de pose: a pose que sai vai para a primeira cópia
    registrar() {
      for (let i = copias.length - 1; i > 0; i--) {
        const a = copias[i], b = copias[i - 1]
        a.ossos.forEach((o, k) => { o.quaternion.copy(b.ossos[k].quaternion); o.position.copy(b.ossos[k].position) })
        a.raiz.matrix.copy(b.raiz.matrix)
      }
      const c0 = copias[0]
      original.forEach((o, k) => { c0.ossos[k].quaternion.copy(o.quaternion); c0.ossos[k].position.copy(o.position) })
      boneco.raiz.updateWorldMatrix(true, false)
      c0.raiz.matrix.copy(boneco.raiz.matrixWorld)
      for (const c of copias) c.raiz.matrixWorldNeedsUpdate = true
    },
    // força 0 a 1 (velocidade): densidade da retícula de cada cópia
    atualizar(forca) {
      for (const c of copias) {
        c.densidade.value = forca * 0.85 * c.fator
        c.raiz.visible = c.densidade.value > 0.05
      }
    },
  }
}
