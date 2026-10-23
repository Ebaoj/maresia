// Foto de uma página do jogo (bancadas): abre no Chrome sem janela, espera window.__pronto e salva a tela.
// uso: node scripts/foto-pagina.mjs URL SAIDA.png [largura] [altura]   (PORTA_EXTRA soma na porta do CDP)
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, saida, larg = 1600, alt = 700] = process.argv.slice(2)
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9323 + (Number(process.env.PORTA_EXTRA) || 0)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const perfil = mkdtempSync(join(tmpdir(), 'maresia-pagina-'))
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--use-angle=metal', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`, `--window-size=${larg},${alt}`, 'about:blank'], { stdio: 'ignore', detached: true })
let codigo = 0
try {
  let pagina = null
  for (let i = 0; i < 60 && !pagina; i++) { try { pagina = (await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()).find((t) => t.type === 'page') } catch {} if (!pagina) await dormir(300) }
  const ws = new WebSocket(pagina.webSocketDebuggerUrl)
  await new Promise((r) => ws.addEventListener('open', r))
  let seq = 0
  const esp = new Map()
  const logs = []
  ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && esp.has(m.id)) { esp.get(m.id)(m); esp.delete(m.id) } if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(m.params.args.map((a) => a.value ?? a.description).join(' ')) })
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++seq; esp.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
  await cmd('Runtime.enable')
  await cmd('Page.enable')
  await cmd('Page.navigate', { url })
  let pronto = null
  for (let i = 0; i < 100 && !pronto; i++) { await dormir(300); pronto = (await cmd('Runtime.evaluate', { expression: 'JSON.stringify(window.__pronto || null)', returnByValue: true })).result?.result?.value; if (pronto === 'null') pronto = null }
  console.log('pronto:', pronto, logs.slice(0, 5).join(' | '))
  const shot = await cmd('Page.captureScreenshot', { format: 'png' })
  writeFileSync(saida, Buffer.from(shot.result.data, 'base64'))
  ws.close()
} catch (e) { console.log('FALHOU', e.message); codigo = 1 } finally {
  try { process.kill(-chrome.pid, 'SIGKILL') } catch {}
  await dormir(200)
  try { rmSync(perfil, { recursive: true, force: true }) } catch {}
}
process.exit(codigo)
