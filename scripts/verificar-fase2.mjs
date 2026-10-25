// Maresia - confere a Fase 2 (docs/PLANO-PERFORMANCE.md) no navegador de verdade.
//
// Sobe o jogo, teleporta para o centro (onde o casario de 1932 está montado), e mede:
//   - quantos desenhos o quadro faz (renderer.info.render.calls) com as casas em lote e sem;
//   - quantas vezes o mapa de sombra do sol foi refeito;
//   - se algum shader não compilou ou algum material ficou sem a saída de luz;
//   - duas fotos (o centro, de dia), para o olho ver se as casas continuam no lugar.
//
// Uso: node scripts/verificar-fase2.mjs [url] [segundos]
// As fotos saem em /tmp/maresia-fase2-*.png

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] || 'http://localhost:5195/'
const espera = Number(process.argv[3] || 90)
const CHROME = process.env.CHROME || '/usr/bin/google-chrome'
const PORTA = 9333

const perfil = mkdtempSync(join(tmpdir(), 'maresia-fase2-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu-sandbox',
  // sem GPU na máquina: o WebGL do Chrome headless vem do SwiftShader (por software, mas é WebGL2 de verdade)
  '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' })

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

async function alvo() {
  for (let i = 0; i < 60; i++) {
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
const logs = []
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled') {
    const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
    logs.push(`[${m.params.type}] ${txt}`)
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails
    logs.push(`[ERRO] ${d.exception?.description || d.text}`)
  }
})
await new Promise((r) => ws.addEventListener('open', r))
const cmd = (method, params = {}) => new Promise((r) => {
  const id = ++seq
  esperando.set(id, r)
  ws.send(JSON.stringify({ id, method, params }))
})
const avaliar = async (expression, comPromessa = true) => {
  const r = await cmd('Runtime.evaluate', { expression, awaitPromise: comPromessa, returnByValue: true })
  if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
  return { valor: r.result?.result?.value }
}
await cmd('Runtime.enable')
await cmd('Log.enable')
await cmd('Page.enable')
// o renderizador é escolhido pelo config salvo no navegador: escreve antes de a página carregar
await cmd('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    try {
      const chave = 'maresia.config.v8'
      const atual = JSON.parse(localStorage.getItem(chave) || '{}')
      atual.desempenho = { ...(atual.desempenho || {}), renderizador: 'webgl' }
      localStorage.setItem(chave, JSON.stringify(atual))
    } catch (e) { console.error('nao deu para gravar o renderizador:', e) }
  })()`,
})

async function rodar(nome, url) {
  logs.length = 0
  await cmd('Page.navigate', { url })
  let pronto = false
  const t0 = Date.now()
  while (Date.now() - t0 < espera * 1000) {
    await dormir(2000)
    const v = (await avaliar('!!(window.maresia && window.__tempos && window.__tempos.fisica)', false)).valor
    if (v) { pronto = true; break }
  }
  if (pronto) await avaliar('Promise.race([window.maresia?.pronto, new Promise((r) => setTimeout(r, 120000))]).then(() => true)')
  // teleporta para o centro e deixa o casario montar
  const r = await avaliar(`(async () => {
    const m = window.maresia
    m.cfg.fatia.travar = false // por padrão o jogador fica preso na fatia da praia (mundo/fatia.js)
    // o alvo é uma casa de verdade (m.quadras tem a posição de cada casa de 1932): a praça
    // nomeada pode cair num terreno sem casario (o Urubu fica a leste)
    const casas = (m.quadras || []).map((q) => [q.cx, q.cz])
    let alvo = casas[0] || [29, 316]
    if (casas.length) {
      let cx = 0, cz = 0
      for (const c of casas) { cx += c[0]; cz += c[1] }
      cx /= casas.length; cz /= casas.length
      let melhor = Infinity
      for (const c of casas) {
        const d = (c[0] - cx) ** 2 + (c[1] - cz) ** 2
        if (d < melhor) { melhor = d; alvo = c }
      }
    }
    m.irPara(alvo[0], alvo[1], -1.5708)
    m.cfg.tempo.hora = 9.5
    for (let i = 0; i < 900; i++) m.passo(1/60, false)
    m.passo(1/60, true)
    await new Promise((r) => setTimeout(r, 3000))
    // mede o mesmo número de quadros nas duas configurações (a mediana vale mais que um quadro só)
    const desenhos = []
    const triangulos = []
    for (let i = 0; i < 8; i++) {
      m.passo(1/60, true)
      await new Promise((r) => setTimeout(r, 120))
      const q = m.desempenho()
      desenhos.push(q.desenhos)
      triangulos.push(q.triangulos)
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]
    const d = m.desempenho()
    return JSON.stringify({
      alvo: [Math.round(alvo[0]), Math.round(alvo[1])],
      jogador: [Math.round(m.jogador.pos.x), Math.round(m.jogador.pos.z)],
      casa: m.casas.estatisticas(),
      desenhos: med(desenhos),
      desenhosMin: Math.min(...desenhos),
      triangulos: med(triangulos),
      sombra: d.sombra,
      lote: d.casas,
      quebrados: (window.__shadersQuebrados || []).length,
      semLuz: (window.__materiaisSemLuz || []).length,
      webgpu: m.webgpu === true,
    })
  })()`)
  const estado = r.valor ? JSON.parse(r.valor) : { erro: r.erro }
  console.log(`--- ${nome} ---`)
  console.log(JSON.stringify(estado, null, 1))
  const shot = await cmd('Page.captureScreenshot', { format: 'png' })
  if (shot.result?.data) {
    const caminho = `/tmp/maresia-fase2-${nome}.png`
    writeFileSync(caminho, Buffer.from(shot.result.data, 'base64'))
    console.log('foto:', caminho, existsSync(caminho) ? 'ok' : 'FALTOU')
  }
  const erros = logs.filter((l) => l.startsWith('[ERRO]') || l.includes('quebrad') || l.includes('sem saída de luz') || l.includes('sem saida de luz'))
  if (erros.length) console.log('avisos do console:\n' + erros.slice(0, 12).join('\n'))
  return estado
}

const so = process.argv[4] // 'com' ou 'sem': roda só um dos lados do A/B
const comLote = so === 'sem' ? { desenhos: undefined, sombra: undefined } : await rodar('com-lote', `${base}?cfg=desempenho.casasEmLote=1`)
const semLote = so === 'com' ? { desenhos: undefined, sombra: undefined } : await rodar('sem-lote', `${base}?cfg=desempenho.casasEmLote=0`)

console.log('--- resumo ---')
console.log(`desenhos (mediana): com lote ${comLote.desenhos} | sem lote ${semLote.desenhos}`)
console.log(`triângulos (mediana): com lote ${comLote.triangulos} | sem lote ${semLote.triangulos}`)
console.log(`sombra refeita: com lote ${comLote.sombra?.refeitos} | sem lote ${semLote.sombra?.refeitos}`)

ws.close()
chrome.kill()
await dormir(300)
try { rmSync(perfil, { recursive: true, force: true }) } catch { /* perfil temporario */ }
process.exit(0)
