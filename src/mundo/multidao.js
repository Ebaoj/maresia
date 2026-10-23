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
//
// WebGPU: o renderizador (src/render/renderizador.js, quantidadeFixa) faz toda malha de cópias cuja contagem muda ser
// desenhada com a capacidade inteira (as cópias a mais viram escala zero), porque o instance() do three guardava a
// lista de matrizes do primeiro desenho. O material da gente lê a matriz de um buffer por cópia (matrizInstancia,
// arcane-tsl.js), que não depende do primeiro desenho; então a multidão marca a malha (userData.contagemViva, a
// bandeira do renderizador no branch fluido) e, onde a bandeira ainda não existe, tira o envoltório (soltarContagem).
// Cuida dos outros dois motivos dele: no WebGPU nunca contagem 1 (o three junta o objeto com outros do mesmo
// material) nem 0 (ainda desenhava uma cópia): sobra vira cópia nula (escala zero).

import * as THREE from 'three'

const NULA = new THREE.Matrix4().makeScale(0, 0, 0).elements
// o mínimo de 2 cópias é coisa do WebGPU; no Node (testes) a contagem é a de verdade
const MINIMO = typeof navigator !== 'undefined' && navigator.gpu ? 2 : 0

// tira o envoltório de quantidade fixa do renderizador do WebGPU (ver o começo do arquivo), se ele passou
function soltarContagem(m) {
  const d = Object.getOwnPropertyDescriptor(m, 'count')
  if (!d || !d.get) return
  delete m.count
  delete m.userData.quantidadeReal
  m.count = m.instanceMatrix.count
}
// grava a contagem: no mínimo MINIMO (as que faltam são nulas) e nunca além da capacidade
function contar(m, n) {
  soltarContagem(m)
  const cap = m.instanceMatrix.count
  const a = m.instanceMatrix.array
  for (let i = n; i < Math.min(MINIMO, cap); i++) a.set(NULA, i * 16)
  m.count = Math.min(cap, Math.max(MINIMO, n))
  m.instanceMatrix.needsUpdate = true
}

// controlaVisivel: malha sem ninguém fica invisível (a cidade); no campo quem liga e desliga é o dia e a noite
export function criarMultidao(cena, material, { nome, ate = 400, sombra = true, controlaVisivel = false } = {}) {
  const tipos = []
  let sujo = true
  const ultima = new THREE.Vector3(1e9, 0, 1e9)
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
    // arruma as cópias pela câmera (cam: Vector3 ou null = todos aparecem); refaz só se alguém mexeu ou a câmera andou
    atualizar(cam = null, forcar = false) {
      if (cam) {
        if (!forcar && !sujo && ultima.distanceToSquared(cam) < 4 * 4) return false
        ultima.copy(cam)
      } else if (!forcar && !sujo) return false
      sujo = false
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
