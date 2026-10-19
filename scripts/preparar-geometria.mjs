// KAN-73 T4: prepara a geometria da three-virtual-geometry fora do navegador, para a abertura não montar nada.
// Peças do kit de 1932 (as que aparecem numa amostra grande de casas, de casario e de morro), espécies de árvore, o
// coqueiro, postes, bancos e o chão viram arquivos .vgeo em public/vg/, com um manifesto (chave da peça -> arquivo). A bancada da cidade lê
// o manifesto com ?preparado=1. Uso: node scripts/preparar-geometria.mjs
import { createServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const raiz = path.resolve(import.meta.dirname, '..')
const saida = path.join(raiz, 'public', 'vg')
fs.mkdirSync(saida, { recursive: true })
const vite = await createServer({ root: raiz, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const vgm = await import('three-virtual-geometry')
  const kit = await vite.ssrLoadModule('/src/mundo/kit1932.js')
  const { criarAleatorio } = await vite.ssrLoadModule('/src/utils.js')
  const cid = await vite.ssrLoadModule('/src/debug/cidade-gerar.js')
  const { CORES } = cid
  const rua = await vite.ssrLoadModule('/src/mundo/rua.js')
  const THREE = await vite.ssrLoadModule('three')
  const esp = await vite.ssrLoadModule('/src/mundo/especies.js')
  const veg = await vite.ssrLoadModule('/src/mundo/vegetacao.js')

  // amostra de casas: todas as combinações de peças que o gerador produz (larguras de 6 a 10 m, casario e morro)
  const rnd = criarAleatorio(42)
  const listas = []
  for (let i = 0; i < 4000; i++) {
    const simples = i % 2 === 1
    const it = { x: 0, z: 0, w: rnd.entre(6, 10), d: 10, frente: [0, 1], rot: 0, cor: CORES[i % CORES.length], chao: 0, y: 0, h: simples ? rnd.entre(2.9, 3.6) : 5 }
    listas.push(kit.pecasDaCasa(it, criarAleatorio(1932 + i * 7919), simples))
  }
  const formas = new Map()
  for (const g of kit.agruparPecas(listas)) formas.set('kit:' + g.peca, kit.formaDaPeca(g.peca))
  // espécies: as mesmas variantes da bancada (semente 1932, três de cada, nesta ordem)
  const rndE = criarAleatorio(1932)
  const fns = { oiti: esp.oiti, cajueiro: esp.cajueiro, carnauba: esp.carnauba, mangue: esp.mangueVermelho, murici: esp.murici, guajiru: esp.guajiru }
  for (const [nome, fn] of Object.entries(fns)) for (let v = 0; v < 3; v++) formas.set(`especie:${nome}:${v}`, fn(rndE))
  const { geo: tronco, topo } = veg.geometriaTronco()
  formas.set('coqueiro:tronco', tronco)
  formas.set('coqueiro:copa', veg.geometriaCopa(topo))
  // objetos de rua e a malha única do relevo (a vg faz o corte em clusters)
  formas.set('rua:poste', rua.geometriaPoste())
  formas.set('rua:banco', rua.geometriaBanco())
  formas.set('terreno:estresse', cid.geometriaTerreno(THREE))

  const manifesto = {}
  let bytes = 0
  const t0 = Date.now()
  for (const [chave, geo] of formas) {
    const dados = await vgm.buildVirtualMesh(vgm.fromBufferGeometry(geo, { colors: true, normals: 'keep' }))
    const bin = await vgm.encodeVirtualMesh(dados)
    const nome = crypto.createHash('sha1').update(chave).digest('hex').slice(0, 16) + '.vgeo'
    fs.writeFileSync(path.join(saida, nome), Buffer.from(bin instanceof ArrayBuffer ? new Uint8Array(bin) : bin))
    manifesto[chave] = nome
    bytes += bin.byteLength
  }
  fs.writeFileSync(path.join(saida, 'manifesto.json'), JSON.stringify({ versao: vgm.VG_FORMAT_VERSION, construcao: vgm.VG_BUILD_VERSION, pecas: manifesto }, null, 1))
  console.log(`${formas.size} modelos preparados em ${((Date.now() - t0) / 1000).toFixed(1)} s, ${(bytes / 1048576).toFixed(1)} MB em public/vg`)
} finally {
  await vite.close()
}
