// Seção "Desempenho": renderizador, resolução, blocos de cópias e a sombra.
// Padrão para controle novo: pasta.add(cfg.grupo, 'chave', min, max, passo).name('nome'); rec('nome') se pede recarregar

import { rec } from './comum.js'

export function secaoDesempenho(gui, cfg) {
  const d = cfg.desempenho
  const des = gui.addFolder('Desempenho')
  des.add(d, 'mostrarFps').name('mostrar FPS')
  des.add(d, 'renderizador', ['webgl', 'webgpu']).name(rec('renderizador'))
  des.add(d, 'resolucao', 0.5, 2, 0.05).name('resolução')
  des.add(d, 'resolucaoDinamica').name('resolução dinâmica')
  des.add(d, 'resolucaoMin', 0.4, 1.25, 0.05).name('resolução dinâmica: mínima')
  des.add(d, 'tamBloco', [96, 192, 384]).name(rec('bloco de cópias (m)'))
  des.add(d, 'motorPlaca').name(rec('árvores na placa (WebGPU)'))
  des.add(d, 'atoresVat').name(rec('atores em textura (WebGPU)'))
  des.add(d, 'chaoSoltoPerto').name('chão solto só perto (objetos)')
  des.add(d, 'muitoLonge').name('longe junto em células grandes')
  des.add(d, 'blocosJuntos').name('blocos sem LOD juntos de longe')
  des.add(d, 'cortePequenos').name('peça pequena some de longe')
  des.add(d, 'cortePx', 0, 12, 0.5).name('peça some abaixo de (px)')
  des.add(d, 'muitoLongeTam', [384, 768, 1536]).name(rec('célula de muito longe (m)'))

  const montagem = des.addFolder('Montagem das casas')
  montagem.add(d, 'fatiarMontagem').name('montagem fatiada (por tempo)')
  montagem.add(d, 'orcamentoMontagemMs', 1, 16, 0.5).name('orçamento de montagem (ms)')
  montagem.add(d, 'orcamentoUploadMB', 2, 64, 1).name('subida para a placa (MB/quadro)')
  montagem.add(d, 'raioPrefetch', 0, 240, 8).name('anel à frente (m)')
  montagem.add(d, 'casasPorQuadro', 1, 4, 1).name('blocos por quadro (sem fatiamento)')
  montagem.add(d, 'preaquecerShaders').name(rec('aquecer os shaders (WebGL)'))
  // Fase 2: as casas de cada material num lote só (um desenho por material)
  montagem.add(d, 'casasEmLote').name(rec('casas em lote (WebGL)'))
  montagem.add(d, 'casasLoteVertices', 200000, 8000000, 100000).name(rec('vértices dos lotes (casas)'))

  const sombra = des.addFolder('Sombra')
  sombra.add(cfg.mundo, 'sombras').name('sombras')
  sombra.add(cfg.mundo, 'resolucaoSombra', [1024, 2048, 4096]).name('qualidade da sombra')
  sombra.add(cfg.mundo, 'sombraPerto').name('sombra de perto (nítida)')
  sombra.add(cfg.mundo, 'sombraPertoTamanho', 16, 120, 1).name('sombra de perto: lado (m)')
  sombra.add(cfg.mundo, 'sombraPertoResolucao', [1024, 2048, 4096]).name('sombra de perto: qualidade')
  sombra.add(cfg.mundo, 'sombraPertoRecorte').name('sombra de perto: só as cópias da janela')
  sombra.add(cfg.mundo, 'sombraPertoACada', 1, 8, 1).name('sombra de perto: refaz a cada (quadros)')
  sombra.add(cfg.mundo, 'sombraPertoBorda', 0.02, 0.4, 0.01).name('sombra de perto: faixa de mistura')
  sombra.add(cfg.mundo, 'sombraPertoAFrente', 0, 20, 0.5).name('sombra de perto: à frente (m)')
  sombra.add(cfg.mundo, 'sombraSuave', 0, 3, 0.05).name('borda da sombra: suavidade (texels)')
  sombra.add(cfg.mundo, 'sombraFiltro', ['pintado', 'three']).name(rec('borda da sombra: filtro'))
  sombra.add(cfg.mundo, 'sombraCopaCheia').name(rec('sombra do coqueiro em tufos'))
  sombra.add(cfg.mundo, 'sombraVies', 0, 1, 0.005).name('sombra: viés (m)')
  sombra.add(cfg.mundo, 'sombraViesNormal', 0, 4, 0.05).name('sombra: viés pela normal (texels)')
  sombra.add(cfg.mundo, 'passoSombraMin', 0, 15, 1).name('sombra anda em passos (min)')
  sombra.add(cfg.mundo, 'cacheSombra').name('sombra dos parados em cache')
  sombra.add(cfg.mundo, 'sombraEstatica').name('sombra refeita só na mudança')
  sombra.add(cfg.mundo, 'cacheSombraRaio', 5, 40, 1).name('cache da sombra: raio (m)')
  sombra.add(cfg.mundo, 'cacheSombraFatias', 1, 12, 1).name('cache da sombra: fatias por refazer')
  sombra.add(cfg.mundo, 'sombraCacheIntervaloMin', 0, 3, 0.05).name('cache da sombra: espera mínima (s)')
  return des
}
