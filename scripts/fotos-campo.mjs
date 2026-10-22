// Fotos de prova do Campo do Urubu (e de qualquer lugar): abre o jogo no Chrome sem janela, espera montar,
// e para cada lugar do plano põe a hora, teletransporta, fecha o painel e tira a foto. No fim, confere o
// console: material sem saída de luz (gLuz), shader que não compilou, erro.
//
// uso: node scripts/fotos-campo.mjs URL PLANO.json PASTA [sufixo]
//   PLANO: [{ "nome": "portao-10h", "x": 1900, "z": 1110, "yaw": 0.6, "pitch": 0.05, "dist": 4.5, "hora": 10 }]
//          "info": true  -> também guarda objetos, chamadas e triângulos do quadro (renderer.info)
// Variáveis: RENDERIZADOR=webgpu|webgl (padrão webgpu), PORTA_EXTRA (soma na porta do CDP),
//   CONFIG='{"mundo":{"urubu":{"gente":0}}}' (grupos do config mesclados no salvo antes de abrir; 1 nível).
// Espera não haver outro Chrome sem janela na máquina antes de abrir o seu (uma GPU, um medidor por vez).
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url = 'http://localhost:5217/', planoArq, PASTA = '/tmp', sufixo = ''] = process.argv.slice(2)
const plano = JSON.parse(readFileSync(planoArq, 'utf8'))
const RENDERIZADOR = process.env.RENDERIZADOR || 'webgpu'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9223 + (Number(process.env.PORTA_EXTRA) || 0)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// um Chrome sem janela por vez na máquina
for (let i = 0; i < 120; i++) {
  let n = 0
  try { n = execSync('pgrep -f "^/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless" | wc -l').toString().trim() | 0 } catch { n = 0 }
  if (!n) break
  if (i === 0) console.log('esperando outro Chrome sem janela terminar...')
  await dormir(15000)
}

mkdirSync(PASTA, { recursive: true })
const perfil = mkdtempSync(join(tmpdir(), 'maresia-campo-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', detached: true })

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
    if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ${(m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')}`)
    if (m.method === 'Runtime.exceptionThrown') logs.push(`[ERRO] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`)
  })
  await new Promise((r) => ws.addEventListener('open', r))
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++seq; esperando.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
  const avaliar = async (expression) => {
    const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
    return { valor: r.result?.result?.value }
  }
  await cmd('Runtime.enable')
  await cmd('Page.enable')
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { try { const k = 'maresia.config.v8'; const a = JSON.parse(localStorage.getItem(k) || '{}');
      a.desempenho = { ...(a.desempenho || {}), renderizador: ${JSON.stringify(RENDERIZADOR)} }
      const extra = ${process.env.CONFIG || '{}'}
      for (const [g, v] of Object.entries(extra)) a[g] = typeof v === 'object' ? { ...(a[g] || {}), ...v } : v
      localStorage.setItem(k, JSON.stringify(a)) } catch (e) { console.error(e) } })()`,
  })
  await cmd('Page.navigate', { url })
  let pronto = false
  for (let t0 = Date.now(); Date.now() - t0 < 300000;) {
    await dormir(2000)
    if ((await avaliar('!!(window.__tempos && window.__tempos.fisica && window.maresia)')).valor) { pronto = true; break }
  }
  if (!pronto) throw new Error('o jogo nao montou')
  await dormir(3000)
  await avaliar('window.maresia.pronto')
  console.log('renderizador:', (await avaliar('String(window.maresia.webgpu)')).valor === 'true' ? 'webgpu' : 'webgl')
  for (const l of plano) {
    const r = await avaliar(`(async () => {
      const m = window.maresia
      m.controle.pausado = true
      m.cfg.tempo.pausado = true
      m.cfg.fatia.travar = false
      let x = ${l.x ?? 'null'}, z = ${l.z ?? 'null'}, yaw = ${l.yaw ?? 0}
      // no quadro do Campo do Urubu (u ao longo da cerca do portão, w para dentro): urubu-planta.js
      if (${l.u ?? 'null'} !== null) {
        const { PLANTA } = await import('/src/mundo/urubu-planta.js')
        ;[x, z] = PLANTA.quadro.mundo(${l.u ?? 0}, ${l.w ?? 0})
        if (${l.alvoU ?? 'null'} !== null) {
          const [tx, tz] = PLANTA.quadro.mundo(${l.alvoU ?? 0}, ${l.alvoW ?? 0})
          yaw = Math.atan2(-(tx - x), -(tz - z))
        }
      }
      m.irPara(x, z, yaw, ${l.hora ?? 10})
      m.cam.pitch = ${l.pitch ?? 0.1}
      m.cfg.camera.distancia = ${l.dist ?? 5}
      m.cam.iniciado = false
      if (document.querySelector('.lil-gui') && getComputedStyle(document.querySelector('.lil-gui')).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
      for (let i = 0; i < ${l.passos ?? 120}; i++) m.passo(1 / 60, i % 10 === 9)
      m.passo(1 / 60, true)
      const info = m.renderer.info
      let objetos = 0
      m.cena.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) objetos++ })
      return JSON.stringify({ jogador: m.jogador.pos.toArray().map((v) => Math.round(v)), objetos,
        chamadas: info.render.drawCalls ?? info.render.calls, triangulos: info.render.triangles })
    })()`)
    const shot = await cmd('Page.captureScreenshot', { format: 'png' })
    const nome = `${l.nome}${sufixo}`
    if (shot.result?.data) writeFileSync(join(PASTA, `${nome}.png`), Buffer.from(shot.result.data, 'base64'))
    console.log(`foto ${nome}:`, r.valor || r.erro)
  }
  const fim = await avaliar(`JSON.stringify({ quebrados: (window.__shadersQuebrados || []).length, nomes: (window.__shadersQuebrados || []).slice(0, 5).map(String) })`)
  console.log('shaders quebrados:', fim.valor || fim.erro)
} catch (e) {
  console.log('FALHOU:', e.message)
  codigo = 1
} finally {
  const ruins = logs.filter((s) => /sem saída de luz|não compilaram|ERRO|\[error\]/i.test(s))
  console.log('--- console: avisos de luz, shader e erro ---')
  console.log(ruins.slice(0, 30).join('\n') || '(nenhum)')
  try { ws?.close() } catch { /* fechado */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { try { chrome.kill('SIGKILL') } catch { /* morto */ } }
  await dormir(300)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* temporário */ }
}
process.exit(codigo)
