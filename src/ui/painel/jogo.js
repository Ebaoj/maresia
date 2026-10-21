// Seção "Jogo": o relógio do dia, o som, a fatia e a câmera.
// Padrão para controle novo: pasta.add(cfg.grupo, 'chave', min, max, passo).name('nome em português')

export function secaoJogo(gui, cfg) {
  const jogo = gui.addFolder('Jogo')
  jogo.add(cfg.tempo, 'hora', 0, 24, 0.01).name('hora do dia').listen()
  const atalhos = {
    amanhecer: () => { cfg.tempo.hora = 5.9 },
    meioDia: () => { cfg.tempo.hora = 12 },
    porDoSol: () => { cfg.tempo.hora = 17.6 },
    noite: () => { cfg.tempo.hora = 21 },
  }
  jogo.add(atalhos, 'amanhecer').name('🌅 amanhecer')
  jogo.add(atalhos, 'meioDia').name('☀️ meio-dia')
  jogo.add(atalhos, 'porDoSol').name('🌇 pôr do sol')
  jogo.add(atalhos, 'noite').name('🌙 noite')
  jogo.add(cfg.tempo, 'pausado').name('parar o relógio')
  jogo.add(cfg.tempo, 'velocidade', 0, 30, 0.1).name('horas do jogo por minuto')
  jogo.add(cfg.audio, 'volume', 0, 1, 0.01).name('volume do som (N liga)')
  jogo.add(cfg.fatia, 'travar').name('prender o jogador na fatia')

  const cam = jogo.addFolder('Câmera')
  cam.add(cfg.camera, 'distancia', 2.5, 45, 0.1).name('distância').listen()
  cam.add(cfg.camera, 'altura', 0, 5, 0.05).name('altura')
  cam.add(cfg.camera, 'fov', 25, 100, 1).name('abertura (fov)')
  cam.add(cfg.camera, 'inclinacaoCorrida', 0, 0.3, 0.005).name('inclinação ao correr')
  return jogo
}
