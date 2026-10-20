// Diagnóstico da Praça do Ferreira: confere o contorno lido do raster contra a
// coordenada de jogo e diz o que é praça e o que não é.
//
//   npx vite-node scripts/diagnostico/ver-praca.mjs

import { ll } from '../../src/mundo/fortaleza1932.js'
import { CENTRO, CONTORNO, RAIO, RAIO_MAX, dentroDaPraca, distanciaDaBorda } from '../../src/mundo/praca1932.js'

console.log('centro da praça (jogo):', CENTRO.map((v) => v.toFixed(1)).join(', '))
console.log('pontos do contorno:', CONTORNO.length)
console.log('raio: min', Math.min(...RAIO).toFixed(1), 'max', RAIO_MAX.toFixed(1), '(unidades de jogo)')

// a praca em unidades de jogo cabe numa caixa?
const xs = CONTORNO.map((p) => p[0])
const zs = CONTORNO.map((p) => p[1])
console.log('x:', Math.min(...xs).toFixed(1), 'a', Math.max(...xs).toFixed(1))
console.log('z:', Math.min(...zs).toFixed(1), 'a', Math.max(...zs).toFixed(1))

// uma amostra de pontos: dentro, na borda e fora
const testes = [
  ['centro', CENTRO[0], CENTRO[1]],
  ['norte', CENTRO[0], CENTRO[1] - 10],
  ['sul', CENTRO[0], CENTRO[1] + 10],
  ['leste', CENTRO[0] + 10, CENTRO[1]],
  ['oeste', CENTRO[0] - 10, CENTRO[1]],
  ['fora (leste 40)', CENTRO[0] + 40, CENTRO[1]],
]
for (const [nome, x, z] of testes) {
  console.log(
    `  ${nome.padEnd(14)} dentro=${dentroDaPraca(x, z) ? 'sim' : 'nao'}  borda=${distanciaDaBorda(x, z).toFixed(1)}`
  )
}
