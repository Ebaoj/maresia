// Os marcos do norte do centro de Fortaleza em 1932, de frente para o mar: a velha Sé (se1932.js),
// a Estação Central (estacao.js) e o Passeio Público (passeio1932.js). Este arquivo só liga os três:
// cria, liga e desliga pelo painel (cfg.mundo.marcosNorte), troca as cores ao vivo e esconde o
// detalhe longe da câmera. As fontes e as decisões de cada um estão no cabeçalho de cada arquivo.

import { criarEstacao } from './estacao.js'
import { criarSe } from './se1932.js'
import { criarPasseio } from './passeio1932.js'
import { acenderVidros, uPincelMarcos } from './obra1932.js'

export function criarMarcosNorte(cena, cfg) {
  const c = cfg.mundo.marcosNorte
  const marcos = {
    se: criarSe(cena, cfg),
    estacao: criarEstacao(cena, cfg),
    passeio: criarPasseio(cena, cfg),
  }
  // as cores que o painel mexe: [marco, chave do material, chave do cfg]
  const CORES = [['se', 'fachada', 'corSe'], ['estacao', 'parede', 'corEstacao'], ['passeio', 'esfinge', 'corEsfinge'],
    ['se', 'ferro', 'corFerro'], ['estacao', 'ferro', 'corFerro'], ['estacao', 'lamp', 'corFerro'], ['passeio', 'ferro', 'corFerro'], ['se', 'lamp', 'corFerro']]
  const materiais = CORES.map(([m, chave, k]) => {
    if (!marcos[m]) return null
    const malha = marcos[m].grupo.getObjectByName(`${marcos[m].grupo.name}-${chave}`)
    return malha ? [malha.material, k, ''] : null
  }).filter(Boolean)
  return {
    marcos,
    atualizar(camera) {
      acenderVidros()
      uPincelMarcos.value = c.pincel
      for (const [nome, m] of Object.entries(marcos)) m.atualizar(camera, c[nome] !== false, c.detalheAte)
      for (const item of materiais) {
        const hex = c[item[1]]
        if (hex !== item[2]) { item[0].color.set(hex); item[2] = hex }
      }
    },
  }
}
