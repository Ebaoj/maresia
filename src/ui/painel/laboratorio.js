// Seção "Laboratório": o que é só de teste e medição, fora do jogo do dia a dia.
//
// Atenção: "Camisa no Ammo" e "Física do comparador" mudam o cfg do jogo, mas quem lê esses números são as
// páginas de arte/visor (tecido-ammo.js, laboratorio/), e elas partem do PADRAO de config.js (o laboratório
// tem o próprio painel e salva em 'maresia.lab.config.v1'). Ficam aqui para não sumirem sem decisão do Joabe.
// Padrão para controle novo: pasta.add(cfg.grupo, 'chave', min, max, passo).name('nome'); rec('nome') se pede recarregar

import { rec } from './comum.js'

export function secaoLaboratorio(gui, cfg) {
  const p = cfg.personagem
  const lab = gui.addFolder('Laboratório')

  // a roupa inteira como pano no Jolt (src/jogador/roupa.js), desligada por padrão desde 20/10/2026
  const jolt = lab.addFolder('Roupa como pano (Jolt)')
  jolt.add(p, 'roupaJolt').name(rec('roupa inteira como pano'))
  for (const [chave, min, max, passo, nome] of [
    ['roupaEspessura', 0.002, 0.012, 0.001, 'tecido: margem de contato'],
    ['roupaFolga', 0.01, 0.10, 0.005, 'camisa: liberdade no tronco'],
    ['roupaBarra', 0.02, 0.15, 0.005, 'camisa: liberdade da barra'],
    ['roupaManga', 0.01, 0.10, 0.005, 'camisa: liberdade das mangas'],
    ['roupaGola', 0.005, 0.04, 0.005, 'camisa: sustentação da gola'],
    ['roupaFlexao', 0.001, 0.08, 0.001, 'tecido: flexibilidade'],
    ['roupaAmortecimento', 0.1, 2, 0.1, 'tecido: amortecimento'],
    ['roupaIteracoes', 4, 16, 1, 'tecido: iterações'],
  ]) jolt.add(p, chave, min, max, passo).name(rec(nome))

  const ammo = lab.addFolder('Camisa no Ammo (visor de tecido)')
  for (const [chave, min, max, passo, nome] of [
    ['ammoSubpassos', 1, 4, 1, 'subpassos nativos'],
    ['ammoPassosAssentar', 0, 120, 1, 'passos de assentamento'],
    ['ammoIteracoes', 2, 12, 1, 'iterações'],
    ['ammoPeleMargem', 0.002, 0.012, 0.001, 'pele: margem (m)'],
    ['ammoPeleAltura', 0, 0.8, 0.05, 'pele: início do contato no tórax'],
    ['ammoPeleLargura', 0.4, 1, 0.05, 'pele: largura do contato'],
    ['ammoPeleReducao', 0, 0.8, 0.1, 'pele: redução do colisor'],
    ['ammoBracoMargem', 0.004, 0.016, 0.001, 'braço: margem de contato (m)'],
    ['ammoBracoInicio', 0.1, 0.3, 0.01, 'braço: início do contato (m)'],
    ['ammoBracoFim', 0.3, 0.6, 0.01, 'braço: fim do contato (m)'],
    ['ammoBracoReducao', 0, 0.8, 0.1, 'braço: redução do colisor'],
    ['ammoCalcaAltura', 0.65, 0.85, 0.01, 'calça: início do contato (m)'],
    ['ammoCalcaReducao', 0, 0.9, 0.05, 'calça: redução do colisor'],
    ['ammoEncaixeFolga', 0.002, 0.025, 0.001, 'encaixe: folga inicial (m)'],
    ['ammoEncaixeMaximo', 0.01, 0.08, 0.005, 'encaixe: ajuste máximo (m)'],
    ['ammoBarraExtra', 0, 0.03, 0.002, 'barra: extensão (m)'],
    ['ammoBarraTransicao', 0.01, 0.06, 0.005, 'barra: transição (m)'],
  ]) ammo.add(p, chave, min, max, passo).name(rec(nome))

  const fis = lab.addFolder('Física do comparador Jolt / Ammo')
  for (const [chave, min, max, passo, nome] of [
    ['lado', 8, 24, 1, 'área (m)'],
    ['passoTerreno', 0.25, 2, 0.25, 'grade do recorte (m)'],
    ['semente', 1, 9999, 1, 'semente'],
    ['bolas', 1, 12, 1, 'bolas'],
    ['cocos', 0, 30, 1, 'cocos'],
    ['alturaQueda', 0.5, 5, 0.25, 'altura da queda (m)'],
    ['gravidade', 5, 35, 1, 'gravidade'],
    ['subpassos', 1, 4, 1, 'subpassos'],
    ['raioRoteiro', 1, 4, 0.25, 'raio do percurso (m)'],
    ['duracaoMedicao', 6, 30, 1, 'roteiro (s simulados)'],
    ['cameraDistancia', 3, 12, 0.5, 'câmera: distância'],
    ['cameraAltura', 1, 8, 0.25, 'câmera: altura'],
    ['resolucao', 0.5, 2, 0.25, 'resolução'],
  ]) fis.add(cfg.laboratorioFisica, chave, min, max, passo).name(rec(nome))
  return lab
}
