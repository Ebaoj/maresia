// O muro dos bairros de 1932: entre uma casa e outra, o lote era fechado por
// um muro caiado, com um portão de madeira. No Centro a testada e de casa
// geminada; nos bairros, e de muro (item 2 do bloco "a cidade parece um
// deserto de areia").
//
// A pecas: o muro e uma caixa unitaria esticada pela matriz da copia (o
// comprimento varia de trecho para trecho), o copeiro de pedra e uma caixa em
// cima, e o portao e uma geometria fixa (batentes, tabuas e escora).
//
// As cores sao da paleta (src/paleta.js): o cal do muro, a pedra do copeiro e
// a madeira do portao.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toon } from '../materiais.js'
import { instanciarEmBlocos } from './blocos.js'
import { CAL } from '../paleta.js'

export const ALTURA_MURO = 1.8
export const ESPESSURA_MURO = 0.22
export const PORTAO_LARG = 1.15
export const PORTAO_ALT = 1.65

// a caixa do muro: origem no meio do pe, para a copia esticar so no comprimento
function caixaUnitaria() {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
}

// o portao: dois batentes, um travessao, as tabuas e a escora
function geometriaPortao() {
  const partes = []
  const batente = (x) => {
    const g = new THREE.BoxGeometry(0.09, PORTAO_ALT, 0.1)
    g.translate(x, PORTAO_ALT / 2, 0)
    return g
  }
  partes.push(batente(-PORTAO_LARG / 2 + 0.045), batente(PORTAO_LARG / 2 - 0.045))
  const travessao = new THREE.BoxGeometry(PORTAO_LARG, 0.1, 0.12)
  travessao.translate(0, PORTAO_ALT - 0.05, 0)
  partes.push(travessao)
  // as tabuas do portao, com fresta entre elas
  const n = 5
  const largura = (PORTAO_LARG - 0.18) / n
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(largura - 0.02, PORTAO_ALT - 0.22, 0.05)
    g.translate(-PORTAO_LARG / 2 + 0.09 + largura * (i + 0.5), (PORTAO_ALT - 0.22) / 2, 0)
    partes.push(g)
  }
  // a escora em diagonal
  const escora = new THREE.BoxGeometry(PORTAO_LARG * 0.86, 0.06, 0.04)
  escora.rotateZ(0.62)
  escora.translate(0, PORTAO_ALT * 0.45, 0.03)
  partes.push(escora)
  return mergeGeometries(partes)
}

// Monta os muros e os portoes. Cada muro e um trecho de testada: { x, z, comprimento, rot }
// (o rot e o angulo da linha da testada, como o das casas).
export function criarMuros1932(cena, muros) {
  if (!muros.length) return { muros: [], portoes: [] }
  const matMuro = toon('#ffffff')
  const matCopeiro = toon('#a89e8c')
  const matPortao = toon(CAL.mangue)

  const eixo = new THREE.Vector3(0, 1, 0)
  const matrizes = []
  const cores = []
  const matrizesCopeiro = []
  const matrizesPortao = []

  for (const m of muros) {
    const q = new THREE.Quaternion().setFromAxisAngle(eixo, m.rot)
    const comp = Math.max(0.6, m.comprimento)
    // o muro entra 0,5 m no chão (a ladeira): a base nunca fica no ar
    const matriz = new THREE.Matrix4().compose(
      new THREE.Vector3(m.x, m.y - 0.5, m.z),
      q,
      new THREE.Vector3(comp, ALTURA_MURO + 0.5, ESPESSURA_MURO)
    )
    matrizes.push(matriz)
    cores.push(m.cor)
    // o copeiro de pedra, em cima do muro
    matrizesCopeiro.push(new THREE.Matrix4().compose(
      new THREE.Vector3(m.x, m.y + ALTURA_MURO, m.z),
      q,
      new THREE.Vector3(comp, 0.13, ESPESSURA_MURO + 0.12)
    ))
    // o portao: no meio do muro (o lugar sai do sorteio, que tem semente)
    if (m.portao) {
      const t = m.portao
      const px = m.x + Math.cos(m.rot) * (t * comp - comp / 2)
      const pz = m.z - Math.sin(m.rot) * (t * comp - comp / 2)
      matrizesPortao.push(new THREE.Matrix4().compose(
        new THREE.Vector3(px, m.y, pz),
        q,
        new THREE.Vector3(1, 1, 1)
      ))
    }
  }

  const malhasMuro = instanciarEmBlocos(cena, caixaUnitaria(), matMuro, matrizes, cores, { nome: 'muros-1932' })
  const malhasCopeiro = instanciarEmBlocos(cena, caixaUnitaria(), matCopeiro, matrizesCopeiro, null, { nome: 'copeiro-1932' })
  const malhasPortao = instanciarEmBlocos(cena, geometriaPortao(), matPortao, matrizesPortao, null, { nome: 'portoes-1932' })
  return { muros: malhasMuro, portoes: malhasPortao }
}
