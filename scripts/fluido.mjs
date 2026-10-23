// Corredor das medições do trabalho "fluido" (22/10/2026, docs/fluido-22-10.md): um Chrome sem janela (WebGPU em
// Metal), o jogo aberto, e uma lista de passos que chamam as funções de scripts/fluido-pagina.js dentro da página.
//
// uso: node scripts/fluido.mjs [url] passos.json [saida.json]
//   passos.json: [{ "fn": "perfil", "args": { "lugar": "coluna" } }, { "foto": "docs/capturas/fluido/x.png", "lugar": "coluna", "cfg": {...} }, ...]
//   RENDERIZADOR=webgl|webgpu (padrão webgpu), JANELA=1600x900, DPR=1.25 (escala do dispositivo: 1600 x 1,25 = 2000 px),
//   CFG_INICIAL='{"desempenho.resolucaoDinamica":true}' grava no localStorage antes de o jogo carregar. PORTA_EXTRA soma na porta.
// Regras da máquina (CLAUDE.md): um Chrome sem janela por vez; com o Joabe jogando (conexão na 5300) não roda.
import { spawn, execSync } from 'node:child_process'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'

const url = process.argv[2] || 'http://localhost:5227/'
const PASSOS = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const SAIDA = process.argv[4] || null
const RENDERIZADOR = process.env.RENDERIZADOR || 'webgpu'
const [LARG, ALT] = (process.env.JANELA || '1600x900').split('x').map(Number)
const DPR = Number(process.env.DPR || 1.25)
const CFG_INICIAL = JSON.parse(process.env.CFG_INICIAL || '{}')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9871 + (Number(process.env.PORTA_EXTRA) || 0)
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const contar = (c) => { try { return Number(execSync(c, { encoding: 'utf8' }).trim()) || 0 } catch { return 0 } }
const joabeJogando = () => contar("lsof -nP -iTCP:5300 -sTCP:ESTABLISHED | grep -c '^Google'")
const outroHeadless = () => contar('pgrep -f "^/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless" | wc -l')
for (;;) {
  const j = joabeJogando(), h = outroHeadless()
  if (!j && !h) break
  console.log(new Date().toISOString().slice(11, 19), `esperando: Joabe jogando=${j}, outro headless=${h}`)
  await dormir(120000)
}

// a porta do protocolo precisa estar livre: com ela ocupada por outro Chrome, o script falaria com a página DELE
if (contar(`lsof -nP -iTCP:${PORTA} -sTCP:LISTEN | grep -c LISTEN`)) { console.error(`porta ${PORTA} ocupada por outro processo; troque PORTA_EXTRA`); process.exit(2) }
// o servidor do jogo precisa estar de pé (em 22/10 ele caiu no meio da noite e quatro rodadas abriram página de erro)
try { const r = await fetch(url); if (!r.ok) throw new Error(r.status) } catch (e) { console.error(`servidor ${url} fora do ar (${e.message})`); process.exit(3) }
const perfil = mkdtempSync(join(tmpdir(), 'maresia-fluido-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer',
  // cronômetro de GPU sem o arredondamento de 100 µs do Chrome (só para medir)
  '--enable-webgpu-developer-features',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  `--window-size=${LARG},${ALT}`, 'about:blank',
], { stdio: 'ignore', detached: true })

let ws = null
let codigo = 0
let passoAtual = false
const logs = []
const resultados = []
try {
  let pagina = null
  for (let i = 0; i < 120 && !pagina; i++) {
    try { pagina = (await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json()).find((t) => t.type === 'page' && t.url === 'about:blank') } catch { /* subindo */ }
    if (!pagina) await dormir(500)
  }
  if (!pagina) throw new Error('chrome nao respondeu')
  ws = new WebSocket(pagina.webSocketDebuggerUrl)
  let seq = 0
  const esperando = new Map()
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id) }
    // a página recarregou (o Vite recarrega quando um arquivo de src muda): a medição em curso não vale mais
    if (m.method === 'Runtime.executionContextsCleared' && passoAtual) { logs.push('[ERRO] a página recarregou no meio do passo'); for (const f of esperando.values()) f({ error: { message: 'pagina recarregou' } }); esperando.clear() }
    if (m.method === 'Runtime.exceptionThrown') logs.push(`[ERRO] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`)
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`[${m.params.type}] ${(m.params.args || []).map((a) => a.value ?? a.description).join(' ')}`)
  })
  await new Promise((r) => ws.addEventListener('open', r))
  const cmd = (method, params = {}) => new Promise((r) => { const id = ++seq; esperando.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
  const avaliar = async (expression) => {
    const r = await Promise.race([cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }), dormir(1500000).then(() => ({ error: { message: 'passo passou de 25 min' } }))])
    if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
    if (r.error || r.result?.result?.value === undefined) return { erro: JSON.stringify(r).slice(0, 600) }
    return { valor: r.result?.result?.value }
  }
  await cmd('Runtime.enable')
  await cmd('Page.enable')
  await cmd('Emulation.setDeviceMetricsOverride', { width: LARG, height: ALT, deviceScaleFactor: DPR, mobile: false })
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { try { const k = 'maresia.config.v8'; const a = JSON.parse(localStorage.getItem(k) || '{}');
      a.desempenho = { ...(a.desempenho || {}), renderizador: ${JSON.stringify(RENDERIZADOR)} };
      for (const [c, v] of Object.entries(${JSON.stringify(CFG_INICIAL)})) { const p = c.split('.'); let o = a; while (p.length > 1) { const s = p.shift(); o = (o[s] ||= {}) } o[p[0]] = v }
      localStorage.setItem(k, JSON.stringify(a)) } catch (e) {} })()`,
  })
  const tAbre = Date.now()
  await cmd('Page.navigate', { url })
  let pronto = false
  while (Date.now() - tAbre < 420000) {
    await dormir(2000)
    if ((await avaliar('!!(window.__tempos && window.__tempos.fisica)')).valor) { pronto = true; break }
  }
  if (!pronto) {
    const est = await avaliar(`JSON.stringify({ tempos: window.__tempos || null, url: location.href, carregando: document.getElementById('carregando')?.className, maresia: !!window.maresia })`)
    console.log('nao montou', est.valor || est.erro, logs.slice(0, 20).join('\n'))
    throw new Error('o jogo nao montou')
  }
  await avaliar('Promise.race([window.maresia.pronto, new Promise((r) => setTimeout(r, 180000))]).then(() => true)')
  await dormir(4000)
  const st = await avaliar(`JSON.stringify({ webgpu: maresia.webgpu, abrir_s: ${(Date.now() - tAbre) / 1000}, primeiroQuadroMs: window.__primeiroQuadroMs, quebrados: (window.__shadersQuebrados || []).length, faltaPortar: (window.__faltaPortar || []).length, timestamp: !!maresia.renderer.backend?.device?.features?.has('timestamp-query'), w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`)
  console.log('estado', st.valor || st.erro)
  resultados.push({ estado: JSON.parse(st.valor || '{}') })
  await avaliar(`dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' })); true`) // esconde o painel

  for (const p of PASSOS) {
    const t0 = Date.now()
    passoAtual = true
    if (p.foto) {
      // foto do jogo parado no lugar (o painel escondido), com remendo de cfg opcional
      const r = await avaliar(`(async () => {
        const f = await import('/scripts/fluido-pagina.js')
        const g = window.maresia
        g.controle.pausado = true
        g.cfg.tempo.pausado = true
        window.__desfazFoto = f.remendar(${JSON.stringify(p.cfg || {})})
        dispatchEvent(new Event('resize'))
        await f.ir(${JSON.stringify(p.lugar)}, { passos: 90 })
        return JSON.stringify(f.contagens())
      })()`)
      await dormir(400)
      const shot = await cmd('Page.captureScreenshot', { format: 'png' })
      mkdirSync(dirname(p.foto), { recursive: true })
      writeFileSync(p.foto, Buffer.from(shot.result.data, 'base64'))
      await avaliar(`(() => { window.__desfazFoto?.(); dispatchEvent(new Event('resize')); window.maresia.controle.pausado = false; return true })()`)
      console.log('foto', p.foto, r.valor || r.erro)
      resultados.push({ foto: p.foto, r: r.valor || r.erro })
      continue
    }
    if (p.js) {
      const r = await avaliar(p.js)
      console.log('js', JSON.stringify(r).slice(0, 400))
      resultados.push({ js: p.js.slice(0, 80), r })
      continue
    }
    const r = await avaliar(`(async () => {
      const f = await import('/scripts/fluido-pagina.js')
      return JSON.stringify(await f[${JSON.stringify(p.fn)}](${JSON.stringify(p.args || {})}))
    })()`)
    const valor = r.valor ? JSON.parse(r.valor) : { erro: r.erro }
    console.log(`--- ${p.fn} ${JSON.stringify(p.args || {})} (${((Date.now() - t0) / 1000).toFixed(0)} s)`)
    console.log(JSON.stringify(valor, null, 1))
    resultados.push({ fn: p.fn, args: p.args, valor })
  }
  const fim = await avaliar(`JSON.stringify({ quebrados: window.__shadersQuebrados || [], faltaPortar: window.__faltaPortar || [] })`)
  console.log('fim', fim.valor)
} catch (e) {
  console.error(e)
  codigo = 1
} finally {
  const graves = logs.filter((l) => !/Redefinition of node|toNonIndexed|semCache|THREE.Clock/.test(l))
  if (graves.length) console.log(graves.slice(0, 30).join('\n'))
  if (SAIDA) writeFileSync(SAIDA, JSON.stringify({ quando: new Date().toISOString(), renderizador: RENDERIZADOR, janela: `${LARG}x${ALT}@${DPR}`, resultados, logs: graves.slice(0, 50) }, null, 1))
  try { ws?.close() } catch { /* */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { /* */ }
  await dormir(500)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* */ }
  process.exit(codigo)
}
