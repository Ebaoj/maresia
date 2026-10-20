// A Praça do Ferreira em 1932: os dados que o motor usa.
//
// A forma da praça vem do raster oficial (src/mundo/mapa1932-malha.png, feito da
// camada "Evolucao Urbana 1932" da Prefeitura): a praça é a única mancha grande de
// espaço público no meio do tecido construído. O contorno foi tirado com
// docs/mapa-1932-praca.py e está em src/mundo/praca1932.json (lon/lat, como o resto
// dos dados do mapa).
//
// O que havia nela em 1932 está em docs/mapa-1932.md, com a marca de confiança:
//   D  documentado  - mosaico no chão e jardins (reforma de 1920, prefeito Godofredo
//                     Maciel); coreto coberto no centro (palanque de 1923); postes de
//                     luz da Light no contorno.
//   H  hipótese     - quantos jardins, onde eles ficam, o desenho do coreto.
// Não entram (anacronismo): a Coluna da Hora (o relógio é de 1933) e os quiosques
// de café dos quatro cantos (foram retirados na mesma reforma de 1920).

import dados from './praca1932.json'
import { ll } from './fortaleza1932.js'

// o centro da praça, em coordenada de jogo
export const CENTRO = ll(...dados.centro)

// o contorno, em coordenada de jogo (o raio de cada ponto, do centro)
export const CONTORNO = dados.contorno.map(([lon, lat]) => ll(lon, lat))
export const RAIO = CONTORNO.map(([x, z]) => Math.hypot(x - CENTRO[0], z - CENTRO[1]))

// o raio maior: até onde a praça chega em cada direção
export const RAIO_MAX = Math.max(...RAIO)

// o raio da praça numa direção qualquer (interpolação entre os vizinhos do contorno)
export function raioEm(ang) {
  const n = RAIO.length
  let a = ang
  while (a < 0) a += Math.PI * 2
  while (a >= Math.PI * 2) a -= Math.PI * 2
  const pos = (a / (Math.PI * 2)) * n
  const i = Math.floor(pos)
  const t = pos - i
  return RAIO[i % n] * (1 - t) + RAIO[(i + 1) % n] * t
}

// o ponto está dentro da praça?
export function dentroDaPraca(x, z) {
  const dx = x - CENTRO[0]
  const dz = z - CENTRO[1]
  const dist = Math.hypot(dx, dz)
  if (dist > RAIO_MAX) return false
  return dist <= raioEm(Math.atan2(dz, dx))
}

// quanto falta para a borda da praça (negativo = dentro)
export function distanciaDaBorda(x, z) {
  const dx = x - CENTRO[0]
  const dz = z - CENTRO[1]
  const dist = Math.hypot(dx, dz)
  return raioEm(Math.atan2(dz, dx)) - dist
}

// o ponto do contorno na direção `ang`, na borda de fora (a calçada): serve para
// Posting os postes da Light em volta da praça
export function bordaEm(ang, folga = 0) {
  const r = raioEm(ang) + folga
  return [CENTRO[0] + Math.cos(ang) * r, CENTRO[1] + Math.sin(ang) * r]
}
