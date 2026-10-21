// Diagnóstico dos bondes: confere se o trilho de cada linha da Light achou caminho
// na rede viária de 1932 e o que ele cruzou.
//
//   npx vite-node scripts/diagnostico/ver-bondes.mjs

import * as THREE from 'three'
import { criarBondes } from '../../src/mundo/bondes.js'

const cena = new THREE.Scene()
const t0 = performance.now()
const r = criarBondes(cena)
console.log(`linhas: ${r.linhas}  paradas: ${r.paradas}  (${Math.round(performance.now() - t0)} ms)`)
for (const l of r.relatorio) console.log(' ', JSON.stringify(l))

// onde cada linha comeca e termina (para conferir no jogo)
console.log('--- malhas na cena ---')
cena.traverse((o) => {
  if (o.isMesh) console.log(' ', o.name, o.geometry.getAttribute('position').count, 'vertices')
})
