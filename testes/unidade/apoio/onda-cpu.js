// Gêmeo na CPU do passe de onda de src/mundo/toque.js (fragOnda e ondaTsl) e da crista de src/mundo/mar.js.
// Mesma grade, mesmo estêncil, mesma gota, mesmo corte de ±2: se a conta do shader mudar, este arquivo muda junto.
//   h = (2·agora − antes + k·(soma dos 4 vizinhos − 4·agora)) · amortece   (+ gotas no 1º passo do quadro)
// Fora da grade a altura é 0 (como o shader, que devolve 0 fora da imagem).

const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

export function criarOndaCpu({ tam, area, k, amortece }) {
  const texel = area / tam
  let agora = new Float32Array(tam * tam)
  let antes = new Float32Array(tam * tam)
  // o centro da grade fica parado em (0, 0): os testes não movem a grade
  const xDe = (i) => (i + 0.5 - tam / 2) * texel
  return {
    texel,
    // um passo de 1/60 s; gotas: [[x, z, raio, força]]
    passo(gotas = []) {
      const prox = new Float32Array(tam * tam)
      const ler = (i, j) => (i < 0 || j < 0 || i >= tam || j >= tam ? 0 : agora[j * tam + i])
      for (let j = 0; j < tam; j++) {
        const z = xDe(j)
        for (let i = 0; i < tam; i++) {
          const c = agora[j * tam + i]
          const viz = ler(i + 1, j) + ler(i - 1, j) + ler(i, j + 1) + ler(i, j - 1)
          let h = (2 * c - antes[j * tam + i] + k * (viz - 4 * c)) * amortece
          const x = xDe(i)
          for (const [gx, gz, r, w] of gotas) h += (1 - suave(0, r, Math.hypot(x - gx, z - gz))) * w
          prox[j * tam + i] = Math.max(-2, Math.min(2, h))
        }
      }
      antes = agora
      agora = prox
    },
    // a crista clara que o mar desenha (mar.js): valor de 0 a 1 em cada célula
    cristas(crista) {
      const lista = []
      for (let j = 0; j < tam; j++) {
        for (let i = 0; i < tam; i++) {
          const h = agora[j * tam + i]
          const v = suave(crista.de, crista.cheia, h) * (1 - suave(crista.some, crista.fim, h))
          if (v > 0.5) lista.push([xDe(i), xDe(j)])
        }
      }
      return lista
    },
  }
}
