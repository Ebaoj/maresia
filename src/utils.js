// Números aleatórios com semente: a cidade sai igual toda vez que abre.
export function criarAleatorio(semente = 1) {
  let a = semente >>> 0
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    proximo,
    entre: (min, max) => min + (max - min) * proximo(),
    escolha: (lista) => lista[Math.floor(proximo() * lista.length)],
    chance: (p) => proximo() < p,
  }
}

export const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

// Interpola ângulos pelo caminho mais curto.
export function lerpAngulo(a, b, t) {
  let d = b - a
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}
