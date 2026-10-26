// Integração localizada no renderizador para não alterar o laço principal.
import { irParaLugar } from '../ui/painel/jogo.js'

import { sinalGpu } from './resolucao-dinamica.js'

export function resumoTempos(valores) {
  const s = [...valores].sort((a, b) => a - b)
  const p = (q) => s[Math.max(0, Math.ceil(s.length * q) - 1)] ?? null
  return { amostras: s.length, media: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null,
    p50: p(.5), p95: p(.95), p99: p(.99), acima33: s.filter(v => v > 33).length,
    acima50: s.filter(v => v > 50).length, acima100: s.filter(v => v > 100).length, pior: s.at(-1) ?? null }
}

export function criarTempoGpu(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2')
  const fila = []
  let ativa = null
  let descartadas = 0
  return {
    disponivel: !!ext,
    get descartadas() { return descartadas },
    iniciar() {
      if (!ext || gl.isContextLost()) return
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (const q of fila.splice(0)) { gl.deleteQuery(q); descartadas++ }
        sinalGpu.ms = null
        return
      }
      // Nunca bloquear esperando a GPU. Limitar também o número de consultas pendentes.
      if (fila.length >= 8 || gl.getQuery(ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return
      ativa = gl.createQuery()
      gl.beginQuery(ext.TIME_ELAPSED_EXT, ativa)
    },
    terminar() {
      if (!ativa) return
      gl.endQuery(ext.TIME_ELAPSED_EXT)
      fila.push(ativa)
      ativa = null
    },
    ler() {
      const tempos = []
      if (!ext || gl.isContextLost()) return tempos
      if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        for (const q of fila.splice(0)) { gl.deleteQuery(q); descartadas++ }
        sinalGpu.ms = null
        return tempos
      }
      while (fila.length && gl.getQueryParameter(fila[0], gl.QUERY_RESULT_AVAILABLE)) {
        const q = fila.shift()
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6
        gl.deleteQuery(q)
        if (Number.isFinite(ms) && ms > 0) {
          tempos.push(ms)
          sinalGpu.ms = ms
          sinalGpu.instante = performance.now()
        }
      }
      return tempos
    },
  }
}

export function instalarMedicaoM1(renderer, cfg) {
  const d = cfg.desempenho
  d.tetoDprEfetivo ??= 1.25 // 0 desliga o teto adicional; tetoRetina continua independente
  d.tempoGpu ??= true
  const setPixelRatio = renderer.setPixelRatio.bind(renderer)
  renderer.setPixelRatio = (ratio) => setPixelRatio(d.tetoDprEfetivo > 0 ? Math.min(ratio, d.tetoDprEfetivo) : ratio)
  const gpu = criarTempoGpu(renderer.getContext())
  const aguardar = () => {
    const m = window.maresia
    if (!m || m.renderer !== renderer) { requestAnimationFrame(aguardar); return }
    // O pós deve usar o mesmo DPR efetivo do canvas, inclusive com teto customizado.
    const tamanho = m.pos.tamanho.bind(m.pos)
    m.pos.tamanho = (w, h, ratio) => tamanho(w, h, d.tetoDprEfetivo > 0 ? Math.min(ratio, d.tetoDprEfetivo) : ratio)
    m.pos.tamanho(innerWidth, innerHeight, renderer.getPixelRatio())
    const desenhar = m.pos.desenhar.bind(m.pos)
    let coletar = null
    m.pos.desenhar = (...args) => {
      const tempos = gpu.ler()
      if (coletar) coletar.push(...tempos)
      if (d.tempoGpu) gpu.iniciar()
      else sinalGpu.ms = null
      try { return desenhar(...args) } finally { gpu.terminar() }
    }
    m.medirM1 = () => medirRota(m, gpu, (v) => { coletar = v })
    if (new URLSearchParams(location.search).has('medirM1')) m.medirM1()
  }
  requestAnimationFrame(aguardar)
}

async function medirRota(m, gpu, coletar) {
  if (m.medicaoM1Ativa) return
  m.medicaoM1Ativa = true
  await m.pronto
  const caixa = document.createElement('pre')
  caixa.style.cssText = 'position:fixed;inset:12px auto auto 12px;z-index:100000;background:#102128;color:white;padding:16px;max-width:90vw;white-space:pre-wrap;font:14px monospace'
  document.body.append(caixa)
  const ocultarPainel = document.createElement('style')
  ocultarPainel.textContent = '.lil-gui { visibility: hidden !important; }'
  document.head.append(ocultarPainel)
  const tempos = [], temposGpu = [], resolucoes = [], longos = [], etapas = []
  const travar = m.cfg.fatia.travar, frente = m.teclas.frente, pausado = m.controle.pausado
  let observador = null, abaOculta = document.hidden
  const visibilidade = () => { if (document.hidden) abaOculta = true }
  document.addEventListener('visibilitychange', visibilidade)
  const loafDisponivel = globalThis.PerformanceObserver?.supportedEntryTypes?.includes('long-animation-frame') ?? false
  if (loafDisponivel) {
    observador = new PerformanceObserver(lista => longos.push(...lista.getEntries().map(e => e.toJSON())))
    observador.observe({ type: 'long-animation-frame' })
  }
  const inicio = performance.now()
  let anterior = null, etapa = -1
  m.cfg.fatia.travar = false
  m.controle.pausado = false
  m.teclas.frente = true
  coletar(temposGpu)
  try {
    await new Promise(resolve => {
      const quadro = agora => {
        if (anterior !== null) tempos.push(agora - anterior)
        anterior = agora
        const decorrido = agora - inicio
        const atual = Math.min(2, Math.floor(decorrido / 15000))
        if (atual !== etapa) {
          etapa = atual
          if (etapa === 1) irParaLugar(m.cfg, 'pracaFerreira', m, 'colunaHora')
          if (etapa === 2) irParaLugar(m.cfg, 'campoUrubu', m, 'urubuRegistro')
          etapas.push({ nome: ['partida', 'colunaHora', 'urubuRegistro'][etapa], ms: decorrido })
        }
        const canvas = m.renderer.domElement
        const ultima = resolucoes.at(-1)
        const ratio = m.pixelRatio()
        if (!ultima || ultima.dprEfetivo !== ratio || ultima.largura !== canvas.width || ultima.altura !== canvas.height)
          resolucoes.push({ ms: decorrido, dprEfetivo: ratio, largura: canvas.width, altura: canvas.height })
        caixa.textContent = `Medição M1: ${etapas.at(-1).nome}\n${Math.min(45, Math.floor(decorrido / 1000))} / 45 s. Mantenha esta aba visível.`
        if (decorrido >= 45000) resolve()
        else requestAnimationFrame(quadro)
      }
      requestAnimationFrame(quadro)
    })
    if (observador) longos.push(...observador.takeRecords().map(e => e.toJSON()))
    const resultado = { versao: 1, data: new Date().toISOString(), duracaoMs: performance.now() - inicio,
      userAgent: navigator.userAgent, dpr: devicePixelRatio, viewport: [innerWidth, innerHeight], abaOculta,
      etapas, quadros: resumoTempos(tempos), intervalosMs: tempos,
      gpu: { disponivel: gpu.disponivel, habilitada: m.cfg.desempenho.tempoGpu, descartadas: gpu.descartadas,
        resumo: resumoTempos(temposGpu), temposMs: temposGpu },
      longAnimationFrames: { disponivel: loafDisponivel, entradas: longos }, resolucoes,
      configuracao: JSON.parse(JSON.stringify(m.cfg.desempenho)), estilo: JSON.parse(JSON.stringify(m.cfg.estilo)) }
    m.ultimaMedicaoM1 = resultado
    caixa.textContent = `Medição M1 concluída${abaOculta ? ' (aba oculta durante a rodada)' : ''}\n${JSON.stringify(resultado.quadros, null, 2)}\nGPU: ${temposGpu.length} amostras, p50 ${resultado.gpu.resumo.p50 ?? 'indisponível'} ms, p95 ${resultado.gpu.resumo.p95 ?? 'indisponível'} ms.\nDPR nativo: ${devicePixelRatio}, efetivo: ${m.pixelRatio()}.\nBuffer: ${m.canvas.width} × ${m.canvas.height}. LoAF: ${loafDisponivel ? longos.length : 'indisponível'}.\nJSON disponível abaixo.`
    const url = URL.createObjectURL(new Blob([JSON.stringify(resultado, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `maresia-m1-${Date.now()}.json`; link.textContent = 'Baixar JSON novamente'
    link.style.color = '#9de0ff'
    caixa.append(document.createElement('br'), link)
    link.click()
    const fechar = document.createElement('button')
    fechar.textContent = 'Fechar'; fechar.onclick = () => { URL.revokeObjectURL(url); caixa.remove() }
    caixa.append(document.createElement('br'), fechar)
  } finally {
    coletar(null)
    ocultarPainel.remove()
    observador?.disconnect()
    document.removeEventListener('visibilitychange', visibilidade)
    m.controle.pausado = pausado
    m.teclas.frente = frente
    m.cfg.fatia.travar = travar
    m.medicaoM1Ativa = false
  }
}
