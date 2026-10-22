// Fotos de prova do acabamento (22/10/2026, branch acabamento): a fachada da velha Sé (cal descascada) e as
// esculturas da Praça dos Leões (metal pintado), de perto e de longe, e duas ruas comuns (as casas não podem
// mudar). Câmera fixa, jogo pausado, passos fixos: a foto do código de antes e a do depois saem do mesmo lugar,
// na mesma hora e no mesmo estado do mundo.
//
// uso: RENDERIZADOR=webgpu|webgl PORTA_EXTRA=1500 node scripts/fotos-acabamento.mjs URL PASTA [nome,nome,...]
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5224/'
const PASTA = process.argv[3] || 'docs/capturas/acabamento/tmp'
const SO = process.argv[4] ? process.argv[4].split(',') : null
const RENDERIZADOR = process.env.RENDERIZADOR || 'webgpu'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9223 + (Number(process.env.PORTA_EXTRA) || 0)

// Lugares. 'vista': o ponto do conceito no "Ir para" (câmera do jogo, jogador no quadro). 'escultura': câmera
// livre a 'dist' metros da escultura, do lado da vista dos Leões (o lado ao sol de manhã). 'se': câmera livre
// em coordenada local da Sé (lotes-marcos.js). 'rua': câmera do jogo num ponto de lon/lat.
const LUGARES = [
  { nome: 'se-vista', vista: 'se' },
  { nome: 'se-torre', se: { de: [-12, 14, 1.7], para: [-7.7, -3, 15] }, hora: 9.0 },
  { nome: 'se-quina', se: { de: [-20, 9, 1.7], para: [-11, -3, 6] }, hora: 9.0 },
  ...['leaoSerpente', 'leao', 'tigre', 'general'].flatMap((e) => [5, 20].map((d) => ({ nome: `${e}-${d}m`, escultura: e, dist: d, hora: 9.5 }))),
  { nome: 'rua-oeste', x: 2952.7, z: 1964.6, yaw: 2.2, dist: 7, pitch: 0.12, hora: 15.5 },
  { nome: 'rua-prainha', lon: -38.5230, lat: -3.7240, yaw: -1.0, dist: 7, pitch: 0.12, hora: 9.5 },
  { nome: 'rua-muro', lon: -38.5310, lat: -3.7230, yaw: 1.5, dist: 7, pitch: 0.12, hora: 9.5 },
  // a Estação usa o mesmo reboco dos marcos (por último: não muda o estado do mundo das fotos de antes)
  { nome: 'estacao-vista', vista: 'estacao' },
]

mkdirSync(PASTA, { recursive: true })
const perfil = mkdtempSync(join(tmpdir(), 'maresia-acab-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer', `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1280,720', 'about:blank',
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
    if (m.method === 'Runtime.exceptionThrown') logs.push(`[ERRO] ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`)
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) logs.push(`[${m.params.type}] ${(m.params.args || []).map((a) => a.value ?? a.description).join(' ')}`)
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
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => { try { const k = 'maresia.config.v8'; const a = JSON.parse(localStorage.getItem(k) || '{}');
      a.desempenho = { ...(a.desempenho || {}), renderizador: ${JSON.stringify(RENDERIZADOR)} }; localStorage.setItem(k, JSON.stringify(a)) } catch (e) {} })()`,
  })
  await cmd('Page.navigate', { url })
  const t0 = Date.now()
  let pronto = false
  while (Date.now() - t0 < 300000) {
    await dormir(2000)
    if ((await avaliar('!!(window.__tempos && window.__tempos.fisica)')).valor) { pronto = true; break }
  }
  if (!pronto) throw new Error('o jogo nao montou')
  await avaliar('Promise.race([window.maresia.pronto, new Promise((r) => setTimeout(r, 180000))]).then(() => true)')
  await dormir(4000) // texturas e GLB das esculturas
  const st = await avaliar(`JSON.stringify({ webgpu: maresia.webgpu, quebrados: (window.__shadersQuebrados || []).length })`)
  console.log('estado', st.valor)
  await avaliar(`dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' })); true`) // esconde o painel
  // CFG_EXTRA='{"estilo.arcAresta":0}': muda o cfg antes das fotos (para isolar uma causa; as provas saem sem ele)
  if (process.env.CFG_EXTRA) {
    console.log('cfg extra', (await avaliar(`(() => { const x = ${process.env.CFG_EXTRA}; for (const [k, v] of Object.entries(x)) { const p = k.split('.'); let o = maresia.cfg; while (p.length > 1) o = o[p.shift()]; o[p[0]] = v } return JSON.stringify(x) })()`)).valor)
  }

  for (const l of LUGARES) {
    if (SO && !SO.includes(l.nome)) continue
    const r = await avaliar(`(async () => {
      const m = window.maresia
      const l = ${JSON.stringify(l)}
      m.controle.pausado = true
      m.cfg.tempo.pausado = true
      m.cfg.fatia.travar = false
      const cam = m.cam
      if (!cam._updateOriginal) cam._updateOriginal = cam.update
      cam.update = cam._updateOriginal
      let livre = null // [cx, cy, cz, tx, ty, tz]
      if (l.vista) {
        const { VISTAS_MARCOS } = await import('/src/mundo/vistas-marcos.js')
        const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
        const v = VISTAS_MARCOS[l.vista] || VISTAS[l.vista]
        m.irPara(v.x, v.z, v.yaw, v.hora)
        if (v.pitch != null) cam.pitch = v.pitch
        m.cfg.camera.distancia = 6
      } else if (l.se) {
        const { PEGADAS } = await import('/src/mundo/lotes-marcos.js')
        const p = PEGADAS.se
        const c = Math.cos(p.rot), s = Math.sin(p.rot)
        const w = ([lx, lz]) => [p.x + lx * c + lz * s, p.z - lx * s + lz * c]
        const g = m.cena.getObjectByName('se-velha')
        const y0 = g ? g.position.y : 0
        const [cx, cz] = w([l.se.de[0], l.se.de[1]])
        const [tx, tz] = w([l.se.para[0], l.se.para[1]])
        livre = [cx, y0 + l.se.de[2], cz, tx, y0 + l.se.para[2], tz]
      } else if (l.escultura) {
        const g = m.cena.getObjectByName('escultura-' + l.escultura)
        if (!g) return 'sem escultura ' + l.escultura
        const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
        const v = VISTAS.leoes
        const p = g.getWorldPosition(new g.position.constructor())
        let dx = v.x - p.x, dz = v.z - p.z
        const n = Math.hypot(dx, dz); dx /= n; dz /= n
        const alt = l.escultura === 'general' ? 1.2 : 0.7
        livre = [p.x + dx * l.dist, p.y + alt + (l.dist > 10 ? 1.5 : 0.3), p.z + dz * l.dist, p.x, p.y + alt, p.z]
      } else {
        const fort = await import('/src/mundo/fortaleza1932.js')
        const [x, z] = l.x != null ? [l.x, l.z] : fort.ll(l.lon, l.lat)
        m.irPara(x, z, l.yaw)
        cam.pitch = l.pitch
        m.cfg.camera.distancia = l.dist
      }
      if (l.hora != null) m.cfg.tempo.hora = l.hora
      m.cfg.estilo.dofAutoFoco = !livre
      if (livre) {
        const [cx, cy, cz, tx, ty, tz] = livre
        m.cfg.estilo.dofFocoManual = Math.hypot(cx - tx, cy - ty, cz - tz) // o foco na peça, não no jogador atrás
        // o jogador fica 3 m atrás da câmera (fora do quadro), a câmera é posta à mão a cada passo
        const dx = cx - tx, dz = cz - tz, n = Math.hypot(dx, dz)
        m.irPara(cx + dx / n * 3, cz + dz / n * 3, Math.atan2(dx, dz), l.hora)
        cam.update = () => { cam.camera.position.set(cx, cy, cz); cam.camera.lookAt(tx, ty, tz); cam.camera.updateMatrixWorld() }
      }
      cam.iniciado = false
      for (let i = 0; i < 90; i++) m.passo(1 / 60, false)
      m.passo(1 / 60, true)
      m.passo(1 / 60, true)
      return JSON.stringify({ cam: cam.camera.position.toArray().map((v) => +v.toFixed(1)) })
    })()`)
    await dormir(300)
    const shot = await cmd('Page.captureScreenshot', { format: 'png' })
    writeFileSync(`${PASTA}/${l.nome}.png`, Buffer.from(shot.result.data, 'base64'))
    console.log(l.nome, r.valor || r.erro)
  }
  const fim = await avaliar(`JSON.stringify({ quebrados: window.__shadersQuebrados || [], semLuz: window.__semSaidaLuz || null })`)
  console.log('fim', fim.valor)
} catch (e) {
  console.error(e)
  codigo = 1
} finally {
  const graves = logs.filter((l) => !/Redefinition of node|toNonIndexed|semCache|THREE.Clock/.test(l))
  if (graves.length) console.log(graves.slice(0, 30).join('\n'))
  try { ws?.close() } catch { /* */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { /* */ }
  await dormir(500)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* */ }
  process.exit(codigo)
}
