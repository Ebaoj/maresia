// As linhas de bonde da Light (1913-1947): as dez linhas que saem da Praca do Ferreira.
//
// Este arquivo e o dado: o grafo das ruas, o caminho mais curto e a rota de cada
// linha. O desenho (trilho, travessa, parada e letreiro) esta em
// src/mundo/bondes-malha.js.
//
// O traco do dado (src/mundo/mapa1932-dados.json) e esquematico: uma reta entre ancoras
// reais, nao a rota historica. Aqui o trilho e desenhado sobre a rede viaria de verdade
// da planta de 1932: um grafo das ruas (as cadeias de src/mundo/casario1932.js) e o
// caminho mais curto da Praca do Ferreira ate a ponta de cada linha.
//
// Nesta rodada sao so os trilhos no chao e as paradas. O bonde andando fica para a
// proxima (ver docs/mapa-1932.md).

import { BONDES, LUGARES } from './mapa1932.js'
import { RUAS } from './casario1932.js'
import { dentroDaPraca, distanciaDaBorda } from './praca1932.js'
import { ocupacao1932 } from './ocupacao1932.js'

// Ligacao entre ruas: a ponta de uma rua se liga a ponta de outra quando estao perto
// (22 unidades de jogo ~= 60 m) e a rua continua quase em linha reta (a direcao de
// saida de uma e a de chegada da outra, com 80 graus de folga). Com 16 unidades so
// 3% da rede se ligava a praca; com 22, 95%.
const LIGACAO = 22
const CURVA = 1.4 // radianos (80 graus)

// onde as linhas nascem: as pontas de rua que ficam na borda da praca. O bonde
// saia da praca pelas ruas do entorno, e nao do meio dela.
const NA_BORDA = 6 // unidades de folga para a borda da praca

// o trilho fica no meio da pista: a cadeia e a linha da testada (a beira do
// calco), e o meio da pista fica meia largura da rua para dentro. A largura se
// mede na grade de ocupacao da planta de 1932: da testada ate o lote do outro
// lado. O deslocamento e limitado, senao o trilho entra na praca.
const MEIA_LARGURA_MAX = 6 // unidades (uns 17 m)

// o nome das paradas: o dado tem o papel de cada lugar, nao o nome
const NOMES = {
  pracaFerreira: 'Praça do Ferreira',
  estacao: 'Estação Central',
  pracaEstacao: 'Praça da Estação',
  passeioPublico: 'Passeio Público',
  pracaLeoes: 'Praça dos Leões',
  theatro: 'Theatro São Luiz',
  mercado: 'Mercado',
  cemiterio: 'Cemitério S. João Batista',
  estacaoOtavio: 'Estação Otávio Bonfim',
  lagoaPorangabussu: 'Lagoa de Porangabussu',
  ponteVelha: 'Ponte Velha',
  ponteIngleses: 'Ponte dos Ingleses',
  santaCasa: 'Santa Casa',
  se: 'Velha Sé',
  pracaMestres: 'Praça dos Mestres',
  parqueLiberdade: 'Parque da Liberdade',
  colegioMilitar: 'Colégio Militar',
  forte: 'Forte',
}

// ---------- o grafo das ruas ----------

// cada ponta de rua e um no; duas pontas se ligam quando a rua pode continuar de uma
// para a outra (perto e sem dobrar de costas)
export function construirGrafo() {
  const nos = []
  for (let i = 0; i < RUAS.length; i++) {
    const p = RUAS[i].pontos
    if (p.length < 2) continue
    const primeiro = p[0]
    const ultimo = p[p.length - 1]
    const depois = p[1]
    const antes = p[p.length - 2]
    nos.push({ rua: i, ponta: 0, x: primeiro[0], z: primeiro[1], dx: depois[0] - primeiro[0], dz: depois[1] - primeiro[1], viz: [] })
    nos.push({ rua: i, ponta: 1, x: ultimo[0], z: ultimo[1], dx: ultimo[0] - antes[0], dz: ultimo[1] - antes[1], viz: [] })
  }
  // indice espacial: uma grade de LIGACAO. Cada ponta entra so na sua celula; a
  // busca olha as nove celulas vizinhas.
  const CEL = LIGACAO
  const grade = new Map()
  const chave = (a, b) => `${a},${b}`
  for (let k = 0; k < nos.length; k++) {
    const c = chave(Math.floor(nos[k].x / CEL), Math.floor(nos[k].z / CEL))
    let lista = grade.get(c)
    if (!lista) { lista = []; grade.set(c, lista) }
    lista.push(k)
  }
  for (let k = 0; k < nos.length; k++) {
    const a = nos[k]
    const cx = Math.floor(a.x / CEL)
    const cz = Math.floor(a.z / CEL)
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const m of grade.get(chave(cx + i, cz + j)) || []) {
          if (m === k) continue
          const b = nos[m]
          const d = Math.hypot(b.x - a.x, b.z - a.z)
          if (d > LIGACAO || d < 0.01) continue
          // a rua tem de continuar: a direcao de saida de uma e a de chegada da
          // outra. (A ponta 0 da cadeia e a direcao para dentro dela; a ponta 1 e
          // a direcao para fora. E por isso que a regra vale para as duas
          // pontas: a mesma rua partida em duas cadeias liga ponta 0 com ponta
          // 1, e as duas faces da mesma rua ligam ponta 0 com ponta 0.)
          const la = Math.hypot(a.dx, a.dz) || 1
          const lb = Math.hypot(b.dx, b.dz) || 1
          const cos = (a.dx * b.dx + a.dz * b.dz) / (la * lb)
          if (cos > -Math.cos(CURVA)) continue
          a.viz.push({ no: m, custo: d })
        }
      }
    }
  }
  return nos
}

// Dijkstra multi-fonte: as pontas em volta da praca sao a origem, e o caminho mais
// barato ate cada no da rede e o caminho do bonde
export function dijkstra(nos, origens) {
  const dist = new Float64Array(nos.length).fill(Infinity)
  const ant = new Int32Array(nos.length).fill(-1)
  const heap = [] // { no, d }
  const trocar = (i, j) => { const t = heap[i]; heap[i] = heap[j]; heap[j] = t }
  const subir = (i) => {
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p].d <= heap[i].d) break
      trocar(i, p)
      i = p
    }
  }
  const descer = (i) => {
    for (;;) {
      const e = 2 * i + 1
      if (e >= heap.length) break
      const d = e + 1 < heap.length && heap[e + 1].d < heap[e].d ? e + 1 : e
      if (heap[d].d >= heap[i].d) break
      trocar(i, d)
      i = d
    }
  }
  for (const o of origens) {
    if (o.custo < dist[o.no]) {
      dist[o.no] = o.custo
      ant[o.no] = -1
      heap.push({ no: o.no, d: o.custo })
      subir(heap.length - 1)
    }
  }
  while (heap.length) {
    const topo = heap[0]
    const ultimo = heap.pop()
    if (heap.length) { heap[0] = ultimo; descer(0) }
    if (topo.d > dist[topo.no]) continue // entrada velha
    for (const v of nos[topo.no].viz) {
      const nd = topo.d + v.custo
      if (nd < dist[v.no]) {
        dist[v.no] = nd
        ant[v.no] = topo.no
        heap.push({ no: v.no, d: nd })
        subir(heap.length - 1)
      }
    }
  }
  return { dist, ant }
}

// ---------- a rota ----------

// a rota do caminho: as cadeias uma de tras da outra, cada uma percorrida da ponta
// do no ate a outra ponta. A ordem e da praca para o destino, e a rota e continua
// (sem vaivem: antes as cadeias vinham ao contrario e a polilinha saltava de um
// quarteirao para o outro).
function rotaDoCaminho(nos, ant, destino) {
  const caminho = []
  let k = destino
  while (k >= 0) { caminho.push(nos[k]); k = ant[k] }
  caminho.reverse() // agora vai da origem (a praca) para o destino
  const pontos = []
  for (const no of caminho) {
    const rua = RUAS[no.rua]
    const lista = no.ponta === 1
      ? { pontos: [...rua.pontos].reverse(), normais: [...rua.normais].reverse() }
      : rua
    for (let i = 0; i < lista.pontos.length; i++) {
      const p = lista.pontos[i]
      const ultimo = pontos[pontos.length - 1]
      if (ultimo && Math.hypot(ultimo[0] - p[0], ultimo[1] - p[1]) < 0.01) continue
      const n = lista.normais[i]
      pontos.push([p[0], p[1], n[0], n[1]])
    }
  }
  return pontos
}

// o trilho fica no meio da pista: a cadeia e a testada, e o meio da pista fica meia
// largura da rua para dentro (a largura se mede na grade de ocupacao de 1932: da
// testada ate o lote do outro lado).
function paraOMeioDaPista(x, z, nx, nz) {
  let largura = 0
  for (let d = 1.5; d <= 24; d += 1.5) {
    if (ocupacao1932(x + nx * d, z + nz * d) > 1) { largura = d; break }
  }
  if (!largura) return [x, z]
  const meio = Math.min(largura / 2, MEIA_LARGURA_MAX)
  const px = x + nx * meio
  const pz = z + nz * meio
  // na borda da praca a "rua" e a propria praca: o trilho fica na borda, nao entra
  if (dentroDaPraca(px, pz)) return [x, z]
  return [px, pz]
}

// troca o canto vivo por tres pontos (o trilho faz a curva)
function arredondar(pontos) {
  const out = [pontos[0]]
  for (let i = 1; i < pontos.length - 1; i++) {
    const a = pontos[i - 1]
    const b = pontos[i]
    const c = pontos[i + 1]
    const d1 = Math.hypot(b[0] - a[0], b[1] - a[1])
    const d2 = Math.hypot(c[0] - b[0], c[1] - b[1])
    const r = Math.min(1.6, d1 * 0.4, d2 * 0.4)
    if (r < 0.05) { out.push(b); continue }
    const p1 = [b[0] + (a[0] - b[0]) * (r / (d1 || 1)), b[1] + (a[1] - b[1]) * (r / (d1 || 1))]
    const p2 = [b[0] + (c[0] - b[0]) * (r / (d2 || 1)), b[1] + (c[1] - b[1]) * (r / (d2 || 1))]
    out.push(p1, b, p2)
  }
  out.push(pontos[pontos.length - 1])
  return out
}

// a direcao da via no ponto (para pôr a parada na calçada, ao lado do trilho)
function direcaoDoTrecho(pontos, i) {
  const a = pontos[Math.max(0, i - 1)]
  const b = pontos[Math.min(pontos.length - 1, i + 1)]
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const l = Math.hypot(dx, dz) || 1
  return [dx / l, dz / l]
}

function comprimento(pontos) {
  let t = 0
  for (let i = 0; i < pontos.length - 1; i++) {
    t += Math.hypot(pontos[i + 1][0] - pontos[i][0], pontos[i + 1][1] - pontos[i][1])
  }
  return t
}

// ---------- as rotas das linhas ----------

// As rotas: cada linha da Light sai da borda da praca e segue as ruas de verdade.
// O trilho nunca entra na praca (ela era o jardim e o coreto): se a rota cutting
// atravessar, o pedaco de dentro e descartado.
export function rotasDosBondes() {
  const nos = construirGrafo()
  // as origens: as pontas de rua na borda da praca
  const origens = []
  for (let k = 0; k < nos.length; k++) {
    const borda = Math.abs(distanciaDaBorda(nos[k].x, nos[k].z))
    if (borda < NA_BORDA) origens.push({ no: k, custo: borda })
  }
  const { dist, ant } = dijkstra(nos, origens)

  const linhas = []
  const paradas = []
  const relatorio = []
  for (const b of BONDES) {
    const fim = b.traco[b.traco.length - 1]
    // o no mais proximo do destino (a rede nao sempre chega ate a ponta: a linha
    // da Praia, por exemplo, morre na orla, onde a planta de 1932 nao tem testada)
    let melhor = -1
    let melhorDist = Infinity
    for (let k = 0; k < nos.length; k++) {
      if (!Number.isFinite(dist[k])) continue
      const d = Math.hypot(nos[k].x - fim[0], nos[k].z - fim[1])
      if (d < 40 && d < melhorDist) { melhorDist = d; melhor = k }
    }
    if (melhor < 0) {
      // sem no perto: fica com o alcancavel mais proximo da ponta
      for (let k = 0; k < nos.length; k++) {
        if (!Number.isFinite(dist[k])) continue
        const d = Math.hypot(nos[k].x - fim[0], nos[k].z - fim[1])
        if (d < melhorDist) { melhorDist = d; melhor = k }
      }
    }
    if (melhor < 0) { relatorio.push({ nome: b.nome, erro: 'sem caminho' }); continue }
    const crua = rotaDoCaminho(nos, ant, melhor)
    if (crua.length < 2) { relatorio.push({ nome: b.nome, erro: 'caminho vazio' }); continue }
    // o trilho no meio da pista
    const pontos = crua.map(([x, z, nx, nz]) => paraOMeioDaPista(x, z, nx, nz))
    // o trilho nao entra na praca: o pedaco de dentro e descartado
    const pecas = foraDaPraca(pontos)
    if (!pecas.length) { relatorio.push({ nome: b.nome, erro: 'rota dentro da praca' }); continue }
    for (const peca of pecas) linhas.push(peca)
    const primeira = pecas[0]
    const ultima = pecas[pecas.length - 1]
    paradas.push({ ponto: primeira[0], direcao: direcaoDoTrecho(primeira, 0), nome: 'Praça do Ferreira' })
    paradas.push({ ponto: ultima[ultima.length - 1], direcao: direcaoDoTrecho(ultima, ultima.length - 1), nome: b.nome })
    relatorio.push({
      nome: b.nome,
      pontos: pecas.reduce((t, p) => t + p.length, 0),
      pedacos: pecas.length,
      comprimento: Math.round(comprimento(primeira)),
      sobra: Math.round(melhorDist), // quanto falta para a ponta nominal do dado
      comeca: primeira[0].map((v) => Math.round(v)),
      termina: ultima[ultima.length - 1].map((v) => Math.round(v)),
    })
  }

  // as paradas nos lugares com nome que o trilho passa perto
  for (const [chave, lugar] of Object.entries(LUGARES)) {
    if (!NOMES[chave]) continue
    const [x, z] = lugar.ponto
    for (const pontos of linhas) {
      let achou = -1
      for (let i = 0; i < pontos.length; i++) {
        if (Math.hypot(pontos[i][0] - x, pontos[i][1] - z) < 18) { achou = i; break }
      }
      if (achou < 0) continue
      paradas.push({ ponto: pontos[achou], direcao: direcaoDoTrecho(pontos, achou), nome: NOMES[chave] })
      relatorio.push({ parada: NOMES[chave] })
      break
    }
  }

  return { linhas, paradas, relatorio }
}

// a parte da rota que fica fora da praca (a praca e o jardim e o coreto: o bonde
// passava pelas ruas do entorno). Se a rota atravessar a praca, ela quebra em
// pedacos: o trilho nao existe dentro da praca.
function foraDaPraca(pontos) {
  const pecas = []
  let atual = []
  for (const p of pontos) {
    if (dentroDaPraca(p[0], p[1])) {
      if (atual.length > 1) pecas.push(arredondar(atual))
      atual = []
      continue
    }
    atual.push(p)
  }
  if (atual.length > 1) pecas.push(arredondar(atual))
  return pecas
}
