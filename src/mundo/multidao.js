// Muita gente parada ou andando, barata (22/10/2026, docs/gente-22-10.md): cada ficha de figura tem duas malhas,
// perto (o detalhe: rosto, mão, fita do chapéu) e longe (a mesma figura com menos lados); além de `ate` metros a pessoa
// não é desenhada (no Centro ela já está atrás das casas). Um terceiro nível (silhueta, 250 vértices contra 360) foi
// medido e saiu: poupava pouco vértice e somava uma malha por ficha (o custo de CPU do desenho). Cada pessoa é uma entrada;
// a cada atualizar as entradas visíveis são arrumadas no começo da malha certa pela distância à câmera, e a contagem
// da malha é o número delas (o que sobra no fim não é desenhado nem passa pelo vértice). Uma malha por ficha e por
// nível em vez de uma por bloco: no Campo do Urubu eram ~100 malhas por quadro (9 blocos de 96 m x 12 fichas).
//
// Entrada: { matriz, oculta }. Quem mexe na matriz (quem anda) ou na oculta (ator ocupou, noite) chama sujar().
//
// WebGPU: o renderizador (src/render/renderizador.js, quantidadeFixa) faz toda malha de cópias cujo count muda ser
// desenhada com a capacidade inteira (as cópias a mais viram escala zero), porque o instance() do three guardava a
// lista de matrizes do primeiro desenho. Aqui isso desfazia o LOD: as três malhas de cada ficha passavam pelo vértice
// com todas as pessoas (3,3 milhões de triângulos na Coluna da Hora, 22/10/2026). O material da gente lê a matriz de
// um buffer por cópia (matrizInstancia, arcane-tsl.js), que não depende do primeiro desenho; então a multidão tira esse
// envoltório da malha dela (soltarContagem) e cuida dos outros dois motivos dele: nunca count 1 (o three junta o
// objeto com outros do mesmo material) e nunca 0 (ainda desenhava uma cópia): sobra vira cópia nula (escala zero).

import * as THREE from 'three'

const NIVEIS = ['perto', 'longe']
const NULA = new THREE.Matrix4().makeScale(0, 0, 0).elements

// tira o envoltório de quantidade fixa do renderizador do WebGPU (ver o começo do arquivo), se ele já passou
function soltarContagem(m) {
  const d = Object.getOwnPropertyDescriptor(m, 'count')
  if (!d || !d.get) return
  delete m.count
  delete m.userData.quantidadeReal
  m.count = m.instanceMatrix.count
  m.userData.webgpu = true // desenhada pelo WebGPU: daqui em diante a contagem tem o mínimo de 2
}
// grava a contagem: no mínimo 2 (as que faltam são nulas) e nunca além da capacidade
function contar(m, n) {
  soltarContagem(m)
  const cap = m.instanceMatrix.count
  const a = m.instanceMatrix.array
  // (no WebGL e nos testes a contagem é a de verdade; o mínimo de 2 é coisa do WebGPU)
  const min = m.userData.webgpu ? 2 : 0
  for (let i = n; i < Math.min(min, cap); i++) a.set(NULA, i * 16)
  m.count = Math.min(cap, Math.max(min, n))
  m.instanceMatrix.needsUpdate = true
}
// controlaVisivel: malha sem ninguém fica invisível (a cidade); no campo quem liga e desliga é o dia e a noite
export function criarMultidao(cena, material, { nome, lodPerto = 20, ate = 400, sombra = true, controlaVisivel = false } = {}) {
  const tipos = []
  let sujo = true
  const ultima = new THREE.Vector3(1e9, 0, 1e9)
  let lim2 = lodPerto * lodPerto
  let ate2 = ate * ate
  const malhas = []

  const api = {
    malhas,
    tipos,
    // um tipo de figura: { perto, longe } (figuraLod)
    tipo(lod) {
      const t = { lod, entradas: [], perto: null, longe: null }
      tipos.push(t)
      return t
    },
    adicionar(t, matriz, extra = {}) {
      const e = { tipo: t, matriz, oculta: false, ...extra }
      t.entradas.push(e)
      return e
    },
    // cria as malhas com lugar para todas as entradas; até o primeiro atualizar com câmera, todos ficam de perto
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
        for (const nivel of NIVEIS) {
          const m = new THREE.InstancedMesh(t.lod[nivel], material, t.entradas.length)
          m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          m.count = 0
          m.castShadow = sombra
          m.receiveShadow = true
          m.frustumCulled = false // a gente se espalha pela cidade toda e se mexe: a esfera seria a cidade inteira
          m.boundingSphere = esfera.clone()
          m.userData.peso = 0.8
          m.userData.nivel = nivel
          m.name = nome
          t[nivel] = m
          malhas.push(m)
          cena.add(m)
        }
      }
      api.atualizar(null, true)
      return api
    },
    sujar() { sujo = true },
    // as cópias que passam pelo vértice agora (todas as malhas): o que o LOD economiza
    copiasDesenhadas() { let n = 0; for (const m of malhas) n += m.count; return n },
    set lodPerto(v) { lim2 = v * v; sujo = true },
    set ate(v) { ate2 = v * v; sujo = true },
    // arruma as cópias: perto ou longe pela câmera (cam: Vector3 ou null = todos de perto)
    atualizar(cam = null, forcar = false) {
      if (cam) {
        if (!forcar && !sujo && ultima.distanceToSquared(cam) < 1.5 * 1.5) return false
        ultima.copy(cam)
      } else if (!forcar && !sujo) return false
      sujo = false
      for (const t of tipos) {
        if (!t.perto) continue
        let np = 0
        let nl = 0
        const ap = t.perto.instanceMatrix.array
        const al = t.longe.instanceMatrix.array
        for (const e of t.entradas) {
          if (e.oculta) continue
          const el = e.matriz.elements
          let d2 = 0
          if (cam) {
            const dx = el[12] - cam.x
            const dz = el[14] - cam.z
            d2 = dx * dx + dz * dz
          }
          if (d2 < lim2) ap.set(el, np++ * 16)
          else if (d2 < ate2) al.set(el, nl++ * 16)
        }
        contar(t.perto, np)
        contar(t.longe, nl)
        if (controlaVisivel) { t.perto.visible = np > 0; t.longe.visible = nl > 0 }
      }
      return true
    },
  }
  return api
}
