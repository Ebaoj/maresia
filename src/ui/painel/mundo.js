// Seção "Mundo": o chão, a grama, o mar, o que o jogador mexe no ambiente e o Campo do Urubu.
// Padrão para controle novo: pasta.add(cfg.grupo, 'chave', min, max, passo).name('nome'); rec('nome') se pede recarregar

import { rec } from './comum.js'

export function secaoMundo(gui, cfg) {
  const mundo = gui.addFolder('Mundo')

  // o centro calçado e o mato são pintados na malha do chão quando ela nasce: só mudam ao recarregar
  const chao = mundo.addFolder('Chão de 1932')
  chao.add(cfg.chao, 'centroRaio', 0, 1500, 10).name(rec('Centro calçado: raio (m)'))
  chao.add(cfg.chao, 'centroBorda', 0, 600, 10).name(rec('borda do calçamento (m)'))
  chao.add(cfg.chao, 'mato', 0, 1, 0.05).name(rec('mato ralo do quintal'))
  chao.add(cfg.chao, 'desgaste', 0, 2, 0.05).name('poeira do meio da rua')
  chao.add(cfg.chao, 'rodeiroForca', 0, 2, 0.05).name('rodeiro da carroça: força')
  chao.add(cfg.chao, 'rodeiroPos', 0, 0.5, 0.01).name('rodeiro: onde fica na rua')
  chao.add(cfg.chao, 'rodeiroLarg', 0.01, 0.3, 0.005).name('rodeiro: largura')

  const rel = mundo.addFolder('Relevo do chão')
  rel.add(cfg.chao, 'relevo', 0, 2, 0.05).name('força geral')
  rel.add(cfg.chao, 'relevoAreia', 0, 2, 0.05).name('areia: ondulação e riscos')
  rel.add(cfg.chao, 'relevoTerra', 0, 2, 0.05).name('terra: torrões, pedrisco, sulco')
  rel.add(cfg.chao, 'relevoPedra', 0, 2, 0.05).name('paralelepípedo: topo e junta')
  rel.add(cfg.chao, 'relevoRacha', 0, 2, 0.05).name('terra rachada')
  rel.add(cfg.chao, 'relevoLonge', 10, 200, 5).name('some depois de (m)')
  rel.add(cfg.chao, 'relevoCor', 0, 1.5, 0.05).name('fresta escura, pedra clara')
  rel.add(cfg.chao, 'relevoMeioDia', 0, 3, 0.05).name('a mais com o sol a pino')
  rel.add(cfg.chao, 'ondaAreia', 0.1, 1.2, 0.01).name('onda da areia (m)')
  rel.add(cfg.chao, 'poeiraManchas', 0, 2, 0.05).name('rua: manchas de poeira')
  rel.add(cfg.chao, 'poeiraParede', 0, 2, 0.05).name('rua: poeira na parede')
  rel.add(cfg.chao, 'pegadasRua', 0, 2, 0.05).name('rua: meio pisado e pegadas')
  rel.add(cfg.chao, 'sulcoDuplo', 0, 2, 0.05).name('rua: segundo par de sulcos')
  rel.add(cfg.chao, 'solto').name('pedrisco, conchas e touceiras em 3D')
  rel.add(cfg.chao, 'soltoRaio', 5, 120, 1).name('chão solto até (m)')
  rel.add(cfg.chao, 'soltoDensidade', 0, 3, 0.1).name(rec('chão solto: quantidade'))

  const cal = mundo.addFolder('Calçamento (paralelepípedo)')
  cal.add(cfg.calamento, 'bloco', 0.1, 0.8, 0.01).name('bloco: comprimento (m)')
  cal.add(cfg.calamento, 'largura', 0.05, 0.4, 0.01).name('bloco: altura da fiada (m)')
  cal.add(cfg.calamento, 'junta', 0, 0.12, 0.005).name('junta (m)')
  cal.add(cfg.calamento, 'desencontro', 0, 0.5, 0.05).name('fiadas desencontradas')

  const g = mundo.addFolder('Grama')
  g.add(cfg.grama, 'altura', 0.1, 2, 0.01).name('altura')
  g.add(cfg.grama, 'largura', 0.02, 0.5, 0.005).name('largura')
  g.add(cfg.grama, 'ventoForca', 0, 2, 0.01).name('vento: força')
  g.add(cfg.grama, 'ventoVelocidade', 0, 2, 0.01).name('vento: velocidade')
  g.add(cfg.grama, 'ventoEscala', 0.005, 0.4, 0.005).name('vento: tamanho das rajadas')
  g.add(cfg.grama, 'quantidade', 5000, 200000, 1000).name('quantidade de folhas')
  g.add(cfg.grama, 'raio', 10, 80, 1).name('raio em volta (m)')
  g.add(cfg.grama, 'lodPerto', 1, 40, 0.5).name('cheia até (m da câmera)')
  g.add(cfg.grama, 'fracaoLonge', 0.05, 1, 0.01).name('fração de folhas longe')
  g.add(cfg.grama, 'larguraLonge', 1, 4, 0.05).name('folhas de longe mais largas')
  g.add(cfg.grama, 'virarCamera', 0, 1, 0.01).name('folhas viradas para a câmera')

  const m = mundo.addFolder('Mar')
  m.add(cfg.mar, 'ondas', 0, 2, 0.01).name('ondas')
  m.addColor(cfg.mar, 'corFundo').name('cor do fundo')
  m.addColor(cfg.mar, 'corRaso').name('cor do raso')
  m.addColor(cfg.mar, 'corEspuma').name('cor da espuma')

  const it = mundo.addFolder('Interação com o ambiente')
  it.add(cfg.interacao, 'pegadas').name('pegadas na areia')
  it.add(cfg.interacao, 'duracaoPegada', 2, 120, 1).name('pegada dura (s)')
  it.add(cfg.interacao, 'recuperaGrama', 0.05, 3, 0.01).name('grama levanta (por s)')
  it.add(cfg.interacao, 'amorteceOnda', 0.9, 0.999, 0.001).name('ondinhas duram')
  it.add(cfg.interacao, 'ventoCoqueiros', 0, 3, 0.01).name('vento nas folhas e roupas')

  const urubu = mundo.addFolder('Campo do Urubu')
  // o campo é montado uma vez, quando o mundo nasce (urubu1932.js lê o cfg): só muda ao recarregar
  urubu.add(cfg.mundo.urubu, 'alturaGalpao', 3, 8, 0.1).name(rec('altura do galpão (m)'))
  urubu.add(cfg.mundo.urubu, 'alturaCerca', 1, 3, 0.1).name(rec('altura do arame (m)'))
  urubu.add(cfg.mundo.urubu, 'gente', 0, 60, 1).name(rec('gente no campo'))
  // os marcos do centro de 1932 (src/mundo/marcos1932/): montados uma vez; só as cores mudam ao vivo
  const mc = mundo.addFolder('Marcos do centro (1932)')
  mc.add(cfg.marcos, 'ligados').name(rec('marcos do centro'))
  mc.add(cfg.marcos, 'pracaReforma').name(rec('Praça do Ferreira reformada (Coluna da Hora)'))
  mc.add(cfg.marcos, 'excelsior').name(rec('Hotel Excelsior'))
  mc.add(cfg.marcos, 'cinemas').name(rec('Majestic e Cine Moderno'))
  mc.add(cfg.marcos, 'leoes').name(rec('Praça dos Leões'))
  mc.add(cfg.marcos, 'mercado').name(rec('Mercado de Ferro'))
  mc.add(cfg.marcos, 'esculturasModelo').name(rec('esculturas dos Leões em modelo'))
  mc.add(cfg.marcos, 'colunaAltura', 8, 20, 0.5).name(rec('Coluna da Hora: altura (m)'))
  mc.add(cfg.marcos, 'excelsiorAltura', 22, 36, 0.5).name(rec('Excelsior: altura (m)'))
  mc.add(cfg.marcos, 'leoesMuro', 1.5, 5, 0.1).name(rec('Leões: muro de arrimo (m)'))
  mc.add(cfg.marcos, 'mercadoAltura', 7, 14, 0.5).name(rec('Mercado: altura (m)'))
  mc.add(cfg.marcos, 'ficusEscala', 0.8, 2.5, 0.05).name(rec('fícus: tamanho'))
  mc.add(cfg.marcos, 'palmeiraEscala', 0.3, 1.2, 0.02).name(rec('palmeira: tamanho'))
  mc.add(cfg.marcos, 'distDetalhe', 40, 400, 5).name('detalhe some depois de (m)')
  for (const [chave, nome] of [['corExcelsior', 'Excelsior'], ['corMajestic', 'Majestic'], ['corModerno', 'Cine Moderno'],
    ['corMercado', 'Mercado de Ferro'], ['corChapa', 'chapa do mercado'], ['corFerro', 'ferro fundido'], ['corBronze', 'jarros'], ['corFelinos', 'felinos (ferro)'], ['corGeneral', 'General (bronze)'],
    ['corBalaustrada', 'balaústres'], ['corPedra', 'cantaria'], ['corMosaicoClaro', 'mosaico claro ⟳'], ['corMosaicoEscuro', 'mosaico escuro ⟳']]) {
    mc.addColor(cfg.marcos, chave).name('cor: ' + nome)
  }
  return mundo
}
