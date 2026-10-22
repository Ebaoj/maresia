// A planta oficial por cima da vista de cima do jogo (docs/mapa-1932.md, v16): para cada pixel da foto de cima
// (scripts/fotos-escala.mjs, item "topo", que grava NOME.json com o recorte), o lon/lat que o jogo põe ali.
// O desenho (a planta de 1932, mapa1932-malha.png, por cima da foto) é do sobrepor-planta.py.
//
//   node scripts/diagnostico/rodar-modulo.mjs scripts/diagnostico/sobrepor-planta.mjs PASTA NOME [NOME...]
//   RAIZ=/worktree/de/antes ... (o lon/lat pela transformada do código de lá: a foto de antes)
// Escreve PASTA/NOME.lonlat (Float32, lon e lat intercalados, 640 x 360).
import { readFileSync, writeFileSync } from 'node:fs'
import { llInverso } from '/src/mundo/fortaleza1932.js'

export default function ([pasta, ...nomes]) {
  const W = 640
  const H = 360
  for (const nome of nomes) {
    const r = JSON.parse(readFileSync(`${pasta}/${nome}.json`, 'utf8'))
    const out = new Float32Array(W * H * 2)
    for (let i = 0; i < H; i++) {
      for (let j = 0; j < W; j++) {
        // a câmera olha reto para baixo com o "para cima" da tela em -z: a direita é +x, o alto é -z
        const x = r.x + ((j + 0.5) / W - 0.5) * r.largura
        const z = r.z + ((i + 0.5) / H - 0.5) * r.altura
        const [lon, lat] = llInverso(x, z)
        out[(i * W + j) * 2] = lon
        out[(i * W + j) * 2 + 1] = lat
      }
    }
    writeFileSync(`${pasta}/${nome}.lonlat`, Buffer.from(out.buffer))
  }
}
