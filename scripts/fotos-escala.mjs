// Fotos de prova da escala do centro (v16, docs/mapa-1932.md): a mesma máquina de scripts/fotos-campo.mjs, com
// mais três tipos de item no plano:
//   { "nome": "v-colunaHora", "vista": "colunaHora" }            o ponto de vista do "Ir para" (marcos e Campo do Urubu)
//   { "nome": "t-centro", "topo": { "lon": -38.5276, "lat": -3.7275, "largura": 1400 } }
//        vista de cima, câmera reta para baixo a 900 m; grava também PASTA/nome.json com o recorte (o centro no
//        jogo, a largura em unidades), para sobrepor a planta oficial (scripts/diagnostico/sobrepor-planta.mjs)
//   { "nome": "...", "lon": .., "lat": .., "yaw": .., "dist": .. }  um lugar de verdade
//
// uso: node scripts/fotos-escala.mjs URL PLANO.json PASTA [sufixo]
//   PLANO: [{ "nome": "portao-10h", "x": 1900, "z": 1110, "yaw": 0.6, "pitch": 0.05, "dist": 4.5, "hora": 10 }]
//          { "nome": "custo", "avaliar": "return await maresia.medir(...)" } -> só a conta, sem foto
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
const perfil = mkdtempSync(join(tmpdir(), 'maresia-escala-'))
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
    // item de conta, sem foto: { "nome": "...", "avaliar": "await maresia.medir(...)" } (o resultado vai para o console)
    if (l.avaliar) {
      const r = await avaliar(`(async () => JSON.stringify(await (async () => { ${l.avaliar} })()))()`)
      console.log(`conta ${l.nome}:`, r.valor || r.erro)
      continue
    }
    const r = await avaliar(`(async () => {
      const m = window.maresia
      m.controle.pausado = true
      m.cfg.tempo.pausado = true
      m.cfg.fatia.travar = false
      const fort = await import('/src/mundo/fortaleza1932.js')
      let x = ${l.x ?? 'null'}, z = ${l.z ?? 'null'}, yaw = ${l.yaw ?? 0}, hora = ${l.hora ?? 10}, pitch = ${l.pitch ?? 0.1}
      const topo = ${JSON.stringify(l.topo || null)}
      if (${l.lon ?? 'null'} !== null) [x, z] = fort.ll(${l.lon ?? 0}, ${l.lat ?? 0})
      if (topo) [x, z] = fort.ll(topo.lon, topo.lat)
      if (${JSON.stringify(l.vista || null)}) {
        const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
        const { VISTAS_MARCOS } = await import('/src/mundo/vistas-marcos.js')
        const { VISTAS_URUBU } = await import('/src/mundo/urubu-lugares.js')
        const v = VISTAS_MARCOS[${JSON.stringify(l.vista || '')}] || VISTAS[${JSON.stringify(l.vista || '')}] || VISTAS_URUBU[${JSON.stringify(l.vista || '')}]
        x = v.x; z = v.z; yaw = v.yaw
        if (v.hora != null && ${l.hora ?? 'null'} === null) hora = v.hora
        if (v.pitch != null && ${l.pitch ?? 'null'} === null) pitch = v.pitch
      }
      m.irPara(x, z, yaw, hora)
      m.cam.pitch = pitch
      m.cfg.camera.distancia = ${l.dist ?? 5}
      m.cam.iniciado = false
      if (document.querySelector('.lil-gui') && getComputedStyle(document.querySelector('.lil-gui')).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
      // a foto é do mundo: o letreiro do bairro, a ajuda e o contador saem
      for (const e of document.querySelectorAll('body *')) if (e.tagName !== 'CANVAS' && !e.querySelector('canvas')) e.style.visibility = 'hidden'
      for (let i = 0; i < ${l.passos ?? 120}; i++) m.passo(1 / 60, i % 10 === 9)
      m.passo(1 / 60, true)
      let recorte = null
      if (topo) {
        // a câmera reta para baixo, a ALTO metros, com a abertura que cobre a largura pedida
        const ALTO = topo.altura || 900
        const cam = m.cam.camera
        const aspecto = innerWidth / innerHeight
        const fovAntes = cam.fov
        cam.fov = 2 * Math.atan(topo.largura / aspecto / 2 / ALTO) * 180 / Math.PI
        cam.position.set(x, ALTO, z)
        cam.up.set(0, 0, -1)
        cam.lookAt(x, 0, z)
        cam.updateProjectionMatrix()
        cam.updateMatrixWorld()
        m.cena.updateMatrixWorld()
        // o horizonte (serras, céu, telhados ao longe: renderOrder negativo) é um anel em volta da câmera; visto
        // de 900 m ele vira uma faixa por cima do mapa. Sai da foto de cima
        const escondidos = []
        m.cena.traverse((o) => { if ((o.isMesh || o.isSprite) && o.visible && o.renderOrder < 0) { o.visible = false; escondidos.push(o) } })
        m.pos.render(1, 0)
        m.pos.render(1, 0)
        for (const o of escondidos) o.visible = true
        recorte = { x, z, largura: topo.largura, altura: topo.largura / aspecto, lon: topo.lon, lat: topo.lat }
        cam.up.set(0, 1, 0)
        cam.fov = fovAntes
      }
      const info = m.renderer.info
      let objetos = 0
      m.cena.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) objetos++ })
      return JSON.stringify({ jogador: m.jogador.pos.toArray().map((v) => Math.round(v)), objetos, recorte,
        chamadas: info.render.drawCalls ?? info.render.calls, triangulos: info.render.triangles })
    })()`)
    const shot = await cmd('Page.captureScreenshot', { format: 'png' })
    const nome = `${l.nome}${sufixo}`
    if (shot.result?.data) writeFileSync(join(PASTA, `${nome}.png`), Buffer.from(shot.result.data, 'base64'))
    try { const o = JSON.parse(r.valor); if (o.recorte) writeFileSync(join(PASTA, `${nome}.json`), JSON.stringify(o.recorte)) } catch { /* sem recorte */ }
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
