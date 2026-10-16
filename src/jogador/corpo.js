// Corpo do jogador no esqueleto padrão, animado com os movimentos do Mixamo (animador.js).
// Carrega em segundo plano: enquanto não chega, o jogo segue com o boneco antigo (personagem.js).

import * as THREE from 'three'
import { criarBoneco } from './esqueleto.js'
import { carregarMovimentosMixamo } from './retarget.js'
import { Animador } from './animador.js'

const NOMES = [
  'parado', 'olhando', 'andar', 'correr', 'disparada', 'pulo-subida', 'pulo-queda', 'pulo-pouso', 'sentar',
  'sentado', 'levantar', 'carregar-andando', 'carregar-parado', 'boiar', 'nadar', 'empurrar',
]

export async function carregarCorpo() {
  const boneco = criarBoneco()
  const r = await carregarMovimentosMixamo({
    alvo: { ossos: boneco.ossos, raiz: boneco.raiz }, pasta: '/animacoes/mixamo/', nomes: NOMES,
    semDeslocamento: [], // no jogo o corpo fica onde o controle manda, até para sentar no banco
  })
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
  const animador = new Animador({ raiz: boneco.raiz, ossos: boneco.ossos }, r.clipes, r.passadas)
  if (r.faltando.length) console.info('Corpo novo: movimentos que faltam', r.faltando)
  return { raiz, corpo, animador, passadas: r.passadas }
}
