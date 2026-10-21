// Os terrenos dos marcos de 1932 do norte do centro: onde cada um fica no mundo e o retângulo
// (na malha de Herbster) que o casario não pode ocupar. É o único lugar com estes números: o
// marco (se1932.js, estacao.js, passeio1932.js) lê a posição daqui e o casario (cidade.js)
// pula a casa cujo corpo cai dentro de um destes retângulos.
//
// Por que precisa: os marcos ficam no tamanho real e o mapa em volta é comprimido (~2,9 vezes
// no sentido norte-sul do centro). Um prédio de 130 m ocupa, no jogo, o lugar de mais de um
// quarteirão; sem a exclusão, as casas da planta de 1932 nasciam dentro dele.
//
// Cada pegada: x, z (origem local do marco), rot (rotation.y; o x local é o leste da malha) e o
// retângulo local [x0, x1] x [z0, z1] (z local cresce para o sul da malha). O "largo" opcional é só
// chão de cidade (terra batida em vez de capim: a Praça da Estação, a Praça da Sé), sem tirar casa.

import { ll } from './fortaleza1932.js'

// a malha de Herbster: as ruas do centro correm a 72,5 graus do leste
export const ROT_MALHA = (72.5 * Math.PI) / 180 - Math.PI / 2
const EX = [Math.cos(ROT_MALHA), -Math.sin(ROT_MALHA)] // leste da malha, no mundo
const EZ = [Math.sin(ROT_MALHA), Math.cos(ROT_MALHA)] // sul da malha, no mundo

// desloca um ponto do mundo ao longo da malha (metros de jogo)
function naMalha([x, z], leste, sul) {
  return [x + EX[0] * leste + EZ[0] * sul, z + EX[1] * leste + EZ[1] * sul]
}

// Estação Central: o prédio do OSM (-38,5299, -3,7217), 15 m para oeste (estacao.js explica)
const est = naMalha(ll(-38.5299, -3.7217), -15, 0)
// Sé: a origem é o meio da fachada. O centro do terreno da catedral de hoje (OSM -38,5243, -3,7248)
// fica no meio da nave da velha Sé, que tinha ~52 m: a fachada a 22 m dele, para o sul da malha
const se = naMalha(ll(-38.5243, -3.7248), 0, 22)

export const PEGADAS = {
  estacao: { x: est[0], z: est[1], rot: ROT_MALHA, x0: -68, x1: 68, z0: -44, z1: 40, largo: [-80, 80, 14, 95] },
  se: { x: se[0], z: se[1], rot: ROT_MALHA, x0: -16, x1: 22, z0: -56, z1: 44, largo: [-40, 45, -10, 60] }, // z1: a praça da frente
}

// o ponto (do mundo) em coordenada local de uma pegada
export function localDaPegada(p, x, z) {
  const dx = x - p.x
  const dz = z - p.z
  return [dx * EX[0] + dz * EX[1], dx * EZ[0] + dz * EZ[1]]
}

// a casa (centro x, z e meia diagonal r) encosta em algum marco? Devolve o nome do marco ou null
export function marcoSob(x, z, r = 0) {
  for (const [nome, p] of Object.entries(PEGADAS)) {
    const [lx, lz] = localDaPegada(p, x, z)
    if (lx > p.x0 - r && lx < p.x1 + r && lz > p.z0 - r && lz < p.z1 + r) return nome
  }
  return null
}

// o ponto está no largo (ou no terreno) de algum marco? (o chão ali é de cidade, não mato)
export function noLargo(x, z) {
  for (const p of Object.values(PEGADAS)) {
    const [lx, lz] = localDaPegada(p, x, z)
    if (lx > p.x0 && lx < p.x1 && lz > p.z0 && lz < p.z1) return true
    const l = p.largo
    if (l && lx > l[0] && lx < l[1] && lz > l[2] && lz < l[3]) return true
  }
  return false
}
