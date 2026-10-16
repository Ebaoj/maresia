// Grade de ocupação: evita que dois prédios (ou coqueiro e prédio) nasçam no mesmo lugar.

import { LIMITES } from './mapa.js'

const CEL = 2
const { x0, x1, z0, z1 } = LIMITES
const NXO = Math.ceil((x1 - x0) / CEL)
const NZO = Math.ceil((z1 - z0) / CEL)
const grade = new Uint8Array(NXO * NZO)

function paraCelulas(cx, cz, hx, hz, rot, fn) {
  const r = Math.hypot(hx, hz)
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const i0 = Math.max(0, Math.floor((cx - r - x0) / CEL))
  const i1 = Math.min(NXO - 1, Math.floor((cx + r - x0) / CEL))
  const j0 = Math.max(0, Math.floor((cz - r - z0) / CEL))
  const j1 = Math.min(NZO - 1, Math.floor((cz + r - z0) / CEL))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const dx = x0 + (i + 0.5) * CEL - cx
      const dz = z0 + (j + 0.5) * CEL - cz
      const lx = dx * c - dz * s
      const lz = dx * s + dz * c
      if (Math.abs(lx) <= hx && Math.abs(lz) <= hz) {
        if (fn(j * NXO + i) === false) return
      }
    }
  }
}

export const ocupacao = {
  livre(cx, cz, hx, hz, rot = 0) {
    let ok = true
    paraCelulas(cx, cz, hx, hz, rot, (k) => {
      if (grade[k]) { ok = false; return false }
    })
    return ok
  },
  marcar(cx, cz, hx, hz, rot = 0) {
    paraCelulas(cx, cz, hx, hz, rot, (k) => { grade[k] = 1 })
  },
}
