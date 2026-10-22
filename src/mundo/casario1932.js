// As fachadas de 1932: cada lote da planta oficial com o lado que dava para a rua.
//
// A fonte é src/mundo/mapa1932-lotes.json, escrito por docs/mapa-1932-lotes.py a partir
// da camada "Evolucao Urbana 1932" da Prefeitura de Fortaleza. Cada entrada traz o uso
// do lote e tres pontos em longitude/latitude: o comeco da frente de rua, o fim da
// frente e o fundo do lote.
//
// Aqui a geometria vira coordenada de jogo: a frente fica sobre a linha que a ligava
// de verdade, a casa olha para a rua e o corpo dela entra no lote. Nada e inventado:
// o que o jogo mostra e a planta de 1932, com a compressao do mapa em cima.
//
// As fachadas de uma mesma rua se encostam. Onde o lote e estreito demais para uma
// casa (o quarto de criado, o lotinho de 4 m), a fachada e juntada com a do vizinho
// da mesma rua: e assim que a rua fica cheia, sem buraco no meio do quarteirao.

import dados from './mapa1932-lotes.json'
import { ll, LIMITES, LUGARES_RESERVADOS } from './fortaleza1932.js'
import { FRENTES, LARGURA_ALVO, FOLGA_PAREDE, emLonLat, fatiasDoCaminho } from './casarioPlanta1932.js'
import { folgaCruzaRua, frenteOlhaParaFolga, folgasEntreCadeias } from './folgas1932.js'

export const USOS = dados.usos
export const USO_FAVELA = 99

// o numero do uso (1 = o primeiro da lista "usos")
export const USO = Object.fromEntries(USOS.map((nome, i) => [nome, i + 1]))
USO.Favela = USO_FAVELA

// O que cada uso pede: o casario de sobrados e platibandas, ou a casa simples de taipa.
export const TIPO_DO_USO = {
  Residencial: 'casario',
  Comercial: 'casario',
  'Prestacao servicos': 'casario',
  Religioso: 'casario',
  Instrucao: 'casario',
  Saude: 'casario',
  Institucional: 'casario',
  Hotelaria: 'casario',
  'Do lazer': 'casario',
  Desportivo: 'casario',
  Fechado: 'casario',
  Comunicacao: 'casario',
  Industrial: 'simples',
  Transporte: 'simples',
  Sem: 'simples',
  Favela: 'simples',
}

// onde o casario vira taipa: longe do centro de 1932 (a distancia e do jogo)
const RAIO_CASARIO = 330
// a menor fachada que o jogo constroi (unidades de jogo)
const MIN_FRENTE = 3.2
// a maior: uma casa de 40 m ja e um quarteirao, nao uma casa
const MAX_FRENTE = 26
// a partir dessa folga (unidades) entre duas frentes, o trecho e um vao sem
// construcao: nao se junta as casas de um lado e do outro
const FOLGA_GRUPO = 2.5
// mas um lote estreito (o quarto de criado) ainda se junta com o vizinho da
// mesma rua, ate essa folga
const FOLGA_JUNTA = 6
// quanto o angulo da testada pode mudar antes de a casa virar outra casa
const VIRADA = Math.cos((8 * Math.PI) / 180)

// As cadeias de rua: a rede viaria da planta oficial. Cada cadeia e a sequencia
// de fachadas que se encaram ao longo de uma mesma rua, na ordem. docs/mapa-1932-lotes.py
// monta isso em metros reais (a direcao e o desvio da linha, nao o encosto: a planta
// oficial tem trechos sem construcao, e a folga entre uma frente e a outra e grande).
// Cada item e [indice da fachada, ponta de entrada]: a entrada e a ponta que se liga
// a fachada anterior da cadeia.
const CADEIAS = dados.cadeias
const livre = (ponta) => (ponta === 'a' ? 'b' : 'a')

// As ruas de 1932: a linha da frente de cada lote, ligada de ponta a ponta. E a
// rede viaria que a planta oficial mostra - nao a grade de Herbster.
// Cada rua guarda os pontos e a normal de cada um (a normal aponta para a rua),
// ja em coordenadas de jogo.
export const RUAS = CADEIAS.map((cadeia) => {
  const pontos = []
  const normais = []
  for (const [k, entrada] of cadeia) {
    const f = FRENTES[k]
    const de = f[entrada]
    const para = f[livre(entrada)]
    const [dx, dz] = ll(...emLonLat(de[0], de[1]))
    const [px, pz] = ll(...emLonLat(para[0], para[1]))
    pontos.push([dx, dz])
    pontos.push([px, pz])
    normais.push(f.normal)
    normais.push(f.normal)
  }
  return { pontos, normais }
}).filter((r) => r.pontos.length > 1)

// o comprimento de uma rua e o ponto a uma distancia dela (para os postes e as pessoas)
export function comprimentoRua(rua) {
  let total = 0
  for (let i = 0; i < rua.pontos.length - 1; i++) {
    total += Math.hypot(rua.pontos[i + 1][0] - rua.pontos[i][0], rua.pontos[i + 1][1] - rua.pontos[i][1])
  }
  return total
}

export function pontoNaRua(rua, dist) {
  let restante = dist
  for (let i = 0; i < rua.pontos.length - 1; i++) {
    const a = rua.pontos[i]
    const b = rua.pontos[i + 1]
    const comp = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (restante <= comp || i === rua.pontos.length - 2) {
      const t = comp > 0 ? Math.min(1, Math.max(0, restante / comp)) : 0
      const na = rua.normais[i]
      const nb = rua.normais[i + 1]
      return [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        na[0] + (nb[0] - na[0]) * t,
        na[1] + (nb[1] - na[1]) * t,
      ]
    }
    restante -= comp
  }
  const p0 = rua.pontos[0]
  const n0 = rua.normais[0]
  return [p0[0], p0[1], n0[0], n0[1]]
}


// as fachadas em coordenada de jogo, ja agrupadas em casas
let vaosDaTestada = []
export const FACHADAS = (() => {
  const grupos = []
  const vaos = [] // os trechos da testada sem construcao (a rua segue vazia)
  for (const cadeia of CADEIAS) {
    let grupo = []
    let largura = 0
    let anterior = null
    let anteriorF = null
    let grupoDoVizinho = -1
    // fecha o grupo: as casas sao trechos de testada encostada. Um grupo curto
    // demais (um lote de 4 m sozinho) entra no grupo anterior da MESMA rua; se
    // nao ha, ele vira casa assim mesmo, do tamanho que a planta deu.
    // Todas as medidas daqui sao em METROS DE VERDADE: a planta oficial e o
    // que manda na largura da casa, e nao a escala comprimida do jogo.
    const fechar = () => {
      if (!grupo.length) return
      if (largura < MIN_FRENTE && grupoDoVizinho >= 0) {
        grupos[grupoDoVizinho].push(...grupo)
      } else {
        grupos.push(grupo)
        grupoDoVizinho = grupos.length - 1
      }
      grupo = []
      largura = 0
    }
    for (const [k, entrada] of cadeia) {
      const f = FRENTES[k]
      const de = f[entrada]
      const para = f[livre(entrada)]
      // a folga entre uma frente e a outra: um trecho sem construcao e um trecho
      // sem casa (e um vao na testada, nao uma casa gigante). Mas um lote
      // estreito sozinho (o quarto de criado) se junta com o vizinho da mesma
      // rua: e assim que a testada fica cheia.
      const folga = anterior ? Math.hypot(de[0] - anterior[0], de[1] - anterior[1]) : 0
      const curta = largura < MIN_FRENTE
      if (folga > FOLGA_GRUPO && !(curta && folga <= FOLGA_JUNTA)) {
        // Um vao na testada: a planta oficial nao tem construcao aqui, mas a
        // rua continua. No Centro esse trecho vira casa geminada; nos bairros,
        // muro com portao (src/mundo/cidade.js).
        vaos.push({
          a: ll(...emLonLat(anterior[0], anterior[1])),
          b: ll(...emLonLat(de[0], de[1])),
          normal: f.normal,
          largura: folga,
          uso: f.uso,
          prof: anteriorF ? anteriorF.prof : 0,
          // a folga é uma rua que cruza (e não um lote vazio)? Uma parede ali fechava a rua
          rua: folgaCruzaRua(anterior, de, f.normal, anteriorF ? anteriorF.prof : 0),
        })
        fechar()
      }
      anterior = para
      anteriorF = f
      grupo.push([k, entrada])
      largura += f.larg
      // a casa tem a largura que a planta deu (LARGURA_ALVO); um lote mais
      // estreito que isso espera o vizinho da mesma rua
      if (largura >= LARGURA_ALVO) fechar()
    }
    fechar()
  }

  const [px, pz] = ll(-38.5276, -3.7275) // a Praça do Ferreira
  const saida = []
  for (const grupo of grupos) {
    // o caminho do grupo: as frentes em fila, uma depois da outra
    const caminho = []
    for (const [k, entrada] of grupo) {
      const f = FRENTES[k]
      caminho.push({ de: f[entrada], para: f[livre(entrada)], f, invertido: entrada === 'b' })
    }
    let total = 0
    for (const c of caminho) { c.inicio = total; total += Math.hypot(c.para[0] - c.de[0], c.para[1] - c.de[1]) }
    if (total < 0.8) continue // a testada e curta demais para ser casa
    // o uso que domina o grupo (a frente mais longa manda)
    const usos = new Map()
    for (const c of caminho) usos.set(c.f.uso, (usos.get(c.f.uso) || 0) + c.f.larg)
    let uso = caminho[0].f.uso
    let melhor = -1
    for (const [u, peso] of usos) if (peso > melhor) { melhor = peso; uso = u }
    const nome = uso === USO_FAVELA ? 'Favela' : USOS[uso - 1]

    // A testada partida em casas: a frente da planta e longa demais para uma
    // casa so (e um quarteirao), e e partida em casas encostadas. Cada fatia
    // pega um pedaco da frente, entao a testada da rua fica cheia: antes, a
    // casa maior que o limite deixava um buraco no meio da rua.
    for (const fatia of fatiasDoCaminho(caminho)) {
      const f = fatia.f
      // a casa tem pelo menos um metro e meio de fundo: um canto de quadra
      // (onde o lote fecha na ponta) nao da uma casa, mas nao deixa buraco
      let prof = Math.max(1.5, fatia.prof)
      if (prof > 40) prof = 40 // o resto do lote e quintal, nao casa
      // a normal da fatia: a perpendicular da frente, virada para a rua
      const comp = Math.hypot(fatia.para[0] - fatia.de[0], fatia.para[1] - fatia.de[1]) || 1
      const ux = (fatia.para[0] - fatia.de[0]) / comp
      const uz = (fatia.para[1] - fatia.de[1]) / comp
      let nx = uz
      let nz = -ux
      const mx = (fatia.de[0] + fatia.para[0]) / 2
      const mz = (fatia.de[1] + fatia.para[1]) / 2
      if ((mx - f.fundo[0]) * nx + (mz - f.fundo[1]) * nz < 0) { nx = -nx; nz = -nz }
      // a casa e um retangulo dentro do lote: a frente e a fatia da testada (sem
      // a fresta da parede) e o fundo, prof metros para dentro, na direcao da
      // normal de verdade. Os quatro cantos vao para o jogo pela mesma
      // transformacao da planta, entao a casa cai dentro do lote que a planta
      // desenhou - e nao num retangulo torto, que invadia a rua.
      // a fresta da parede fica no meio da fatia: a casa e a fatia da testada
      // menos a parede que a separa da vizinha
      const ajuste = FOLGA_PAREDE / 2
      const dentro = Math.max(0.1, comp - FOLGA_PAREDE)
      const frenteA = [fatia.de[0] + ux * ajuste, fatia.de[1] + uz * ajuste]
      const frenteB = [fatia.para[0] - ux * ajuste, fatia.para[1] - uz * ajuste]
      const cantosReal = [
        [frenteA[0] - nx * prof, frenteA[1] - nz * prof],
        [frenteB[0] - nx * prof, frenteB[1] - nz * prof],
        frenteB,
        frenteA,
      ]
      const cantos = cantosReal.map((p) => ll(...emLonLat(p[0], p[1])))
      // o jogo distorce a planta: a frente e o fundo chegam inclinados um para
      // o outro. A casa e o retangulo que cabe entre os dois.
      const larguraJogo = Math.hypot(cantos[3][0] - cantos[2][0], cantos[3][1] - cantos[2][1])
      if (larguraJogo < 0.2) continue
      const dirX = (cantos[2][0] - cantos[3][0]) / larguraJogo
      const dirZ = (cantos[2][1] - cantos[3][1]) / larguraJogo
      let jnx = dirZ
      let jnz = -dirX
      const meioFrente = [(cantos[3][0] + cantos[2][0]) / 2, (cantos[3][1] + cantos[2][1]) / 2]
      const meioFundo = [(cantos[0][0] + cantos[1][0]) / 2, (cantos[0][1] + cantos[1][1]) / 2]
      // a normal olha para a rua: para longe do fundo do lote
      if ((meioFundo[0] - meioFrente[0]) * jnx + (meioFundo[1] - meioFrente[1]) * jnz > 0) { jnx = -jnx; jnz = -jnz }
      // a profundidade que cabe: a menor distancia da frente ate a linha de
      // fundo, medida na direcao da normal (e nao ate a linha de fundo, que
      // chega inclinada no jogo)
      const fundoX = cantos[1][0] - cantos[0][0]
      const fundoZ = cantos[1][1] - cantos[0][1]
      const compFundo = Math.hypot(fundoX, fundoZ) || 1
      const fx = fundoX / compFundo
      const fz = fundoZ / compFundo
      const distFundo = (p) => Math.abs((p[0] - cantos[0][0]) * fz - (p[1] - cantos[0][1]) * fx)
      const profJogo = Math.hypot(meioFundo[0] - meioFrente[0], meioFundo[1] - meioFrente[1])
      const profCabem = Math.min(distFundo(cantos[3]), distFundo(cantos[2]))
      const profFinal = Math.max(0.5, Math.min(profJogo, profCabem * 0.95))
      // o centro da casa: no meio da frente, profFinal para dentro
      const cxj = meioFrente[0] - jnx * (profFinal / 2)
      const czj = meioFrente[1] - jnz * (profFinal / 2)
      // fora do mundo jogavel nao ha casa (o sul da planta passa da borda do mapa)
      if (cxj < LIMITES.x0 || cxj > LIMITES.x1 || czj < LIMITES.z0 || czj > LIMITES.z1) continue
      const centro = Math.hypot(cxj - px, czj - pz)
      saida.push({
        uso,
        nome,
        tipo: TIPO_DO_USO[nome] === 'simples' ? 'simples' : (centro < RAIO_CASARIO ? 'casario' : (nome === 'Residencial' ? 'simples' : 'casario')),
        x: cxj,
        z: czj,
        w: larguraJogo,
        d: profFinal,
        // a profundidade em metros de verdade (a do jogo depende da escala local)
        prof,
        // a largura da frente em metros de verdade
        largura: dentro,
        rot: Math.atan2(jnx, jnz),
        // as testadas que formaram a casa (de, para), em coordenadas de jogo:
        // e a linha da frente que a planta oficial desenhou para este lote
        frentes: [[
          ll(...emLonLat(fatia.de[0], fatia.de[1]))[0],
          ll(...emLonLat(fatia.de[0], fatia.de[1]))[1],
          ll(...emLonLat(fatia.para[0], fatia.para[1]))[0],
          ll(...emLonLat(fatia.para[0], fatia.para[1]))[1],
        ]],
      })
    }
  }
  vaosDaTestada = vaos
  return saida
})()

// Os vaos da testada: os trechos da rua que a planta oficial deixa sem
// construcao. No Centro eles viram casa geminada; nos bairros, muro com
// portao (src/mundo/cidade.js).
export const VAOS = [...vaosDaTestada, ...folgasEntreCadeias()]
export { frenteOlhaParaFolga, folgaCruzaRua }

// os lugares que a cidade nao pode cobrir: a reconstituicao de cada um entra por cima
export const RESERVADOS = LUGARES_RESERVADOS
