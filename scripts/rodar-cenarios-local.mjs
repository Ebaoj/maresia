// A suíte de regressão do jogo rodando, no Mac, com a GPU real.
//
// Decisão do Joabe (20/10/2026): a suíte de regressão passa a rodar no Mac, com a GPU de verdade
// (WebGPU em Metal), em vez de depender da L4 do Modal. Os mesmos cenários de
// testes/jogo/cenarios.js, os mesmos critérios, o mesmo console verificado.
//
// A janela é 1280 × 720, como na execução da T4 que valiou o M1 (18/10/2026).
//
// uso: node scripts/rodar-cenarios-local.mjs [url] [cenario,cenario,...]
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5195/'
const ORDEM = ['semErros', 'pesParados', 'poseCongelada', 'meiaVolta', 'meiaVoltaRapida', 'meiaVoltaInterrompida',
  'sentarLevantar', 'copiasUnicas', 'copiasQueCrescem', 'sombrasCopias', 'pegadasNaAreia',
  'propriedadeEmJogo', 'programasReaproveitados', 'semRecompilarParado']
const cenarios = process.argv[3] ? process.argv[3].split(',').filter(Boolean) : ORDEM
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9333 + (Number(process.env.PORTA_EXTRA) || 0)

const perfil = mkdtempSync(join(tmpdir(), 'maresia-cenarios-'))
// detached: o Chrome vira um grupo, e o grupo inteiro morre junto (o helper de GPU e os
// renderers do swiftshader). Um Chrome órfão rodando a 550% de CPU trava a máquina.
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox',
  // o WebGPU precisa do Dawn: --enable-unsafe-webgpu libera o adaptador e o
  // --use-angle=metal usa a GPU de verdade da maquina (no Mac, o Dawn fala Metal)
  '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1280,720', 'about:blank',
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
  const avisos = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id) }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
      avisos.push(`[${m.params.type}] ${txt}`)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      avisos.push(`[exceção] ${d.exception?.description || d.text}`)
    }
  })
  await new Promise((r) => ws.addEventListener('open', r))
  const cmd = (method, params = {}) => new Promise((r) => {
    const id = ++seq
    esperando.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const avaliar = async (expression) => {
    const r = await cmd('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
    return { valor: r.result?.result?.value }
  }

  await cmd('Runtime.enable')
  await cmd('Log.enable')
  await cmd('Page.enable')
  // o renderizador e escolhido pelo config salvo no navegador: escreve antes de a
  // pagina carregar, para o jogo ja nascer no renderizador pedido
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      try {
        const chave = 'maresia.config.v8'
        const atual = JSON.parse(localStorage.getItem(chave) || '{}')
        atual.desempenho = { ...(atual.desempenho || {}), renderizador: 'webgpu' }
        localStorage.setItem(chave, JSON.stringify(atual))
      } catch (e) { console.error('nao deu para gravar o renderizador:', e) }
    })()`,
  })
  await cmd('Page.navigate', { url })

  // o jogo precisa montar: no swiftshader leva um par de minutos
  let pronto = false
  const t0 = Date.now()
  while (Date.now() - t0 < 420000) {
    await dormir(3000)
    const v = await avaliar('!!window.maresia?.cena')
    if (v.valor) { pronto = true; break }
  }
  const estado = (await avaliar('JSON.stringify({ webgpu: window.maresia?.webgpu ?? null, renderizador: window.maresia?.cfg?.desempenho?.renderizador ?? null, quebrados: (window.__shadersQuebrados || []).length })', false)).valor
  console.log('--- estado ---', estado)
  if (!pronto) {
    console.log('--- o jogo NAO montou ---')
    console.log(avisos.slice(0, 30).join('\n'))
    codigo = 1
  } else if (estado && JSON.parse(estado).webgpu !== true) {
    // a suite roda com a GPU real: abrir em WebGL mede outra coisa
    console.log('--- ATENCAO: o jogo nao abriu em WebGPU, a suite nao vale ---')
    codigo = 1
  } else {
    console.log('--- o jogo montou (WebGPU) ---')
    let falhas = 0
    for (const nome of cenarios) {
      const r = await avaliar(`import('/testes/jogo/cenarios.js').then(m => m.cenarios.${nome}(window.maresia))`)
      const res = r.valor
      const ok = res && res.ok
      if (!ok) falhas++
      console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}  ${res?.motivo || r.erro || ''}`)
      if (res?.medidas) console.log('        ' + JSON.stringify(res.medidas).slice(0, 300))
    }

    // o shader que não compila some da tela sem aviso: a lista fica no window
    const quebrados = await avaliar('JSON.stringify(window.__shadersQuebrados || [])')
    if (quebrados.valor && quebrados.valor !== '[]') {
      console.log('--- shaders que nao compilaram ---')
      console.log(quebrados.valor)
    }

    // o console: o Chrome pede o favicon sozinho e a fonte do Google às vezes não entra
    const externos = ['favicon.ico', 'fonts.googleapis.com', 'fonts.gstatic.com', 'localStorage']
    const reprovam = avisos.filter((a) => !externos.some((e) => a.includes(e)))
      .filter((a) => a.startsWith(('[error]', '[exceção]', '[log error]')) || a.includes('sem saída de luz') || a.includes('não compilaram') || a.includes('Congelado e movido'))
    console.log(`--- console: ${reprovam.length ? 'REPROVA' : 'limpo'} ---`)
    for (const a of reprovam.slice(0, 12)) console.log('   ' + a)
    if (reprovam.length) falhas++
    console.log(falhas ? `--- ${falhas} falha(s) ---` : '--- tudo passou ---')
    codigo = falhas ? 1 : 0
  }
} finally {
  // o navegador sempre sai, mesmo com erro: um Chrome órfão segura a máquina
  try { ws?.close() } catch { /* ja fechado */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { try { chrome.kill('SIGKILL') } catch { /* ja morto */ } }
  await dormir(300)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* perfil temporario */ }
}
process.exit(codigo)
