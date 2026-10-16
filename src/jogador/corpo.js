// Corpo do jogador no esqueleto padrão, animado com os movimentos do Mixamo (animador.js).
// Carrega em segundo plano: enquanto não chega, o jogo segue com o boneco antigo (personagem.js).

import * as THREE from 'three'
import { criarBoneco } from './esqueleto.js'
import { carregarMovimentosMixamo } from './retarget.js'
import { Animador } from './animador.js'
import { criarNadoCrawl } from './nado-crawl.js'
import { BancoDeMovimento, espelhar } from './motion-matching.js'
import { criarMultiplos } from './multiplos.js'
import { criarRosto } from './rosto.js'
import { criarMolas } from './molas.js'

// banco do motion matching: movimentos com deslocamento (os que repetem marcados); os que não repetem
// entram também espelhados (curva para a esquerda vira curva para a direita, etc.)
const BANCO = {
  'mm-parado': true, 'mm-andar': true, 'mm-andar-padrao': true, 'mm-correr': true, 'mm-trote': true, 'mm-disparada': true,
  'mm-arrancar': false, 'mm-parar-andando': false, 'mm-parar-correndo': false, 'mm-curva-andando': false,
  'mm-volta-andando': false, 'mm-volta-correndo': false, 'mm-virar-esq': false, 'mm-virar-dir': false,
}

const NOMES = [
  'parado', 'olhando', 'andar', 'correr', 'disparada', 'pulo-subida', 'pulo-queda', 'pulo-pouso', 'sentar',
  'sentado', 'levantar', 'carregar-andando', 'carregar-parado', 'boiar', 'nadar', 'empurrar',
]

export async function carregarCorpo() {
  const boneco = criarBoneco()
  const r = await carregarMovimentosMixamo({
    alvo: { ossos: boneco.ossos, raiz: boneco.raiz }, pasta: '/animacoes/mixamo/', nomes: [...NOMES, ...Object.keys(BANCO)],
    // no jogo o corpo fica onde o controle manda; só o banco do motion matching guarda o deslocamento
    semDeslocamento: Object.keys(BANCO),
  })
  const entradas = []
  for (const [nome, loop] of Object.entries(BANCO)) {
    const clipe = r.clipes[nome]
    if (!clipe) continue
    entradas.push({ nome, clipe, loop })
    if (!loop && nome !== 'mm-virar-esq' && nome !== 'mm-virar-dir') entradas.push({ nome: nome + '-esp', clipe: espelhar(clipe, nome + '-esp'), loop })
    delete r.clipes[nome]
  }
  const banco = entradas.length >= 4 ? new BancoDeMovimento(entradas, { raiz: boneco.raiz, ossos: boneco.ossos }) : null
  if (!r.clipes.andar || !r.clipes.parado) {
    console.warn('Corpo novo: faltam movimentos do Mixamo em public/animacoes/mixamo/; fica o boneco antigo', r.faltando)
    return null
  }
  // mesma forma do boneco antigo: raiz (posição e direção) > corpo (estica e amassa) > boneco
  const raiz = new THREE.Group()
  raiz.userData.peso = 1
  const corpo = new THREE.Group()
  raiz.add(corpo)
  corpo.add(boneco.raiz)
  r.clipes.nadar = criarNadoCrawl() // o Joabe quer crawl; o "nadar" do Mixamo é submerso
  const animador = new Animador({ raiz: boneco.raiz, ossos: boneco.ossos }, r.clipes, r.passadas)
  if (banco) animador.usarBanco(banco)
  const multiplos = criarMultiplos(boneco, 2)
  animador.multiplos = multiplos
  // o rosto entra depois dos múltiplos: as cópias em retícula ficam sem rosto
  animador.rosto = criarRosto(boneco.ossos.get('Head'))
  animador.molas = criarMolas(boneco.ossos)
  if (r.faltando.length) console.info('Corpo novo: movimentos que faltam', r.faltando)
  return { raiz, corpo, animador, passadas: r.passadas, banco, multiplos, rosto: animador.rosto }
}
