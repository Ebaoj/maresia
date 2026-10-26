// O lote das casas (Fase 2 do plano de performance, docs/PLANO-PERFORMANCE.md).
//
// Antes, cada bloco de 96 m virava cinco malhas (reboco, peças, interior, aceso e telhas) e o three
// desenhava cada uma: com o anel de blocos perto do jogador eram ~80 desenhos por quadro, só de casa,
// e mais outros tantos no passe de sombra.
//
// Aqui as geometrias de todos os blocos de um mesmo material entram num BatchedMesh só: o reboco num,
// as peças noutro, as telhas noutro. O three desenha cada lote num multi-draw (um desenho, quando a
// extensão WEBGL_multi_draw existe) e o corte por instância continua: cada bloco é uma instância do
// lote, com a sua matriz (a identidade: a geometria já está no lugar do mundo) e a sua esfera, e o
// three corta as instâncias fora da tela antes do desenho.
//
// 26/10/2026 (a hitch de 100 ms): o addGeometry do three copia a pilha do bloco inteira de uma vez
// (70 a 100 ms por bloco na T4) e o lote crescia no meio da partida (o setGeometrySize recria o
// buffer, e a placa sobe o buffer inteiro de novo). Agora:
//   - o lote nasce com o espaço FINAL e nunca cresce. A fatia de cada material sai da estimativa
//     de quantos vértices o mapa inteiro pede nele (estimarCapacidade). Quando a fatia do bloco
//     não cabe, o bloco usa o caminho de antes (uma malha por pilha) em vez de o lote crescer;
//   - a geometria do bloco é montada fora da thread do jogo (src/mundo/gerador-bloco.worker.js) e
//     chega aqui como arrays;
//   - a cópia para a placa é fatiada (src/mundo/lote-fatia.js): cada quadro escreve um trecho da
//     faixa reservada e marca só o trecho escrito (o addUpdateRange), e a instância do bloco só
//     entra no lote quando a pilha inteira entrou.
//
// O caminho de antes (uma malha por pilha) continua existindo: cfg.desempenho.casasEmLote desligado.

import * as THREE from 'three'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { Escritor } from './lote-fatia.js'

const IDENTIDADE = new THREE.Matrix4()

// O mínimo que a escrita do lote gasta por quadro, mesmo quando a fila usou o orçamento todo:
// a escrita anda sempre (sem isso, o bloco nunca acabaria de entrar)
const MINIMO_ESCRITA_MS = 0.25

// O custo de uma casa em vértices, por material (medido no casario e no morro de 1932, 26/10/2026).
// O morro é a casa simples: ela pede menos peça e menos reboco.
const CUSTO_CASARIO = { reboco: 583, pecas: 4866, interior: 141, aceso: 55, telhas: 51 }
const CUSTO_MORRO = { rebocoMorro: 244, pecas: 1313, interior: 58, aceso: 43, telhas: 50 }
const MATERIAIS_LOTE = ['reboco', 'rebocoMorro', 'pecas', 'interior', 'aceso', 'telhas']
const CAPACIDADE_MINIMA = 20000 // nenhum material fica sem espaço para uma casa
const VERTICES_MINIMOS = 1024 // o menor lote que o three aceita

// O espaço final de cada lote: o total reservado (cfg.desempenho.casasLoteVertices) dividido
// pela fatia de cada material no mapa inteiro (medida pelo número de casas de cada tipo).
// Com `nomes`, só os materiais que existem no jogo entram na conta (o que não existir divide
// a sua parte com os que existem).
export function estimarCapacidade({ casas = [], morro = [], total = 1500000, nomes = MATERIAIS_LOTE }) {
  const nc = Math.max(casas.length, 1)
  const nm = Math.max(morro.length, 1)
  const precisa = {}
  let soma = 0
  for (const nome of nomes) {
    const v = (CUSTO_CASARIO[nome] ?? 0) * nc + (CUSTO_MORRO[nome] ?? 0) * nm
    precisa[nome] = v
    soma += v
  }
  const capacidade = {}
  for (const nome of nomes) {
    const fatia = soma > 0 ? (total * precisa[nome]) / soma : total / nomes.length
    capacidade[nome] = Math.max(CAPACIDADE_MINIMA, Math.round(fatia))
  }
  return { capacidade, precisa }
}

export class LoteCasas {
  // materiais: [{ nome, material, castShadow, receiveShadow }]
  // capacidade: o espaço final de cada material (o que estimarCapacidade devolve); sem ele, a
  //   estimativa sai do total reservado (cfg.desempenho.casasLoteVertices)
  constructor({ grupo, cfg, capacidade = null, materiais }) {
    this.cfg = cfg
    this.grupo = grupo
    this.lotes = new Map() // nome → { nome, material, castShadow, mesh, itens, vertices, capacidade, visiveis, instâncias }
    this.proximoId = 1
    this.totalReservado = Math.max(50000, Math.round(cfg?.desempenho?.casasLoteVertices ?? 1500000))
    // o three tem um limite de instâncias por lote, e o mapa tem mais de mil blocos de casas: o
    // limite é generoso (a matriz de cada instância são 64 bytes na placa)
    this.instanciasReservadas = Math.max(1024, Math.round(cfg?.desempenho?.casasLoteInstancias ?? 2048))
    this.fatiaMaxima = Math.max(1024, Math.round(cfg?.desempenho?.casasLoteFatiaVertices ?? 65536))
    this.verticesTotais = 0
    this.escritores = new Map() // id → a pilha que está entrando na placa, pedaço a pedaço
    const espaco = capacidade ?? estimarCapacidade({ total: this.totalReservado, nomes: [...materiais.map((m) => m.nome)] }).capacidade
    for (const m of materiais) {
      const vertices = Math.max(VERTICES_MINIMOS, Math.round(espaco[m.nome] ?? this.totalReservado / materiais.length))
      this.lotes.set(m.nome, { ...m, mesh: null, itens: new Map(), vertices: 0, capacidade: vertices, visiveis: 0, instancias: 0 })
      this.criarLote(this.lotes.get(m.nome))
    }
  }

  // A malha do lote nasce com o espaço final: o three reserva o buffer na placa na hora, e ele
  // nunca cresce (crescer recria o buffer e a placa sobe tudo de novo: era o pico de 100 ms).
  criarLote(lote) {
    const vertices = lote.capacidade
    const mesh = new THREE.BatchedMesh(this.instanciasReservadas, vertices, 0, lote.material)
    mesh.name = `casas-lote-${lote.nome}`
    mesh.castShadow = lote.castShadow !== false
    mesh.receiveShadow = lote.receiveShadow !== false
    mesh.frustumCulled = false // o corte é por instância (o three faz isso no BatchedMesh)
    mesh.perObjectFrustumCulled = true
    mesh.sortObjects = false // o material é opaco: a ordem de desenho não muda nada e a ordenação custa CPU
    // os atributos do lote: os mesmos da casa (posição, normal, cor e o chão da casa). O three
    // cria os mesmos quando o primeiro addGeometry entra; aqui não entra (a escrita é fatiada e
    // o addGeometry copiaria a pilha inteira de uma vez).
    const g = mesh.geometry
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3))
    g.setAttribute('aChao', new THREE.BufferAttribute(new Float32Array(vertices), 1))
    // o three não recria os atributos quando o lote já os tem
    mesh._geometryInitialized = true
    this.grupo.add(mesh)
    // o lote é parado: entra no registro da sombra (src/render/sombra-estatica.js)
    if (mesh.castShadow) registrarEstatico(mesh)
    lote.mesh = mesh
    mesh.userData.verticesUsados = 0
    mesh.userData.verticesReservados = vertices
  }

  // Reserva a faixa de vértices de uma pilha no lote do material. Devolve null quando não cabe
  // (o lote tem espaço final): quem chama usa o caminho de antes, uma malha por pilha.
  reservar(nome, vertices, limites = null) {
    const lote = this.lotes.get(nome)
    if (!lote || !lote.mesh) return null
    if (!vertices || vertices <= 0) return null
    if (lote.vertices + vertices > lote.capacidade) return null
    if (lote.instancias >= this.instanciasReservadas) return null
    const vertexStart = lote.vertices
    lote.vertices += vertices
    lote.instancias++
    this.verticesTotais += vertices
    return {
      id: this.proximoId++,
      nome, lote, mesh: lote.mesh, vertices, limites,
      info: {
        vertexStart, vertexCount: 0, reservedVertexCount: vertices,
        indexStart: -1, indexCount: -1, reservedIndexCount: -1,
        start: vertexStart, count: 0,
        boundingBox: null, boundingSphere: null, active: true,
      },
    }
  }

  // Escreve no lote. Com um ticket, copia um trecho da pilha na faixa reservada (é o que o
  // escritor de fatias chama, um pedaço por quadro). Com um número, é a escrita do quadro: o
  // lote escreve o que couber no orçamento de tempo.
  escrever(a, b, c, d) {
    if (typeof a === 'number') return this.escreverLote(a, b)
    return this.copiar(a, b, c, d)
  }

  // Copia um trecho da pilha na faixa reservada. Só o trecho escrito sobe para a placa (o
  // addUpdateRange diz o intervalo; sem ele o three sobe o buffer inteiro, que era o outro
  // lado do pico de 100 ms).
  copiar(ticket, dados, inicio, quantidade) {
    if (!ticket || !dados || quantidade <= 0) return
    const g = ticket.mesh.geometry
    const destino = ticket.info.vertexStart + inicio
    copiarAtributo(g.attributes.position, dados.pos, inicio, destino, quantidade, 3)
    copiarAtributo(g.attributes.normal, dados.nor, inicio, destino, quantidade, 3)
    copiarAtributo(g.attributes.color, dados.cor, inicio, destino, quantidade, 3)
    copiarAtributo(g.attributes.aChao, dados.chao, inicio, destino, quantidade, 1)
  }

  // A pilha fica na fila de escrita do lote: o lote escreve um pedaço por quadro
  // (src/mundo/lote-fatia.js) e só quando a pilha inteira entrou a instância entra no lote.
  // O jogo usa o escritor do bloco (src/mundo/quarteirao.js, que sabe quando o bloco inteiro
  // entrou); este caminho é para o lote escrever por conta própria, com o orçamento do quadro.
  prepararPronto(item, pilha, { aoTerminar = null, limites = null } = {}) {
    if (!item || !pilha) return null
    const escritor = new Escritor({
      escrever: (inicio, quantidade) => this.copiar(item, pilha, inicio, quantidade),
      vertices: item.vertices,
      maximo: this.fatiaMaxima,
      aoTerminar: () => {
        const id = this.fechar(item, limites ?? item.limites)
        aoTerminar?.(id)
      },
    })
    this.escritores.set(item.id, { item, escritor, aoTerminar })
    return escritor
  }

  // A escrita do quadro: cada pilha na fila escreve um pedaço, sem passar do orçamento de tempo.
  // Devolve o que foi escrito (para a marca da montagem no rastreador).
  escreverLote(orcamentoMs = 0, agora = () => performance.now()) {
    if (this.escritores.size === 0) return { ms: 0, vertices: 0, blocos: 0 }
    const t0 = agora()
    let vertices = 0
    let blocos = 0
    for (const [id, pendente] of [...this.escritores.entries()]) {
      const gasto = agora() - t0
      // o mínimo garante que a escrita anda mesmo quando a fila usou o orçamento todo
      const sobra = Math.max((orcamentoMs || 0) - gasto, MINIMO_ESCRITA_MS)
      const r = pendente.escritor.passo(sobra)
      vertices += r.escritos
      if (!r.fim) break // o orçamento acabou: o resto fica para o próximo quadro
      this.escritores.delete(id)
      pendente.aoTerminar?.()
      blocos++
      if (agora() - t0 >= (orcamentoMs || 0)) break
    }
    return { ms: agora() - t0, vertices, blocos }
  }

  // A pilha inteira entrou: a faixa vira uma geometria do lote e a instância aparece (escondida:
  // o LOD de perto e longe do bloco manda). Devolve o id (para mostrar, esconder e tirar).
  fechar(ticket, limites) {
    if (!ticket) return null
    const mesh = ticket.mesh
    const lote = ticket.lote
    const info = { ...ticket.info }
    info.vertexCount = ticket.vertices
    info.count = ticket.vertices
    info.start = ticket.info.vertexStart
    if (limites) { info.boundingBox = limites.caixa ?? null; info.boundingSphere = limites.esfera ?? null }
    const geometriaId = registrarGeometria(mesh, info)
    const instancia = mesh.addInstance(geometriaId)
    mesh.setMatrixAt(instancia, IDENTIDADE)
    mesh.setVisibleAt(instancia, false) // o bloco só aparece quando o LOD mandar
    mesh.userData.verticesUsados = (mesh.userData.verticesUsados ?? 0) + ticket.vertices
    const id = ticket.id
    lote.itens.set(id, { id, instancia, geometriaId, mesh, vertices: ticket.vertices, visivel: false })
    return id
  }

  // mostra ou esconde o bloco (o LOD de perto e longe do bloco de casas)
  mostrar(id, sim) {
    for (const lote of this.lotes.values()) {
      const item = lote.itens.get(id)
      if (!item) continue
      if (item.visivel === sim) return true
      item.visivel = sim
      item.mesh.setVisibleAt(item.instancia, sim)
      lote.visiveis += sim ? 1 : -1
      return true
    }
    return false
  }

  // o bloco saiu do mapa: a instância e a geometria saem do lote
  remover(id) {
    for (const lote of this.lotes.values()) {
      const item = lote.itens.get(id)
      if (!item) continue
      item.mesh.deleteInstance(item.instancia)
      item.mesh.deleteGeometry(item.geometriaId)
      lote.vertices -= item.vertices
      lote.instancias--
      this.verticesTotais -= item.vertices
      if (item.visivel) lote.visiveis--
      lote.itens.delete(id)
      return true
    }
    return false
  }

  // quantos bytes a pilha ocupa na placa (o orçamento de subida do quadro, Fase 1)
  static bytesDosDados(dados) {
    if (!dados) return 0
    let n = 0
    for (const k of ['pos', 'nor', 'cor', 'chao']) n += dados[k]?.length ?? 0
    return n * 4
  }

  stats() {
    let geometrias = 0, visiveis = 0, vertices = 0, reservados = 0
    for (const lote of this.lotes.values()) {
      geometrias += lote.itens.size
      visiveis += lote.visiveis
      vertices += lote.vertices
      reservados += lote.capacidade
    }
    return { lotes: this.lotes.size, malhas: this.lotes.size, geometrias, visiveis, vertices, reservados, escrevendo: this.escritores.size }
  }
}

// os bytes da pilha (o mesmo, fora da classe)
export const bytesDosDados = (dados) => LoteCasas.bytesDosDados(dados)

// copia n vértices da pilha (dentro do bloco) para o atributo do lote (na faixa reservada)
function copiarAtributo(atributo, origem, de, destino, n, itemSize) {
  if (!atributo || !origem) return
  const a = de * itemSize
  const b = destino * itemSize
  atributo.array.set(origem.subarray(a, a + n * itemSize), b)
  atributo.addUpdateRange(b, n * itemSize)
  atributo.needsUpdate = true
}

// Registra a faixa do bloco como uma geometria do lote. O addGeometry do three faria o mesmo,
// mas copiando a pilha inteira de uma vez (o que travava o quadro): aqui a faixa já está
// reservada e escrita, e o three só precisa saber que ela existe.
function registrarGeometria(mesh, info) {
  const lista = mesh._geometryInfo
  let id
  if (mesh._availableGeometryIds.length > 0) {
    mesh._availableGeometryIds.sort((a, b) => a - b)
    id = mesh._availableGeometryIds.shift()
    lista[id] = info
  } else {
    id = lista.length
    lista.push(info)
    mesh._geometryCount = lista.length
  }
  mesh._nextVertexStart = info.vertexStart + info.reservedVertexCount
  mesh._visibilityChanged = true
  return id
}
