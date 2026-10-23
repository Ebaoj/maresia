// Fotos de prova da gente (docs/capturas/gente/), feito a partir de scripts/fotos-campo.mjs. Para cada item do
// plano: o ponto de vista do conceito (cena: colunaHora, mercado, estacao, cozinha, galpao), a pessoa mais perto de
// um ponto à frente dele vira o centro, o jogador some e a câmera fica a `dist` metros dela.
// Base: Fotos de prova do Campo do Urubu (e de qualquer lugar): abre o jogo no Chrome sem janela, espera montar,
// e para cada lugar do plano põe a hora, teletransporta, fecha o painel e tira a foto. No fim, confere o
// console: material sem saída de luz (gLuz), shader que não compilou, erro.
//
// uso: node scripts/fotos-campo.mjs URL PLANO.json PASTA [sufixo]
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
const perfil = mkdtempSync(join(tmpdir(), 'maresia-gente-'))
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
  if (process.env.PRE_JS) await cmd('Page.addScriptToEvaluateOnNewDocument', { source: process.env.PRE_JS })
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
    // perfil de CPU: roda o código com o profiler do Chrome ligado e lista as funções que mais gastaram (tempo próprio)
    if (l.perfil) {
      await cmd('Profiler.enable')
      await cmd('Profiler.setSamplingInterval', { interval: 200 })
      await cmd('Profiler.start')
      const r = await avaliar(`(async () => JSON.stringify(await (async () => { ${l.perfil} })()))()`)
      const p = (await cmd('Profiler.stop')).result.profile
      const dt = (p.endTime - p.startTime) / 1000 / p.samples.length
      const proprio = new Map()
      const porId = new Map(p.nodes.map((n) => [n.id, n]))
      for (const id of p.samples) { const n = porId.get(id); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`; proprio.set(k, (proprio.get(k) || 0) + dt) }
      const top = [...proprio].sort((a, b) => b[1] - a[1]).slice(0, l.top || 25).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`)
      console.log(`perfil ${l.nome}:`, r.valor || r.erro)
      console.log(top.join('\n'))
      continue
    }
    // alocação: o mesmo, com o perfil de memória por amostragem (quem aloca mais, em bytes)
    if (l.alocacao) {
      await cmd('HeapProfiler.enable')
      await cmd('HeapProfiler.startSampling', { samplingInterval: 4096 })
      const r = await avaliar(`(async () => JSON.stringify(await (async () => { ${l.alocacao} })()))()`)
      const p = (await cmd('HeapProfiler.stopSampling')).result.profile
      const porFn = new Map()
      const andar = (n, pilha) => {
        const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').slice(-2).join('/')}:${n.callFrame.lineNumber}`
        porFn.set(k, (porFn.get(k) || 0) + n.selfSize)
        for (const c of n.children || []) andar(c)
      }
      andar(p.head)
      console.log(`alocacao ${l.nome}:`, r.valor || r.erro)
      console.log([...porFn].sort((a, b) => b[1] - a[1]).slice(0, l.top || 20).map(([k, v]) => `${(v / 1e6).toFixed(1).padStart(7)} MB  ${k}`).join('\n'))
      continue
    }
    if (l.avaliar) {
      const r = await avaliar(`(async () => JSON.stringify(await (async () => { ${l.avaliar} })()))()`)
      console.log(`conta ${l.nome}:`, r.valor || r.erro)
      continue
    }
    const r = await avaliar(`(async () => {
      const m = window.maresia
      const l = ${JSON.stringify(l)}
      m.controle.pausado = true
      m.cfg.tempo.pausado = true
      m.cfg.fatia.travar = false
      const { VISTAS } = await import('/src/mundo/marcos1932/vistas.js')
      const { VISTAS_MARCOS } = await import('/src/mundo/vistas-marcos.js')
      const L = m.urubu.lugares
      let base
      if (VISTAS[l.cena]) base = VISTAS[l.cena]
      else if (VISTAS_MARCOS[l.cena]) base = VISTAS_MARCOS[l.cena]
      else if (l.cena === 'cozinha') {
        const f = L.filaDaCozinha
        const dx = f.fim.x - f.x, dz = f.fim.z - f.z, n = Math.hypot(dx, dz)
        // de lado para a fila: o alvo fica no meio dela, a câmera ao lado
        const mx = f.x + dx * 0.25, mz = f.z + dz * 0.25
        base = { x: mx, z: mz, hora: 10, alvo: [mx - dz / n, mz + dx / n], yaw: Math.atan2(dz / n, -dx / n) }
      } else if (l.cena === 'galpao') {
        const g = L.redeDaFamilia
        // ao longo do galpão (o eixo u do campo), a câmera dentro, entre as redes
        const u = m.urubu.planta.quadro.u
        base = { x: g.x, z: g.z, hora: 10, alvo: [g.x + u[0], g.z + u[1]], yaw: Math.atan2(-u[0], -u[1]) }
      }
      const hora = l.hora ?? base.hora
      const yaw = base.yaw + (l.yawExtra || 0)
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw)
      const tx = base.x + fx * (l.avanco || 0) + (l.dx || 0), tz = base.z + fz * (l.avanco || 0) + (l.dz || 0)
      // a hora antes de escolher: de noite o movimento do dia some
      m.cfg.tempo.hora = hora
      m.passo(1 / 60, false)
      const p = new m.cena.position.constructor()
      const M = new m.cena.matrix.constructor()
      const cand = []
      if (l.fonte !== 'campo') {
        for (const r of m.pessoas.registro) {
          if (l.estado && r.estado !== l.estado) continue
          p.setFromMatrixPosition(r.matriz)
          cand.push([Math.hypot(p.x - tx, p.z - tz), p.x, p.z])
        }
      } else {
        m.cena.traverse((o) => {
          if (!o.isInstancedMesh || !/^urubu-(gente|povo)$/.test(o.name)) return
          for (let i = 0; i < o.count; i++) {
            o.getMatrixAt(i, M)
            const s = Math.hypot(M.elements[0], M.elements[1], M.elements[2])
            if (s < 0.1 || (l.adulto && s < 0.9)) continue
            p.setFromMatrixPosition(M)
            cand.push([Math.hypot(p.x - tx, p.z - tz), p.x, p.z])
          }
        })
      }
      cand.sort((a, b) => a[0] - b[0])
      const [d0, px, pz] = cand[l.escolha || 0] || [0, tx, tz]
      // recuo: o jogador (escondido) fica entre a câmera e a pessoa, a câmera a 3 m atrás dele, olhando reto: a
      // pessoa fica a l.dist metros da câmera sem a câmera subir para fugir de obstáculo (o que ela faz a 40 m)
      const rec = l.recuo ? Math.max(0, (l.dist ?? 5) - 3) : 0
      m.irPara(px + (l.ox || 0) - fx * rec, pz + (l.oz || 0) - fz * rec, yaw, hora)
      m.jogador.p.raiz.visible = false
      for (const o of m.jogador.multiplos?.raizes || []) o.visible = false
      m.cam.pitch = l.pitch ?? 0.1
      if (l.js) await (async () => { eval(l.js) })()
      m.cfg.camera.distancia = l.recuo ? 3 : (l.dist ?? 5)
      m.cam.iniciado = false
      if (document.querySelector('.lil-gui') && getComputedStyle(document.querySelector('.lil-gui')).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
      for (let i = 0; i < (l.passos ?? 120); i++) { if (m.webgpu) m.renderer._nodes.nodeFrame.update(); m.passo(1 / 60, i % 10 === 9) }
      m.jogador.p.raiz.visible = false
      m.passo(1 / 60, true)
      const info = m.renderer.info
      return JSON.stringify({ alvo: [Math.round(px), Math.round(pz)], dist: +d0.toFixed(1), candidatos: cand.length, atores: (m.atores()?.atores || []).filter((a) => a.pessoa).length,
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
  try { writeFileSync(join(PASTA, 'console.txt'), logs.join('\n')) } catch { /* pasta */ }
  const ruins = logs.filter((s) => /sem saída de luz|não compilaram|ERRO|\[error\]/i.test(s))
  console.log('--- console: avisos de luz, shader e erro ---')
  console.log(ruins.slice(0, 30).join('\n') || '(nenhum)')
  try { ws?.close() } catch { /* fechado */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { try { chrome.kill('SIGKILL') } catch { /* morto */ } }
  await dormir(300)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* temporário */ }
}
process.exit(codigo)
