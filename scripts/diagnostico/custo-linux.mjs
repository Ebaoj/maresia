// Custo do quadro no Linux (27/10/2026, correções visuais): Chrome sem janela com SwiftShader (placa de software).
// Laço do jogo pausado; cada quadro é um m.passo(1/60) seguido de uma espera até a placa terminar (WebGL: leitura de
// 1 pixel; WebGPU: onSubmittedWorkDone). Variantes alternadas na mesma rodada (como manda o CLAUDE.md).
// Limite: o SwiftShader desenha na CPU; vale a COMPARAÇÃO entre variantes (custo de pixel do pós), não o número
// absoluto, e nada disso diz o custo no M1.
//
// uso: [RENDERIZADOR=webgpu] [VARIANTES='{"nome":"js que aplica"}'] [FOTOS=PASTA] [HORA=15]
//      node scripts/diagnostico/custo-linux.mjs URL SAIDA.json [quadros=12] [rodadas=3]
import { chromium } from '/workspace/pw/node_modules/playwright-core/index.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5311/?semTelemetria'
const SAIDA = process.argv[3] || '/tmp/custo.json'
const N = Number(process.argv[4]) || 12
const RODADAS = Number(process.argv[5]) || 3
const GPU = process.env.RENDERIZADOR === 'webgpu'
const VARIANTES = JSON.parse(process.env.VARIANTES || '{"base":""}')
const FOTOS = process.env.FOTOS || ''
const L = { x: 4240.84, z: 2164.09, yaw: 0, hora: Number(process.env.HORA || 15), pitch: 0.2, dist: 5 }

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    ...(GPU ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'] : [])] })
const res = { url, renderizador: GPU ? 'webgpu' : 'webgl', lugar: L, quadros: N, rodadas: RODADAS, variantes: {}, console: [] }
try {
  const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })
  p.on('pageerror', (e) => res.console.push('[pageerror] ' + String(e)))
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) res.console.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
  await p.addInitScript((r) => {
    const chave = 'maresia.config.v8'
    const atual = JSON.parse(localStorage.getItem(chave) || '{}')
    atual.desempenho = { ...(atual.desempenho || {}), renderizador: r }
    localStorage.setItem(chave, JSON.stringify(atual))
  }, GPU ? 'webgpu' : 'webgl')
  await p.goto(url, { timeout: 300000 })
  await p.waitForFunction(() => window.maresia, null, { timeout: 400000, polling: 1000 })
  await p.evaluate(async () => { await Promise.race([window.maresia.pronto, new Promise((r) => setTimeout(r, 240000))]) })
  await p.waitForTimeout(3000)
  await p.evaluate((L) => {
    const m = window.maresia
    m.controle.pausado = true
    const lil = document.querySelector('.lil-gui')
    if (lil && getComputedStyle(lil).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
    if (m.cfg.fatia) m.cfg.fatia.travar = false
    for (const k in m.teclas) m.teclas[k] = false
    m.irPara(L.x, L.z, L.yaw, L.hora)
    m.cfg.tempo.pausado = true
    m.cam.pitch = L.pitch
    m.cfg.camera.distancia = L.dist
    m.cam.iniciado = false
    window.__desfazer = {}
  }, L)
  const medir = (nome, js, n) => p.evaluate(async ({ nome, js, n }) => {
    const m = window.maresia
    const px = new Uint8Array(4)
    const esperar = async () => {
      if (m.webgpu) await m.renderer.backend.device.queue.onSubmittedWorkDone()
      else { const gl = m.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px) }
    }
    const passo = () => { if (m.webgpu) m.renderer._nodes.nodeFrame.update(); m.passo(1 / 60) }
    const base = JSON.parse(JSON.stringify(m.cfg))
    if (js) eval(js)
    for (let i = 0; i < 4; i++) { passo(); await esperar() } // assenta (estabilização, cache de sombra)
    const t = []
    for (let i = 0; i < n; i++) { const t0 = performance.now(); passo(); await esperar(); t.push(performance.now() - t0) }
    // desfaz: volta o cfg inteiro ao de antes da variante
    const volta = (dst, src) => { for (const k in src) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k]) volta(dst[k], src[k]); else dst[k] = src[k] } }
    volta(m.cfg, base)
    return t
  }, { nome, js, n })
  const nomes = Object.keys(VARIANTES)
  for (const nome of nomes) res.variantes[nome] = { tempos: [] }
  for (let r = 0; r < RODADAS; r++) {
    for (const nome of (r % 2 ? [...nomes].reverse() : nomes)) {
      const t = await medir(nome, VARIANTES[nome], N)
      res.variantes[nome].tempos.push(...t.map((v) => +v.toFixed(1)))
      console.log('rodada', r, nome, 'mediana', [...t].sort((a, b) => a - b)[t.length >> 1].toFixed(1), 'ms')
    }
  }
  for (const nome of nomes) {
    const s = [...res.variantes[nome].tempos].sort((a, b) => a - b)
    res.variantes[nome].mediana = s[s.length >> 1]
    res.variantes[nome].p25 = s[Math.floor(s.length * 0.25)]
    res.variantes[nome].p75 = s[Math.floor(s.length * 0.75)]
    if (FOTOS) {
      mkdirSync(FOTOS, { recursive: true })
      const d = await p.evaluate(async ({ js }) => {
        const m = window.maresia
        const base = JSON.parse(JSON.stringify(m.cfg))
        if (js) eval(js)
        for (let i = 0; i < 6; i++) { if (m.webgpu) m.renderer._nodes.nodeFrame.update(); m.passo(1 / 60) }
        if (m.webgpu) await m.renderer.backend.device.queue.onSubmittedWorkDone()
        const url = m.canvas.toDataURL('image/png')
        const volta = (dst, src) => { for (const k in src) { if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k]) volta(dst[k], src[k]); else dst[k] = src[k] } }
        volta(m.cfg, base)
        return url
      }, { js: VARIANTES[nome] })
      writeFileSync(join(FOTOS, `${nome}-${res.renderizador}.png`), Buffer.from(d.split(',')[1], 'base64'))
    }
    console.log(nome, 'mediana', res.variantes[nome].mediana, 'ms (p25', res.variantes[nome].p25, 'p75', res.variantes[nome].p75, ')')
  }
  res.quebrados = await p.evaluate(() => window.__shadersQuebrados || [])
} catch (e) {
  res.falha = String(e)
  console.log('FALHA', e)
} finally {
  writeFileSync(SAIDA, JSON.stringify(res, null, 1))
  await b.close()
}
