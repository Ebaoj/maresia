// Painel de ajustes (tecla H): cada número do jogo vira um controle deslizante.
// É o "mini motor de jogo" do vídeo do André Elias: ajustar no olho, não no prompt.
//
// No alto: a legenda e as ações (restaurar, copiar). Embaixo, as seções, todas fechadas: Jogo, Visual, Mundo, Personagem, Desempenho e Laboratório, uma por arquivo em src/ui/painel/.
// Controle novo entra no arquivo da seção certa, sempre ligado a uma chave do cfg (config.js).

import GUI from 'lil-gui'
import { salvarConfig, restaurarPadrao } from '../config.js'
import { LEGENDA } from './painel/comum.js'
import { montarSecoes } from './painel/secoes.js'

const NOME_RESTAURAR = '↺ Restaurar padrão'
const NOME_COPIAR = '📋 Copiar ajustes'

export function criarPainel(cfg) {
  const gui = new GUI({ title: 'Maresia · ajustes (H esconde)', width: 300 })
  let visivel = true

  // ---- ações no alto
  let confirmando = null // restaurar apaga todos os ajustes salvos: pede um segundo clique
  const acoes = {
    restaurar: () => {
      if (!confirmando) {
        acoesCtl.restaurar.name('↺ clique de novo para restaurar tudo')
        confirmando = setTimeout(() => { confirmando = null; acoesCtl.restaurar.name(NOME_RESTAURAR) }, 3000)
        return
      }
      clearTimeout(confirmando)
      confirmando = null
      acoesCtl.restaurar.name(NOME_RESTAURAR)
      restaurarPadrao(cfg)
      gui.controllersRecursive().forEach((k) => k.updateDisplay())
    },
    copiar: async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(cfg, null, 2))
        acoesCtl.copiar.name('✔ copiado!')
        setTimeout(() => acoesCtl.copiar.name(NOME_COPIAR), 1500)
      } catch { /* sem permissão de área de transferência */ }
    },
  }
  const acoesCtl = {
    restaurar: gui.add(acoes, 'restaurar').name(NOME_RESTAURAR),
    copiar: gui.add(acoes, 'copiar').name(NOME_COPIAR),
  }

  // ---- as seções
  montarSecoes(gui, cfg)

  for (const f of gui.foldersRecursive()) f.close()

  // ---- legenda da marca de recarregar, antes das ações
  const legenda = document.createElement('div')
  legenda.className = 'painel-legenda'
  legenda.style.cssText = 'padding: 4px var(--padding); opacity: 0.6; font-size: 11px'
  legenda.textContent = LEGENDA
  gui.$children.prepend(legenda)

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
