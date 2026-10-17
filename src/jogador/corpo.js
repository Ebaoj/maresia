// Corpo do jogador no esqueleto padrão, animado com os movimentos do Mixamo (animador.js).
// Carrega em segundo plano: enquanto não chega, o jogo segue com o boneco antigo (personagem.js).

import * as THREE from 'three'
import { criarBoneco, criarEsqueleto } from './esqueleto.js'
import { carregarMovimentosMixamo, converter, repouso } from './retarget.js'
import { carregarNeto } from './neto.js'
import { Animador } from './animador.js'
import { criarNadoCrawl } from './nado-crawl.js'
import { BancoDeMovimento, espelhar } from './motion-matching.js'
import { criarMultiplos } from './multiplos.js'
import { criarRosto } from './rosto.js'
import { criarMolas } from './molas.js'
import { criarPano } from './pano.js'

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

// Converte clipes do esqueleto padrão para outro modelo (o neto): um esqueleto padrão novo, em repouso,
// é a fonte; o alvo é o modelo, também em repouso. Mesmo conversor dos movimentos do Mixamo.
export function criarAdaptador(alvo) {
  const { raizOsso, ossos } = criarEsqueleto()
  const raiz = new THREE.Group()
  raiz.add(raizOsso)
  raiz.updateMatrixWorld(true)
  const fonte = { raiz, ossos, rep: repouso(ossos) }
  alvo.raiz.updateMatrixWorld(true)
  const destino = { ossos: alvo.ossos, rep: repouso(alvo.ossos) }
  return (clipe) => {
    const c = converter(clipe, fonte, destino, { noLugar: false, nome: clipe.name })
    c.userData = clipe.userData // o crawl guarda a velocidade dele aí
    return c
  }
}

// modelo: 'neto' (o personagem da história) ou 'boneco' (o de cápsulas, para testes)
export async function carregarCorpo({ modelo = 'neto', chapeu = false, rostoDesenhado = false, estiloRosto = 'minimo-brilho', ombros = 0.9, folgaCamisa = 0.012 } = {}) {
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
  r.clipes.nadar = criarNadoCrawl() // o Joabe quer crawl; o "nadar" do Mixamo é submerso
  // tudo acima é preparado no esqueleto padrão; o corpo que aparece pode ser outro modelo
  let alvo = { raiz: boneco.raiz, ossos: boneco.ossos, esqueleto: boneco.esqueleto }
  let adaptar = (c) => c
  if (modelo === 'neto') {
    const neto = await carregarNeto({ chapeu, semRosto: rostoDesenhado, ombros, folgaCamisa })
    if (neto) { alvo = neto; adaptar = criarAdaptador(neto) } else console.warn('Corpo: o neto não carregou; fica o boneco')
  }
  // tecido solto: prepara antes de qualquer pose (precisa do repouso)
  const pano = alvo.malhas && alvo !== null && modelo === 'neto' ? criarPano(alvo.malhas) : null
  const clipesAlvo = Object.fromEntries(Object.entries(r.clipes).map(([k, c]) => [k, adaptar(c)]))
  // mesma forma do boneco antigo: raiz (posição e direção) > corpo (estica e amassa) > modelo
  const raiz = new THREE.Group()
  raiz.userData.peso = 1
  const corpo = new THREE.Group()
  raiz.add(corpo)
  corpo.add(alvo.raiz)
  const animador = new Animador({ raiz: alvo.raiz, ossos: alvo.ossos, eixos: alvo.eixos }, clipesAlvo, r.passadas)
  if (banco) animador.usarBanco(banco, adaptar)
  const multiplos = criarMultiplos(alvo, 2)
  animador.multiplos = multiplos
  // rosto desenhado só no boneco: o neto tem olhos, sobrancelhas e boca modelados
  // (o rosto entra depois dos múltiplos: as cópias em retícula ficam sem rosto)
  if (alvo.raiz === boneco.raiz) animador.rosto = criarRosto(boneco.ossos.get('Head'), {}, estiloRosto)
  else if (alvo.ancorasRosto) animador.rosto = criarRosto(alvo.ossos.get('Head'), alvo.ancorasRosto, estiloRosto) // neto de rosto liso
  animador.molas = criarMolas(alvo.ossos)
  // susto: o tronco leva um tranco para trás (Tintin: "o corpo é que reage")
  if (animador.rosto) animador.rosto.aoAssustar = () => { const y = animador.antes?.yaw || 0; animador.molas.empurrar(-Math.sin(y) * 3, -Math.cos(y) * 3, y) }
  if (r.faltando.length) console.info('Corpo novo: movimentos que faltam', r.faltando)
  // clipes no esqueleto padrão: a gente da cidade (atores.js) usa o boneco
  animador.pano = pano
  return { raiz, corpo, animador, passadas: r.passadas, banco, multiplos, rosto: animador.rosto, clipes: r.clipes, pano }
}
