// Seção "Personagem": o neto (modelo, rosto, movimento, animação, corpo e roupa) e o avô.
// Padrão para controle novo: pasta.add(cfg.personagem, 'chave', min, max, passo).name('nome'); rec('nome') se pede recarregar

import { rec } from './comum.js'

const ESTILOS_ROSTO = ['atual', 'aranhaverso', 'grande', 'grande-mel', 'grande-oval', 'gato', 'gato-ambar', 'gato-palpebra', 'minimo', 'minimo-feijao', 'minimo-brilho', 'brilho-alto', 'brilho-maior', 'brilho-duplo', 'brilho-castanho', 'brilho-sobrancelha', 'brilho-triste-oval']

export function secaoPersonagem(gui, cfg) {
  const p = cfg.personagem
  const pers = gui.addFolder('Personagem')
  pers.add(p, 'modeloJogador', ['neto-v6', 'neto-tripo', 'neto-tripo-partes', 'neto-tripo-p2', 'neto-vestido', 'neto', 'boneco']).name(rec('modelo do jogador'))
  // o estilo do rosto troca na hora, sem recarregar
  pers.add(p, 'estiloRostoNeto', ESTILOS_ROSTO).name('estilo do rosto desenhado').onChange((v) => { window.maresia?.jogador?.animador?.rosto?.estilo(v); window.maresia?.avo?.rosto?.estilo(v) })
  pers.add(p, 'rostoNeto').name(rec('rosto desenhado no neto'))
  pers.add(p, 'chapeu').name(rec('chapéu no neto'))
  pers.add(p, 'corpoNovo').name(rec('corpo novo (mocap)'))

  // "corpo novo" é o padrão; andar e correr do corpo antigo ficam no fim
  const mov = pers.addFolder('Movimento')
  mov.add(p, 'velocidadeNova', 0.8, 10, 0.1).name('andar (m/s)')
  mov.add(p, 'corridaNova', 2, 15, 0.1).name('correr (m/s)')
  mov.add(p, 'pulo', 2, 20, 0.1).name('força do pulo')
  mov.add(p, 'gravidade', 5, 60, 0.5).name('gravidade')
  mov.add(p, 'peNoChao').name('pé no chão (IK)')
  mov.add(p, 'inclinar').name('inclinar na curva')
  mov.add(p, 'motionMatching').name('motion matching')
  mov.add(p, 'aceleracao', 2, 30, 0.5).name('arrancada (1/s)')
  mov.add(p, 'frenagem', 2, 40, 0.5).name('freada (1/s)')
  mov.add(p, 'giroAndando', 1, 30, 0.5).name('virar andando (1/s)')
  mov.add(p, 'giroClipeMin', 1.2, 3.14, 0.05).name('giro gravado a partir de (rad)')
  mov.add(p, 'ritmoGiro', 0.6, 2.5, 0.05).name('ritmo do giro gravado')
  mov.add(p, 'velNoGiro', 0, 1, 0.05).name('velocidade de costas no giro')
  mov.add(p, 'afundaAreia', 0, 0.08, 0.005).name('afunda na areia (m)')
  mov.add(p, 'joelhos', 0, 40, 1).name('joelho parado (graus)')
  mov.add(p, 'velocidade', 1, 10, 0.1).name('corpo antigo: andar (m/s)')
  mov.add(p, 'corrida', 2, 20, 0.1).name('corpo antigo: correr (m/s)')

  const anim = pers.addFolder('Animação "em 2"')
  anim.add(p, 'fpsPose', 4, 60, 1).name('poses por segundo')
  anim.add(p, 'fpsAcao', 6, 60, 1).name('poses por segundo na ação')
  anim.add(p, 'posicaoEm2').name('corpo todo "em 2"')
  anim.add(p, 'pausaPulo').name('pausa no alto do pulo')
  anim.add(p, 'multiplos', 0, 1.5, 0.05).name('múltiplos (rastro em retícula)')
  anim.add(p, 'dedosReferenciaAndar', ['andar', 'mm-andar', 'mm-curva-andando']).name(rec('dedos: referência ao andar'))
  anim.add(p, 'dedosFecharCiclo', 0, 0.3, 0.01).name(rec('dedos: emenda do ciclo'))

  const corpo = pers.addFolder('Corpo e roupa')
  corpo.add(p, 'ombros', 0.6, 1.1, 0.01).name(rec('largura dos ombros'))
  corpo.add(p, 'clavicula', 0, 40, 1).name('ombro: caimento (graus)')
  corpo.add(p, 'folgaCamisa', 0, 0.05, 0.002).name(rec('folga da camisa'))
  corpo.add(p, 'panoSolto', 0, 2, 0.05).name('tecido solto (força)')
  corpo.add(p, 'dobras', 0, 1.5, 0.05).name('dobras desenhadas')

  const avo = pers.addFolder('Avô')
  avo.add(p, 'avo').name(rec('avô perto do começo'))
  avo.add(p, 'avoMovimento', ['parado', 'velho-parado']).name(rec('movimento do avô'))
  avo.add(p, 'rostoAvo').name(rec('rosto desenhado no avô'))
  avo.add(p, 'avoTripo').name(rec('avô do Tripo ao lado'))
  avo.add(p, 'avoTripoMovimento', ['velho-parado', 'parado']).name(rec('movimento do avô do Tripo'))
  return pers
}
