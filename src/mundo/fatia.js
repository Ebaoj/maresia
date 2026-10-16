// Fatia vertical (16/10/2026): 100 m da Praia do Peixe levados ao nível de acabamento que o jogo
// inteiro deve ter (referência: Messenger, da Abeto). Enquanto ela é trabalhada, o jogador fica preso
// aqui dentro (cfg.fatia.travar), da água até o fim do primeiro grupo de casas de palha.

import { linhaCosta, larguraPraia } from './mapa.js'

const CX = 340
const LARGURA = 100
const zCosta = linhaCosta(CX)
export const FATIA = {
  x0: CX - LARGURA / 2,
  x1: CX + LARGURA / 2,
  z0: zCosta - 22, // um pouco de mar, onde dá pé e onde as jangadas chegam
  z1: zCosta + larguraPraia(CX) + 50,
  centro: [CX, zCosta + larguraPraia(CX) * 0.5],
}

export const dentroDaFatia = (x, z, margem = 0) =>
  x > FATIA.x0 - margem && x < FATIA.x1 + margem && z > FATIA.z0 - margem && z < FATIA.z1 + margem

// segura um ponto dentro da fatia (o jogador bate na borda como numa parede)
export function prenderNaFatia(p) {
  p.x = Math.min(FATIA.x1, Math.max(FATIA.x0, p.x))
  p.z = Math.min(FATIA.z1, Math.max(FATIA.z0, p.z))
  return p
}
