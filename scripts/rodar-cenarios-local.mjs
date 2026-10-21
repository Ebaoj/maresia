// Roda os cenários de testes/jogo/cenarios.js no jogo local, sem a L4 do Modal.
//
// A suíte oficial (infra/modal-jogo/testar_jogo.py) precisa da GPU do Modal ou da T4, e nenhum dos
// dois está com credencial agora. Esta é a versão local: o mesmo jogo, o mesmo Chrome sem
// aceleração (swiftshader), os mesmos cenários.
//
// O que ela NÃO prova: os quadros são muito mais lentos no swiftshader, então os cenários que
// medem tempo de quadro reprovam por conta da máquina, não do código. Os de correção (pose,
// cópias, sombras, pegadas, compilação) valem.
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
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--use-angle=swiftshader', '--use-gl=angle',
  '--enable-unsafe-swiftshader', '--enable-features=Vulkan,UseSkiaRenderer',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
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
const ws = new WebSocket(pagina.webSocketDebuggerUrl)
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
await cmd('Page.navigate', { url })

// o jogo precisa montar: no swiftshader leva um par de minutos
let pronto = false
const t0 = Date.now()
while (Date.now() - t0 < 420000) {
  await dormir(3000)
  const v = await avaliar('!!window.maresia?.cena')
  if (v.valor) { pronto = true; break }
}
if (!pronto) {
  console.log('--- o jogo NAO montou ---')
  console.log(avisos.slice(0, 30).join('\n'))
  ws.close(); chrome.kill()
  process.exit(1)
}
console.log('--- o jogo montou ---')

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

ws.close()
chrome.kill()
await dormir(300)
try { rmSync(perfil, { recursive: true, force: true }) } catch { /* perfil temporario */ }
console.log(falhas ? `--- ${falhas} falha(s) ---` : '--- tudo passou ---')
process.exit(falhas ? 1 : 0)
