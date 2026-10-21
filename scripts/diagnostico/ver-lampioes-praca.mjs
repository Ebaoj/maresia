// Diagnóstico da iluminação da Praça do Ferreira: os lampiões a gás no limite
// da praça, com espaçamento de verdade (30 m), longe do meio e longe dos
// canteiros.
//
//   npx vite-node scripts/diagnostico/ver-lampioes-praca.mjs

import { CENTRO, CONTORNO, RAIO_MAX, dentroDaPraca, raioEm } from '../../src/mundo/praca1932.js'

// o mesmo do src/mundo/praca.js
const PASSO_LAMPIAO = 10.4
const FOLGA_LAMPIAO = 0.9
// a praça tem 0,348 un por metro (medido no contorno: 134,4 un de perímetro para
// 387 m de perímetro real)
const UN_POR_M = 0.348

function pontoNoContorno(d) {
  let acc = 0
  for (let i = 0; i < CONTORNO.length; i++) {
    const a = CONTORNO[i]
    const b = CONTORNO[(i + 1) % CONTORNO.length]
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (acc + seg >= d) {
      const t = seg > 0 ? (d - acc) / seg : 0
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    acc += seg
  }
  return null
}

let perimetro = 0
for (let i = 0; i < CONTORNO.length; i++) {
  const a = CONTORNO[i]
  const b = CONTORNO[(i + 1) % CONTORNO.length]
  perimetro += Math.hypot(b[0] - a[0], b[1] - a[1])
}

const lampioes = []
for (let d = PASSO_LAMPIAO / 2; d < perimetro; d += PASSO_LAMPIAO) {
  const p = pontoNoContorno(d)
  if (!p) break
  const dx = CENTRO[0] - p[0]
  const dz = CENTRO[1] - p[1]
  const r = Math.hypot(dx, dz) || 1
  const x = p[0] + (dx / r) * FOLGA_LAMPIAO
  const z = p[1] + (dz / r) * FOLGA_LAMPIAO
  lampioes.push({ x, z, d, raio: Math.hypot(x - CENTRO[0], z - CENTRO[1]), dentro: dentroDaPraca(x, z) })
}

const raiosBorda = CONTORNO.map((p) => Math.hypot(p[0] - CENTRO[0], p[1] - CENTRO[1]))
console.log(`perímetro do contorno: ${perimetro.toFixed(1)} un (${(perimetro / UN_POR_M).toFixed(0)} m)`)
console.log(`raio da praça: ${Math.min(...raiosBorda).toFixed(1)} a ${Math.max(...raiosBorda).toFixed(1)} un`)
console.log(`lampiões: ${lampioes.length} (passo de ${PASSO_LAMPIAO} un)`)

// o espaçamento, de em em: em unidades de jogo e em metros de verdade
const dins = []
for (let i = 0; i < lampioes.length; i++) {
  const a = lampioes[i]
  const b = lampioes[(i + 1) % lampioes.length]
  dins.push(Math.hypot(a.x - b.x, a.z - b.z))
}
dins.sort((a, b) => a - b)
const p50 = dins[Math.floor(dins.length / 2)]
console.log(`espaçamento: min ${dins[0].toFixed(1)}  p50 ${p50.toFixed(1)}  max ${dins[dins.length - 1].toFixed(1)} un`)
console.log(`             min ${(dins[0] / UN_POR_M).toFixed(0)}  p50 ${(p50 / UN_POR_M).toFixed(0)}  max ${(dins[dins.length - 1] / UN_POR_M).toFixed(0)} m`)

// nenhum lampião no meio da praça, nenhum fora dela
const raios = lampioes.map((l) => l.raio)
console.log(`raio do lampião: min ${Math.min(...raios).toFixed(1)}  max ${Math.max(...raios).toFixed(1)} un`)
console.log(`fora da praça: ${lampioes.filter((l) => !l.dentro).length}`)

// a distância até a borda: o lampião fica na calçada, um pouco para dentro
const bordas = lampioes.map((l) => {
  const ang = Math.atan2(l.z - CENTRO[1], l.x - CENTRO[0])
  return raioEm(ang) - l.raio
})
console.log(`distância até a borda: min ${Math.min(...bordas).toFixed(2)}  max ${Math.max(...bordas).toFixed(2)} un`)
