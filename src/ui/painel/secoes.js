// A ordem das seções no painel: o que se mexe mais vem primeiro, o Laboratório por último.
// Controle novo entra no arquivo da seção certa (jogo, visual, mundo, personagem, desempenho, laboratorio).

import { secaoJogo } from './jogo.js'
import { secaoVisual } from './visual.js'
import { secaoMundo } from './mundo.js'
import { secaoPersonagem } from './personagem.js'
import { secaoDesempenho } from './desempenho.js'
import { secaoLaboratorio } from './laboratorio.js'

export function montarSecoes(gui, cfg) {
  return [secaoJogo, secaoVisual, secaoMundo, secaoPersonagem, secaoDesempenho, secaoLaboratorio].map((s) => s(gui, cfg))
}
