// Pisca no Linux (27/10/2026, diagnóstico): versão de scripts/pisca.mjs para o Chrome do Linux com SwiftShader
// (playwright-core). Grava quadros PNG seguidos do mesmo lugar, câmera parada, para scripts/pisca-mapa.py.
// SwiftShader: vale a imagem, não o tempo de quadro.
//
// uso: node scripts/diagnostico/pisca-linux.mjs URL PASTA [quadros=16]
// Situações:
//   vivo-parado  o laço do próprio jogo (governador como vem, relógio parado, animação andando); cada quadro é lido
//                logo depois de pos.desenhar, na mesma tarefa
//   raf-parado   pisca.mjs modo raf: laço do jogo pausado, um m.passo(1e-6) por requestAnimationFrame (governador
//                não roda: o laço sai cedo com controle.pausado)
//   raf-tempo    idem com dt 1/30 e o relógio andando
//   raf-giro     idem com dt 1/30 e a câmera girando 0,2 rad/s
// Sai PASTA/<situacao>/q0000.png ... e PASTA/estado.json (renderizador, governador, pixel ratio por quadro, console).
import { chromium } from '/workspace/pw/node_modules/playwright-core/index.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5311/?semTelemetria'
const PASTA = process.argv[3] || 'docs/capturas/pisca-diagnostico'
const N = Number(process.argv[4]) || 16
const L = { x: 4240.84, z: 2164.09, yaw: 0, hora: 15, pitch: 0.2, dist: 5 }
const VARIANTE_JS = process.env.VARIANTE_JS || '' // ex.: 'm.cfg.estilo.grao = 0', aplicado antes de cada situação
const SITS = (process.env.SITUACOES || 'vivo-parado,raf-parado,raf-tempo,raf-giro').split(',')
mkdirSync(PASTA, { recursive: true })

const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const estado = { url, varianteJs: VARIANTE_JS, lugar: L, situacoes: {}, console: [] }
const salvarEstado = () => writeFileSync(join(PASTA, 'estado.json'), JSON.stringify(estado, null, 1))
try {
  const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })
  p.on('pageerror', (e) => estado.console.push('[pageerror] ' + String(e)))
  p.on('console', (m) => { if (['error', 'warning'].includes(m.type())) estado.console.push(`[${m.type()}] ${m.text().slice(0, 300)}`) })
  await p.addInitScript(() => {
    try {
      const chave = 'maresia.config.v8'
      const atual = JSON.parse(localStorage.getItem(chave) || '{}')
      atual.desempenho = { ...(atual.desempenho || {}), renderizador: 'webgl' }
      localStorage.setItem(chave, JSON.stringify(atual))
    } catch (e) { console.error('renderizador:', e) }
  })
  const t0 = Date.now()
  await p.goto(url, { timeout: 300000 })
  await p.waitForFunction(() => window.maresia, null, { timeout: 400000, polling: 1000 })
  await p.evaluate(async () => { await Promise.race([window.maresia.pronto, new Promise((r) => setTimeout(r, 240000))]) })
  await p.waitForTimeout(5000)
  estado.abrirS = (Date.now() - t0) / 1000
  estado.inicio = await p.evaluate(() => {
    const m = window.maresia
    return { webgpu: !!m.webgpu, rendererTipo: m.renderer?.constructor?.name, governadorLigado: !!m.governador,
      governador: m.governador?.nome ?? null, pixelRatio: m.pixelRatio(), qualidadeFixa: m.cfg.desempenho.qualidadeFixa,
      qualidadeEscolhida: m.cfg.desempenho.qualidadeEscolhida, estabilizar: m.cfg.estilo.estabilizar,
      quebrados: window.__shadersQuebrados || [] }
  })
  console.log('inicio', JSON.stringify(estado.inicio), 'em', estado.abrirS, 's')
  salvarEstado()

  const preparar = (L) => {
    const m = window.maresia
    const lil = document.querySelector('.lil-gui')
    if (lil && getComputedStyle(lil).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
    if (m.cfg.fatia) m.cfg.fatia.travar = false
    for (const k in m.teclas) m.teclas[k] = false
    m.irPara(L.x, L.z, L.yaw, L.hora)
    m.cfg.tempo.hora = L.hora
    m.cam.pitch = L.pitch
    m.cfg.camera.distancia = L.dist
    m.cam.iniciado = false
  }

  for (const sit of SITS) {
    const pasta = join(PASTA, sit)
    mkdirSync(pasta, { recursive: true })
    const t1 = Date.now()
    let r
    if (sit === 'vivo-parado') {
      r = await p.evaluate(async ({ L, N, preparar, VJ }) => {
        const m = window.maresia
        eval('(' + preparar + ')')(L)
        if (VJ) eval(VJ)
        m.cfg.tempo.pausado = true
        m.controle.pausado = false
        // assenta com o laço do jogo: 40 quadros dele
        const meta = { quadros: [] }
        let contar = 0
        const orig = m.pos.desenhar.bind(m.pos)
        window.__q = []
        let capturar = false
        m.pos.desenhar = (...a) => {
          const res = orig(...a)
          contar++
          if (capturar && window.__q.length < N) {
            window.__q.push(m.canvas.toDataURL('image/png'))
            meta.quadros.push({ governador: m.governador?.nome ?? null, pixelRatio: m.pixelRatio(), w: m.canvas.width, h: m.canvas.height,
              yaw: m.cam.yaw, pitch: m.cam.pitch, t: performance.now() })
          }
          return res
        }
        const ti = performance.now()
        while (contar < 40 && performance.now() - ti < 240000) await new Promise((r) => setTimeout(r, 200))
        meta.assentarQuadros = contar
        meta.governadorAntes = m.governador?.nome ?? null
        meta.pixelRatioAntes = m.pixelRatio()
        capturar = true
        while (window.__q.length < N && performance.now() - ti < 480000) await new Promise((r) => setTimeout(r, 100))
        m.pos.desenhar = orig
        m.controle.pausado = true
        meta.governadorDepois = m.governador?.nome ?? null
        meta.governadorEstado = m.governador?.estado ? m.governador.estado() : null
        return { n: window.__q.length, meta }
      }, { L, N, preparar: preparar.toString(), VJ: VARIANTE_JS })
    } else {
      r = await p.evaluate(async ({ L, N, sit, preparar, VJ }) => {
        const m = window.maresia
        m.controle.pausado = true
        m.tamanhoFixo(0)
        eval('(' + preparar + ')')(L)
        if (VJ) eval(VJ)
        const raf = () => new Promise((r) => requestAnimationFrame(() => r()))
        for (let i = 0; i < 40; i++) { await raf(); m.passo(1 / 60) }
        m.cfg.tempo.pausado = sit === 'raf-parado'
        const dt = sit === 'raf-parado' ? 1e-6 : 1 / 30
        window.__q = []
        const meta = { quadros: [], governadorAntes: m.governador?.nome ?? null }
        for (let i = 0; i < N; i++) {
          if (sit === 'raf-giro') m.cam.yaw += 0.2 / 30
          await raf()
          m.passo(dt)
          window.__q.push(m.canvas.toDataURL('image/png'))
          meta.quadros.push({ governador: m.governador?.nome ?? null, pixelRatio: m.pixelRatio(), w: m.canvas.width, h: m.canvas.height, yaw: m.cam.yaw, hora: m.cfg.tempo.hora })
        }
        meta.governadorDepois = m.governador?.nome ?? null
        return { n: window.__q.length, meta }
      }, { L, N, sit, preparar: preparar.toString(), VJ: VARIANTE_JS })
    }
    for (let i = 0; i < r.n; i += 2) {
      const lote = await p.evaluate(([i]) => window.__q.slice(i, i + 2), [i])
      lote.forEach((d, k) => writeFileSync(join(pasta, `q${String(i + k).padStart(4, '0')}.png`), Buffer.from(d.split(',')[1], 'base64')))
    }
    await p.evaluate(() => { window.__q = null })
    r.meta.segundos = (Date.now() - t1) / 1000
    estado.situacoes[sit] = r.meta
    console.log(sit, r.n, 'quadros em', r.meta.segundos, 's; governador', r.meta.governadorAntes, '->', r.meta.governadorDepois,
      'pixelRatios', [...new Set(r.meta.quadros.map((q) => q.pixelRatio))].join(','))
    salvarEstado()
  }
  estado.quebradosFim = await p.evaluate(() => window.__shadersQuebrados || [])
} catch (e) {
  estado.falha = String(e)
  console.log('FALHA', e)
} finally {
  salvarEstado()
  await b.close()
}
