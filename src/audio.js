// Som ambiente gerado na hora, sem arquivo de áudio:
// mar = ruído marrom filtrado com volume que sobe e desce como onda;
// vento = ruído branco num filtro estreito, mais forte no alto dos morros.

function bufferRuido(ctx, marrom) {
  const tam = ctx.sampleRate * 3
  const buf = ctx.createBuffer(1, tam, ctx.sampleRate)
  const d = buf.getChannelData(0)
  let ultimo = 0
  for (let i = 0; i < tam; i++) {
    const branco = Math.random() * 2 - 1
    if (marrom) {
      ultimo = (ultimo + 0.02 * branco) / 1.02
      d[i] = ultimo * 3.5
    } else {
      d[i] = branco
    }
  }
  return buf
}

export function criarSom(cfg) {
  let ctx = null
  let mestre = null
  let mar = null
  let vento = null
  let ligado = false // começa mudo; tecla N liga

  function iniciar() {
    if (ctx) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = new AC()
    mestre = ctx.createGain()
    mestre.gain.value = 0
    mestre.connect(ctx.destination)

    const fonteMar = ctx.createBufferSource()
    fonteMar.buffer = bufferRuido(ctx, true)
    fonteMar.loop = true
    const filtroMar = ctx.createBiquadFilter()
    filtroMar.type = 'lowpass'
    filtroMar.frequency.value = 520
    mar = ctx.createGain()
    mar.gain.value = 0.3
    // duas ondas lentas em ritmos diferentes, para não soar repetido
    for (const [freq, prof] of [[0.085, 0.18], [0.13, 0.1]]) {
      const lfo = ctx.createOscillator()
      lfo.frequency.value = freq
      const g = ctx.createGain()
      g.gain.value = prof
      lfo.connect(g).connect(mar.gain)
      lfo.start()
    }
    fonteMar.connect(filtroMar).connect(mar).connect(mestre)
    fonteMar.start()

    const fonteVento = ctx.createBufferSource()
    fonteVento.buffer = bufferRuido(ctx, false)
    fonteVento.loop = true
    const filtroVento = ctx.createBiquadFilter()
    filtroVento.type = 'bandpass'
    filtroVento.frequency.value = 800
    filtroVento.Q.value = 0.7
    vento = ctx.createGain()
    vento.gain.value = 0.02
    fonteVento.connect(filtroVento).connect(vento).connect(mestre)
    fonteVento.start()
  }

  return {
    iniciar,
    alternar() {
      ligado = !ligado
      if (ligado) iniciar()
      if (ctx) mestre.gain.setTargetAtTime(ligado ? cfg.audio.volume : 0, ctx.currentTime, 0.2)
      return ligado
    },
    atualizar(distanciaMar, altura) {
      if (!ctx) return
      const t = ctx.currentTime
      const pertoMar = Math.max(0.05, 1 - Math.max(0, distanciaMar) / 160)
      mar.gain.setTargetAtTime(0.32 * pertoMar, t, 0.5)
      vento.gain.setTargetAtTime(0.015 + Math.min(0.06, Math.max(0, altura) / 900), t, 0.8)
      mestre.gain.setTargetAtTime(ligado ? cfg.audio.volume : 0, t, 0.3)
    },
  }
}
