// Painel de debug: cada número do jogo vira um controle deslizante.
// É o "mini motor de jogo" do vídeo do André Elias: ajustar no olho, não no prompt.

import GUI from 'lil-gui'
import { salvarConfig, restaurarPadrao } from '../config.js'

export function criarPainel(cfg) {
  const gui = new GUI({ title: 'Maresia · ajustes (H esconde)' })
  let visivel = true

  const tempo = gui.addFolder('Hora do dia')
  tempo.add(cfg.tempo, 'hora', 0, 24, 0.01).name('hora').listen()
  tempo.add(cfg.tempo, 'velocidade', 0, 30, 0.1).name('horas por minuto')
  tempo.add(cfg.tempo, 'pausado').name('parar o relógio')
  const atalhos = {
    amanhecer: () => { cfg.tempo.hora = 5.9 },
    meioDia: () => { cfg.tempo.hora = 12 },
    porDoSol: () => { cfg.tempo.hora = 17.6 },
    noite: () => { cfg.tempo.hora = 21 },
  }
  tempo.add(atalhos, 'amanhecer').name('🌅 amanhecer')
  tempo.add(atalhos, 'meioDia').name('☀️ meio-dia')
  tempo.add(atalhos, 'porDoSol').name('🌇 pôr do sol')
  tempo.add(atalhos, 'noite').name('🌙 noite')

  const e = cfg.estilo
  const arc = gui.addFolder('Visual (Arcane)')
  arc.add(e, 'visual', ['arcane', 'quadrinho']).name('visual (recarregar)')
  arc.add(e, 'arcSombra', 0, 1, 0.01).name('limite da sombra')
  arc.add(e, 'arcLuz', 0, 1.5, 0.01).name('limite da luz')
  arc.add(e, 'arcSuave', 0, 0.3, 0.005).name('passagem entre faixas')
  arc.add(e, 'arcPincel', 0, 1, 0.01).name('pincelada na borda')
  arc.addColor(e, 'arcCorSombra').name('cor da sombra')
  arc.add(e, 'arcNivelSombra', 0, 1.2, 0.01).name('força da sombra')
  arc.add(e, 'arcNivelMeio', 0, 1.5, 0.01).name('força do meio-tom')
  arc.add(e, 'arcNivelLuz', 0, 2, 0.01).name('força da luz')
  arc.add(e, 'arcLinha', 0, 1, 0.01).name('contorno da silhueta')
  arc.add(e, 'arcSaturacao', 0, 2, 0.01).name('saturação')
  arc.add(e, 'arcGrao', 0, 0.2, 0.005).name('grão de filme')
  arc.add(e, 'arcTextura', 0, 2, 0.05).name('textura pintada do mundo')
  arc.add(e, 'arcContraste', 0.6, 2, 0.01).name('contraste')
  arc.add(e, 'arcExposicao', 0.5, 1.5, 0.01).name('exposição')
  const est = gui.addFolder('Estética (quadrinho)')
  const epoca = gui.addFolder('Época')
  epoca.add(e, 'memoria', 0, 1, 0.01).name('1932 → 1881 (memória)').listen()
  const atalhosEpoca = { presente: () => { e.memoria = 0 }, memoria: () => { e.memoria = 1 } }
  epoca.add(atalhosEpoca, 'presente').name('⛵ 1932 (presente)')
  epoca.add(atalhosEpoca, 'memoria').name('📰 1881 (memória)')
  const traco = est.addFolder('Traço de nanquim')
  traco.add(e, 'espessuraLinha', 0.5, 4, 0.05).name('espessura')
  traco.add(e, 'intensidadeTinta', 0, 1, 0.01).name('força')
  traco.addColor(e, 'corTinta').name('cor da tinta')
  traco.add(e, 'limiarProfundidade', 0.01, 0.4, 0.005).name('sensib. silhueta')
  traco.add(e, 'limiarNormal', 0.05, 1, 0.01).name('sensib. dobras')
  traco.add(e, 'distanciaLinha', 40, 800, 5).name('alcance (m)')
  traco.add(e, 'tremorLinha', 0, 4, 0.05).name('tremor')
  traco.add(e, 'fpsTraco', 1, 24, 1).name('redesenhos/s')

  const ret = est.addFolder('Retícula e hachura')
  ret.add(e, 'tamanhoPonto', 2, 16, 0.1).name('tamanho do ponto')
  ret.add(e, 'limiarReticula', 0, 1, 0.01).name('a partir de que sombra')
  ret.add(e, 'intensidadeReticula', 0, 1, 0.01).name('força')
  ret.addColor(e, 'corReticula').name('cor do ponto')
  ret.add(e, 'tintaReticula', 0, 1, 0.01).name('quanto da cor')
  ret.add(e, 'hachura', 0, 1, 0.01).name('hachura')
  ret.add(e, 'espacoHachura', 2, 14, 0.1).name('espaço da hachura')
  ret.add(e, 'limiarHachura', 0, 0.6, 0.01).name('hachura a partir de')

  const lente = est.addFolder('Lente e impressão')
  lente.add(e, 'aberracao', 0, 0.06, 0.001).name('aberração cromática')
  lente.add(e, 'desalinho', 0, 5, 0.05).name('cor fora do traço')
  lente.add(e, 'desfoqueFundo', 0, 2, 0.01).name('desfoque do fundo')
  lente.add(e, 'focoDistancia', 20, 500, 1).name('começa a desfocar (m)')
  lente.add(e, 'saturacao', 0, 2, 0.01).name('saturação')
  lente.add(e, 'exposicao', 0.4, 2, 0.01).name('exposição')
  lente.add(e, 'papel', 0, 0.3, 0.005).name('textura de papel')
  lente.add(e, 'grao', 0, 0.2, 0.005).name('grão')
  lente.add(e, 'vinheta', 0, 1, 0.01).name('vinheta')
  lente.add(e, 'linhasVelocidade').name('linhas de velocidade')

  const luz = est.addFolder('Luz e pintura')
  luz.add(e, 'pincel', 0, 1.2, 0.01).name('pincelada')
  luz.add(e, 'pincelEscala', 0.1, 3, 0.01).name('tamanho da pincelada')
  luz.add(e, 'oclusao', 0, 1.5, 0.01).name('cantos escuros (AO)')
  luz.add(e, 'raioOclusao', 0.2, 5, 0.05).name('alcance dos cantos (m)')
  luz.add(e, 'brilho', 0, 3, 0.01).name('brilho das luzes')
  luz.add(e, 'limiarBrilho', 0.3, 3, 0.01).name('o que brilha a partir de')
  luz.add(e, 'nevoaDensidade', 0, 0.01, 0.0001).name('névoa em camadas')
  luz.add(e, 'nevoaQueda', 0, 0.3, 0.001).name('névoa some com a altura')
  luz.add(e, 'maresia', 0, 0.03, 0.0005).name('maresia (fundo perde cor)')
  luz.addColor(e, 'corSombra').name('cor da sombra')
  luz.add(e, 'tomSombra', 0, 1, 0.01).name('quanto da cor na sombra')
  luz.addColor(e, 'corLuz').name('cor da luz')
  luz.add(e, 'tomLuz', 0, 1, 0.01).name('quanto da cor na luz')
  traco.add(e, 'pesoCenario', 0, 1, 0.01).name('força no cenário')

  const mask = est.addFolder('Luz como máscara')
  mask.add(e, 'pontosNaLuz').name('pontos na luz, hachura na sombra')
  mask.add(e, 'limiarLuzPontos', 0.3, 2, 0.01).name('pontos a partir de (luz)')
  mask.add(e, 'intensidadePontosLuz', 0, 1, 0.01).name('força dos pontos')
  mask.addColor(e, 'corPontoLuz').name('cor dos pontos')
  mask.add(e, 'limiarHachuraLuz', 0, 1.2, 0.01).name('hachura abaixo de (luz)')
  mask.add(e, 'hachuraOclusao', 0, 3, 0.01).name('cantos viram hachura')
  mask.add(e, 'hachuraCruzada', 0, 1, 0.01).name('hachura cruzada')
  mask.add(e, 'brilhoEmPontos', 0, 1, 0.01).name('brilho em pontos')
  mask.add(e, 'distanciaReticula', 30, 800, 5).name('pontos e hachura até (m)')

  const fat = gui.addFolder('Fatia vertical')
  fat.add(cfg.fatia, 'travar').name('prender o jogador na fatia')
  est.add(e, 'tonsLuz', [2, 3, 5]).name('degraus de luz (recarregar)')

  const p = gui.addFolder('Personagem')
  p.add(cfg.personagem, 'velocidade', 1, 10, 0.1).name('andar (m/s)')
  p.add(cfg.personagem, 'corrida', 2, 20, 0.1).name('correr (m/s)')
  p.add(cfg.personagem, 'pulo', 2, 20, 0.1).name('força do pulo')
  p.add(cfg.personagem, 'gravidade', 5, 60, 0.5)
  p.add(cfg.personagem, 'fpsPose', 4, 60, 1).name('poses por segundo')
  p.add(cfg.personagem, 'posicaoEm2').name('corpo todo "em 2"')
  p.add(cfg.personagem, 'corpoNovo').name('corpo novo (mocap; recarregar)')
  p.add(cfg.personagem, 'modelo', ['neto', 'boneco']).name('modelo do jogador (recarregar)')
  p.add(cfg.personagem, 'chapeu').name('chapéu no neto (recarregar)')
  p.add(cfg.personagem, 'ombros', 0.6, 1.1, 0.01).name('largura dos ombros (recarregar)')
  p.add(cfg.personagem, 'folgaCamisa', 0, 0.05, 0.002).name('folga da camisa (recarregar)')
  p.add(cfg.personagem, 'clavicula', 0, 40, 1).name('ombro: caimento (graus)')
  p.add(cfg.personagem, 'panoSolto', 0, 2, 0.05).name('tecido solto (força)')
  p.add(cfg.personagem, 'roupaJolt').name('roupa no Jolt (recarregar)')
  p.add(cfg.personagem, 'avo').name('avô perto do começo (recarregar)')
  p.add(cfg.personagem, 'avoMovimento', ['parado', 'velho-parado']).name('movimento do avô (recarregar)')
  p.add(cfg.personagem, 'rostoAvo').name('avô com rosto desenhado (recarregar)')
  p.add(cfg.personagem, 'avoTripo').name('avô do Tripo ao lado (recarregar)')
  p.add(cfg.personagem, 'avoTripoMovimento', ['velho-parado', 'parado']).name('movimento do avô do Tripo (recarregar)')
  p.add(cfg.personagem, 'dobras', 0, 1.5, 0.05).name('dobras desenhadas')
  p.add(cfg.personagem, 'rostoNeto').name('rosto desenhado no neto (recarregar)')
  p.add(cfg.personagem, 'estiloRostoNeto', ['atual', 'aranhaverso', 'grande', 'grande-mel', 'grande-oval', 'gato', 'gato-ambar', 'gato-palpebra', 'minimo', 'minimo-feijao', 'minimo-brilho', 'brilho-alto', 'brilho-maior', 'brilho-duplo', 'brilho-castanho', 'brilho-sobrancelha', 'brilho-triste-oval']).name('estilo do rosto desenhado').onChange((v) => { window.maresia?.jogador?.animador?.rosto?.estilo(v); window.maresia?.avo?.rosto?.estilo(v) })
  p.add(cfg.personagem, 'velocidadeNova', 0.8, 10, 0.1).name('corpo novo: andar (m/s)')
  p.add(cfg.personagem, 'corridaNova', 2, 15, 0.1).name('corpo novo: correr (m/s)')
  p.add(cfg.personagem, 'peNoChao').name('corpo novo: pé no chão (IK)')
  p.add(cfg.personagem, 'inclinar').name('corpo novo: inclinar na curva')
  p.add(cfg.personagem, 'afundaAreia', 0, 0.08, 0.005).name('corpo novo: afunda na areia (m)')
  p.add(cfg.personagem, 'joelhos', 0, 40, 1).name('corpo novo: joelho parado (graus)')
  p.add(cfg.personagem, 'motionMatching').name('corpo novo: motion matching')
  p.add(cfg.personagem, 'fpsAcao', 6, 60, 1).name('poses por segundo na ação')
  p.add(cfg.personagem, 'pausaPulo').name('pausa no alto do pulo')
  p.add(cfg.personagem, 'multiplos', 0, 1.5, 0.05).name('múltiplos (rastro em retícula)')

  const c = gui.addFolder('Câmera')
  c.add(cfg.camera, 'distancia', 2.5, 45, 0.1).name('distância').listen()
  c.add(cfg.camera, 'altura', 0, 5, 0.05)
  c.add(cfg.camera, 'fov', 25, 100, 1).name('abertura (fov)')
  c.add(cfg.camera, 'inclinacaoCorrida', 0, 0.3, 0.005).name('inclinação correndo')

  const g = gui.addFolder('Grama')
  g.add(cfg.grama, 'raio', 10, 80, 1).name('raio em volta (m)')
  g.add(cfg.grama, 'quantidade', 5000, 200000, 1000).name('quantidade de folhas')
  g.add(cfg.grama, 'altura', 0.1, 2, 0.01)
  g.add(cfg.grama, 'largura', 0.02, 0.5, 0.005)
  g.add(cfg.grama, 'ventoForca', 0, 2, 0.01).name('força do vento')
  g.add(cfg.grama, 'ventoVelocidade', 0, 2, 0.01).name('velocidade do vento')
  g.add(cfg.grama, 'ventoEscala', 0.005, 0.4, 0.005).name('tamanho das rajadas')
  g.add(cfg.grama, 'lodPerto', 1, 40, 0.5).name('cheia até (m da câmera)')
  g.add(cfg.grama, 'fracaoLonge', 0.05, 1, 0.01).name('fração de folhas longe')
  g.add(cfg.grama, 'larguraLonge', 1, 4, 0.05).name('folhas de longe mais largas')
  g.add(cfg.grama, 'virarCamera', 0, 1, 0.01).name('folhas viradas p/ câmera')

  const it = gui.addFolder('Interação com o ambiente')
  it.add(cfg.interacao, 'recuperaGrama', 0.05, 3, 0.01).name('grama levanta (por s)')
  it.add(cfg.interacao, 'amorteceOnda', 0.9, 0.999, 0.001).name('ondinhas duram')
  it.add(cfg.interacao, 'pegadas').name('pegadas na areia')
  it.add(cfg.interacao, 'duracaoPegada', 2, 120, 1).name('pegada dura (s)')
  it.add(cfg.interacao, 'ventoCoqueiros', 0, 3, 0.01).name('vento nas folhas e roupas')

  const m = gui.addFolder('Mar')
  m.addColor(cfg.mar, 'corFundo').name('fundo')
  m.addColor(cfg.mar, 'corRaso').name('raso')
  m.addColor(cfg.mar, 'corEspuma').name('espuma')
  m.add(cfg.mar, 'ondas', 0, 2, 0.01)

  const mundo = gui.addFolder('Mundo e desempenho')
  mundo.add(cfg.mundo, 'sombras')
  mundo.add(cfg.mundo, 'resolucaoSombra', [1024, 2048, 4096]).name('qualidade da sombra')
  mundo.add(cfg.mundo, 'nevoaPerto', 10, 600, 1).name('névoa começa (m)')
  mundo.add(cfg.mundo, 'nevoaLonge', 100, 2000, 1).name('névoa total (m)')
  mundo.add(cfg.desempenho, 'resolucao', 0.5, 2, 0.05).name('resolução')
  mundo.add(cfg.audio, 'volume', 0, 1, 0.01).name('volume')

  const acoes = {
    copiar: async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))
        acoesCtl.copiar.name('✔ copiado!')
        setTimeout(() => acoesCtl.copiar.name('📋 copiar ajustes'), 1500)
      } catch { /* sem permissão de área de transferência */ }
    },
    restaurar: () => {
      restaurarPadrao(cfg)
      gui.controllersRecursive().forEach((k) => k.updateDisplay())
    },
  }
  const acoesCtl = {
    copiar: gui.add(acoes, 'copiar').name('📋 copiar ajustes'),
    restaurar: gui.add(acoes, 'restaurar').name('↺ restaurar padrão'),
  }

  for (const f of [p, c, g, m, mundo, ret, lente, traco, it]) f.close()

  // só grava quando você mexe em algo no painel
  gui.onFinishChange(() => salvarConfig(cfg))

  if (innerWidth < 700) {
    gui.hide()
    visivel = false
  }

  return {
    alternar() {
      visivel = !visivel
      if (visivel) gui.show()
      else gui.hide()
    },
  }
}
