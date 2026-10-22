// Fotos e vídeo da profundidade de campo (src/pos/profundidade.js): o mesmo lugar, a mesma câmera e o mesmo instante
// com variantes do cfg.estilo (desligada, ligada antes da pincelada, depois...). Cada variante sai logo depois da
// anterior, na mesma sessão, para a luz e a gente serem as mesmas e a diferença ser só o efeito.
//
// uso: node scripts/fotos-profundidade.mjs URL PLANO.json PASTA
// PLANO: {
//   "variantes": { "off": { "dof": false }, "on": { "dof": true } },
//   "lugares": [ { "nome": "coluna", "lugar": "pracaFerreira", "vista": "colunaHora", "passos": 90 },
//                { "nome": "rua", "x": 0, "z": 0, "yaw": 0, "hora": 12, "pitch": 0.2, "dist": 5 } ],
//   "videos": [{ "nome": "andando", "segundos": 6, "fps": 30, "lugar": {...}, "cfg": {...}, "roteiro": "(t, m) => { m.teclas.frente = true }" }]
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

// roda na página: grava os pares ligado/desligado em docs/capturas/video/<nome>-on e -off (gravador do modo dev)
const PARES = `async (nome, segundos, fps, roteiro) => {
  const m = window.maresia
  const V3 = m.cam.alvo.constructor // o Vector3 do jogo (importar o three de novo daria uma segunda cópia)
  const { alturaChao } = await import('/src/mundo/colisao.js')
  const cv = m.canvas
  cv.setPointerCapture = () => {} // o evento sintético não tem ponteiro ativo para capturar
  let px = 0, py = 0, arr = false
  const ev = {
    tecla: (code, baixo) => dispatchEvent(new KeyboardEvent(baixo ? 'keydown' : 'keyup', { code, key: code })),
    arrasta: (dx, dy) => {
      if (!arr) { arr = true; px = 640; py = 360; cv.dispatchEvent(new PointerEvent('pointerdown', { clientX: px, clientY: py, pointerId: 1, bubbles: true })) }
      px += dx; py += dy
      cv.dispatchEvent(new PointerEvent('pointermove', { clientX: px, clientY: py, pointerId: 1, bubbles: true }))
    },
    solta: () => { if (arr) { arr = false; cv.dispatchEvent(new PointerEvent('pointerup', { clientX: px, clientY: py, pointerId: 1, bubbles: true })) } },
    roda: (dy) => cv.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true })),
  }
  const e = m.cfg.estilo
  const base = m.pos.base || m.pos
  m.controle.pausado = true
  const dt = 1 / fps, total = Math.round(segundos * fps)
  const envios = [], quadros = []
  const v = new V3(), fr = new V3(), w = new V3()
  const ossos = []
  m.jogador.p.raiz.traverse((o) => { if (o.isBone) ossos.push(o) })
  const naTela = (p) => { v.copy(p).project(m.cam.camera); return [(v.x + 1) / 2 * cv.width, (1 - v.y) / 2 * cv.height, v.z] }
  const mandar = (sufixo, i) => {
    envios.push(fetch('/__quadro?nome=' + encodeURIComponent(nome + '-' + sufixo) + '&n=' + i, { method: 'POST', body: cv.toDataURL('image/jpeg', 0.95) }))
  }
  try {
    for (let i = 0; i < total; i++) {
      roteiro(i * dt, m, ev)
      e.dof = true
      m.passo(dt)
      mandar('on', i)
      // regiões, com a câmera deste quadro
      const cam = m.cam.camera
      // a caixa do jogador na tela: os ossos do corpo visível projetados
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
      for (const o of ossos) {
        const [sx, sy] = naTela(o.getWorldPosition(w))
        x0 = Math.min(x0, sx); y0 = Math.min(y0, sy); x1 = Math.max(x1, sx); y1 = Math.max(y1, sy)
      }
      cam.getWorldDirection(fr)
      const foco = fr.dot(v.copy(m.cam.alvo).sub(cam.position))
      const fh = new V3(fr.x, 0, fr.z).normalize()
      const distH = Math.hypot(m.cam.alvo.x - cam.position.x, m.cam.alvo.z - cam.position.z)
      const chao = {}
      for (const [k, fator] of [['meio', 0.5], ['dobro', 2], ['quadruplo', 4]]) {
        const p = cam.position.clone().addScaledVector(fh, distH * fator)
        p.y = alturaChao(p.x, p.z) + 0.05
        const [sx, sy, sz] = naTela(p)
        chao[k] = { x: sx, y: sy, z: sz, d: fr.dot(p.clone().sub(cam.position)) }
      }
      if (i === 0) { const c = document.createElement('canvas'); c.width = 8; c.height = 8; const g = c.getContext('2d'); g.drawImage(cv, 0, 0, 8, 8); console.warn('primeiro quadro, brilho:', [...g.getImageData(0, 0, 8, 8).data].reduce((a, b) => a + b, 0)) }
      quadros.push({ i, jogador: [x0, y0, x1, y1], foco, focoDof: base.estadoFoco.foco, dist: m.cam.dist, pitch: m.cam.pitch, fov: cam.fov, chao, w: cv.width, h: cv.height })
      // o mesmo quadro desligado: só o filtro de novo, sem andar o jogo
      e.dof = false
      m.pos.render(base.estadoFoco.tempo, 0)
      mandar('off', i)
      e.dof = true
      if (envios.length > 16) await envios.shift()
    }
    await Promise.all(envios)
  } finally {
    ev.solta()
    for (const k in m.teclas) m.teclas[k] = false
    e.dof = true
    m.controle.pausado = false
  }
  return JSON.stringify({ nome, fps, quadros })
}`
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
  // com prazo: uma página travada (GPU disputada) prendia o Chrome sem fim e bloqueava as outras sessões
  const avaliar = async (expression, prazo = 600000) => {
    const r = await Promise.race([cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }),
      new Promise((_, nao) => setTimeout(() => nao(new Error('a página não respondeu em ' + prazo / 1000 + ' s')), prazo))])
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
    for (const v of plano.videos || (plano.video ? [plano.video] : [])) {
      if (v.lugar) console.log('video lugar:', (await avaliar(posicionar(v.lugar))).valor)
      if (v.cfg) await avaliar(variante(v.cfg))
      const r = await avaliar(`window.maresia.gravar({ nome: ${JSON.stringify(v.nome)}, segundos: ${v.segundos ?? 6}, fps: ${v.fps ?? 30}, roteiro: ${v.roteiro || '() => {}'} }).then((x) => JSON.stringify(x))`)
      console.log('video:', r.valor || r.erro)
      await avaliar(`Object.assign(window.maresia.cfg.estilo, ${padrao}), 'ok'`)
    }
    // pares: o mesmo quadro desenhado ligado e desligado (sem andar o jogo entre os dois), com entrada de verdade
    // (teclado, arrastar e roda do mouse pelos mesmos ouvintes do jogo) e as regiões medidas: a caixa do jogador na
    // tela e manchas do chão a 0,5x e 2x a distância do jogador, na direção da câmera
    for (const v of plano.pares || []) {
      if (v.lugar) console.log('par lugar:', (await avaliar(posicionar(v.lugar))).valor)
      const r = await avaliar(`(${PARES})(${JSON.stringify(v.nome)}, ${v.segundos ?? 6}, ${v.fps ?? 30}, ${v.roteiro || '() => {}'})`)
      if (r.erro) console.log('par', v.nome, r.erro)
      else { writeFileSync(join(PASTA, `${v.nome}.json`), r.valor); console.log('par', v.nome, 'quadros:', JSON.parse(r.valor).quadros.length) }
      await avaliar(`Object.assign(window.maresia.cfg.estilo, ${padrao}), 'ok'`)
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
