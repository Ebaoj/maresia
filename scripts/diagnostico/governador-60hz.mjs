// Governador a 60 Hz e a 120 Hz (27/10/2026, visual/correcoes): o mesmo traço de custo de quadro nos dois governadores.
// Antigo (3b2b4cf): recebe o intervalo do rAF (o custo arredondado para cima ao vsync). Novo: recebe o custo e o
// intervalo. Traço: 6 min; custo base 9-12 ms, um trecho pesado de 25 s a cada 2 min (custo 20-28 ms), travadas raras.
// Cada degrau poupa uma fração do custo (ECONOMIA, estimada; a resolução pela área de pixels).
// uso: node scripts/diagnostico/governador-60hz.mjs [saida.json]
import { writeFileSync } from 'node:fs'
import { GovernadorQualidade as Antigo } from '../governador-antigo/governador-3b2b4cf.js'
import { GovernadorQualidade as Novo } from '../../src/render/governador.js'

const ECONOMIA = { 'sombra-perto-leve': 0.04, 'pincelada-meia': 0.06, 'sem-dof': 0.04, distancia: 0.06, lod: 0.05,
  'sem-sombra-perto': 0.06, 'sem-estabilizar': 0.02, 'pixel-0.9': 0.19 * 0.7, 'pixel-0.8': 0.21 * 0.7, 'pixel-0.75': 0.12 * 0.7,
  'pixel-0.65': 0.25 * 0.7, 'pixel-0.5': 0.41 * 0.7 }
const fator = (g) => { let f = 1; for (let k = 1; k <= g.degrau; k++) f *= 1 - (ECONOMIA[g.degraus[k].nome] || 0); return f }

function rodar(G, hz, novo) {
  let s = 4242
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const v = 1000 / hz
  const g = new G()
  const porDegrau = {}
  let tCheioDepois = 0, tDepois = 0
  for (let t = 0; t < 360000;) {
    const pesado = (t % 120000) > 60000 && (t % 120000) < 85000
    let custo = pesado ? 20 + rnd() * 8 : 9 + rnd() * 3
    if (rnd() < 0.03) custo += 6 + rnd() * 6
    if (rnd() < 0.002) custo = 60 + rnd() * 120
    custo *= fator(g)
    const intervalo = Math.max(1, Math.ceil(custo / v - 1e-6)) * v
    const q = { t, custo, intervalo, pesado }
    t += intervalo
    if (novo) g.quadro(q.custo, q.intervalo)
    else g.quadro(q.intervalo)
    porDegrau[g.nome] = (porDegrau[g.nome] || 0) + q.intervalo / 1000
    // fora do trecho pesado (e 20 s depois dele): o jogo deveria estar no cheio
    const longe = !q.pesado && ((q.t % 120000) < 50000 || (q.t % 120000) > 105000)
    if (longe) { tDepois += q.intervalo; if (g.degrau === 0) tCheioDepois += q.intervalo }
  }
  for (const k in porDegrau) porDegrau[k] = +porDegrau[k].toFixed(1)
  return { degrauFinal: g.nome, trocas: g.trocas.length, porDegrauS: porDegrau,
    cheioForaDoPesadoPct: +(100 * tCheioDepois / tDepois).toFixed(1), ultimasTrocas: g.trocas.slice(-6) }
}

const res = {}
for (const hz of [60, 120]) {
  res[`${hz}hz`] = { antigo: rodar(Antigo, hz, false), novo: rodar(Novo, hz, true) }
  console.log(`${hz} Hz antigo`, JSON.stringify(res[`${hz}hz`].antigo.porDegrauS), 'final', res[`${hz}hz`].antigo.degrauFinal, 'cheio fora do pesado', res[`${hz}hz`].antigo.cheioForaDoPesadoPct + '%')
  console.log(`${hz} Hz novo  `, JSON.stringify(res[`${hz}hz`].novo.porDegrauS), 'final', res[`${hz}hz`].novo.degrauFinal, 'cheio fora do pesado', res[`${hz}hz`].novo.cheioForaDoPesadoPct + '%')
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(res, null, 1))
