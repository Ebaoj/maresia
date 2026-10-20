// A compressão pchip do mapa é suave, mas será que é regular? Mede o passo do ll()
// ao longo de uma linha e mostra onde o mapa "crespou".

import { ll } from '../../src/mundo/fortaleza1932.js'

const LON = -38.5276
const LAT = -3.7275
const passo = 0.0004

console.log('--- ao longo da longitude (mesma latitude) ---')
let ant = ll(LON, LAT)
for (let i = 1; i <= 30; i++) {
  const p = ll(LON + i * passo, LAT)
  console.log(
    `${(i * passo).toFixed(4)}  x=${p[0].toFixed(2)}  dx=${(p[0] - ant[0]).toFixed(2)}  z=${p[1].toFixed(2)}  dz=${(p[1] - ant[1]).toFixed(2)}`
  )
  ant = p
}

console.log('--- ao longo da latitude (mesma longitude) ---')
ant = ll(LON, LAT)
for (let i = 1; i <= 30; i++) {
  const p = ll(LON, LAT + i * passo)
  console.log(
    `${(i * passo).toFixed(4)}  z=${p[1].toFixed(2)}  dz=${(p[1] - ant[1]).toFixed(2)}  x=${p[0].toFixed(2)}  dx=${(p[0] - ant[0]).toFixed(2)}`
  )
  ant = p
}
