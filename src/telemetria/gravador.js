// Telemetria de desempenho (sempre ligada; ?semTelemetria desliga): a cada 30 s, e ao sair/esconder a aba, manda um
// resumo anônimo ao Worker maresia-telemetria via sendBeacon. Sem IP, sem nada do jogador: só números do quadro e do
// aparelho. O custo por quadro é um performance.now() e umas comparações; ordenar e montar o resumo fica fora do quadro.
import { geracaoTexturas } from '../globais.js'

const URL_PADRAO = 'https://maresia-telemetria.joabecornelio.workers.dev' // ou VITE_TELEMETRIA_URL
const INTERVALO_MS = 30000
const MAX_QUADROS = 8192 // por janela de 30 s (até ~270 FPS)

export function telemetriaDesligada(busca = location.search) {
  return new URLSearchParams(busca).has('semTelemetria')
}

function idAleatorio() {
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export function percentil(ordenado, n, p) {
  if (!n) return 0
  return ordenado[Math.min(n - 1, Math.floor(p * n))]
}

function gpuDe(renderer) {
  try {
    const gl = renderer.getContext?.()
    if (gl && gl.getExtension) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      if (ext) return { fornecedor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL), gpu: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) }
      return { fornecedor: gl.getParameter(gl.VENDOR), gpu: gl.getParameter(gl.RENDERER) }
    }
    const a = renderer.backend?.adapter?.info // WebGPU
    if (a) return { fornecedor: a.vendor, gpu: [a.architecture, a.device, a.description].filter(Boolean).join(' ') || 'webgpu' }
  } catch { /* sem GPU legível */ }
  return { fornecedor: null, gpu: null }
}

// Causa provável de uma travada: o que mais pesou no quadro anterior, entre os sistemas que avisam (marcar),
// e se nesse quadro chegou textura nova ou o renderizador compilou programa novo
export function causaProvavel(ms, marcas, texturaNova, shaderNovo) {
  let causa = null, maior = 0
  for (const k in marcas) if (marcas[k] > maior) { maior = marcas[k]; causa = k }
  if (causa && maior >= ms * 0.3) return causa
  if (shaderNovo) return 'shader'
  if (texturaNova) return 'textura'
  return causa && maior >= 8 ? causa : 'desconhecida'
}

export function criarTelemetria({ renderer, canvas, url, busca = location.search, intervaloMs = INTERVALO_MS } = {}) {
  if (telemetriaDesligada(busca)) return null
  const destino = (url || import.meta.env.VITE_TELEMETRIA_URL || URL_PADRAO).replace(/\/$/, '') + '/v1/sessao'
  if (destino.includes('PREENCHER')) return null
  const sessao = idAleatorio()
  const inicio = performance.now()
  const ms = new Float32Array(MAX_QUADROS)
  let n = 0, seq = 0, acima50 = 0, acima100 = 0, ultimo = 0, piorMs = 0
  let causas = {}
  const marcas = {} // ms gastos por sistema no quadro em curso
  let geracaoTex = geracaoTexturas.valor
  let programas = renderer.info?.programs?.length ?? 0
  let custoProprio = 0, amostrasCusto = 0
  let amostrando = false, autoResetAntes = true, contaQuadros = 0
  const amostra = { chamadas: 0, triangulos: 0 }
  const gpu = gpuDe(renderer)

  function quadro() {
    const t = performance.now()
    if (ultimo) {
      const d = t - ultimo
      if (n < MAX_QUADROS) ms[n++] = d
      if (d > 50) {
        acima50++
        if (d > 100) acima100++
        if (d > piorMs) piorMs = d
        const progs = renderer.info?.programs?.length ?? programas
        const c = causaProvavel(d, marcas, geracaoTexturas.valor !== geracaoTex, progs !== programas)
        causas[c] = (causas[c] || 0) + 1
      }
    }
    ultimo = t
    for (const k in marcas) marcas[k] = 0
    // base para a próxima travada: textura nova chegou? programa novo compilou? (só leituras de contador)
    geracaoTex = geracaoTexturas.valor
    programas = renderer.info?.programs?.length ?? programas
    // chamadas e triângulos do quadro inteiro: o three zera renderer.info a cada render() (o filtro desenha várias
    // passadas). De 256 em 256 quadros, desliga o autoReset por um quadro, lê o total e devolve como estava
    const info = renderer.info
    if (info) {
      if (amostrando) {
        amostra.chamadas = info.render.calls ?? info.render.drawCalls ?? 0
        amostra.triangulos = info.render.triangles ?? 0
        info.autoReset = autoResetAntes
        amostrando = false
      } else if (((++contaQuadros & 255) === 0 || !amostra.chamadas) && typeof info.reset === 'function') {
        autoResetAntes = info.autoReset
        info.autoReset = false
        info.reset()
        amostrando = true
      }
    }
    custoProprio += performance.now() - t
    amostrasCusto++
  }

  // sistemas avisam quanto gastaram no quadro: marcar('casas', ms)
  function marcar(nome, duracao) { marcas[nome] = (marcas[nome] || 0) + duracao }

  function resumo(motivo) {
    const ord = ms.slice(0, n).sort()
    let soma = 0
    for (let i = 0; i < n; i++) soma += ord[i]
    const info = renderer.info || {}
    const r = info.render || {}
    const mem = info.memory || {}
    const p = {
      v: 1, sessao, seq: seq++, motivo,
      t: Math.round(performance.now() - inicio),
      base: import.meta.env.BASE_URL,
      quadros: {
        n, fps: n && soma ? +(n * 1000 / soma).toFixed(1) : 0,
        p50: +percentil(ord, n, 0.5).toFixed(2), p95: +percentil(ord, n, 0.95).toFixed(2), p99: +percentil(ord, n, 0.99).toFixed(2),
        pior: +piorMs.toFixed(1),
      },
      travadas: { acima50, acima100, causas },
      render: {
        chamadas: amostra.chamadas || (r.calls ?? r.drawCalls ?? 0), triangulos: amostra.triangulos || (r.triangles ?? 0),
        geometrias: mem.geometries ?? 0, texturas: mem.textures ?? 0, programas: info.programs?.length ?? 0,
        dpr: devicePixelRatio, pixelRatio: renderer.getPixelRatio?.() ?? null,
        resolucao: [canvas?.width ?? 0, canvas?.height ?? 0],
        motor: renderer.isWebGPURenderer ? 'webgpu' : 'webgl',
      },
      dispositivo: {
        gpu: gpu.gpu ? String(gpu.gpu).slice(0, 300) : null, fornecedor: gpu.fornecedor ? String(gpu.fornecedor).slice(0, 120) : null,
        ua: navigator.userAgent.slice(0, 512),
        tela: [screen.width, screen.height], janela: [innerWidth, innerHeight],
        nucleos: navigator.hardwareConcurrency ?? null, memoriaGb: navigator.deviceMemory ?? null,
      },
      custoGravadorMs: amostrasCusto ? +(custoProprio / amostrasCusto).toFixed(4) : 0,
    }
    n = 0; acima50 = 0; acima100 = 0; piorMs = 0; causas = {}; custoProprio = 0; amostrasCusto = 0
    return p
  }

  function enviar(motivo) {
    if (!n) return
    const corpo = JSON.stringify(resumo(motivo))
    // text/plain: o sendBeacon não faz preflight; o Worker lê o JSON do mesmo jeito
    const blob = new Blob([corpo], { type: 'text/plain;charset=UTF-8' })
    if (!navigator.sendBeacon?.(destino, blob)) fetch(destino, { method: 'POST', body: blob, keepalive: true, mode: 'cors' }).catch(() => {})
  }

  const relogio = setInterval(() => enviar('intervalo'), intervaloMs)
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') enviar('oculto') })
  addEventListener('pagehide', () => enviar('saida'))
  avisar()

  return { quadro, marcar, enviar, sessao, parar: () => clearInterval(relogio) }
}

// Aviso curto na primeira tela (some sozinho; não volta depois de visto)
function avisar() {
  try { if (localStorage.getItem('maresia.avisoTelemetria')) return; localStorage.setItem('maresia.avisoTelemetria', '1') } catch { /* sem storage */ }
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:60;max-width:90vw;' +
    'font:14px/1.35 system-ui,sans-serif;color:#fff;background:rgba(0,0,0,.7);padding:8px 14px;border-radius:8px;' +
    'transition:opacity .6s;pointer-events:none;text-align:center'
  el.textContent = 'O Maresia coleta dados anônimos de desempenho (FPS, placa de vídeo) para melhorar o jogo. Para não enviar, abra com ?semTelemetria.'
  document.body.appendChild(el)
  setTimeout(() => { el.style.opacity = '0' }, 9000)
  setTimeout(() => el.remove(), 10000)
}
