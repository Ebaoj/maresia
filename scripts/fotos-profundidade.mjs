// Fotos e vídeo da profundidade de campo (src/pos/profundidade.js): o mesmo lugar, a mesma câmera e o mesmo instante
// com variantes do cfg.estilo (desligada, ligada antes da pincelada, depois...). Cada variante sai logo depois da
// anterior, na mesma sessão, para a luz e a gente serem as mesmas e a diferença ser só o efeito.
//
// uso: node scripts/fotos-profundidade.mjs URL PLANO.json PASTA
// PLANO: {
//   "variantes": { "off": { "dof": false }, "on": { "dof": true } },
//   "lugares": [ { "nome": "coluna", "lugar": "pracaFerreira", "vista": "colunaHora", "passos": 90 },
//                { "nome": "rua", "x": 0, "z": 0, "yaw": 0, "hora": 12, "pitch": 0.2, "dist": 5 } ],
//   "video": { "nome": "andando", "segundos": 6, "fps": 30, "lugar": {...}, "roteiro": "(t, m) => { m.teclas.frente = true }" }
// }
// Sai PASTA/<lugar>-<variante>.png; o vídeo vai para docs/capturas/video/<nome>/ (gravador do modo dev).
// Variáveis: RENDERIZADOR ('webgpu' padrão ou 'webgl'), PORTA_EXTRA (soma na porta do CDP).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5195/'
const plano = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const PASTA = process.argv[4] || 'docs/capturas/profundidade'
const RENDERIZADOR = process.env.RENDERIZADOR || 'webgpu'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9223 + (Number(process.env.PORTA_EXTRA) || 0)

mkdirSync(PASTA, { recursive: true })
const perfil = mkdtempSync(join(tmpdir(), 'maresia-dof-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', detached: true })

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
let ws = null
let codigo = 0
const logs = []
try {
  let pagina = null
  for (let i = 0; i < 120 && !pagina; i++) {
    try { pagina = (await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()).find((t) => t.type === 'page') } catch { /* subindo */ }
    if (!pagina) await dormir(500)
  }
  if (!pagina) throw new Error('chrome nao respondeu')
  ws = new WebSocket(pagina.webSocketDebuggerUrl)
  let seq = 0
  const esperando = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id) }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      logs.push(`[${m.params.type}] ` + (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '))
    }
    if (m.method === 'Runtime.exceptionThrown') logs.push('[ERRO] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text))
  })
  await new Promise((r) => ws.addEventListener('open', r))
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++seq; esperando.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
  const avaliar = async (expression) => {
    const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
    return { valor: r.result?.result?.value }
  }
  const foto = async (caminho) => {
    const s = await cmd('Page.captureScreenshot', { format: 'png' })
    if (s.result?.data) writeFileSync(caminho, Buffer.from(s.result.data, 'base64'))
  }
  await cmd('Runtime.enable')
  await cmd('Page.enable')
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { try {
      const chave = 'maresia.config.v8'
      const atual = JSON.parse(localStorage.getItem(chave) || '{}')
      atual.desempenho = { ...(atual.desempenho || {}), renderizador: ${JSON.stringify(RENDERIZADOR)} }
      localStorage.setItem(chave, JSON.stringify(atual))
    } catch (e) { console.error('renderizador:', e) } })()`,
  })
  await cmd('Page.navigate', { url })
  let pronto = false
  for (const t0 = Date.now(); Date.now() - t0 < 300000;) {
    await dormir(2000)
    if ((await avaliar('!!(window.__tempos && window.__tempos.fisica)')).valor) { pronto = true; break }
  }
  if (pronto) await avaliar('Promise.race([window.maresia?.pronto, new Promise((r) => setTimeout(r, 180000))]).then(() => true)')
  await dormir(2500) // as ferramentas do modo dev chegam por import assíncrono
  console.log('estado:', (await avaliar('JSON.stringify({ webgpu: window.maresia?.webgpu ?? null, quebrados: window.__shadersQuebrados || [] })')).valor)
  if (!pronto) { console.log('--- o jogo NAO montou ---'); codigo = 1 }

  // posiciona: vista do "Ir para" (lugar + vista) ou x, z, yaw, hora
  const posicionar = (l) => `(async () => {
    const m = window.maresia
    m.controle.pausado = true
    m.cfg.tempo.pausado = true
    m.cfg.fatia.travar = false
    if (document.querySelector('.lil-gui') && getComputedStyle(document.querySelector('.lil-gui')).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
    ${l.lugar ? `const j = await import('/src/ui/painel/jogo.js'); j.irParaLugar(m.cfg, ${JSON.stringify(l.lugar)}, m, ${JSON.stringify(l.vista ?? null)})`
      : l.lon != null ? `const f = await import('/src/mundo/fortaleza1932.js'); const p = f.ll(${l.lon}, ${l.lat}); m.irPara(p[0], p[1], ${l.yaw ?? 0}, ${l.hora ?? 12})`
      : `m.irPara(${l.x}, ${l.z}, ${l.yaw ?? 0}, ${l.hora ?? 12})`}
    ${l.hora != null && l.lugar ? `m.cfg.tempo.hora = ${l.hora}` : ''}
    ${l.pitch != null ? `m.cam.pitch = ${l.pitch}` : ''}
    ${l.dist != null ? `m.cfg.camera.distancia = ${l.dist}` : ''}
    ${l.antes || ''}
    m.cam.iniciado = false
    for (let i = 0; i < ${l.passos ?? 120}; i++) m.passo(1/60, i % 10 === 9)
    return JSON.stringify({ jogador: m.jogador.pos.toArray().map((v) => +v.toFixed(1)), foco: +m.pos.base?.estadoFoco?.foco?.toFixed?.(2) || +m.pos.estadoFoco?.foco?.toFixed?.(2) })
  })()`
  const variante = (v) => `(async () => {
    const m = window.maresia
    Object.assign(m.cfg.estilo, ${JSON.stringify(v)})
    m.passo(1/60, true); m.passo(1/60, true)
    return 'ok'
  })()`

  if (pronto) {
    const padrao = (await avaliar('JSON.stringify(window.maresia.cfg.estilo)')).valor
    for (const l of plano.lugares || []) {
      const r = await avaliar(posicionar(l))
      console.log(`--- ${l.nome} ---`, r.valor || r.erro)
      for (const [nv, v] of Object.entries(plano.variantes || { base: {} })) {
        const rv = await avaliar(variante(v))
        if (rv.erro) console.log('variante', nv, rv.erro)
        await foto(join(PASTA, `${l.nome}-${nv}.png`))
        await avaliar(`Object.assign(window.maresia.cfg.estilo, ${padrao}), 'ok'`)
      }
    }
    if (plano.video) {
      const v = plano.video
      if (v.lugar) console.log('video lugar:', (await avaliar(posicionar(v.lugar))).valor)
      if (v.cfg) await avaliar(variante(v.cfg))
      const r = await avaliar(`window.maresia.gravar({ nome: ${JSON.stringify(v.nome)}, segundos: ${v.segundos ?? 6}, fps: ${v.fps ?? 30}, roteiro: ${v.roteiro || '() => {}'} }).then((x) => JSON.stringify(x))`)
      console.log('video:', r.valor || r.erro)
    }
    console.log('quebrados no fim:', (await avaliar('JSON.stringify(window.__shadersQuebrados || [])')).valor)
  }
} finally {
  console.log('--- console (erros e avisos) ---\n' + (logs.slice(0, 30).join('\n') || '(nada)'))
  try { ws?.close() } catch { /* fechado */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { try { chrome.kill('SIGKILL') } catch { /* morto */ } }
  await dormir(300)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* temporário */ }
}
process.exit(codigo)
