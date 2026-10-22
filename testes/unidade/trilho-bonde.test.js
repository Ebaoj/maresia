// Bug (22/10/2026, branch bugs-22): no trilho do bonde em frente à Estação Central, as travessas ficavam 14 cm
// acima do calçamento (alturaTerreno + 0,02, com 12 cm de madeira) e o ramal da ponta da linha não tinha aço:
// a rota (bondes.js) chega ali indo e voltando em pontos de meio metro, cada travessa seguia um trechinho torto
// e o trilho virava pedacinhos soltos. Correção: commit "Trilho do bonde rente ao chão e com aço em todo ramal".
//
// Monta o trilho de verdade (as linhas de 1932 de bondes.js) sobre o relevo do jogo e confere o que o olho vê:
// a travessa rente à malha do chão desenhada e os dois trilhos de aço passando sobre cada travessa.

import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three'
import { calcularAlturas, alturas, NX, NZ } from '../../src/mundo/terreno.js'
import { LIMITES } from '../../src/mundo/mapa.js'
import { PEGADAS, localDaPegada } from '../../src/mundo/lotes-marcos.js'

// o letreiro das paradas é desenhado num <canvas>: no Node, um de mentira que aceita tudo
if (!globalThis.document) globalThis.document = {}
if (!globalThis.document.createElement) {
  const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true })
  globalThis.document.createElement = () => ({ getContext: () => ctx, width: 0, height: 0, style: {}, addEventListener() {} })
}

// a altura da malha do chão como terreno.js a desenha: dois triângulos por célula, diagonal de (i+1, j) a (i, j+1)
function chao(x, z) {
  const { x0, z0, passo } = LIMITES
  const fx = (x - x0) / passo
  const fz = (z - z0) / passo
  const i = Math.min(NX - 2, Math.floor(fx))
  const j = Math.min(NZ - 2, Math.floor(fz))
  const tx = fx - i
  const tz = fz - j
  const a = alturas[j * NX + i]
  const b = alturas[j * NX + i + 1]
  const c = alturas[(j + 1) * NX + i]
  const d = alturas[(j + 1) * NX + i + 1]
  if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz
  return d + (c - d) * (1 - tx) + (b - d) * (1 - tz)
}

const BITOLA = 0.7
const ALTURA_TRAVESSA = 0.12
const travessas = [] // [x, z, topo, direção da madeira (x, z)]
const acos = [] // trechos do topo do aço: [ax, az, ay, bx, bz, by]

beforeAll(async () => {
  calcularAlturas()
  const { criarBondes } = await import('../../src/mundo/bondes-malha.js')
  const cena = new THREE.Scene()
  criarBondes(cena)
  const m = new THREE.Matrix4()
  const p = new THREE.Vector3()
  const eixo = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  cena.traverse((o) => {
    if (o.isInstancedMesh && o.name.startsWith('travessas-bonde')) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m)
        m.decompose(p, q, s)
        eixo.set(1, 0, 0).applyQuaternion(q) // a madeira atravessa a via no x local
        travessas.push([p.x, p.z, p.y + ALTURA_TRAVESSA, eixo.x, eixo.z])
      }
    }
    if (o.isMesh && !o.isInstancedMesh && o.name === 'trilhos-bonde') {
      // o topo de cada trecho é o quad cujas pontas 0 e 3 têm a mesma altura e estão a 7 cm uma da outra
      const P = o.geometry.attributes.position
      for (let k = 0; k + 3 < P.count; k += 4) {
        const y0 = P.getY(k)
        const y3 = P.getY(k + 3)
        const larg = Math.hypot(P.getX(k) - P.getX(k + 3), P.getZ(k) - P.getZ(k + 3))
        if (Math.abs(y0 - y3) > 1e-5 || Math.abs(larg - 0.07) > 0.005) continue
        acos.push([(P.getX(k) + P.getX(k + 3)) / 2, (P.getZ(k) + P.getZ(k + 3)) / 2, y0,
          (P.getX(k + 1) + P.getX(k + 2)) / 2, (P.getZ(k + 1) + P.getZ(k + 2)) / 2, P.getY(k + 1)])
      }
    }
  })
})

// o aço mais perto do ponto (x, z): distância na horizontal e a altura do aço ali
function acoPerto(grade, x, z) {
  let melhor = { d: Infinity, y: -Infinity }
  const ci = Math.floor(x / 4)
  const cj = Math.floor(z / 4)
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (const [ax, az, ay, bx, bz, by] of grade.get(`${ci + di},${cj + dj}`) || []) {
        const vx = bx - ax
        const vz = bz - az
        const L2 = vx * vx + vz * vz || 1e-9
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2))
        const d = Math.hypot(ax + vx * t - x, az + vz * t - z)
        if (d < melhor.d) melhor = { d, y: ay + (by - ay) * t }
      }
    }
  }
  return melhor
}

describe('trilho do bonde (bondes-malha.js)', () => {
  it('há trilho e travessa', () => {
    expect(travessas.length).toBeGreaterThan(1000)
    expect(acos.length).toBeGreaterThan(1000)
  })

  it('o trilho em frente à Estação continua inteiro: a limpeza da rota não come o ramal da fachada', () => {
    // a linha corre ao longo da fachada leste, de x = 44 a 85 (local da Estação), a z = 13 a 16.
    // Desde 22/10/2026 (o centro histórico inteiro em 1:1, decisão do Joabe) a rua da frente fica onde a planta
    // a põe, em metros: a linha corre a z = 26 a 44 (antes 13 a 16 un do mundo comprimido) e chega de leste até
    // x = 95. A janela mudou com a escala; a afirmação (o trilho do ramal é inteiro, sem buraco) é a mesma.
    const P = PEGADAS.estacao
    const xs = new Set()
    for (const [ax, az, , bx, bz] of acos) {
      const passos = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25))
      for (let i = 0; i <= passos; i++) {
        const t = i / passos
        const [lx, lz] = localDaPegada(P, ax + (bx - ax) * t, az + (bz - az) * t)
        if (lz > 26 && lz < 44 && lx > 80 && lx < 190) xs.add(Math.round(lx))
      }
    }
    for (let x = 95; x <= 175; x++) expect(xs.has(x), `aço em x = ${x}`).toBe(true)
  })

  it('a travessa fica rente ao calçamento: o topo a no máximo 3 cm da malha do chão, nunca acima', () => {
    let pior = 0
    for (const [x, z, topo] of travessas) {
      const acima = topo - chao(x, z)
      pior = Math.max(pior, Math.abs(acima - 0.015))
    }
    expect(pior).toBeLessThan(0.015)
  })

  it('o aço passa sobre os dois apoios de cada travessa, e acima do chão (no ramal da Estação também)', () => {
    const grade = new Map()
    for (const a of acos) {
      for (const [x, z] of [[a[0], a[1]], [a[3], a[4]]]) {
        const k = `${Math.floor(x / 4)},${Math.floor(z / 4)}`
        if (!grade.has(k)) grade.set(k, [])
        if (!grade.get(k).includes(a)) grade.get(k).push(a)
      }
    }
    const P = PEGADAS.estacao
    let semAco = 0
    let semAcoEstacao = 0
    let enterrado = 0
    for (const [x, z, , ex, ez] of travessas) {
      for (const lado of [-1, 1]) {
        const sx = x + (ex * BITOLA * lado) / 2
        const sz = z + (ez * BITOLA * lado) / 2
        const a = acoPerto(grade, sx, sz)
        if (a.d > 0.06) {
          semAco++
          const [lx, lz] = localDaPegada(P, x, z)
          if (Math.abs(lx) < 150 && lz > -60 && lz < 160) semAcoEstacao++
        } else if (a.y - chao(sx, sz) < 0.03) enterrado++
      }
    }
    expect(semAcoEstacao).toBe(0)
    expect(semAco).toBe(0)
    expect(enterrado).toBe(0)
  })
})
