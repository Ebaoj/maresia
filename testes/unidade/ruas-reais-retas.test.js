import { describe, it, expect } from 'vitest'
import { ll } from '../../src/mundo/fortaleza1932.js'
import lotes from '../../src/mundo/mapa1932-lotes.json'

// As ruas de verdade do Centro de 1932 continuam retas no jogo.
//
// Pega: o quadro da grade de 06f9525 tinha o eixo espelhado. Ele endireitava as
// retas de azimute 72,5 graus (para lés-nordeste), mas as testadas da planta
// oficial correm a 107,5 graus (lés-sudeste) e a 17,5 graus (nor-nordeste): num
// raio de 600 m da Praça do Ferreira são 12,6 km de testada a 107,5 graus, 3,0 km
// a 17,5 e só uns 0,5 km perto de 72,5. As ruas de verdade continuavam a entortar:
// a reta da testada passando pela praça tinha 26 un de barriga em 1,8 km, e a de
// 300 m ao norte, 163 un. Correção: o eixo do quadro em src/mundo/quadroGrade1932.js
// (commit "Quadro da grade: o eixo das ruas de verdade").
//
// O teste mede no dado oficial, não na grade do código: o azimute de cada família
// de ruas sai do histograma das testadas, ponderado pelo comprimento.

const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180)
const M_LAT = 110574
const PRACA = [-38.5275014, -3.7274448]

// as testadas do Centro: [azimute em graus (0 a 180), comprimento em m, lon, lat do meio]
const testadas = lotes.fachadas.map((f) => {
  const de = (f[3] - f[1]) * M_LON
  const dn = (f[4] - f[2]) * M_LAT
  const az = (((Math.atan2(de, dn) * 180) / Math.PI) + 360) % 180
  const lon = (f[1] + f[3]) / 2
  const lat = (f[2] + f[4]) / 2
  const dist = Math.hypot((lon - PRACA[0]) * M_LON, (lat - PRACA[1]) * M_LAT)
  return { az, comp: Math.hypot(de, dn), lon, lat, dist }
}).filter((t) => t.dist < 600 && t.comp > 3)

// o azimute médio de uma família (as testadas a menos de 6 graus do palpite), ponderado
function azimuteDaFamilia(palpite) {
  let s = 0
  let c = 0
  for (const t of testadas) {
    const d = ((t.az - palpite + 270) % 180) - 90
    if (Math.abs(d) > 6) continue
    s += d * t.comp
    c += t.comp
  }
  return { az: palpite + s / c, comp: c }
}

function barriga(pontos) {
  const a = pontos[0]
  const b = pontos[pontos.length - 1]
  const len = Math.hypot(b[0] - a[0], b[1] - a[1])
  let max = 0
  for (const p of pontos) max = Math.max(max, Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / len)
  return max
}

// a reta de verdade, de azimute az, passando por (lon, lat), levada para o jogo
function reta(lon, lat, az, comprimento, passo = 25) {
  const e = Math.sin((az * Math.PI) / 180)
  const n = Math.cos((az * Math.PI) / 180)
  const pontos = []
  for (let s = -comprimento / 2; s <= comprimento / 2; s += passo) {
    pontos.push(ll(lon + (s * e) / M_LON, lat + (s * n) / M_LAT))
  }
  return pontos
}

describe('as ruas de verdade do Centro de 1932 no jogo', () => {
  const ese = azimuteDaFamilia(107.5)
  const nne = azimuteDaFamilia(17.5)

  it('a planta tem as duas famílias de rua de Herbster (e quase nada a 72,5 graus)', () => {
    expect(ese.comp).toBeGreaterThan(10000)
    expect(nne.comp).toBeGreaterThan(2500)
    expect(azimuteDaFamilia(72.5).comp).toBeLessThan(1500)
    // perpendiculares entre si, como a grade
    expect(Math.abs(ese.az - nne.az - 90)).toBeLessThan(2)
  })

  it('a testada de verdade não entorta: a reta da rua, passando por cada testada longa, continua reta', () => {
    // a média ponderada pelo comprimento da barriga das retas de 800 m pelas testadas longas
    for (const fam of [ese, nne]) {
      let soma = 0
      let peso = 0
      let pior = 0
      for (const t of testadas) {
        if (t.comp < 20) continue
        const d = ((t.az - fam.az + 270) % 180) - 90
        if (Math.abs(d) > 4) continue
        const b = barriga(reta(t.lon, t.lat, fam.az, 800))
        soma += b * t.comp
        peso += t.comp
        pior = Math.max(pior, b)
      }
      expect(peso).toBeGreaterThan(1000)
      expect(soma / peso, `barriga média, azimute ${fam.az.toFixed(1)}`).toBeLessThan(1)
      expect(pior, `pior barriga, azimute ${fam.az.toFixed(1)}`).toBeLessThan(2)
    }
  })

  it('a rua que passa pela praça e a de 300 m ao norte ficam retas por 1,8 km', () => {
    for (const fam of [ese, nne]) {
      for (const norte of [0, 300]) {
        const b = barriga(reta(PRACA[0], PRACA[1] + norte / M_LAT, fam.az, 1800, 50))
        expect(b, `azimute ${fam.az.toFixed(1)}, ${norte} m ao norte`).toBeLessThan(2)
      }
    }
  })
})
