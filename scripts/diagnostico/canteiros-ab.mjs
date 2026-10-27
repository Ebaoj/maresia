// Canteiros da Praça do Ferreira (27/10/2026, diagnóstico de docs/relatorio-visual.md): A/B ao vivo das peças do
// 003cc70 que se desligam sem recarregar (LOD cópia a cópia das árvores) e do cache de sombra, na vista de abertura.
// SwiftShader (WebGL): vale a imagem, não o tempo.
//
// uso: [RENDERIZADOR=webgpu] [LUGAR=x,z,yaw] [SO_PADRAO=1] node scripts/diagnostico/canteiros-ab.mjs URL PASTA
// Sai PASTA/<variante>.png e PASTA/canteiros-ab.json (o que mudou entre as variantes, em média de |diferença|).
import { chromium } from '/workspace/pw/node_modules/playwright-core/index.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const url = process.argv[2] || 'http://localhost:5311/?semTelemetria'
const PASTA = process.argv[3] || 'docs/capturas/canteiros'
mkdirSync(PASTA, { recursive: true })
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    ...(process.env.RENDERIZADOR === 'webgpu' ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader'] : [])] })
const saida = { url, variantes: {}, console: [] }
try {
  const p = await b.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 })
  p.on('pageerror', (e) => saida.console.push('[pageerror] ' + String(e)))
  await p.addInitScript((r) => {
    const chave = 'maresia.config.v8'
    const atual = JSON.parse(localStorage.getItem(chave) || '{}')
    atual.desempenho = { ...(atual.desempenho || {}), renderizador: r }
    localStorage.setItem(chave, JSON.stringify(atual))
  }, process.env.RENDERIZADOR || 'webgl')
  await p.goto(url, { timeout: 300000 })
  await p.waitForFunction(() => window.maresia, null, { timeout: 400000, polling: 1000 })
  await p.evaluate(async () => { await Promise.race([window.maresia.pronto, new Promise((r) => setTimeout(r, 240000))]) })
  await p.waitForTimeout(3000)
  await p.evaluate(() => {
    const m = window.maresia
    m.controle.pausado = true
    m.tamanhoFixo(960, 540)
    m.cfg.tempo.pausado = true
    m.cfg.tempo.hora = 15
    const lil = document.querySelector('.lil-gui')
    if (lil && getComputedStyle(lil).display !== 'none') dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyH' }))
    for (const k in m.teclas) m.teclas[k] = false
  })
  // LUGAR="x,z,yaw": a vista (sem ela, a de abertura); SO_PADRAO=1: só a primeira variante (para comparar commits)
  if (process.env.LUGAR) {
    const [x, z, yaw] = process.env.LUGAR.split(',').map(Number)
    await p.evaluate(({ x, z, yaw }) => { const m = window.maresia; m.irPara(x, z, yaw, 15); m.cam.pitch = 0.2; m.cfg.camera.distancia = 5 }, { x, z, yaw })
    saida.lugar = process.env.LUGAR
  }
  const variantes = [
    ['padrao', ''],
    ['cache-refeito', 'm.cacheSombra?.politica?.invalidar("teste")'],
    ['sem-lod-copia', 'm.cfg.arvores.lodCopia = false; (await import("/src/mundo/lod-arvores.js")).LOD_COPIA_ARVORES.ligado = false; m.cacheSombra?.politica?.invalidar("teste")'],
    ['sem-lod-copia-sem-sombra-perto', 'm.cfg.mundo.sombraPerto = false'],
    ['volta-padrao', 'm.cfg.mundo.sombraPerto = true; m.cfg.arvores.lodCopia = true; (await import("/src/mundo/lod-arvores.js")).LOD_COPIA_ARVORES.ligado = true; m.cacheSombra?.politica?.invalidar("teste")'],
  ]
  // VARIANTES='[["nome","js"],...]': troca a lista (cada uma por cima da anterior)
  const lista = process.env.VARIANTES ? JSON.parse(process.env.VARIANTES) : variantes
  for (const [nome, js] of process.env.SO_PADRAO ? lista.slice(0, 1) : lista) {
    const info = await p.evaluate(`(async () => {
      const m = window.maresia
      ${js}
      for (let i = 0; i < 40; i++) m.passo(1e-6)
      await new Promise((r) => requestAnimationFrame(() => r()))
      m.passo(1e-6) // o quadro é lido na mesma tarefa do desenho (sem preserveDrawingBuffer)
      const png = m.canvas.toDataURL('image/png')
      return { png, webgpu: !!m.webgpu, pixelRatio: m.pixelRatio(), governador: m.governador?.nome ?? null, lodCopia: m.cfg.arvores.lodCopia }
    })()`)
    const png = info.png
    delete info.png
    writeFileSync(join(PASTA, nome + '.png'), Buffer.from(png.split(',')[1], 'base64'))
    saida.variantes[nome] = info
    console.log(nome, JSON.stringify(info))
  }
} finally {
  writeFileSync(join(PASTA, 'canteiros-ab.json'), JSON.stringify(saida, null, 1))
  await b.close()
}
