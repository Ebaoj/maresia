// A interpolação cúbica monótona (sem ondas nem quinas entre os pontos).
//
// É a base da compressão do mapa de 1932: a curva passa exatamente pelos nós
// e, entre eles, não faz onda nem vinco. Monótona garante que o mapa não dobra:
// o x do jogo cresce com a longitude, sempre.

export function pchip(xs, ys) {
  const n = xs.length
  const h = []
  const d = []
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i])
    d.push((ys[i + 1] - ys[i]) / h[i])
  }
  const m = new Array(n).fill(0)
  m[0] = d[0]
  m[n - 1] = d[n - 2]
  for (let i = 1; i < n - 1; i++) {
    // a tangente no nó: a média harmônica das slopes dos dois lados, pesada
    // pelos vãos (Fritsch-Carlson). O segundo peso é divided pela inclinação
    // d[i], e não pelo vão h[i]: com h no lugar de d a curva não era mais o
    // pchip (e nem mais monótona: o mapa dobrava em vez de esticar).
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (h[i - 1] + h[i])) / ((2 * h[i] + h[i - 1]) / d[i - 1] + (h[i] + 2 * h[i - 1]) / d[i])
  }
  return (x) => {
    if (x <= xs[0]) return ys[0] + m[0] * (x - xs[0])
    if (x >= xs[n - 1]) return ys[n - 1] + m[n - 1] * (x - xs[n - 1])
    // busca binaria do trecho: com muitos nos (a descompressao da praca usa
    // milhares), a varredura linear ficaria lenta demais.
    // O fim da busca e o ultimo no (n-1), nao o penultimo: assim o trecho
    // [xs[n-2], xs[n-1]] ainda e encontrado (com hi = n-2 o invariante
    // xs[hi] > x quebrava e o ultimo trecho saia com t > 1, com a
    // interpolacao estourada).
    let lo = 0
    let hi = n - 1
    while (hi - lo > 1) {
      const meio = (lo + hi) >> 1
      if (xs[meio] <= x) lo = meio
      else hi = meio
    }
    const i = lo
    const t = (x - xs[i]) / h[i]
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1]
  }
}
