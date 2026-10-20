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

const cruas = dados.fachadas.map((f) => {
  const [ax, az] = ll(f[1], f[2])
  const [bx, bz] = ll(f[3], f[4])
  const [cx, cz] = ll(f[5], f[6])
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  let ux = bx - ax
  let uz = bz - az
  const larg = Math.hypot(ux, uz)
  ux /= larg || 1
  uz /= larg || 1
  // a normal aponta para a rua: a perpendicular que fica longe do fundo do lote
  let nx = uz
  let nz = -ux
  if ((mx - cx) * nx + (mz - cz) * nz < 0) { nx = -nx; nz = -nz }
  const prof = Math.abs((mx - cx) * nx + (mz - cz) * nz)
  return {
    uso: f[0],
    a: [ax, az],
    b: [bx, bz],
    normal: [nx, nz],
    larg,
    prof,
    x: mx - nx * (prof / 2),
    z: mz - nz * (prof / 2),
  }
})

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
// Cada rua guarda os pontos e a normal de cada um (a normal aponta para a rua).
export const RUAS = CADEIAS.map((cadeia) => {
  const pontos = []
  const normais = []
  for (const [k, entrada] of cadeia) {
    const f = cruas[k]
    const de = f[entrada]
    const para = f[livre(entrada)]
    pontos.push(de)
    pontos.push(para)
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
export const FACHADAS = (() => {
  const grupos = []
  for (const cadeia of CADEIAS) {
    let grupo = []
    let largura = 0
    let anterior = null
    let grupoDoVizinho = -1
    // fecha o grupo: as casas sao trechos de testada encostada. Um grupo curto
    // demais (um lote de 4 m sozinho) entra no grupo anterior da MESMA rua; se
    // nao ha, ele vira casa assim mesmo, do tamanho que a planta deu.
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
      const f = cruas[k]
      const de = f[entrada]
      const para = f[livre(entrada)]
      // a folga entre uma frente e a outra: um trecho sem construcao e um trecho
      // sem casa (e um vao na testada, nao uma casa gigante). Mas um lote
      // estreito sozinho (o quarto de criado) se junta com o vizinho da mesma
      // rua: e assim que a testada fica cheia.
      const folga = anterior ? Math.hypot(de[0] - anterior[0], de[1] - anterior[1]) : 0
      const curta = largura < MIN_FRENTE
      if (folga > FOLGA_GRUPO && !(curta && folga <= FOLGA_JUNTA)) fechar()
      anterior = para
      if (f.larg > MAX_FRENTE) { grupo.push([k, entrada]); fechar(); continue } // fachada grande demais
      grupo.push([k, entrada])
      largura += f.larg
      if (largura >= MIN_FRENTE) fechar()
    }
    fechar()
  }

  const [px, pz] = ll(-38.5276, -3.7275) // a Praça do Ferreira
  const saida = []
  for (const grupo of grupos) {
    // o caminho do grupo: as frentes em fila, uma depois da outra
    const caminho = []
    for (const [k, entrada] of grupo) {
      const f = cruas[k]
      caminho.push({ de: f[entrada], para: f[livre(entrada)], f })
    }
    let total = 0
    for (const c of caminho) { c.inicio = total; total += Math.hypot(c.para[0] - c.de[0], c.para[1] - c.de[1]) }
    if (total < 0.8) continue
    // a fachada fica um pouco menor que o grupo: a parede entre as casas tem
    // espessura, e nas ruas curvas o canto da casa nao entra no vizinho
    const larg = Math.min(total, MAX_FRENTE) * 0.96
    // o meio do caminho: onde a casa vai ficar
    const meio = larg / 2
    let achado = caminho[0]
    for (const c of caminho) {
      const fim = c.inicio + Math.hypot(c.para[0] - c.de[0], c.para[1] - c.de[1])
      if (meio <= fim) { achado = c; break }
    }
    const comp = Math.hypot(achado.para[0] - achado.de[0], achado.para[1] - achado.de[1]) || 1
    const t = Math.min(1, Math.max(0, (meio - achado.inicio) / comp))
    const mx = achado.de[0] + (achado.para[0] - achado.de[0]) * t
    const mz = achado.de[1] + (achado.para[1] - achado.de[1]) * t
    // fora do mundo jogavel nao ha casa (o sul da planta passa da borda do mapa)
    if (mx < LIMITES.x0 || mx > LIMITES.x1 || mz < LIMITES.z0 || mz > LIMITES.z1) continue
    const ux = (achado.para[0] - achado.de[0]) / comp
    const uz = (achado.para[1] - achado.de[1]) / comp
    // a normal: a perpendicular que aponta para a rua
    let nx = uz
    let nz = -ux
    let prof = Infinity
    const usos = new Map()
    for (const c of caminho) {
      // a casa e tao funda quanto o lote mais raso do grupo: assim ela nao invade
      // o lote de tras (a parede dos fundos)
      prof = Math.min(prof, c.f.prof)
      usos.set(c.f.uso, (usos.get(c.f.uso) || 0) + c.f.larg)
      if (c.f.normal[0] * nx + c.f.normal[1] * nz < 0) { nx = -nx; nz = -nz }
    }
    let uso = achado.f.uso
    let melhor = -1
    for (const [u, peso] of usos) if (peso > melhor) { melhor = peso; uso = u }
    if (prof < 1.2) continue // lote raso demais: e um canto de quadra, nao uma casa
    if (prof > 40) prof = 40 // o resto do lote e quintal, nao casa
    const nome = uso === USO_FAVELA ? 'Favela' : USOS[uso - 1]
    const centro = Math.hypot(mx - px, mz - pz)
    saida.push({
      uso,
      nome,
      tipo: TIPO_DO_USO[nome] === 'simples' ? 'simples' : (centro < RAIO_CASARIO ? 'casario' : (nome === 'Residencial' ? 'simples' : 'casario')),
      x: mx - nx * (prof / 2),
      z: mz - nz * (prof / 2),
      w: larg,
      d: prof,
      rot: Math.atan2(nx, nz),
    })
  }
  return saida
})()

// os lugares que a cidade nao pode cobrir: a reconstituicao de cada um entra por cima
export const RESERVADOS = LUGARES_RESERVADOS
