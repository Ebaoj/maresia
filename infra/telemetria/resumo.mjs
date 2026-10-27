#!/usr/bin/env node
// Puxa as linhas do maresia-telemetria e resume por aparelho/GPU.
// Uso: node resumo.mjs [URL do Worker] [--json]   (padrão: $MARESIA_TELEMETRIA_URL ou http://127.0.0.1:8787)
// A chave de admin vem de ~/.maresia-telemetria-admin (nunca é impressa).
import fs from 'node:fs'
import os from 'node:os'
const args = process.argv.slice(2)
const base = (args.find((a) => /^https?:/.test(a)) || process.env.MARESIA_TELEMETRIA_URL || 'http://127.0.0.1:8787').replace(/\/$/, '')
const chave = fs.readFileSync(`${os.homedir()}/.maresia-telemetria-admin`, 'utf8').trim()
const linhas = []
for (let desde = 0; ;) {
  const r = await fetch(`${base}/v1/sessoes?desde=${desde}&limite=5000`, { headers: { Authorization: `Bearer ${chave}` } })
  if (!r.ok) { console.error(`erro ${r.status}`); process.exit(1) }
  const { linhas: l } = await r.json()
  linhas.push(...l)
  if (l.length < 5000) break
  desde = l[l.length - 1].id
}
const navegador = (ua = '') => (ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/) || [])[0]?.replace('Version', 'Safari') || '?'
const so = (ua = '') => /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '?'
const grupos = new Map()
for (const l of linhas) {
  const d = l.dispositivo || {}
  const k = `${d.gpu || '?'} | ${so(d.ua)} ${navegador(d.ua)} | ${l.render?.motor || '?'}`
  const g = grupos.get(k) || { sessoes: new Set(), quadros: 0, somaMs: 0, p50: [], p95: [], p99: [], t50: 0, t100: 0, causas: {}, chamadas: [], tri: [], res: new Set(), dpr: new Set() }
  g.sessoes.add(l.sessao)
  const q = l.quadros
  g.quadros += q.n; if (q.fps) g.somaMs += q.n * 1000 / q.fps
  for (let i = 0; i < Math.max(1, Math.round(q.n / 100)); i++) { g.p50.push(q.p50); g.p95.push(q.p95); g.p99.push(q.p99) } // peso pelos quadros
  g.t50 += l.travadas.acima50; g.t100 += l.travadas.acima100
  for (const [c, n] of Object.entries(l.travadas.causas || {})) g.causas[c] = (g.causas[c] || 0) + n
  if (l.render) { g.chamadas.push(l.render.chamadas); g.tri.push(l.render.triangulos); g.res.add(l.render.resolucao?.join('x')); g.dpr.add(l.render.dpr) }
  grupos.set(k, g)
}
const med = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const saida = [...grupos].map(([k, g]) => ({
  aparelho: k, sessoes: g.sessoes.size, minutos: +(g.somaMs / 60000).toFixed(1),
  fps: g.somaMs ? +(g.quadros * 1000 / g.somaMs).toFixed(1) : 0,
  p50: med(g.p50), p95: med(g.p95), p99: med(g.p99),
  travadasPorMin50: g.somaMs ? +(g.t50 / (g.somaMs / 60000)).toFixed(2) : 0, travadas100: g.t100,
  causas: Object.entries(g.causas).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c}:${n}`).join(' '),
  chamadas: med(g.chamadas), triangulos: med(g.tri), resolucoes: [...g.res].join(','), dpr: [...g.dpr].join(','),
})).sort((a, b) => b.minutos - a.minutos)
if (args.includes('--json')) { console.log(JSON.stringify(saida, null, 2)); process.exit(0) }
console.log(`${linhas.length} resumos, ${new Set(linhas.map((l) => l.sessao)).size} sessões\n`)
for (const s of saida) {
  console.log(`■ ${s.aparelho}`)
  console.log(`  ${s.sessoes} sessão(ões), ${s.minutos} min · ${s.fps} FPS · quadro p50/p95/p99 ${s.p50}/${s.p95}/${s.p99} ms`)
  console.log(`  travadas >50ms ${s.travadasPorMin50}/min, >100ms ${s.travadas100} · causas: ${s.causas || '-'}`)
  console.log(`  chamadas ${s.chamadas} · triângulos ${s.triangulos} · resolução ${s.resolucoes} · DPR ${s.dpr}\n`)
}
