// Fatia vertical (16/10/2026): 100 m da Praia do Peixe levados ao nível de acabamento que o jogo
// inteiro deve ter (referência: Messenger, da Abeto). Enquanto ela é trabalhada, o jogador fica preso
// aqui dentro (cfg.fatia.travar), da água até o fim do primeiro grupo de casas de palha.

import { linhaCosta, larguraPraia } from './mapa.js'
import { ll, latCostaReal } from './fortaleza1932.js'

// O lugar real da fatia, em lon/lat (o ponto da costa que x = 340 mostrava até 6b0e58b). Preso a lon/lat,
// e não a um x do jogo, porque a escala do mapa muda (a Praça do Ferreira 1:1 empurrou tudo a leste
// dela ~350 un, e a fatia tinha ficado num trecho de praia sem nada: testes/unidade/fatia.test.js).
// A latitude é a da costa de verdade nessa longitude (21/10/2026): o ponto antigo (-3,717700) ficava
// ~2 m ao norte da polilinha oficial, e o quanto essa folga aparecia no jogo dependia de como o mapa
// gira (3,5 m com o eixo espelhado, 7,7 m com o eixo das ruas de verdade). Na costa, ela some.
export const FATIA_LON = -38.51940234507335
export const FATIA_LAT = latCostaReal(FATIA_LON)
const CX = ll(FATIA_LON, FATIA_LAT)[0]
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
