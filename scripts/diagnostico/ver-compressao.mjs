// Deformação local do mapa: quanto a compressão pchip estica x e z em cada ponto.
// O lon/lat é real; o jogo é comprimido, e não sempre por igual nos dois eixos.
// Serve para saber o tamanho certo de uma peça na praça (o coreto tem de sair
// redondo no mundo, mesmo que no jogo ele seja oval).

import { ll } from '../../src/mundo/fortaleza1932.js'

const LON = -38.5276
const LAT = -3.7275
const passo = 0.0004 // ~40 m

for (const [nome, lon, lat] of [
  ['Praça do Ferreira', LON, LAT],
  ['Estação', -38.5302, -3.7219],
  ['Praia', -38.5235, -3.7155],
  ['Campo do Urubu', -38.57, -3.7176],
]) {
  const [x0, z0] = ll(lon, lat)
  const [x1, z1] = ll(lon + passo, lat)
  const [x2, z2] = ll(lon, lat + passo)
  const m_lon = 102.4e3 * passo // metros de longitude em 1 passo
  const m_lat = 110.6e3 * passo
  const ex = Math.abs(x1 - x0) / m_lon // unidades de jogo por metro real (eixo x)
  const ez = Math.abs(z2 - z0) / m_lat // unidades de jogo por metro real (eixo z)
  console.log(
    `${nome.padEnd(18)} 1 un = ${(1 / ex).toFixed(2)} m (x)  ${(1 / ez).toFixed(2)} m (z)` +
      `  deformacao z/x = ${(ez / ex).toFixed(2)}`
  )
}
