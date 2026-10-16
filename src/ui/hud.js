// Caixas de narração de gibi ao entrar num lugar novo, e onomatopeias na tela.

import { bairro, distCosta, larguraPraia } from '../mundo/mapa.js'
import { alturaTerreno } from '../mundo/terreno.js'

const LUGARES = {
  rio: ['PEDRA DO PÃO', 'morros, casas coloridas e o bondinho'],
  recife: ['BAIRRO DO CAIS', 'casario, o rio e as pontes'],
  fortaleza: ['BEIRA-MAR', 'jangadas, coqueiros e o farol'],
  pier: ['O PÍER', 'daqui o pôr do sol é outro'],
  morro: ['NO ALTO DO MORRO', 'dá pra ver a cidade inteira'],
  mar: ['MAR ABERTO', 'água morna, sem pressa'],
}

function lugar(jogador) {
  const p = jogador.pos
  if (jogador.nadando) return 'mar'
  if (p.y > 26) return 'morro'
  if (distCosta(p.x, p.z) < larguraPraia(p.x) - 1 && p.y > alturaTerreno(p.x, p.z) + 0.5) return 'pier'
  return bairro(p.x)
}

export function criarHud(camera) {
  const legendas = document.getElementById('legendas')
  const camada = document.getElementById('onomatopeias')
  let atual = null
  let candidato = null
  let tempoCandidato = 0

  function mostrarLegenda(chave) {
    const [titulo, texto] = LUGARES[chave]
    const el = document.createElement('div')
    el.className = 'legenda legenda-bairro'
    const forte = document.createElement('strong')
    forte.textContent = titulo
    el.append(forte, document.createTextNode(texto))
    legendas.appendChild(el)
    requestAnimationFrame(() => el.classList.add('entrar'))
    setTimeout(() => {
      el.classList.add('sair')
      setTimeout(() => el.remove(), 500)
    }, 4500)
    while (legendas.children.length > 2) legendas.firstChild.remove()
  }

  function onomatopeia(texto, pos3d) {
    const v = pos3d.clone()
    v.y += 1.6
    v.project(camera)
    if (v.z > 1) return
    const el = document.createElement('div')
    el.className = 'onomatopeia'
    el.textContent = texto
    el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`
    el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`
    camada.appendChild(el)
    setTimeout(() => el.remove(), 950)
  }

  return {
    onomatopeia,
    atualizar(dt, jogador) {
      const l = lugar(jogador)
      if (l !== candidato) {
        candidato = l
        tempoCandidato = 0
      }
      tempoCandidato += dt
      if (candidato !== atual && tempoCandidato > 0.8) {
        atual = candidato
        mostrarLegenda(atual)
      }
    },
  }
}
