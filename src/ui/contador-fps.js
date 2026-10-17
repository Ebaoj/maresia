// Contagem de quadros por segundo do jogo, no alto da tela (cfg.desempenho.mostrarFps, no painel).
// É o FPS de quem desenha o jogo: no streaming (AWS, Modal), o da máquina lá longe.

export function criarContadorFps(cfg) {
  const el = document.createElement('div')
  el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:50;pointer-events:none;' +
    'font:600 13px/1.3 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,.55);padding:3px 9px;border-radius:6px'
  document.body.appendChild(el)
  let quadros = 0
  let t0 = performance.now()
  return {
    quadro() {
      quadros++
      const t = performance.now()
      if (t - t0 < 500) return
      el.style.display = cfg.desempenho.mostrarFps ? '' : 'none'
      el.textContent = `${Math.round((quadros * 1000) / (t - t0))} FPS · ${((t - t0) / quadros).toFixed(1)} ms`
      quadros = 0
      t0 = t
    },
  }
}
