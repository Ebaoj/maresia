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
import { LongeMascarado } from './muito-longe.js'

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
// ate: função que devolve a distância (m) além da qual o bloco inteiro sai do desenho e da sombra (as árvores dos
// quintais somem atrás dos telhados, cfg.casario.quintal.ate); sem ela, de longe fica a copa simples
export function instanciarArvores(cena, pecas, matrizes, { nome = 'arvore', variacao = formaArvores().variacao, ate = null, ...opcoes } = {}) {
  if (!matrizes.length) return null
  const { corpo, cartoes } = materiaisArvores()
  const p = new THREE.Vector3()
  const cores = matrizes.map((m) => { p.setFromMatrixPosition(m); return corDaCopia(p.x, p.z, variacao) })
  const { placa: _placa, ...op } = opcoes // o vento é código de vértice: fica nos blocos, não vai para a vg
  op.semJuntarLonge = true // o LOD daqui tem a versão de longe mascarada (montarMascara)
  const perto = instanciarEmBlocos(cena, pecas.corpo, corpo, matrizes, cores, { ...op, nome })
  const longe = instanciarEmBlocos(cena, pecas.longe, corpo, matrizes, cores, { ...op, nome: nome + '-longe' })
  const cart = pecas.cartoes ? instanciarEmBlocos(cena, pecas.cartoes, cartoes, matrizes, cores, { ...op, nome: nome + '-folhas' }) : null
  // peças que a espécie não pode perder de longe (os leques da carnaúba), na versão simples
  const cartLonge = pecas.cartoesLonge ? instanciarEmBlocos(cena, pecas.cartoesLonge, cartoes, matrizes, cores, { ...op, nome: nome + '-folhas-longe' }) : null
  registrarLod(perto, longe, cart, cartLonge, ate)
  return { perto, longe, cartoes: cart, cartoesLonge: cartLonge }
}

export function registrarLod(perto, longe, cartoes, cartoesLonge = null, ate = null) {
  if (!Array.isArray(perto) || !Array.isArray(longe) || perto.length !== longe.length) return
  for (let i = 0; i < perto.length; i++) {
    const s = perto[i].boundingSphere || (perto[i].computeBoundingSphere(), perto[i].boundingSphere)
    const g = { c: s.center.clone().applyMatrix4(perto[i].matrixWorld), r: s.radius, perto: perto[i], longe: longe[i], cart: cartoes ? cartoes[i] : null, cartLonge: cartoesLonge ? cartoesLonge[i] : null, ate, estado: null }
    prepararCopias(g)
    grupos.push(g)
    longe[i].visible = false
    if (cartoesLonge) cartoesLonge[i].visible = false
  }
}

// Cópia a cópia no bloco de perto (27/10/2026, perf-governador). O bloco de árvores tem de 192 a 768 m (blocos.js
// junta os ralos), e bastava a borda dele chegar a lodBloco para TODAS as cópias dele virarem o corpo cheio (2 a 4 mil
// triângulos cada, mais os cartões): na Praça do Ferreira eram ~600 mil triângulos de cajueiro de quintal e oiti, e
// outro tanto no mapa de sombra de perto. Agora, no bloco de perto, cada cópia escolhe pela distância dela: até
// lodBloco o corpo e os cartões; além, a copa simples do próprio bloco (a mesma que o bloco inteiro mostraria longe).
// Mesma troca, na mesma distância, só que por árvore. Os cartões já sumiam no shader antes de lodLonge (< lodBloco).
// A contagem dessas malhas muda com a câmera: elas não entram na assinatura do mapa de sombra em cache
// (semAssinatura): a sombra das cópias está no mapa com uma versão ou a outra, nunca falta.
export const LOD_COPIA_ARVORES = { ligado: true, folga: 8 }
const _p = new THREE.Vector3()
function prepararCopias(g) {
  const malhas = [g.perto, g.longe, g.cart, g.cartLonge].filter(Boolean)
  const n = g.perto.count
  if (malhas.some((m) => m.count !== n)) return
  g.n = n
  g.xyz = new Float32Array(n * 3)
  const a = g.perto.instanceMatrix.array
  g.perto.updateWorldMatrix(true, false)
  for (let i = 0; i < n; i++) {
    _p.set(a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]).applyMatrix4(g.perto.matrixWorld)
    g.xyz[i * 3] = _p.x; g.xyz[i * 3 + 1] = _p.y; g.xyz[i * 3 + 2] = _p.z
  }
  const geo = g.perto.geometry
  if (!geo.boundingSphere) geo.computeBoundingSphere()
  const esc = Math.max(Math.hypot(a[0], a[1], a[2]), Math.hypot(a[4], a[5], a[6]), Math.hypot(a[8], a[9], a[10]))
  g.rCopia = geo.boundingSphere.radius * esc
  for (const m of malhas) {
    m.userData.copiasOrig = { mat: m.instanceMatrix.array.slice(), cor: m.instanceColor ? m.instanceColor.array.slice() : null }
    m.userData.semAssinatura = true
    m.userData.contagemViva = true
  }
  g.porCopia = false
  g.camCopia = null
}

function escreverCopias(m, lista, k) {
  if (!m) return
  const o = m.userData.copiasOrig
  const am = m.instanceMatrix.array, ac = m.instanceColor?.array
  for (let j = 0; j < k; j++) {
    const i = lista[j]
    am.set(o.mat.subarray(i * 16, i * 16 + 16), j * 16)
    if (ac && o.cor) ac.set(o.cor.subarray(i * 3, i * 3 + 3), j * 3)
  }
  m.count = k
  if (!k) return
  m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, k * 16); m.instanceMatrix.needsUpdate = true
  if (ac) { m.instanceColor.clearUpdateRanges(); m.instanceColor.addUpdateRange(0, k * 3); m.instanceColor.needsUpdate = true }
}

const _perto = [], _longe = []
function repartirCopias(g, cp, D) {
  _perto.length = 0; _longe.length = 0
  const x = g.xyz
  for (let i = 0; i < g.n; i++) {
    const d = Math.hypot(x[i * 3] - cp.x, x[i * 3 + 1] - cp.y, x[i * 3 + 2] - cp.z) - g.rCopia
    const antes = g.ladoCopia ? g.ladoCopia[i] : 1
    const perto = antes ? d < D + LOD_COPIA_ARVORES.folga : d < D
    ;(perto ? _perto : _longe).push(i)
  }
  ;(g.ladoCopia ||= new Uint8Array(g.n)).fill(0)
  for (const i of _perto) g.ladoCopia[i] = 1
  escreverCopias(g.perto, _perto, _perto.length)
  escreverCopias(g.cart, _perto, _perto.length)
  escreverCopias(g.longe, _longe, _longe.length)
  escreverCopias(g.cartLonge, _longe, _longe.length)
  g.longe.visible = _longe.length > 0
  if (g.cartLonge) g.cartLonge.visible = _longe.length > 0
  g.perto.visible = _perto.length > 0
  if (g.cart) g.cart.visible = _perto.length > 0
  g.porCopia = true
}

// o bloco saiu de perto: as malhas voltam a ter todas as cópias, na ordem de sempre
function restaurarCopias(g) {
  if (!g.porCopia) return
  g.porCopia = false
  g.camCopia = null
  g.ladoCopia = null
  const todas = Array.from({ length: g.n }, (_, i) => i)
  for (const m of [g.perto, g.cart, g.longe, g.cartLonge]) escreverCopias(m, todas, g.n)
}

// perto ou longe para um bloco a uma distância d (da câmera até a borda do bloco); folga para não piscar na divisa
export function nivelDoBloco(d, distancia, estadoAntes) {
  return estadoAntes === true ? d < distancia + 10 : d < distancia
}

// 'perto', 'longe' ou 'fora' (além de "ate", se houver), com a mesma folga de 10 m nas duas divisas
export function estadoDoBloco(d, distancia, ate, antes) {
  if (ate !== null && ate !== undefined && (antes === 'fora' ? d > ate - 10 : d > ate)) return 'fora'
  return nivelDoBloco(d, distancia, antes === 'perto') ? 'perto' : 'longe'
}

// A copa simples de cada forma de cada espécie é UMA malha para o mapa todo (muito-longe.js, LongeMascarado): o bloco
// que não está longe tem as cópias dele zeradas nela. As espécies são espalhadas e têm 3 ou 4 formas; mesmo com a
// junção de blocos sobrava um objeto de longe por bloco e por forma (~260 por quadro na Coluna da Hora). Vale também
// para quem some por inteiro longe (ate, as árvores dos quintais): fora é só não mostrar a de longe.
let mascara = null
function montarMascara() {
  mascara = new LongeMascarado({ nome: 'arvores' })
  for (const g of grupos) {
    g.unidade = { longe: [g.longe, g.cartLonge].filter(Boolean) }
    mascara.adicionar(g.unidade)
  }
  mascara.montar()
}

export function atualizarLodArvores(camera, cfg) {
  const D = cfg.arvores.lodBloco
  const cp = camera.position
  // na primeira vez: todas as espécies já registraram os blocos
  if (!mascara && grupos.length) montarMascara()
  mascara?.atualizar(camera)
  for (const g of grupos) {
    const d = cp.distanceTo(g.c) - g.r
    const nivel = estadoDoBloco(d, D, g.ate ? g.ate() : null, g.estado)
    if (nivel !== g.estado) {
      g.estado = nivel
      if (nivel !== 'perto') restaurarCopias(g)
      g.perto.visible = nivel === 'perto'
      if (g.cart) g.cart.visible = nivel === 'perto'
      if (g.unidade) { mascara.mostrar(g.unidade, nivel === 'longe'); g.longe.visible = false; if (g.cartLonge) g.cartLonge.visible = false }
      else { g.longe.visible = nivel === 'longe'; if (g.cartLonge) g.cartLonge.visible = nivel === 'longe' } // registrado depois da máscara
    }
    // no bloco de perto, cópia a cópia (refaz quando a câmera anda 6 m)
    if (g.estado === 'perto' && g.xyz && LOD_COPIA_ARVORES.ligado && cfg.arvores.lodCopia !== false) {
      if (!g.camCopia || g.camCopia.distanceToSquared(cp) > 36 || g.dCopia !== D) {
        ;(g.camCopia ||= cp.clone()).copy(cp)
        g.dCopia = D
        repartirCopias(g, cp, D)
      }
    } else if (g.estado === 'perto' && g.porCopia) {
      restaurarCopias(g)
      g.perto.visible = true
      if (g.cart) g.cart.visible = true
      g.longe.visible = false
      if (g.cartLonge) g.cartLonge.visible = false
    }
  }
  mascara?.aplicar()
}

export function gruposLod() { return grupos }
export function mascaraArvores() { return mascara }
