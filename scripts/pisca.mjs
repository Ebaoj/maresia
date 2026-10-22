// Cintilação (pisca, 22/10/2026, docs/pisca-22-10.md): grava quadros PNG do mesmo lugar em quatro situações
// (parado sem tempo, parado com tempo, giro lento, andando) e em variantes do cfg, para separar as causas do
// "pisca" com o mapa de pixels que mudam e voltam (scripts/pisca-mapa.py).
//
// uso: node scripts/pisca.mjs URL PLANO.json PASTA
// PLANO: {
//   "lugar": { "x": 3158, "z": 1467, "yaw": 1.265, "hora": 15, "pitch": 0.2, "dist": 5 },
//   "segundos": 2, "fps": 30, "assentar": 60,
//   "situacoes": ["parado", "tempo", "giro", "andando"],
//   "modos": ["gravar", "raf"],
//   "variantes": { "base": {}, "semPintura": { "estilo": { "arcPintura": 0 } }, "x": { "js": "m.cfg.x = 1" },
//                  "ssaa": { "ssaa": [2560, 1154] } }   (ssaa: desenho em tamanho fixo maior; o mapa reduz com --largura)
// }
// Modos (como cada quadro é avançado):
//   gravar  passos seguidos, como o maresia.gravar de 4195ad2: o quadro do three (nodeFrame) não anda entre eles
//   quadro  como o maresia.medir: nodeFrame.update() antes de cada passo
//   raf     um passo por quadro do navegador (requestAnimationFrame), como o jogo de verdade
//   gravarReal  chama o próprio maresia.gravar (JPEG, em docs/capturas/video/pisca-<situacao>-<variante>/ do worktree
//           que o servidor serve); "parado" ali tem o relógio parado, mas a animação anda
// Sai PASTA/<situacao>-<modo>-<variante>/q0000.png ...
// Variáveis: RENDERIZADOR ('webgpu' padrão ou 'webgl'), PORTA_EXTRA (soma na porta do CDP).
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5222/'
const plano = JSON.parse(readFileSync(process.argv[3], 'utf8'))
const PASTA = process.argv[4] || 'docs/capturas/pisca/quadros'
const RENDERIZADOR = process.env.RENDERIZADOR || 'webgpu'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9223 + (Number(process.env.PORTA_EXTRA) || 0)

mkdirSync(PASTA, { recursive: true })
const perfil = mkdtempSync(join(tmpdir(), 'maresia-pisca-'))
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
  const avaliar = async (expression, prazo = 600000) => {
    const r = await Promise.race([cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, nao) => setTimeout(() => nao(new Error('a página não respondeu em ' + prazo / 1000 + ' s')), prazo))])
    if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
    return { valor: r.result?.result?.value }
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
  await dormir(2500)
  console.log('estado:', (await avaliar('JSON.stringify({ webgpu: window.maresia?.webgpu ?? null, quebrados: window.__shadersQuebrados || [] })')).valor)
  if (!pronto) { console.log('--- o jogo NAO montou ---'); codigo = 1 }

  const L = plano.lugar
  const fps = plano.fps ?? 30
  const quadros = Math.round((plano.segundos ?? 2) * fps)
  if (pronto) {
    const padrao = (await avaliar('JSON.stringify({ estilo: window.maresia.cfg.estilo, mundo: window.maresia.cfg.mundo, desempenho: window.maresia.cfg.desempenho, camera: window.maresia.cfg.camera, tempo: window.maresia.cfg.tempo })')).valor
    for (const sit of plano.situacoes || ['parado', 'tempo', 'giro', 'andando']) {
      for (const modo of plano.modos || ['raf']) {
        for (const [nv, v] of Object.entries(plano.variantes || { base: {} })) {
          const pasta = join(PASTA, `${sit}-${modo}-${nv}`)
          mkdirSync(pasta, { recursive: true })
          const expr = `(async () => {
            const m = window.maresia
            const p = ${padrao}
            for (const k of Object.keys(p)) Object.assign(m.cfg[k], p[k])
            m.controle.pausado = true
            m.cfg.fatia.travar = false
            const lil = document.querySelector('.lil-gui')
            if (lil && getComputedStyle(lil).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
            const v = ${JSON.stringify(v)}
            for (const k of ['estilo', 'mundo', 'desempenho', 'camera']) if (v[k]) Object.assign(m.cfg[k], v[k])
            m.tamanhoFixo(${v.ssaa ? `${v.ssaa[0]}, ${v.ssaa[1]}` : 0})
            ${v.js || ''}
            for (const k in m.teclas) m.teclas[k] = false
            m.irPara(${L.x}, ${L.z}, ${L.yaw ?? 0}, ${L.hora ?? 15})
            m.cfg.tempo.hora = ${L.hora ?? 15}
            m.cam.pitch = ${L.pitch ?? 0.2}
            m.cfg.camera.distancia = ${L.dist ?? 5}
            m.cam.iniciado = false
            const quadroNovo = () => { if (m.webgpu) m.renderer._nodes.nodeFrame.update() }
            const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
            // assenta (câmera, streaming, LOD, cache de sombra) do mesmo jeito em todas as gravações
            for (let i = 0; i < ${plano.assentar ?? 60}; i++) { await raf(); m.passo(1 / 60) }
            const sit = ${JSON.stringify(sit)}, modo = ${JSON.stringify(modo)}
            m.cfg.tempo.pausado = sit === 'parado'
            const dt = sit === 'parado' ? 1e-6 : 1 / ${fps}
            window.__q = []
            if (modo === 'gravarReal') {
              // o próprio maresia.gravar (JPEG para docs/capturas/video/<nome>/ do worktree servido): o caminho que fez
              // o vídeo que o Joabe viu
              const r = await m.gravar({ nome: ${JSON.stringify(`pisca-${sit}-${nv}`)}, segundos: ${quadros} / ${fps}, fps: ${fps},
                roteiro: (t, mm) => { if (sit === 'giro') mm.cam.yaw += 0.2 / ${fps}; mm.teclas.frente = sit === 'andando' } })
              m.controle.pausado = false
              return -r.quadros
            }
            for (let i = 0; i < ${quadros}; i++) {
              if (sit === 'giro') m.cam.yaw += 0.2 / ${fps}
              m.teclas.frente = sit === 'andando'
              if (modo === 'raf') await raf()
              if (modo === 'quadro') quadroNovo()
              m.passo(dt)
              window.__q.push(m.canvas.toDataURL('image/png'))
            }
            for (const k in m.teclas) m.teclas[k] = false
            m.controle.pausado = false
            return window.__q.length
          })()`
          const r = await avaliar(expr)
          if (r.erro) { console.log(sit, modo, nv, 'ERRO', r.erro); codigo = 1; continue }
          if (r.valor < 0) { console.log(`${sit}-${modo}-${nv}: ${-r.valor} quadros em docs/capturas/video/pisca-${sit}-${nv}/ (do worktree servido)`); continue }
          for (let i = 0; i < r.valor; i += 2) {
            const lote = (await avaliar(`window.__q.slice(${i}, ${i + 2})`)).valor || []
            lote.forEach((d, k) => writeFileSync(join(pasta, `q${String(i + k).padStart(4, '0')}.png`), Buffer.from(d.split(',')[1], 'base64')))
          }
          await avaliar('window.__q = null, 1')
          console.log(`${sit}-${modo}-${nv}: ${r.valor} quadros`)
        }
      }
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
