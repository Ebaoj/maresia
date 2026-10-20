import { BONDES, comprimento } from '../../src/mundo/mapa1932.js'
for (const b of BONDES) {
  const m = comprimento(b.traco)
  console.log(`${b.nome.padEnd(18)} traco=${m.toFixed(0).padStart(5)} m  doc=${String(b.distancia).padStart(5)} m  razao=${(m/b.distancia).toFixed(2)}`)
}
