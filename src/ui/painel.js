// Painel de ajustes (tecla H): cada número do jogo vira um controle deslizante.
// É o "mini motor de jogo" do vídeo do André Elias: ajustar no olho, não no prompt.
//
// No alto: a busca, a legenda e as ações (restaurar, copiar). Embaixo, as seções, todas fechadas na primeira
// vez: Jogo, Visual, Mundo, Personagem, Desempenho e Laboratório, uma por arquivo em src/ui/painel/.
// Controle novo entra no arquivo da seção certa, sempre ligado a uma chave do cfg (config.js).

import GUI from 'lil-gui'
import { salvarConfig, restaurarPadrao } from '../config.js'
import { LEGENDA } from './painel/comum.js'
import { montarSecoes } from './painel/secoes.js'
import { decidirBusca, contarAchados } from './painel/busca.js'
import { lerPastas, gravarPastas, aplicarPastas, caminhoPasta } from './painel/estado.js'
import './painel/painel.css'

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
  const secoes = montarSecoes(gui, cfg)

  // ---- pastas abertas e fechadas, lembradas por navegador
  const pastas = lerPastas()
  aplicarPastas(gui, pastas)
  let buscando = false // enquanto houver busca, abrir e fechar pasta não fica lembrado
  gui.onOpenClose((f) => {
    if (buscando) return // a busca abre e fecha pastas sozinha: isso não é escolha de quem joga
    pastas[caminhoPasta(f)] = !f._closed
    gravarPastas(pastas)
  })

  // ---- busca e legenda, antes das ações
  const topo = document.createElement('div')
  topo.className = 'painel-topo'
  const campo = document.createElement('input')
  campo.type = 'search'
  campo.className = 'painel-busca'
  campo.placeholder = 'buscar ajuste (ex.: sombra, névoa, ⟳)'
  campo.setAttribute('aria-label', 'buscar ajuste')
  const legenda = document.createElement('div')
  legenda.className = 'painel-legenda'
  legenda.textContent = LEGENDA
  topo.append(campo, legenda)
  gui.$children.prepend(topo)

  function buscar() {
    const visivelPor = decidirBusca(secoes, campo.value)
    buscando = true
    if (!visivelPor) {
      for (const k of gui.controllersRecursive()) k.show()
      for (const f of gui.foldersRecursive()) f.show()
      aplicarPastas(gui, pastas)
      legenda.textContent = LEGENDA
      buscando = false
    } else {
      gui.open()
      for (const [item, v] of visivelPor) {
        item.show(v)
        if (item.folders && v) item.open()
      }
      const n = contarAchados(visivelPor)
      legenda.textContent = n ? `${n} ${n === 1 ? 'ajuste' : 'ajustes'} · ${LEGENDA}` : 'nada encontrado'
    }
  }
  campo.addEventListener('input', buscar)
  campo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { campo.value = ''; buscar(); campo.blur() }
  })

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
