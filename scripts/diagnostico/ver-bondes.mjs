// Diagnóstico dos bondes: confere se o trilho de cada linha da Light achou caminho
// na rede viária de 1932, se ele fica fora da praça e o que ele cruzou.
//
//   npx vite-node scripts/diagnostico/ver-bondes.mjs

import { rotasDosBondes } from '../../src/mundo/bondes.js'
import { CENTRO, dentroDaPraca, distanciaDaBorda } from '../../src/mundo/praca1932.js'

const t0 = performance.now()
const r = rotasDosBondes()
console.log(`linhas: ${r.linhas.length}  paradas: ${r.paradas.length}  (${Math.round(performance.now() - t0)} ms)`)
for (const l of r.relatorio) console.log(' ', JSON.stringify(l))

// o trilho nao entra na praça, e a parada da praça fica na borda
let dentro = 0
let bordaMin = Infinity
let bordaMax = -Infinity
let saltos = 0
let maior = 0
for (const peca of r.linhas) {
  for (const p of peca) {
    if (dentroDaPraca(p[0], p[1])) dentro++
    const b = distanciaDaBorda(p[0], p[1])
    if (b < bordaMin) bordaMin = b
    if (b > bordaMax) bordaMax = b
  }
  for (let i = 1; i < peca.length; i++) {
    const d = Math.hypot(peca[i][0] - peca[i - 1][0], peca[i][1] - peca[i - 1][1])
    if (d >= 10) saltos++
    if (d > maior) maior = d
  }
}
console.log(`pontos dentro da praça: ${dentro}`)
console.log(`distância até a borda da praça: ${bordaMin.toFixed(1)} a ${bordaMax.toFixed(1)} un`)
console.log(`saltos de 10+ unidades (buracos de rua): ${saltos}  maior: ${maior.toFixed(1)} un`)
console.log(`centro da praça: ${CENTRO.map((v) => v.toFixed(1)).join(', ')}`)
