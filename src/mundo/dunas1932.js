// Onde a duna pode subir: longe das casas de 1932.
//
// As dunas a leste (Aldeota, Meireles, Mucuripe: mapa.js) são ruído de relevo, e o ruído não sabe onde há
// rua. Com o centro histórico em 1:1 (22/10/2026) as quadras de 1932 da Prainha e do Outeiro ficaram onde a
// rampa das dunas já subia, e as casas e o trilho do bonde iam parar em barranco de 20 m. Em 1932 a areia
// cercava o arruado, não passava por cima dele: a duna só sobe onde a planta oficial não tem lote.
//
// A conta: as frentes de lote de 1932 contadas numa grade de 30 un do jogo e borradas (caixa de 5 x 5
// células, ~150 un); semCasa() é 1 onde não há frente perto e cai a 0 onde há duas ou mais.

import lotes from './mapa1932-lotes.json'
import { ll, LIMITES } from './fortaleza1932.js'

const CEL = 30
const NX = Math.ceil((LIMITES.x1 - LIMITES.x0) / CEL) + 1
const NZ = Math.ceil((LIMITES.z1 - LIMITES.z0) / CEL) + 1
let GRADE = null

function montar() {
  const conta = new Float32Array(NX * NZ)
  for (const f of lotes.fachadas) {
    const [x, z] = ll((f[1] + f[3]) / 2, (f[2] + f[4]) / 2)
    const i = Math.floor((x - LIMITES.x0) / CEL)
    const j = Math.floor((z - LIMITES.z0) / CEL)
    if (i >= 0 && j >= 0 && i < NX && j < NZ) conta[j * NX + i] += 1
  }
  // caixa 5 x 5, separável
  const R = 2
  const tmp = new Float32Array(NX * NZ)
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      let s = 0
      for (let d = -R; d <= R; d++) { const ii = i + d; if (ii >= 0 && ii < NX) s += conta[j * NX + ii] }
      tmp[j * NX + i] = s
    }
  }
  const saida = new Float32Array(NX * NZ)
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      let s = 0
      for (let d = -R; d <= R; d++) { const jj = j + d; if (jj >= 0 && jj < NZ) s += tmp[jj * NX + i] }
      saida[j * NX + i] = s
    }
  }
  GRADE = saida
}

// 1 = nenhuma casa de 1932 por perto (a duna pode subir), 0 = arruado
export function semCasa(x, z) {
  if (!GRADE) montar()
  const fx = (x - LIMITES.x0) / CEL - 0.5
  const fz = (z - LIMITES.z0) / CEL - 0.5
  const i = Math.max(0, Math.min(NX - 2, Math.floor(fx)))
  const j = Math.max(0, Math.min(NZ - 2, Math.floor(fz)))
  const tx = Math.max(0, Math.min(1, fx - i))
  const tz = Math.max(0, Math.min(1, fz - j))
  const k = j * NX + i
  const c = (GRADE[k] * (1 - tx) + GRADE[k + 1] * tx) * (1 - tz) + (GRADE[k + NX] * (1 - tx) + GRADE[k + NX + 1] * tx) * tz
  const t = Math.min(1, c / 2)
  return 1 - t * t * (3 - 2 * t)
}
