// Muita gente parada ou andando, barata (22/10/2026, docs/gente-22-10.md): uma malha por ficha de figura, com todas
// as pessoas dela; a cada atualizar as entradas visíveis (não ocultas e a menos de `ate` metros da câmera: no Centro,
// além disso, já está atrás das casas) são arrumadas no começo da malha, e a contagem da malha é o número delas (o que
// sobra no fim não é desenhado nem passa pelo vértice). No Campo do Urubu era uma malha por bloco de 96 m e por ficha.
//
// Por que um nível só por malha (medido em 22 e 23/10/2026 na Coluna da Hora): com perto e longe por ficha eram 48
// malhas de gente, e neste renderizador cada malha custa no processador em cada passada (cor, sombra do sol, sombra de
// perto) mais do que os vértices que o nível de longe poupava. O detalhe de perto fica com os atores (os 16 mais
// perto do jogador, atores.js) e, no campo, com a fila da cozinha; o resto da gente usa a figura média (gente-corpo.js).
//
// Entrada: { matriz, oculta }. Quem mexe na matriz (quem anda) ou na oculta (ator ocupou, noite) chama sujar().
// Com a câmera inteira (não só a posição), a multidão também deixa de fora quem está fora do quadro, com folga
// (`folga` metros, para a sombra de quem está logo fora ainda cair na tela): as malhas por bloco de antes eram
// cortadas pelo three por bloco; a malha única não é (a esfera dela é a cidade). Refaz quando a câmera anda 2 m ou
// gira 0,08 rad, ou quando alguém mexeu.
//
// WebGPU: o renderizador (src/render/renderizador.js, quantidadeFixa) faz toda malha de cópias cuja contagem muda ser
// desenhada com a capacidade inteira (as cópias a mais viram escala zero), porque o instance() do three guardava a
// lista de matrizes do primeiro desenho. O material da gente lê a matriz de um buffer por cópia (matrizInstancia,
// arcane-tsl.js), que não depende do primeiro desenho; então a multidão marca a malha (userData.contagemViva) e o
// renderizador não põe o envoltório nela (um mecanismo só, o mesmo da malha de longe mascarada, muito-longe.js).
// Cuida dos outros dois motivos dele: no WebGPU nunca contagem 1 (o three junta o objeto com outros do mesmo
// material) nem 0 (ainda desenhava uma cópia): sobra vira cópia nula (escala zero).

import * as THREE from 'three'

const NULA = new THREE.Matrix4().makeScale(0, 0, 0).elements
// o mínimo de 2 cópias é coisa do WebGPU; no Node (testes) a contagem é a de verdade
const MINIMO = typeof navigator !== 'undefined' && navigator.gpu ? 2 : 0

// grava a contagem: no mínimo MINIMO (as que faltam são nulas) e nunca além da capacidade
function contar(m, n) {
  const cap = m.instanceMatrix.count
  const a = m.instanceMatrix.array
  for (let i = n; i < Math.min(MINIMO, cap); i++) a.set(NULA, i * 16)
  m.count = Math.min(cap, Math.max(MINIMO, n))
  m.instanceMatrix.needsUpdate = true
}

// controlaVisivel: malha sem ninguém fica invisível (a cidade); no campo quem liga e desliga é o dia e a noite
const _frustum = new THREE.Frustum()
const _pm = new THREE.Matrix4()
const _esf = new THREE.Sphere()
const _dir = new THREE.Vector3()
export function criarMultidao(cena, material, { nome, ate = 400, sombra = true, controlaVisivel = false, folga = 6 } = {}) {
  const tipos = []
  let sujo = true
  const ultima = new THREE.Vector3(1e9, 0, 1e9)
  const ultimaDir = new THREE.Vector3()
  let ate2 = ate * ate
  const malhas = []

  const api = {
    malhas,
    tipos,
    // um tipo de figura: a geometria dela (figuraGeo)
    tipo(geo) {
      const t = { geo, entradas: [], malha: null }
      tipos.push(t)
      return t
    },
    adicionar(t, matriz, extra = {}) {
      const e = { tipo: t, matriz, oculta: false, ...extra }
      t.entradas.push(e)
      return e
    },
    // cria as malhas com lugar para todas as entradas; até o primeiro atualizar com câmera, todos aparecem
    montar() {
      const esfera = new THREE.Sphere()
      const caixa = new THREE.Box3()
      const p = new THREE.Vector3()
      for (const t of tipos) {
        if (!t.entradas.length) continue
        caixa.makeEmpty()
        for (const e of t.entradas) caixa.expandByPoint(p.setFromMatrixPosition(e.matriz))
        caixa.getBoundingSphere(esfera)
        esfera.radius += 2
        const m = new THREE.InstancedMesh(t.geo, material, t.entradas.length)
        // uso estático de propósito: com DynamicDrawUsage o three refaz o objeto inteiro (FULL) em todo desenho
        // (hasDynamicInstancing); a matriz sobe do mesmo jeito quando needsUpdate (12 vezes por segundo, quem anda)
        m.userData.contagemViva = true
        m.castShadow = sombra
        m.receiveShadow = true
        m.frustumCulled = false // a gente se espalha pela cidade toda e se mexe: a esfera seria a cidade inteira
        m.boundingSphere = esfera.clone()
        m.userData.peso = 0.8
        m.name = nome
        t.malha = m
        malhas.push(m)
        cena.add(m)
      }
      api.atualizar(null, true)
      return api
    },
    sujar() { sujo = true },
    set ate(v) { ate2 = v * v; sujo = true },
    // as cópias que passam pelo vértice agora
    copiasDesenhadas() { let n = 0; for (const m of malhas) n += m.count; return n },
    // arruma as cópias pela câmera (camera: THREE.Camera, ou Vector3 = só a distância, ou null = todos aparecem)
    atualizar(camera = null, forcar = false) {
      const cam = camera?.isCamera ? camera.position : camera
      let quadro = null
      if (camera?.isCamera) {
        camera.getWorldDirection(_dir)
        quadro = _frustum.setFromProjectionMatrix(_pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
      }
      if (cam) {
        if (!forcar && !sujo && ultima.distanceToSquared(cam) < 2 * 2 && (!quadro || ultimaDir.dot(_dir) > Math.cos(0.08))) return false
        ultima.copy(cam)
        if (quadro) ultimaDir.copy(_dir)
      } else if (!forcar && !sujo) return false
      sujo = false
      _esf.radius = 1.2 + folga
      for (const t of tipos) {
        if (!t.malha) continue
        let n = 0
        const a = t.malha.instanceMatrix.array
        for (const e of t.entradas) {
          if (e.oculta) continue
          const el = e.matriz.elements
          if (cam) {
            const dx = el[12] - cam.x
            const dz = el[14] - cam.z
            if (dx * dx + dz * dz > ate2) continue
            if (quadro) { _esf.center.set(el[12], el[13] + 0.9, el[14]); if (!quadro.intersectsSphere(_esf)) continue }
          }
          a.set(el, n++ * 16)
        }
        contar(t.malha, n)
        if (controlaVisivel) t.malha.visible = n > 0
      }
      return true
    },
  }
  return api
}
