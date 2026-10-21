// A régua da cidade de estresse (docs/motor-m1.md), rodando local.
//
// A régua oficial (infra/maquina-gpu/regua_cidade.py) roda dentro da g4dn da AWS, e o Python de
// lá tem o módulo websocket. Aqui a mesma conta em node, que fala CDP sem instalar nada, contra o
// Chrome com a GPU da máquina (WebGPU em Metal no Mac).
//
// uso:
//   node scripts/rodar-regua.mjs [CASAS] [RODADAS] [PARAMETROS]
//   ex.: node scripts/rodar-regua.mjs 15000 3 '&preparado=1&terreno=b'
//
// A regra: a quantidade exata de casas, pelo menos 80 FPS em todos os trechos, abertura mediana de
// até 15 s, estatísticas de capacidade válidas sem overflow, e nenhum shader quebrado.

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CASAS = Number(process.argv[2] || 15000)
const RODADAS = Number(process.argv[3] || 3)
const EXTRA = process.argv[4] || '&preparado=1&terreno=b'
const URL_JOGO = process.env.URL_JOGO || 'http://localhost:5195'
const FPS_MIN = 80
const ABERTURA_MAX_MS = 15000
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9222 + (Number(process.env.PORTA_EXTRA) || 0)

const perfil = mkdtempSync(join(tmpdir(), 'maresia-regua-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--use-angle=metal', '--enable-unsafe-webgpu',
  '--enable-features=Vulkan,UseSkiaRenderer', `--remote-debugging-port=${PORTA}`,
  `--user-data-dir=${perfil}`, '--window-size=2560,1544', 'about:blank',
], { stdio: 'ignore' })

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
async function alvo () {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA}/json/list`)
      const lista = await r.json()
      const p = lista.find((t) => t.type === 'page')
      if (p) return p
    } catch { /* o chrome ainda subindo */ }
    await dormir(500)
  }
  throw new Error('chrome nao respondeu')
}

const pagina = await alvo()
const ws = new WebSocket(pagina.webSocketDebuggerUrl)
let seq = 0
const esperando = new Map()
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id) }
})
await new Promise((r) => ws.addEventListener('open', r))
const cmd = (method, params = {}) => new Promise((r) => {
  const id = ++seq
  esperando.set(id, r)
  ws.send(JSON.stringify({ id, method, params }))
})
const js = async (expression) => {
  const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.result?.result?.value
}
await cmd('Runtime.enable')
await cmd('Page.enable')

const mediana = (v) => {
  const o = [...v].sort((a, b) => a - b)
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2
}

const resultados = []
for (let rodada = 0; rodada < RODADAS; rodada++) {
  await cmd('Page.navigate', { url: `${URL_JOGO}/bancada-cidade.html?casas=${CASAS}&segundos=10${EXTRA}` })
  await dormir(3000)
  let r = null
  const prazo = Date.now() + 180000
  while (Date.now() < prazo) {
    r = await js('window.__resultado || null')
    if (r) break
    await dormir(1000)
  }
  if (!r || !r.trechos) {
    console.log('REPROVA: a bancada não terminou', JSON.stringify(r).slice(0, 600))
    ws.close(); chrome.kill()
    process.exit(1)
  }
  if (r.casas !== CASAS) {
    console.log(`REPROVA: pediu ${CASAS} casas, a bancada gerou ${r.casas}`)
    ws.close(); chrome.kill()
    process.exit(1)
  }
  resultados.push(r)
  console.log('rodada', rodada + 1, JSON.stringify({ casas: r.casas, copias: r.copias, msPrimeiroQuadro: r.msPrimeiroQuadro, trechos: r.trechos }))
}

const falhas = []
const abertura = mediana(resultados.map((r) => r.msPrimeiroQuadro))
if (abertura > ABERTURA_MAX_MS) falhas.push(`abertura ${(abertura / 1000).toFixed(1)} s > ${ABERTURA_MAX_MS / 1000} s`)
for (const r of resultados) {
  const vg = r.vg
  if (!vg || !('estourou' in vg)) falhas.push('as estatísticas de capacidade da geometria virtual não foram lidas')
  else if (vg.estourou) falhas.push('a geometria virtual excedeu a capacidade de desenho')
}
for (const trecho of Object.keys(resultados[0].trechos)) {
  for (const r of resultados) {
    const geo = r.trechos[trecho].geometria || {}
    if (!('estourou' in geo)) falhas.push(`${trecho}: capacidade não medida`)
    else if (geo.estourou) falhas.push(`${trecho}: geometria excedeu a capacidade de desenho`)
  }
  const fps = mediana(resultados.map((r) => r.trechos[trecho].fps))
  console.log(`  ${trecho}: ${fps.toFixed(0)} FPS`)
  if (fps < FPS_MIN) falhas.push(`${trecho} ${fps.toFixed(0)} FPS < ${FPS_MIN}`)
}
const quebrados = await js('(window.__shadersQuebrados || []).slice(0, 3)')
if (quebrados && quebrados.length) falhas.push(`shader quebrado: ${JSON.stringify(quebrados)}`)
console.log(`abertura ${(abertura / 1000).toFixed(1)} s; ${CASAS} casas`)

ws.close()
chrome.kill()
await dormir(300)
try { rmSync(perfil, { recursive: true, force: true }) } catch { /* perfil temporario */ }
if (falhas.length) {
  console.log('REPROVA: ' + falhas.join('; '))
  process.exit(1)
}
console.log('PASSA')
