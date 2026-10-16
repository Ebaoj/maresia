// Gravador de vídeo para depuração (só no modo de desenvolvimento).
// Pausa o laço normal, roda a simulação com passo fixo e manda cada quadro
// para o servidor do Vite, que salva em docs/capturas/video/<nome>/.
// Uso no console: await maresia.gravar({ nome: 'teste', segundos: 4, fps: 30, roteiro })
// roteiro(t, m) é chamado a cada quadro para apertar teclas e girar a câmera.

export function instalar(m) {
  m.gravar = async ({ nome = 'gravacao', segundos = 4, fps = 30, roteiro = () => {} } = {}) => {
    m.controle.pausado = true
    const dt = 1 / fps
    const total = Math.round(segundos * fps)
    const envios = []
    try {
      for (let i = 0; i < total; i++) {
        roteiro(i * dt, m)
        m.passo(dt)
        // logo depois de desenhar, antes do navegador limpar o quadro
        const dados = m.canvas.toDataURL('image/jpeg', 0.88)
        envios.push(fetch(`/__quadro?nome=${encodeURIComponent(nome)}&n=${i}`, { method: 'POST', body: dados }))
        if (envios.length > 8) await envios.shift()
      }
      await Promise.all(envios)
    } finally {
      for (const k in m.teclas) m.teclas[k] = false
      m.controle.pausado = false
    }
    return { nome, quadros: total }
  }
}
