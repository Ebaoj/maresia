// Laço vivo ~60 s com a telemetria ligada; o envio é interceptado (nada sai para o Worker) e lido aqui.
import { chromium } from 'playwright-core'
const [url, saida] = process.argv.slice(2)
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync'] })
const p = await b.newPage({ viewport: { width: 480, height: 270 } })
const cargas = []
await p.route(/workers\.dev/, (r) => { try { cargas.push(JSON.parse(r.request().postData())) } catch {} ; r.abort() })
await p.goto(url + '?qualidade=medio', { timeout: 600000 })
await p.waitForFunction(() => window.maresia, null, { timeout: 600000 })
await p.evaluate(async () => { await window.maresia.pronto })
await p.evaluate(() => window.maresia.telemetria.enviar('aquecer'))
const pontos = [[4240.84, 2164.09, 0], [4174.08, 2101.54, 3.1], [5409.34, 1128.49, 0], [5300, 1180, -1.5], [4942.78, 1283.3, 3.1], [4240.84, 2164.09, 1.5]]
for (const [x, z, y] of pontos) {
  await p.evaluate(([x, z, y]) => { const m = window.maresia; m.irPara(x, z, y, 10); m.teclas.frente = true }, [x, z, y])
  await p.waitForTimeout(10000)
}
await p.evaluate(() => window.maresia.telemetria.enviar('fim'))
await p.waitForTimeout(500)
const c = cargas.filter((x) => x.motivo !== 'aquecer')
const causas = {}; let n50 = 0
for (const x of c) { n50 += x.travadas.acima50; for (const k in x.travadas.causas) causas[k] = (causas[k] || 0) + x.travadas.causas[k] }
const r = { envios: c.length, travadas50: n50, causas, sistemas: c.at(-1)?.sistemas, governador: c.at(-1)?.governador }
console.log(JSON.stringify(r))
await (await import('node:fs')).promises.writeFile(saida, JSON.stringify(r, null, 1))
await b.close()
