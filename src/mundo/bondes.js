// As linhas de bonde da Light (1913-1947): as dez linhas que saem da Praca do Ferreira.
//
// O traco do dado (src/mundo/mapa1932-dados.json) e esquematico: uma reta entre ancoras
// reais, nao a rota historica. Aqui o trilho e desenhado sobre a rede viaria de verdade
// da planta de 1932: um grafo das ruas (as cadeias de src/mundo/casario1932.js) e o
// caminho mais curto da Praca do Ferreira ate a ponta de cada linha.
//
// Nesta rodada sao so os trilhos no chao e as paradas. O bonde andando fica para a
// proxima (ver docs/mapa-1932.md).

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BONDES, LUGARES } from './mapa1932.js'
import { RUAS } from './casario1932.js'
import { alturaTerreno } from './terreno.js'
import { toon, toonVertice } from '../materiais.js'
import { colorir } from './cenografia.js'
import { instanciarEmBlocos } from './blocos.js'
import { CENTRO as CENTRO_PRACA } from './praca1932.js'

// Ligacao entre ruas: a ponta de uma rua se liga a ponta de outra quando estao perto
// (22 unidades de jogo ~= 60 m) e a rua continua quase em linha reta (a direcao de
// saida de uma e a de chegada da outra, com 80 graus de folga). Com 16 unidades so
// 3% da rede se ligava a praca; com 22, 95%.
const LIGACAO = 22
const CURVA = 1.4 // radianos (80 graus)
const BITOLA = 1.0 // a distancia entre os dois trilhos, em unidades de jogo
const ESPESSURA = 0.14
const RAIO_PRACA = 30 // onde as linhas nascem: as pontas de rua em volta da praca

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
          // a rua tem de continuar: a direcao de saida de uma e a de chegada da outra
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

// ---------- o caminho em polilinha ----------

// junta os trechos de rua do caminho e arredonda as curvas, para o trilho nao ficar
// com o canto vivo
function polilinhaDoCaminho(nos, ant, destino) {
  const trechos = []
  let k = destino
  while (k >= 0) {
    const no = nos[k]
    trechos.push(no)
    k = ant[k]
  }
  const pontos = []
  // o caminho vem do destino para a praca: a rua de cada no e percorrida da ponta do
  // no ate a outra ponta. No fim, a polilinha fica da praca para o destino.
  for (const no of trechos) {
    const rua = RUAS[no.rua].pontos
    const lista = no.ponta === 1 ? [...rua].reverse() : rua
    for (const p of lista) {
      const ultimo = pontos[pontos.length - 1]
      if (ultimo && Math.hypot(ultimo[0] - p[0], ultimo[1] - p[1]) < 0.01) continue
      pontos.push([p[0], p[1]])
    }
  }
  return arredondar(pontos.reverse())
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

// ---------- o desenho ----------

// dois trilhos de aco assentados no paralelepipedo, no caminho da linha.
// A geometria e montada na mao (um quad no topo e dois de lado por trecho): uma
// BoxGeometry por trecho custava 178 mil vertices e 1 s de carga.
// dois trilhos de aco assentados no paralelepipedo, no caminho da linha.
// A geometria e montada na mao (um quad no topo e dois de lado por trecho): uma
// BoxGeometry por trecho custava 178 mil vertices e 1 s de carga.
function geometriaTrilho(linhas) {
  const pos = []
  const idx = []
  let base = 0
  const quad = (a, b, c, d) => {
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2])
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
    base += 4
  }
  for (const pontos of linhas) {
    for (let i = 0; i < pontos.length - 1; i++) {
      const [x0, z0] = pontos[i]
      const [x1, z1] = pontos[i + 1]
      const dx = x1 - x0
      const dz = z1 - z0
      const comp = Math.hypot(dx, dz)
      if (comp < 0.01) continue
      const nx = -dz / comp
      const nz = dx / comp
      const y0 = alturaTerreno(x0, z0) + 0.15
      const y1 = alturaTerreno(x1, z1) + 0.15
      for (const lado of [-1, 1]) {
        const ox = (nx * BITOLA * lado) / 2
        const oz = (nz * BITOLA * lado) / 2
        const e = ESPESSURA / 2
        // o topo do trilho
        quad(
          [x0 + ox - nx * e, y0, z0 + oz - nz * e],
          [x1 + ox - nx * e, y1, z1 + oz - nz * e],
          [x1 + ox + nx * e, y1, z1 + oz + nz * e],
          [x0 + ox + nx * e, y0, z0 + oz + nz * e]
        )
        // as duas laterais, para o trilho ter volume de um ponto de vista baixo
        quad(
          [x0 + ox - nx * e, y0, z0 + oz - nz * e],
          [x1 + ox - nx * e, y1, z1 + oz - nz * e],
          [x1 + ox - nx * e, y1 - 0.05, z1 + oz - nz * e],
          [x0 + ox - nx * e, y0 - 0.05, z0 + oz - nz * e]
        )
        quad(
          [x0 + ox + nx * e, y0, z0 + oz + nz * e],
          [x0 + ox + nx * e, y0 - 0.05, z0 + oz + nz * e],
          [x1 + ox + nx * e, y1 - 0.05, z1 + oz + nz * e],
          [x1 + ox + nx * e, y1, z1 + oz + nz * e]
        )
      }
    }
  }
  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// as travessas de madeira: sem elas o trilho some de longe (9 cm de acao viram
// um pixel a 40 m)
function geometriaTravessa() {
  return new THREE.BoxGeometry(BITOLA + 0.34, 0.07, 0.2).translate(0, 0.035, 0)
}

// a parada: um poste de madeira com a placa, no chao de paralelepipedo
function geometriaParada() {
  const partes = []
  partes.push(colorir(new THREE.CylinderGeometry(0.08, 0.1, 2.3, 6).translate(0, 1.15, 0), '#7a6248'))
  partes.push(colorir(new THREE.BoxGeometry(0.9, 0.34, 0.05).translate(0, 2.05, 0), '#e9dcc0'))
  partes.push(colorir(new THREE.BoxGeometry(0.9, 0.05, 0.09).translate(0, 2.24, 0), '#3b3038'))
  return mergeGeometries(partes.map((g) => g.toNonIndexed()))
}

export function criarBondes(cena) {
  const nos = construirGrafo()
  // as origens: as pontas de rua em volta da praca do Ferreira
  const origens = []
  for (let k = 0; k < nos.length; k++) {
    const d = Math.hypot(nos[k].x - CENTRO_PRACA[0], nos[k].z - CENTRO_PRACA[1])
    if (d < RAIO_PRACA && d > 6) origens.push({ no: k, custo: d })
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
    const pontos = polilinhaDoCaminho(nos, ant, melhor)
    if (pontos.length < 2) { relatorio.push({ nome: b.nome, erro: 'caminho vazio' }); continue }
    // o trilho comeca na borda da praca: o coreto fica no meio, entao o bonde para
    // antes dele
    let corte = 0
    for (let i = 0; i < pontos.length; i++) {
      if (Math.hypot(pontos[i][0] - CENTRO_PRACA[0], pontos[i][1] - CENTRO_PRACA[1]) < 6) { corte = i; break }
    }
    const trecho = corte > 0 ? pontos.slice(corte) : pontos
    linhas.push(trecho)
    paradas.push({ ponto: trecho[0], direcao: direcaoDoTrecho(trecho, 0), nome: 'Praça do Ferreira' })
    paradas.push({ ponto: trecho[trecho.length - 1], direcao: direcaoDoTrecho(trecho, trecho.length - 1), nome: b.nome })
    relatorio.push({
      nome: b.nome,
      pontos: trecho.length,
      comprimento: Math.round(comprimento(trecho)),
      sobra: Math.round(melhorDist), // quanto falta para a ponta nominal do dado
      comeca: trecho[0].map((v) => Math.round(v)),
      termina: trecho[trecho.length - 1].map((v) => Math.round(v)),
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

  // as travessas de madeira, atravessadas na via
  const matrizesTravessa = []
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  for (const pontos of linhas) {
    for (let i = 0; i < pontos.length - 1; i++) {
      const [x0, z0] = pontos[i]
      const [x1, z1] = pontos[i + 1]
      const comp = Math.hypot(x1 - x0, z1 - z0)
      if (comp < 0.05) continue
      const ang = -Math.atan2(z1 - z0, x1 - x0)
      q.setFromAxisAngle(Y, ang)
      for (let d = 0; d < comp; d += 0.45) {
        const t = d / comp
        const x = x0 + (x1 - x0) * t
        const z = z0 + (z1 - z0) * t
        matrizesTravessa.push(m4.clone().compose(
          new THREE.Vector3(x, alturaTerreno(x, z) + 0.13, z), q, new THREE.Vector3(1, 1, 1)
        ))
      }
    }
  }
  if (matrizesTravessa.length) {
    instanciarEmBlocos(cena, geometriaTravessa(), toon('#5e4529'), matrizesTravessa, null, { nome: 'travessas-bonde' })
  }

  // o desenho
  const geo = geometriaTrilho(linhas)
  if (geo) {
    const matTrilho = toon('#38352f', { side: THREE.DoubleSide })
    const malha = new THREE.Mesh(geo, matTrilho)
    malha.name = 'trilhos-bonde'
    malha.receiveShadow = true
    cena.add(malha)
  }
  // as paradas, cada uma no seu lugar
  if (paradas.length) {
    const matrizes = paradas.map(({ ponto: [x, z], direcao }) => {
      // na calçada, 1,4 unidade para o lado do trilho
      const px = x + -direcao[1] * 1.4
      const pz = z + direcao[0] * 1.4
      return new THREE.Matrix4().makeTranslation(px, alturaTerreno(px, pz), pz)
    })
    const malha = new THREE.InstancedMesh(geometriaParada(), toonVertice(), matrizes.length)
    matrizes.forEach((m, i) => malha.setMatrixAt(i, m))
    malha.instanceMatrix.needsUpdate = true
    malha.name = 'paradas-bonde'
    malha.castShadow = true
    cena.add(malha)
  }

  return { linhas: linhas.length, paradas: paradas.length, relatorio }
}
