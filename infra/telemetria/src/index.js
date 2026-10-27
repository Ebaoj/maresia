// maresia-telemetria: recebe resumos de desempenho do jogo (POST /v1/sessao) e entrega ao admin (GET /v1/sessoes).
// Não guarda IP: o limite de taxa usa um hash do IP com sal diário, só na tabela de limite, e expira.
const MAX_BYTES = 64 * 1024
const LIMITE_POR_MIN = 12 // por IP-hash e por sessão
const ORIGENS = [/^https:\/\/ebaoj\.github\.io$/, /^https?:\/\/localhost(:\d+)?$/, /^https?:\/\/127\.0\.0\.1(:\d+)?$/]

const origemOk = (o) => !!o && ORIGENS.some((r) => r.test(o))
function cors(origem) {
  const h = { 'Vary': 'Origin' }
  if (origemOk(origem)) {
    h['Access-Control-Allow-Origin'] = origem
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    h['Access-Control-Allow-Headers'] = 'Content-Type'
    h['Access-Control-Max-Age'] = '86400'
  }
  return h
}
const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...extra } })

const num = (v, min = 0, max = 1e9) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const str = (v, max) => typeof v === 'string' && v.length <= max

export function validar(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return 'corpo não é objeto'
  if (p.v !== 1) return 'versão'
  if (!str(p.sessao, 64) || !/^[A-Za-z0-9_-]{8,64}$/.test(p.sessao)) return 'sessao'
  if (!Number.isInteger(p.seq) || p.seq < 0 || p.seq > 100000) return 'seq'
  if (!str(p.motivo, 24)) return 'motivo'
  const q = p.quadros
  if (!q || typeof q !== 'object') return 'quadros'
  for (const k of ['n', 'fps', 'p50', 'p95', 'p99']) if (!num(q[k], 0, 1e7)) return `quadros.${k}`
  const tr = p.travadas
  if (!tr || !num(tr.acima50, 0, 1e6) || !num(tr.acima100, 0, 1e6)) return 'travadas'
  if (tr.causas && (typeof tr.causas !== 'object' || Object.keys(tr.causas).length > 16)) return 'travadas.causas'
  if (p.dispositivo && typeof p.dispositivo !== 'object') return 'dispositivo'
  const d = p.dispositivo || {}
  if (d.gpu !== undefined && !str(d.gpu, 300)) return 'dispositivo.gpu'
  if (d.ua !== undefined && !str(d.ua, 512)) return 'dispositivo.ua'
  return null
}

async function hashIp(ip, dia) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${dia}|${ip}`))
  return [...new Uint8Array(b).slice(0, 12)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

async function dentroDoLimite(env, chave, agora) {
  const janela = Math.floor(agora / 60000)
  const r = await env.DB.prepare(
    `INSERT INTO limite (chave, janela, n) VALUES (?1, ?2, 1)
     ON CONFLICT(chave) DO UPDATE SET n = CASE WHEN janela = ?2 THEN n + 1 ELSE 1 END, janela = ?2
     RETURNING n`).bind(chave, janela).first()
  return (r?.n ?? 1) <= LIMITE_POR_MIN
}

function igual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let x = 0
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return x === 0
}

async function receber(req, env) {
  const origem = req.headers.get('Origin')
  const h = cors(origem)
  if (!origemOk(origem)) return json({ erro: 'origem' }, 403, h)
  const tam = Number(req.headers.get('Content-Length') || 0)
  if (tam > MAX_BYTES) return json({ erro: 'grande demais' }, 413, h)
  const buf = await req.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) return json({ erro: 'grande demais' }, 413, h)
  let p
  try { p = JSON.parse(new TextDecoder().decode(buf)) } catch { return json({ erro: 'json' }, 400, h) }
  const e = validar(p)
  if (e) return json({ erro: `inválido: ${e}` }, 400, h)
  const agora = Date.now()
  const ip = req.headers.get('CF-Connecting-IP') || 'sem-ip'
  const dia = new Date(agora).toISOString().slice(0, 10)
  const okIp = await dentroDoLimite(env, `ip:${await hashIp(ip, dia + (env.SAL || ''))}`, agora)
  const okSessao = await dentroDoLimite(env, `s:${p.sessao}`, agora)
  if (!okIp || !okSessao) return json({ erro: 'limite' }, 429, { ...h, 'Retry-After': '60' })
  const d = p.dispositivo || {}
  await env.DB.prepare(
    `INSERT INTO sessoes (recebido, sessao, seq, motivo, gpu, ua, fps, p50, p95, p99, travadas50, travadas100, dados)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
    agora, p.sessao, p.seq, p.motivo, d.gpu ?? null, d.ua ?? null,
    p.quadros.fps, p.quadros.p50, p.quadros.p95, p.quadros.p99,
    p.travadas.acima50, p.travadas.acima100, JSON.stringify(p)).run()
  // limpeza preguiçosa da tabela de limite (janelas com mais de 10 min)
  if (Math.random() < 0.02) await env.DB.prepare('DELETE FROM limite WHERE janela < ?').bind(Math.floor(agora / 60000) - 10).run()
  return new Response(null, { status: 204, headers: h })
}

async function listar(req, env, url) {
  const aut = req.headers.get('Authorization') || ''
  if (!env.ADMIN_KEY || !igual(aut, `Bearer ${env.ADMIN_KEY}`)) return json({ erro: 'não autorizado' }, 401)
  const desde = Number(url.searchParams.get('desde') || 0)
  const limite = Math.min(Number(url.searchParams.get('limite') || 5000), 20000)
  const r = await env.DB.prepare('SELECT id, recebido, dados FROM sessoes WHERE id > ? ORDER BY id LIMIT ?').bind(desde, limite).all()
  return json({ linhas: r.results.map((x) => ({ id: x.id, recebido: x.recebido, ...JSON.parse(x.dados) })) }, 200, { 'Cache-Control': 'no-store' })
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url)
    if (req.method === 'OPTIONS' && url.pathname === '/v1/sessao') {
      const o = req.headers.get('Origin')
      return new Response(null, { status: origemOk(o) ? 204 : 403, headers: cors(o) })
    }
    if (req.method === 'POST' && url.pathname === '/v1/sessao') return receber(req, env)
    if (req.method === 'GET' && url.pathname === '/v1/sessoes') return listar(req, env, url)
    if (url.pathname === '/') return new Response('maresia-telemetria\n')
    return json({ erro: 'não achado' }, 404)
  },
}
