// Custo do quadro (27/10/2026, visual/correcoes; docs/correcoes-visual.md): o trabalho que o quadro deu, para o
// governador e a resolução dinâmica, no lugar do intervalo do requestAnimationFrame (preso ao vsync: a 60 Hz nunca
// fica abaixo de 16,7 ms, e o governador virava catraca).
//   CPU: do começo ao fim do passo() (performance.now()).
//   Placa: WebGPU, do começo do passo até a placa terminar o que ele mandou (onSubmittedWorkDone, um por vez; inclui a
//          CPU). WebGL, o cronômetro EXT_disjoint_timer_query_webgl2 quando o navegador der (o resultado chega
//          alguns quadros depois; quadro "disjunto" ou acima de 100 ms é jogado fora). Sem cronômetro, só a CPU.
// O custo é o maior dos dois (CPU e placa trabalham em paralelo: o quadro custa o mais lento), com o último valor da
// placa que chegou. `cfg.desempenho.cronometroGpu` false desliga o cronômetro do WebGL (no Mac ele já deu números
// incoerentes no medidor: CLAUDE.md).

const MAX_PENDENTES = 4
const GPU_MAX_MS = 100

export function criarCustoQuadro(renderer, { webgpu = false, cfg = null } = {}) {
  let cpuMs = 0
  let gpuMs = 0
  let t0 = 0
  // WebGPU
  let esperando = false
  // WebGL
  const gl = !webgpu && renderer.getContext ? renderer.getContext() : null
  const ext = gl?.getExtension ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null
  const pendentes = []
  let aberta = null
  const cronometroLigado = () => !!ext && cfg?.desempenho?.cronometroGpu !== false

  function colher() {
    while (pendentes.length && gl.getQueryParameter(pendentes[0], gl.QUERY_RESULT_AVAILABLE)) {
      const q = pendentes.shift()
      const disjunto = gl.getParameter(ext.GPU_DISJOINT_EXT)
      const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6
      gl.deleteQuery(q)
      if (!disjunto && ms > 0 && ms < GPU_MAX_MS) gpuMs = ms
    }
  }

  return {
    get temCronometroGpu() { return webgpu || cronometroLigado() },
    get cpuMs() { return cpuMs },
    get gpuMs() { return gpuMs },
    inicio() {
      t0 = performance.now()
      if (cronometroLigado() && !aberta && pendentes.length < MAX_PENDENTES) {
        aberta = gl.createQuery()
        gl.beginQuery(ext.TIME_ELAPSED_EXT, aberta)
      }
    },
    // devolve o custo deste quadro (ms): CPU deste e o último tempo de placa conhecido
    fim() {
      const agora = performance.now()
      cpuMs = agora - t0
      if (aberta) { gl.endQuery(ext.TIME_ELAPSED_EXT); pendentes.push(aberta); aberta = null }
      if (ext && pendentes.length) colher()
      if (!cronometroLigado()) gpuMs = 0
      if (webgpu && !esperando && renderer.backend?.device) {
        esperando = true
        const ti = t0
        renderer.backend.device.queue.onSubmittedWorkDone().then(() => { gpuMs = performance.now() - ti; esperando = false })
      }
      return Math.max(cpuMs, gpuMs)
    },
  }
}
