// Maresia - olha o jogo de fora: abre a pagina no Chrome headless, espera o jogo montar,
// conta as casas, mede o tempo de cada etapa e tira foto de lugares escolhidos.
//
// Uso:
//   node scripts/olhar-jogo.mjs [url] [esperaEmSegundos] [plano.json]
//
// O plano e um JSON com a lista de lugares a fotografar:
//   [{ "nome": "centro", "lon": -38.5276, "lat": -3.7275, "yaw": -1.5708,
//      "pitch": 0.25, "dist": 6, "hora": 9.5, "x": 29, "z": 316 }]
// Sem plano, o script so conta e tira uma foto do lugar do console.
//
// O renderizador e o WebGPU (decisao do Joabe, Fase 4 do docs/plano-20-10-2026.md): o
// script grava a preferencia no localStorage antes da pagina carregar e avisa se o jogo
// abriu em WebGL. Para forcar o WebGL mesmo assim: RENDERIZADOR=webgl.
//
// Variaveis de ambiente:
//   RENDERIZADOR   'webgpu' (padrao) ou 'webgl'
//   PORTA_EXTRA    soma na porta do CDP (para rodar dois olhares ao mesmo tempo)

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5195/'
const espera = Number(process.argv[3] || 90)
const plano = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : null
const RENDERIZADOR = process.env.RENDERIZADOR || 'webgpu'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9223 + (Number(process.env.PORTA_EXTRA) || 0)

const perfil = mkdtempSync(join(tmpdir(), 'maresia-chrome-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox',
  // o WebGPU precisa do Dawn: --enable-unsafe-webgpu libera o adaptador e o
  // --use-angle=metal usa a GPU de verdade da maquina (no Mac, o Dawn fala Metal)
  '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function alvo() {
  for (let i = 0; i < 60; i++) {
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
const logs = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
    logs.push(`[${m.params.type}] ${txt}`)
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    logs.push(`[ERRO] ${d.exception?.description || d.text}`)
  }
})
await new Promise((r) => ws.addEventListener('open', r))
const cmd = (method, params = {}) => new Promise((r) => {
  const id = ++seq
  esperando.set(id, r)
  ws.send(JSON.stringify({ id, method, params }))
})
const avaliar = async (expression, comPromessa = true) => {
  const r = await cmd('Runtime.evaluate', { expression, awaitPromise: comPromessa, returnByValue: true })
  if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
  return { valor: r.result?.result?.value }
}

await cmd('Runtime.enable')
await cmd('Log.enable')
await cmd('Page.enable')
// o renderizador e escolhido pelo config salvo no navegador: escreve antes de a
// pagina carregar, para o jogo ja nascer no renderizador pedido
await cmd('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    try {
      const chave = 'maresia.config.v8'
      const atual = JSON.parse(localStorage.getItem(chave) || '{}')
      atual.desempenho = { ...(atual.desempenho || {}), renderizador: ${JSON.stringify(RENDERIZADOR)} }
      localStorage.setItem(chave, JSON.stringify(atual))
    } catch (e) { console.error('nao deu para gravar o renderizador:', e) }
  })()`,
})
await cmd('Page.navigate', { url })

let pronto = false
const t0 = Date.now()
while (Date.now() - t0 < espera * 1000) {
  await dormir(2000)
  const v = (await avaliar('JSON.stringify({pronto: !!(window.__tempos && window.__tempos.fisica)})', false)).valor
  if (v) {
    const o = JSON.parse(v)
    if (o.pronto) { pronto = true; break }
  }
}
// espera também os modelos (o corpo do jogador e os GLB carregam em segundo plano): sem isso a foto saía
// com o boneco de cápsulas no lugar do Neto (22/10/2026); a suíte de cenários já esperava maresia.pronto
if (pronto) await avaliar('Promise.race([window.maresia?.pronto, new Promise((r) => setTimeout(r, 180000))]).then(() => true)')

const estado = await avaliar(`JSON.stringify({
  tempos: window.__tempos || null,
  Predios: window.maresia?.predios?.length ?? null,
  recusa: window.maresia?.recusa ?? null,
  webgpu: window.maresia?.webgpu ?? null,
  renderizador: window.maresia?.cfg?.desempenho?.renderizador ?? null,
  shadersQuebrados: (window.__shadersQuebrados || []).length,
})`, false)
console.log('--- estado ---')
console.log(estado.valor || estado.erro)
// o renderizador pedido e o WebGPU: se o jogo abriu em WebGL, a foto nao serve
const st = estado.valor ? JSON.parse(estado.valor) : {}
const webgpu = st.webgpu === true
console.log(webgpu
  ? '--- renderizador: WebGPU ---'
  : `--- ATENCAO: o jogo abriu em ${st.renderizador || 'desconhecido'} (WebGPU: ${st.webgpu}) ---`)
if (st.shadersQuebrados) console.log(`--- shaders quebrados: ${st.shadersQuebrados} ---`)
console.log('--- console do jogo ---')
console.log(logs.slice(0, 40).join('\n') || '(nenhuma mensagem)')
console.log(pronto ? '--- o jogo montou ---' : '--- o jogo NAO montou no tempo previsto ---')

// a consulta final, se o chamador quiser (o jogo instala as ferramentas de
// depuracao com import assincrono: espera um pouco para elas chegarem)
const consulta = process.env.CONSULTA
if (consulta) {
  await dormir(2500)
  const c = await avaliar(consulta)
  console.log('--- consulta ---', c.valor || c.erro)
}

// ---- fotos: o jogo e pausado e avanca passo fixo, para a foto sair sempre igual
async function foto(lugar) {
  const nome = lugar.nome || 'olhar'
  const expr = `(async () => {
    const m = window.maresia
    m.controle.pausado = true
    m.cfg.tempo.pausado = true
    m.cfg.fatia.travar = false // a fatia vertical prende o jogador na Praia do Peixe
    if (${lugar.hora ?? 'null'} !== null) m.cfg.tempo.hora = ${lugar.hora ?? 9.5}
    let x = ${lugar.x ?? 'null'}, z = ${lugar.z ?? 'null'}
    if (x === null && ${lugar.lon ?? 'null'} !== null) {
      const fort = await import('/src/mundo/fortaleza1932.js')
      const p = fort.ll(${lugar.lon}, ${lugar.lat})
      x = p[0]; z = p[1]
    }
    if (x !== null) m.irPara(x, z, ${lugar.yaw ?? 0})
    m.cam.pitch = ${lugar.pitch ?? 0.22}
    m.cfg.camera.distancia = ${lugar.dist ?? 6}
    m.cam.iniciado = false
    if (${lugar.mapa ?? false}) {
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM' }))
    }
    for (let i = 0; i < ${lugar.passos ?? 90}; i++) m.passo(1/60, false)
    m.passo(1/60, true)
    return JSON.stringify({ alvo: [Math.round(x ?? 0), Math.round(z ?? 0)], jogador: m.jogador.pos.toArray().map((v) => Math.round(v)), cam: m.cam.camera.position.toArray().map((v) => Math.round(v)) })
  })()`
  const r = await avaliar(expr)
  const shot = await cmd('Page.captureScreenshot', { format: 'png' })
  if (shot.result?.data) {
    const caminho = `/tmp/maresia-${nome}.png`
    writeFileSync(caminho, Buffer.from(shot.result.data, 'base64'))
    console.log(`--- foto ${nome} ---`, r.valor || r.erro, caminho)
  }
}

if (pronto) {
  const lugares = plano || [{ nome: 'olhar', lon: -38.5276, lat: -3.7275, yaw: -1.5708, dist: 8, pitch: 0.3 }]
  for (const l of lugares) await foto(l)
}

ws.close()
chrome.kill()
await dormir(300)
try { rmSync(perfil, { recursive: true, force: true }) } catch { /* perfil temporario */ }
process.exit(pronto && webgpu ? 0 : 1)
