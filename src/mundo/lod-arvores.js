// Cópias e detalhe por distância das árvores pintadas (21/10/2026).
// Cada espécie tem três malhas (arvore-forma.js): corpo, longe e cartões. Elas vão para instanciarEmBlocos com as
// mesmas matrizes, então os blocos de chão saem iguais nas três (mesma ordem). Por bloco: perto da câmera, o corpo
// e os cartões; longe, só o corpo simples (cachos maiores e com menos polígonos). Antes de o bloco trocar, os
// cartões já encolheram até sumir no shader (vento-arvores.js, entre lodPerto e lodLonge), e a troca não pula.
// Cor por cópia: cada árvore um pouco mais clara, escura, amarela ou azulada, pela posição (sem sorteio solto).

import * as THREE from 'three'
import { instanciarEmBlocos } from './blocos.js'
import { materiaisArvores } from './vento-arvores.js'
import { formaArvores } from './especies.js'

const grupos = []
const c = new THREE.Color()

// tinta da cópia pela posição: um hash fixo, a cidade sai igual
export function corDaCopia(x, z, variacao = 1) {
  const h = (k) => { const s = Math.sin(x * (12.9898 + k) + z * (78.233 - k)) * 43758.5453; return s - Math.floor(s) }
  const val = 1 + (h(0) - 0.5) * 0.16 * variacao
  const tom = (h(1) - 0.5) * 0.05 * variacao
  return c.setRGB(val * (1 + tom), val, val * (1 - tom * 1.4)).clone()
}

// as três malhas de uma espécie (pecas = { corpo, longe, cartoes }) nas mesmas matrizes
export function instanciarArvores(cena, pecas, matrizes, { nome = 'arvore', variacao = formaArvores().variacao, ...opcoes } = {}) {
  if (!matrizes.length) return null
  const { corpo, cartoes } = materiaisArvores()
  const p = new THREE.Vector3()
  const cores = matrizes.map((m) => { p.setFromMatrixPosition(m); return corDaCopia(p.x, p.z, variacao) })
  const { placa: _placa, ...op } = opcoes // o vento é código de vértice: fica nos blocos, não vai para a vg
  const perto = instanciarEmBlocos(cena, pecas.corpo, corpo, matrizes, cores, { ...op, nome })
  const longe = instanciarEmBlocos(cena, pecas.longe, corpo, matrizes, cores, { ...op, nome: nome + '-longe' })
  const cart = pecas.cartoes ? instanciarEmBlocos(cena, pecas.cartoes, cartoes, matrizes, cores, { ...op, nome: nome + '-folhas' }) : null
  registrarLod(perto, longe, pecas.cartoesSempre ? null : cart)
  return { perto, longe, cartoes: cart }
}

export function registrarLod(perto, longe, cartoes) {
  if (!Array.isArray(perto) || !Array.isArray(longe) || perto.length !== longe.length) return
  for (let i = 0; i < perto.length; i++) {
    const s = perto[i].boundingSphere || (perto[i].computeBoundingSphere(), perto[i].boundingSphere)
    grupos.push({ c: s.center.clone().applyMatrix4(perto[i].matrixWorld), r: s.radius, perto: perto[i], longe: longe[i], cart: cartoes ? cartoes[i] : null, estado: null })
    longe[i].visible = false
  }
}

// perto ou longe para um bloco a uma distância d (da câmera até a borda do bloco); folga para não piscar na divisa
export function nivelDoBloco(d, distancia, estadoAntes) {
  return estadoAntes === true ? d < distancia + 10 : d < distancia
}

export function atualizarLodArvores(camera, cfg) {
  const D = cfg.arvores.lodBloco
  const cp = camera.position
  for (const g of grupos) {
    const perto = nivelDoBloco(cp.distanceTo(g.c) - g.r, D, g.estado)
    if (perto === g.estado) continue
    g.estado = perto
    g.perto.visible = perto
    if (g.cart) g.cart.visible = perto
    g.longe.visible = !perto
  }
}

export function gruposLod() { return grupos }
