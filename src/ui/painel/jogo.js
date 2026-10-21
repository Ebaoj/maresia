// Seção "Jogo": o relógio do dia, o som, a fatia e a câmera.
// Padrão para controle novo: pasta.add(cfg.grupo, 'chave', min, max, passo).name('nome em português')

import { lugaresJogo } from '../../mundo/fortaleza1932.js'
import { VISTAS_MARCOS } from '../../mundo/vistas-marcos.js'

// "Ir para": atalhos para os lugares mais conhecidos de Fortaleza em 1932 (pedido do Joabe, 21/10/2026),
// para conferir cada um. A chave é a de LUGARES em src/mundo/fortaleza1932.js; quem é prédio vai para a praça
// ou o largo da frente (a Estação vai para a Praça da Estação). O 3º item, quando há, é um ponto de vista de
// src/mundo/vistas-marcos.js: o jogador vai para onde o quadro de conceito do marco foi pintado, olhando para ele.
export const DESTINOS = [
  ['Praça do Ferreira', 'pracaFerreira'],
  ['Passeio Público', 'passeioPublico'],
  ['Estação Central', 'pracaEstacao', 'estacao'],
  ['Sé', 'se'],
  ['Forte', 'forte'],
  ['Mercado', 'mercado'],
  ['Theatro José de Alencar', 'theatro'],
  ['Praça dos Leões', 'pracaLeoes'],
  ['Santa Casa', 'santaCasa'],
  ['Ponte Velha (Metálica)', 'ponteVelha'],
  ['Ponte dos Ingleses', 'ponteIngleses'],
  ['Poço da Draga', 'pocoDraga'],
  ['Farol do Mucuripe', 'farol'],
  ['Campo do Urubu', 'campoUrubu'],
  ['Oficinas do Urubu', 'oficinasUrubu'],
  ['Barra do Ceará', 'barraCeara'],
]

// leva o jogador ao lugar: solta a fatia (senão ele bate na borda dela) e usa o teleporte do jogo
export function irParaLugar(cfg, chave, maresia = globalThis.window?.maresia, vista = null) {
  const p = lugaresJogo[chave]
  if (!p || !maresia?.irPara) return false
  cfg.fatia.travar = false
  const v = vista && VISTAS_MARCOS[vista]
  if (v) {
    maresia.irPara(v.x, v.z, v.yaw, v.hora)
    if (maresia.cam) maresia.cam.pitch = v.pitch
  } else maresia.irPara(p[0], p[1])
  return true
}

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

  const ir = jogo.addFolder('Ir para')
  const botoes = {}
  for (const [nome, chave, vista] of DESTINOS) {
    // a chave do botão é a do lugar; o segundo ponto de vista do mesmo lugar usa a da vista
    const k = botoes[chave] ? vista : chave
    botoes[k] = () => irParaLugar(cfg, chave, undefined, vista)
    ir.add(botoes, k).name('📍 ' + nome)
  }

  const cam = jogo.addFolder('Câmera')
  cam.add(cfg.camera, 'distancia', 2.5, 45, 0.1).name('distância').listen()
  cam.add(cfg.camera, 'altura', 0, 5, 0.05).name('altura')
  cam.add(cfg.camera, 'fov', 25, 100, 1).name('abertura (fov)')
  cam.add(cfg.camera, 'inclinacaoCorrida', 0, 0.3, 0.005).name('inclinação ao correr')
  return jogo
}
