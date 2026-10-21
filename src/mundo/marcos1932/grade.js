// A grade de Herbster no centro de 1932: as ruas correm a 72,5 graus do leste (fortaleza1932.js). Os marcos
// se montam nesse referencial: u = rua leste-sudeste (Guilherme Rocha), v = rua sul-sudoeste (Major Facundo).
import { ANGULO_GRADE } from '../fortaleza1932.js'

// a rotação da grade (a mesma de cidade.js): rotation.y = ROT leva o x local para a rua da grade
export const ROT = -(Math.PI / 2 - ANGULO_GRADE)
export const EX = [Math.cos(ROT), -Math.sin(ROT)]
export const EZ = [Math.sin(ROT), Math.cos(ROT)]

// ponto (u, v) da grade a partir de uma origem de jogo
export function naGrade(origem, u, v) {
  return [origem[0] + u * EX[0] + v * EZ[0], origem[1] + u * EX[1] + v * EZ[1]]
}

// o contrário: (x, z) de jogo -> (u, v) a partir da origem
export function paraGrade(origem, x, z) {
  const dx = x - origem[0]
  const dz = z - origem[1]
  return [dx * EX[0] + dz * EX[1], dx * EZ[0] + dz * EZ[1]]
}
