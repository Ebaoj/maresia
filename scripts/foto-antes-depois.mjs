// Foto antes e depois da cena, para o Joabe aprovar: a mesma câmera, a mesma hora, o mesmo
// instante, e a única diferença é a cena.
//
// A comparação é feita na MESMA sessão do jogo: a foto "depois" sai com a cena visível e a
// "antes" sai com a cena escondida (as malhas cujo nome começa com "urubu"). Assim as duas
// imagens têm a mesma luz, a mesma sombra e o mesmo quadro do motor, e a diferença é só a cena.
//
// uso: node scripts/foto-antes-depois.mjs [url] [espera] [plano.json] [pasta]
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5195/'
const espera = Number(process.argv[3] || 240)
const plano = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : null
const PASTA = process.argv[5] || 'docs/capturas/urubu-1932'
const RENDERIZADOR = process.env.RENDERIZADOR || 'webgpu'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9223 + (Number(process.env.PORTA_EXTRA) || 0)

mkdirSync(PASTA, { recursive: true })
const perfil = mkdtempSync(join(tmpdir(), 'maresia-ab-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox',
  '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', detached: true })

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
let ws = null
let codigo = 0
try {
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
  ws = new WebSocket(pagina.webSocketDebuggerUrl)
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
  const avaliar = async (expression, comPromessa = true) => {
    const r = await cmd('Runtime.evaluate', { expression, awaitPromise: comPromessa, returnByValue: true })
    if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
    return { valor: r.result?.result?.value }
  }
  const foto = async (caminho) => {
    const s = await cmd('Page.captureScreenshot', { format: 'png' })
    if (!s.result?.data) return false
    writeFileSync(caminho, Buffer.from(s.result.data, 'base64'))
    return true
  }

  await cmd('Runtime.enable')
  await cmd('Log.enable')
  await cmd('Page.enable')
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
    const v = (await avaliar('!!(window.__tempos && window.__tempos.fisica)', false)).valor
    if (v) { pronto = true; break }
  }
  const estado = (await avaliar('JSON.stringify({ webgpu: window.maresia?.webgpu ?? null, quebrados: (window.__shadersQuebrados || []).length })', false)).valor
  console.log('estado:', estado)
  if (!pronto) { console.log('--- o jogo NAO montou ---'); codigo = 1 }

  if (pronto) {
    const lugares = plano || [{ nome: 'campo', lon: -38.5700, lat: -3.7185, yaw: -1.5708, pitch: 0.55, dist: 90, hora: 9.5 }]
    for (const l of lugares) {
      const nome = l.nome || 'campo'
      // a pose e a camera sao as mesmas nos dois momentos
      const posicoes = `(async () => {
        const m = window.maresia
        m.controle.pausado = true
        m.cfg.tempo.pausado = true
        m.cfg.fatia.travar = false
        m.cfg.tempo.hora = ${l.hora ?? 9.5}
        const fort = await import('/src/mundo/fortaleza1932.js')
        const p = fort.ll(${l.lon}, ${l.lat})
        m.irPara(p[0], p[1], ${l.yaw ?? 0})
        m.cam.pitch = ${l.pitch ?? 0.22}
        m.cfg.camera.distancia = ${l.dist ?? 6}
        m.cam.iniciado = false
        // o painel de ajustes polui a foto: fecha (H), mas so quando esta aberto (o H alterna)
        if (document.querySelector('.lil-gui')) dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
        for (let i = 0; i < ${l.passos ?? 90}; i++) m.passo(1/60, false)
        m.passo(1/60, true)
        return JSON.stringify({ jogador: m.jogador.pos.toArray().map((v) => Math.round(v)) })
      })()`
      const esconder = `(async () => {
        const m = window.maresia
        let n = 0
        m.cena.traverse((o) => { if (o.name && o.name.startsWith('urubu')) { o.visible = false; n++ } })
        m.passo(1/60, false); m.passo(1/60, true)
        return String(n)
      })()`
      const mostrar = `(async () => {
        const m = window.maresia
        let n = 0
        m.cena.traverse((o) => { if (o.name && o.name.startsWith('urubu')) { o.visible = true; n++ } })
        m.passo(1/60, false); m.passo(1/60, true)
        return String(n)
      })()`
      const r = await avaliar(posicoes)
      await foto(join(PASTA, `${nome}-depois.png`))
      const escondidas = await avaliar(esconder)
      await foto(join(PASTA, `${nome}-antes.png`))
      await avaliar(mostrar)
      console.log(`--- ${nome} ---`, r.valor || r.erro, '| malhas escondidas:', escondidas.valor || escondidas.erro)
    }
  }
} finally {
  try { ws?.close() } catch { /* ja fechado */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { try { chrome.kill('SIGKILL') } catch { /* ja morto */ } }
  await dormir(300)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* perfil temporario */ }
}
process.exit(codigo)
