// Uso: node scripts/governador-replay.mjs (antes e depois do governador em escada, 27/10/2026; a pasta governador-antigo/ guarda a versão de ea83569)
// Repete um traço de quadros parecido com a telemetria do M1 nos dois governadores (antigo: perfil inteiro +
// resolução dinâmica; novo: escada). Mostra o pixel ratio (Retina, dpr 2) e o que foi cortado.
import { GovernadorQualidade as Antigo } from './governador-antigo/governador.js'
import { aplicarNivelVivo as vivoAntigo, tetoPixel as tetoAntigo } from './governador-antigo/qualidade.js'
import { ResolucaoDinamica } from '../src/render/resolucao-dinamica.js'
import { GovernadorQualidade as Novo, aplicarDegrau } from '../src/render/governador.js'
let s = 12345
const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
// 4 min: base p50 13 / p95 ~18 / p99 30-45; trechos de cidade (20 s a cada minuto) com p50 15, p95 24; 3-13 travadas de 50-200 ms / 30 s
function traco(cenario) {
  const out = []
  for (let t = 0; t < 240000;) {
    const cidade = cenario === 'cidade' ? (t % 60000) > 40000 : false
    if (cenario === 'carga' && t < 25000) { const dt = 20 + rnd() * 6 + (rnd() < 0.1 ? 15 : 0); out.push(dt); t += dt; continue }
    let dt = cidade ? 14 + rnd() * 3 : 12.3 + rnd() * 1.4
    const r = rnd()
    if (r < 0.06) dt = cidade ? 22 + rnd() * 8 : 16 + rnd() * 5
    else if (r < 0.012 + 0.06) dt = 25 + rnd() * 20
    if (rnd() < 8 / 30 / 75) dt = 50 + rnd() * 150
    out.push(dt); t += dt
  }
  return out
}
const DPR = 2
function antigo(tr) {
  const cfg = { desempenho: { resolucao: 1, resolucaoMin: 0.9, tetoRetina: 1, resolucaoDinamica: true }, mundo: { sombraPerto: true, sombraPertoResolucao: 1024 }, estilo: { dof: true, estabilizar: 0.85 } }
  const g = new Antigo({ nivel: 'medio' })
  const d = new ResolucaoDinamica({ alvo: 1, minimo: 0.9, eficacia: true })
  let res = cfg.desempenho.resolucao, minPR = 9, t = 0, pr = 0, prs = []
  for (const dt of tr) {
    t += dt
    if (cfg.desempenho.resolucao !== res) { res = cfg.desempenho.resolucao; d.redefinir(res) }
    d.minimo = cfg.desempenho.resolucaoMin
    d.quadro(dt)
    const n = g.quadro(dt); if (n) vivoAntigo(cfg, n)
    pr = Math.min(d.escala, tetoAntigo(cfg, DPR)); minPR = Math.min(minPR, pr); prs.push([t, pr])
  }
  return { fim: pr, minimo: minPR, trocas: g.trocas.map((x) => `${x.de}->${x.para}`).join(' '), medioPR: +(prs.reduce((a, [, p]) => a + p, 0) / prs.length).toFixed(3) }
}
function novo(tr) {
  const cfg = { desempenho: { resolucao: 1, tetoRetina: 1, cortePx: 3 }, mundo: { sombraPerto: true, sombraPertoResolucao: 1024, palhaPerto: 220 }, estilo: { dof: true, estabilizar: 0.85, arcPinturaMeia: false }, pessoas: { ate: 400 }, marcos: { distDetalhe: 170 }, arvores: { lodPerto: 65, lodLonge: 85, lodBloco: 90 } }
  const g = new Novo(); const base = {}; aplicarDegrau(cfg, g, base)
  let minPR = 9, pr = 0, prs = [], pior = 0
  for (const dt of tr) {
    if (g.quadro(dt) !== null) aplicarDegrau(cfg, g, base)
    pior = Math.max(pior, g.degrau)
    pr = Math.min(cfg.desempenho.resolucao, tetoAntigo(cfg, DPR), g.capPixel()); minPR = Math.min(minPR, pr); prs.push(pr)
  }
  return { fim: pr, minimo: minPR, piorDegrau: g.degraus[pior].nome, trocas: g.trocas.map((x) => `${x.de}->${x.para}`).join(' '), medioPR: +(prs.reduce((a, p) => a + p, 0) / prs.length).toFixed(3) }
}
for (const c of ['m1', 'cidade', 'carga']) {
  const tr = traco(c)
  const o = [...tr].sort((a, b) => a - b)
  console.log(`traço ${c}: ${tr.length} quadros, p50 ${o[o.length >> 1].toFixed(1)} p95 ${o[Math.floor(o.length * 0.95)].toFixed(1)} p99 ${o[Math.floor(o.length * 0.99)].toFixed(1)}`)
  console.log('  antigo', JSON.stringify(antigo(tr)))
  console.log('  novo  ', JSON.stringify(novo(tr)))
}
