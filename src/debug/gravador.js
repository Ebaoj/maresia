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
        // quadro novo para o WebGPU a cada passo (pisca, 22/10/2026; o mesmo do medidor e da foto justa): o three só
        // refaz o que é "por quadro" (mapas de sombra, ossos) quando o contador de quadros dele anda, e ele só anda no
        // quadro do navegador. Nos passos seguidos daqui ele andava só de vez em quando (quando a espera do envio
        // deixava o navegador desenhar): a sombra e o boneco ficavam velhos num quadro e certos no seguinte, e o vídeo
        // piscava sem o jogo piscar
        if (m.webgpu) m.renderer._nodes.nodeFrame.update()
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
