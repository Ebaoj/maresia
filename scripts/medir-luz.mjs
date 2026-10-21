// A régua do passe de luz: quanto custa o quadro antes e depois, na mesma rodada.
//
// As variantes se alternam (antes, depois, antes, depois) porque a GPU do Mac muda de
// frequência sozinha: medir uma depois da outra contaminaria a comparação.
//
// uso: node scripts/medir-luz.mjs [url] [repeticoes] [variantes.json]
//   variantes.json: { "nome": { ...valores de cfg.estilo } }, alternadas na mesma rodada
//   ESTILO_INICIAL='{"arcPinturaAmostras":7}' grava valores de cfg.estilo antes de o jogo carregar
//   (para o que só vale ao recarregar). Uma só Chrome sem janela; PORTA_EXTRA soma na porta.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5204/'
const REPETICOES = Number(process.argv[3] || 3)
const VARIANTES = process.argv[4]
  ? JSON.parse(readFileSync(process.argv[4], 'utf8'))
  : { antes: { arcCeuPintado: 0, arcLuzEstrutura: 0, arcGradeCal: 0 }, depois: { arcCeuPintado: 1, arcLuzEstrutura: 1, arcGradeCal: 1 } }
const ESTILO_INICIAL = JSON.parse(process.env.ESTILO_INICIAL || '{}')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9223 + (Number(process.env.PORTA_EXTRA) || 0)

const perfil = mkdtempSync(join(tmpdir(), 'maresia-luz-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox',
  '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1600,900', 'about:blank',
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
  await cmd('Runtime.enable')
  await cmd('Page.enable')
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      try {
        const chave = 'maresia.config.v8'
        const atual = JSON.parse(localStorage.getItem(chave) || '{}')
        atual.desempenho = { ...(atual.desempenho || {}), renderizador: ${JSON.stringify(process.env.RENDERIZADOR || 'webgpu')} }
        atual.estilo = { ...(atual.estilo || {}), ...${JSON.stringify(ESTILO_INICIAL)} }
        localStorage.setItem(chave, JSON.stringify(atual))
      } catch (e) { console.error('nao deu para gravar o renderizador:', e) }
    })()`,
  })
  await cmd('Page.navigate', { url })

  let pronto = false
  const t0 = Date.now()
  while (Date.now() - t0 < 420000) {
    await dormir(3000)
    const v = (await avaliar('!!(window.__tempos && window.__tempos.fisica)', false)).valor
    if (v) { pronto = true; break }
  }
  if (!pronto) { console.log('--- o jogo NAO montou ---'); codigo = 1 } else {
    console.log('--- o jogo montou ---')
    const r = await avaliar(`(async () => {
      const m = window.maresia
      // o medidor chega por import assíncrono (só no modo dev)
      for (let i = 0; i < 100 && !m.medir; i++) await new Promise((r) => setTimeout(r, 200))
      const e = m.cfg.estilo
      const guardar = { ...e }
      const por = (v) => (m) => {
        Object.assign(e, guardar, v)
        return () => { Object.assign(e, guardar) }
      }
      const res = await m.medir({
        lugares: [[195, 498, -1.5708, 11], [195, 498, -1.5708, 16.5], [694, -20, 0.7, 16.5]],
        quadros: 30, largura: 1600, altura: 900, resolucao: 1.25, repeticoes: ${REPETICOES},
        variantes: Object.fromEntries(Object.entries(${JSON.stringify(VARIANTES)}).map(([k, v]) => [k, por(v)])),
      })
      return JSON.stringify(res)
    })()`)
    console.log('--- medicao ---')
    console.log(r.valor || r.erro)
  }
} finally {
  try { ws?.close() } catch { /* ja fechado */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { try { chrome.kill('SIGKILL') } catch { /* ja morto */ } }
  await dormir(300)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* perfil temporario */ }
}
process.exit(codigo)
