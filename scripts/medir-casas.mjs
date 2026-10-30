// A demanda de vértices das casas de 1932 no mapa inteiro (26/10/2026).
//
// O lote das casas (src/mundo/casas-lote.js) reserva o espaço FINAL de cada material na placa.
// Esse espaço precisa vir da contagem real: o mapa tem mais de 18 mil casas (a planta oficial de
// 1932) e cada uma pede milhares de vértices, repartidos em cinco pilhas (reboco, peças, interior,
// interior aceso e telhas). A estimativa antiga (as constantes CUSTO_CASARIO/CUSTO_MORRO em
// casas-lote.js) era uma média medida em poucas casas: ela errava a fatia de cada material.
//
// Este script monta a cidade como o jogo monta (src/mundo/cidade.js: criarCidade, com a planta de
// 1932 lida do PNG) e gera a geometria de cada casa com o MESMO gerador e a MESMA semente que o
// jogo usa (src/mundo/casa1932.js: casa, com a semente 1932 + i * 7919, i na ordem do mapa). O
// resultado sai em src/mundo/casas-capacidade.json, que o jogo lê na abertura para dimensionar os
// lotes, e que o teste testes/unidade/casas-capacidade.test.js confere contra o gerador.
//
// O script roda os módulos pelo Vite (ssrLoadModule) porque a planta de 1932 é um PNG importado
// (src/mundo/ocupacao1932.js): o Node puro não sabe ler isso.
//
// Uso: node scripts/medir-casas.mjs [--gravar]
import { fileURLToPath } from 'node:url'
import { writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const RAIZ = fileURLToPath(new URL('../', import.meta.url))
const TAM_BLOCO = 96 // o mesmo bloco do LOD (src/mundo/blocos.js: TAM_LOD)
const PILHAS = ['reboco', 'pecas', 'interior', 'aceso', 'telhas']
// o lote de cada pilha: o reboco da favela (o morro) tem material proprio (o desgaste maior de
// src/mundo/casas-materiais.js), o resto das pilhas é o mesmo material para os dois tipos
const LOTE = { reboco: 'reboco', rebocoMorro: 'rebocoMorro', pecas: 'pecas', interior: 'interior', aceso: 'aceso', telhas: 'telhas' }
const nomeDoLote = (pilha, simples) => (pilha === 'reboco' && simples ? 'rebocoMorro' : LOTE[pilha])
const GRAVAR = process.argv.includes('--gravar')

// o canvas de mentira para quem desenha letreiro (o Node não tem)
function canvasDeMentira() {
  if (!globalThis.document) globalThis.document = {}
  if (!globalThis.document.createElement) {
    const ctx = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'getImageData' ? () => ({ data: new Uint8ClampedArray(4) }) : () => {}), set: () => true })
    globalThis.document.createElement = () => ({ getContext: () => ctx, width: 0, height: 0, style: {}, addEventListener() {} })
  }
  if (!globalThis.document.createElementNS) globalThis.document.createElementNS = (_, n) => globalThis.document.createElement(n)
}
canvasDeMentira()

const vite = await createServer({ root: RAIZ, server: { middlewareMode: true }, appType: 'custom', logLevel: 'warn' })
const mod = (p) => vite.ssrLoadModule(p)

const { lerPng } = await import('../testes/unidade/apoio/png.js')
const ocup = await mod('/src/mundo/ocupacao1932.js')
const png = lerPng(`${RAIZ}src/mundo/mapa1932-malha.png`)
ocup.montarOcupacao1932(png.dados, png.w, png.h)
const { calcularAlturas } = await mod('/src/mundo/terreno.js')
calcularAlturas()
const { criarCidade } = await mod('/src/mundo/cidade.js')
const { PADRAO } = await mod('/src/config.js')
const { criarAleatorio } = await mod('/src/utils.js')
const { casa, pilhasVazias, planejar } = await mod('/src/mundo/casa1932.js')
const THREE = await mod('/node_modules/three/build/three.module.js')

const cena = new THREE.Scene()
const cfg = JSON.parse(JSON.stringify(PADRAO))
const t0 = Date.now()
const { predios } = criarCidade(cena, cfg)
console.log(`a cidade: ${predios.length} casas em ${((Date.now() - t0) / 1000).toFixed(1)} s`)

// a semente de cada casa: a mesma de src/mundo/quarteirao.js (a ordem do mapa é a de predios)
const sementeDe = (i) => 1932 + i * 7919

// 1ª passada: o planejamento (o jogo faz o mesmo ao abrir: a fachada e a altura saem daqui)
planejar(true)
for (const [i, it] of predios.entries()) {
  for (const _ of casa(it, pilhasVazias(), criarAleatorio(sementeDe(i)), it.tipo === 'favela')) { /* nada */ }
}
planejar(false)
console.log(`planejamento pronto (${((Date.now() - t0) / 1000).toFixed(1)} s)`)

// 2ª passada: a geometria de verdade (a mesma que o trabalhador monta), contando os vértices
const porMaterial = {}
for (const p of Object.values(LOTE)) porMaterial[p] = { vertices: 0, triangulos: 0, blocos: 0, maxBloco: 0, casas: 0 }
const porTipo = { casario: { casas: 0, vertices: 0, lotes: {} }, favela: { casas: 0, vertices: 0, lotes: {} } }
const blocos = new Map() // chave do bloco → { simples, materiais: vértices }
let indice = 0
for (const [i, it] of predios.entries()) {
  const simples = it.tipo === 'favela'
  const pilhas = pilhasVazias()
  for (const _ of casa(it, pilhas, criarAleatorio(sementeDe(i)), simples)) { /* nada */ }
  const chave = `${simples ? 'm' : 'c'}${Math.floor(it.x / TAM_BLOCO)},${Math.floor(it.z / TAM_BLOCO)}`
  let bloco = blocos.get(chave)
  if (!bloco) {
    const bi = Math.floor(it.x / TAM_BLOCO)
    const bj = Math.floor(it.z / TAM_BLOCO)
    bloco = { simples, x0: bi * TAM_BLOCO, z0: bj * TAM_BLOCO, materiais: {} }
    blocos.set(chave, bloco)
  }
  const tipo = simples ? 'favela' : 'casario'
  for (const p of PILHAS) {
    const n = pilhas[p].n
    if (!n) continue
    const lote = nomeDoLote(p, simples)
    bloco.materiais[lote] = (bloco.materiais[lote] ?? 0) + n
    porMaterial[lote].vertices += n
    porMaterial[lote].triangulos += n / 3
    porMaterial[lote].casas++
    porTipo[tipo].lotes[lote] = (porTipo[tipo].lotes[lote] ?? 0) + n
  }
  porTipo[tipo].casas++
  for (const p of PILHAS) porTipo[tipo].vertices += pilhas[p].n
  indice++
  if (indice % 2000 === 0) console.log(`  ${indice}/${predios.length} casas (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
}
// os blocos por material (o lote reserva uma instância por bloco e material)
for (const bloco of blocos.values()) {
  for (const [p, v] of Object.entries(bloco.materiais)) {
    porMaterial[p].blocos++
    if (v > porMaterial[p].maxBloco) porMaterial[p].maxBloco = v
  }
}

// O anel que o jogo mantém montado: o gerenciador de blocos (src/mundo/bloco-casas.js) monta os
// blocos a até PERTO + raioPrefetch (70 + 96 = 166 m) do jogador e, no destino do teleporte, a
// até raioPrefetch + tamBloco (96 + 96 = 192 m). O lote das casas só precisa guardar esse anel:
// o resto do mapa é desenhado com as caixas de fachada pintada (o LOD de longe), que são outras
// malhas (instanciadas por bloco), e não com a geometria detalhada.
const ANEL_JOGADOR = 166
const ANEL_DESTINO = 192
const raios = [ANEL_JOGADOR, ANEL_DESTINO]

// a distância do ponto ao retângulo do bloco (a mesma conta de bloco-casas.js)
function distanciaAoBloco(b, cx, cz) {
  const t = TAM_BLOCO
  return Math.hypot(Math.max(b.x0 - cx, 0, cx - (b.x0 + t)), Math.max(b.z0 - cz, 0, cz - (b.z0 + t)))
}

// o pior anel do mapa: para cada bloco (a câmera pode estar nele), a soma do que os blocos do
// anel pedem. É o pior caso do que o lote precisa guardar ao mesmo tempo.
const listaBlocos = [...blocos.values()]
function anelEm(raio) {
  let max = 0
  let maxBlocos = 0
  let maxPorMaterial = {}
  const valores = []
  for (const b of listaBlocos) {
    let soma = 0
    let n = 0
    const porMat = {}
    for (const c of listaBlocos) {
      if (distanciaAoBloco(c, b.x0 + TAM_BLOCO / 2, b.z0 + TAM_BLOCO / 2) > raio) continue
      n++
      for (const p of Object.values(LOTE)) {
        const v = c.materiais[p] ?? 0
        soma += v
        porMat[p] = (porMat[p] ?? 0) + v
      }
    }
    valores.push(soma)
    if (soma > max) {
      max = soma
      maxBlocos = n
      maxPorMaterial = porMat
    }
  }
  valores.sort((a, b) => a - b)
  const p = (q) => valores[Math.min(valores.length - 1, Math.floor(valores.length * q))]
  return { raio, max, maxBlocos, p50: p(0.5), p90: p(0.9), p99: p(0.99), porMaterial: maxPorMaterial }
}
const anelJogador = anelEm(ANEL_JOGADOR)
const anelDestino = anelEm(ANEL_DESTINO)
const anel = {
  raioJogador: ANEL_JOGADOR,
  raioDestino: ANEL_DESTINO,
  jogador: anelJogador,
  destino: anelDestino,
  maxVertices: Math.max(anelJogador.max, anelDestino.max),
  maxBlocos: Math.max(anelJogador.maxBlocos, anelDestino.maxBlocos),
  porMaterial: anelJogador.max >= anelDestino.max ? anelJogador.porMaterial : anelDestino.porMaterial,
}

const totalVertices = Object.values(LOTE).reduce((a, p) => a + porMaterial[p].vertices, 0)
// o custo na placa: posição, normal e cor (3 floats cada) e o chão da casa (1 float); sem índice
// (a geometria da casa é uma sopa de triângulos: cada peça entra sem os vértices compartilhados)
const BYTES_POR_VERTICE = 12 + 12 + 12 + 4
const tabela = {
  geradoEm: new Date().toISOString().slice(0, 10),
  bloco: TAM_BLOCO,
  casas: predios.length,
  blocos: blocos.size,
  bytesPorVertice: BYTES_POR_VERTICE,
  total: { vertices: totalVertices, bytes: totalVertices * BYTES_POR_VERTICE },
  materiais: Object.fromEntries(Object.values(LOTE).map((p) => [p, {
    vertices: porMaterial[p].vertices,
    triangulos: porMaterial[p].triangulos,
    blocos: porMaterial[p].blocos,
    maxBloco: porMaterial[p].maxBloco,
    bytes: porMaterial[p].vertices * BYTES_POR_VERTICE,
  }])),
  anel,
  porTipo: Object.fromEntries(Object.entries(porTipo).map(([k, v]) => [k, {
    casas: v.casas,
    vertices: v.vertices,
    mediaPorCasa: Math.round(v.vertices / Math.max(1, v.casas)),
    lotes: v.lotes,
    mediaPorLote: Object.fromEntries(Object.entries(v.lotes).map(([l, n]) => [l, Math.round(n / Math.max(1, v.casas))])),
  }])),
}
console.log(JSON.stringify(tabela, null, 2))
console.log(`memória da placa (sem índice, com 10% de folga): ${((tabela.total.bytes * 1.1) / 1048576).toFixed(0)} MB`)
if (GRAVAR) {
  const destino = `${RAIZ}src/mundo/casas-capacidade.json`
  writeFileSync(destino, `${JSON.stringify(tabela, null, 2)}\n`)
  console.log(`gravado em ${destino}`)
}
await vite.close()
