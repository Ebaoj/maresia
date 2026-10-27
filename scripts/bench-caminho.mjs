// Benchmark de caminho fixo (27/10/2026): node scripts/bench-caminho.mjs <url> <saida.json> [pastaFotos]. Precisa de playwright-core e do Chrome em /usr/bin/google-chrome; SwiftShader: vale triângulos, chamadas e CPU, não o tempo de quadro.
// Benchmark reproduzível do Maresia: caminho de câmera fixo (~60 s de jogo), passos fixos com o laço pausado.
// uso: node bench.mjs <url> <saida.json> [dirFotos] [extraQuery]
import { chromium } from 'playwright-core'
import { writeFileSync, mkdirSync } from 'node:fs'
const [url = 'http://localhost:5302/maresia/', saida = 'r.json', fotos = '', extra = ''] = process.argv.slice(2)
const DT = 1 / 15 // 15 passos por segundo de jogo: 900 quadros em 60 s
const SEG = [
  // nome, x, z, yaw0, giro (rad no segmento), andar, segundos
  ['praca-giro', 4240.84, 2164.09, 0, Math.PI * 2, false, 12],
  ['praca-andar', 4240.84, 2164.09, Math.PI / 2, 0, true, 10],
  ['excelsior', 4174.08, 2101.54, 0, Math.PI, false, 8],
  ['praia-ingleses-giro', 5409.34, 1128.49, 0, Math.PI * 2, false, 12],
  ['praia-andar', 5300, 1180, -Math.PI / 2, 0, true, 10],
  ['poco-draga', 4942.78, 1283.30, Math.PI, Math.PI, false, 8],
]
const FOTOS = ['praca-giro', 'excelsior', 'praia-ingleses-giro', 'poco-draga']
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--js-flags=--expose-gc'] })
const p = await b.newPage({ viewport: { width: 960, height: 540 } })
const erros = []
p.on('pageerror', (e) => erros.push(String(e)))
await p.goto(url + (url.includes('?') ? '&' : '?') + 'semTelemetria&qualidade=medio' + extra, { timeout: 300000 })
await p.waitForFunction(() => window.maresia, null, { timeout: 300000 })
await p.evaluate(async () => { await window.maresia.pronto; await new Promise((r) => setTimeout(r, 20000)) })
await p.evaluate(() => {
  const m = window.maresia
  m.controle.pausado = true
  m.tamanhoFixo(960, 540)
  const pos = m.pos
  const orig = pos.desenhar.bind(pos)
  window.__msRender = 0
  pos.desenhar = (...a) => { const t = performance.now(); const r = orig(...a); window.__msRender += performance.now() - t; return r }
  m.renderer.info.autoReset = false
  // sem rasterizar: os desenhos viram no-op (o three conta triângulos e chamadas antes de chamar o gl).
  // O SwiftShader rasteriza na CPU e o tempo dele não diz nada do M1; assim o tempo é só o do processador do jogo
  const gl = m.renderer.getContext()
  window.__draws = {}
  for (const f of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
    if (!gl[f]) continue
    window.__draws[f] = gl[f].bind(gl)
    gl[f] = () => {}
  }
  const ext = gl.getExtension('WEBGL_multi_draw')
  if (ext) for (const f of Object.keys(Object.getPrototypeOf(ext))) if (typeof ext[f] === 'function' && f.startsWith('multiDraw')) { window.__draws['ext.' + f] = ext[f].bind(ext); ext[f] = () => {} }
})
mkdirSync(fotos || '/tmp', { recursive: true })
const res = { url, segmentos: [] }
for (const [nome, x, z, yaw0, giro, andar, s] of SEG) {
  const r = await p.evaluate(async ({ x, z, yaw0, giro, andar, s, DT }) => {
    const m = window.maresia
    m.irPara(x, z, yaw0, 10)
    for (const k in m.teclas) m.teclas[k] = false
    // aquecer: casas montam um bloco por quadro; 90 passos sem medir
    for (let i = 0; i < 90; i++) m.passo(DT)
    m.irPara(x, z, yaw0, 10)
    for (let i = 0; i < 5; i++) m.passo(DT)
    m.teclas.frente = andar
    const n = Math.round(s / DT)
    const cpu = [], ren = [], tri = [], chamadas = []
    for (let i = 0; i < n; i++) {
      m.cam.yaw = yaw0 + giro * i / n
      m.renderer.info.reset()
      window.__msRender = 0
      const t = performance.now()
      m.passo(DT)
      cpu.push(performance.now() - t); ren.push(window.__msRender)
      tri.push(m.renderer.info.render.triangles); chamadas.push(m.renderer.info.render.calls)
      if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0))
    }
    m.teclas.frente = false
    m.cam.yaw = yaw0 + giro * 0.5
    return { cpu, ren, tri, chamadas }
  }, { x, z, yaw0, giro, andar, s, DT })
  const est = (a) => { const o = [...a].sort((u, v) => u - v); const q = (f) => o[Math.min(o.length - 1, Math.floor(f * o.length))]; return { media: +(a.reduce((u, v) => u + v, 0) / a.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), max: +o[o.length - 1].toFixed(2) } }
  const upd = r.cpu.map((c, i) => c - r.ren[i])
  const seg = { nome, quadros: r.cpu.length, cpuMs: est(r.cpu), renderMs: est(r.ren), updateMs: est(upd), triangulos: est(r.tri), chamadas: est(r.chamadas) }
  res.segmentos.push(seg)
  console.log(JSON.stringify(seg))
}
if (fotos) {
  await p.evaluate(() => {
    const m = window.maresia, gl = m.renderer.getContext(), ext = gl.getExtension('WEBGL_multi_draw')
    for (const k in window.__draws) { if (k.startsWith('ext.')) ext[k.slice(4)] = window.__draws[k]; else gl[k] = window.__draws[k] }
  })
  await p.keyboard.press('KeyH') // esconde o painel
  for (const [nome, x, z, yaw0, giro] of SEG) {
    if (!FOTOS.includes(nome)) continue
    await p.evaluate(({ x, z, yaw0 }) => { const m = window.maresia; m.irPara(x, z, yaw0, 10); for (let i = 0; i < 40; i++) m.passo(1 / 15, i > 36); m.irPara(x, z, yaw0, 10); m.passo(1 / 60) }, { x, z, yaw0 })
    await p.screenshot({ path: `${fotos}/${nome}.png`, timeout: 900000 })
    console.log('foto', nome)
  }
}
const all = (k, f) => res.segmentos.map((s) => s[k][f])
res.total = {
  triMedia: Math.round(all('triangulos', 'media').reduce((a, b) => a + b) / SEG.length),
  triMax: Math.max(...all('triangulos', 'max')),
  chamadasMedia: Math.round(all('chamadas', 'media').reduce((a, b) => a + b) / SEG.length),
  cpuMedia: +(all('cpuMs', 'media').reduce((a, b) => a + b) / SEG.length).toFixed(2),
  updateMedia: +(all('updateMs', 'media').reduce((a, b) => a + b) / SEG.length).toFixed(2),
  renderMedia: +(all('renderMs', 'media').reduce((a, b) => a + b) / SEG.length).toFixed(2),
}
res.erros = erros
console.log('TOTAL', JSON.stringify(res.total), 'erros', erros.length)
writeFileSync(saida, JSON.stringify(res, null, 1))
await b.close()
