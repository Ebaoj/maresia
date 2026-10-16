// Caixas de narração de gibi ao entrar num lugar novo, e onomatopeias na tela.

import { bairro } from '../mundo/mapa.js'

// legenda de gibi ao entrar em cada bairro de 1932 (docs/mapa-1932.md)
const LUGARES = {
  'Barra do Ceará': ['BARRA DO CEARÁ', 'a foz do rio e o mangue'],
  Pirambu: ['PIRAMBU', 'praia de pescadores'],
  Floresta: ['FLORESTA', 'as oficinas da estrada de ferro'],
  Jacarecanga: ['JACARECANGA', 'o trem passa rente ao mar'],
  'Moura Brasil': ['MOURA BRASIL', 'entre a linha do trem e a praia'],
  Centro: ['CENTRO', 'a cidade em xadrez'],
  'Praia Formosa': ['PRAIA FORMOSA', 'a areia atrás da estação'],
  'Poço da Draga': ['POÇO DA DRAGA', 'a ponte do porto'],
  'Praia de Iracema': ['PRAIA DE IRACEMA', 'a antiga Praia do Peixe, dos jangadeiros'],
  Prainha: ['PRAINHA', 'o outeiro do Seminário'],
  Outeiro: ['OUTEIRO', 'a cidade sobe devagar'],
  Aldeota: ['ALDEOTA', 'casas sobre as dunas'],
  Meireles: ['MEIRELES', 'dunas e cajueiros'],
  Mucuripe: ['MUCURIPE', 'o farol e a vila dos jangadeiros'],
  'Alagadiço': ['ALAGADIÇO', 'a estrada para o sertão'],
  'Otávio Bonfim': ['OTÁVIO BONFIM', 'a linha do trem para o sul'],
  Benfica: ['BENFICA', 'chácaras e a lagoa'],
  'Joaquim Távora': ['JOAQUIM TÁVORA', 'a cidade termina em sítios'],
  Tauape: ['TAUAPE', 'a lagoa e os sítios'],
  duna: ['NO ALTO DA DUNA', 'dá pra ver o mar inteiro'],
  mar: ['MAR ABERTO', 'água morna, sem pressa'],
}

function lugar(jogador) {
  const p = jogador.pos
  if (jogador.nadando) return 'mar'
  if (p.y > 13) return 'duna'
  return bairro(p.x, p.z)
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
