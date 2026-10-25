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
// A geometria de cada bloco entra no lote quando o bloco é montado (Fase 1 monta o casario em fatias,
// com orçamento de tempo por quadro) e sai quando o bloco é descarregado (a descarga do mapa é da
// Fase 3). O espaço do lote é reservado na placa com folga e cresce quando falta.
//
// O caminho de antes (uma malha por pilha) continua existindo: cfg.desempenho.casasEmLote desligado.

import * as THREE from 'three'
import { registrarEstatico } from '../render/sombra-estatica.js'

const IDENTIDADE = new THREE.Matrix4()

export class LoteCasas {
  // materiais: [{ nome, material, castShadow, receiveShadow }]
  constructor({ grupo, cfg, materiais }) {
    this.cfg = cfg
    this.grupo = grupo
    this.lotes = new Map() // nome → { nome, material, castShadow, mesh, itens, vertices, capacidade, visiveis }
    this.proximoId = 1
    // os vértices que o conjunto dos lotes reserva na placa (o total, dividido entre os materiais
    // pela fatia de cada um: as peças da casa são a maior parte, o telhado e o interior são o resto)
    this.verticesReservados = Math.max(50000, Math.round(cfg?.desempenho?.casasLoteVertices ?? 1500000))
    // o three tem um limite de instâncias por lote, e o mapa tem mais de mil blocos de casas: o
    // limite é generoso (a matriz de cada instância são 64 bytes na placa)
    this.instanciasReservadas = 2048
    // o bloco que está sendo montado e o anterior: o anterior dá a fatia de cada material
    this.bloco = new Map()
    this.blocoAnterior = new Map()
    this.totalBloco = 0
    this.totalBlocoAnterior = 0
    this.verticesTotais = 0
    for (const m of materiais) {
      this.lotes.set(m.nome, { ...m, mesh: null, meshes: [], itens: new Map(), vertices: 0, capacidade: 0, visiveis: 0 })
    }
  }

  // a malha do lote nasce quando a primeira casa entra (o three reserva o espaço na placa na hora)
  criarLote(lote, vertices) {
    const mesh = new THREE.BatchedMesh(this.instanciasReservadas, vertices, vertices, lote.material)
    mesh.name = `casas-lote-${lote.nome}`
    mesh.castShadow = lote.castShadow !== false
    mesh.receiveShadow = lote.receiveShadow !== false
    mesh.frustumCulled = false // o corte é por instância (o three faz isso no BatchedMesh)
    mesh.perObjectFrustumCulled = true
    mesh.sortObjects = false // o material é opaco: a ordem de desenho não muda nada e a ordenação custa CPU
    this.grupo.add(mesh)
    // o lote é parado: entra no registro da sombra (src/render/sombra-estatica.js)
    if (mesh.castShadow) registrarEstatico(mesh)
    lote.meshes.push(mesh)
    lote.mesh = mesh
    lote.capacidade = vertices
    mesh.userData.verticesUsados = 0
    mesh.userData.verticesReservados = vertices
  }

  // A geometria de um bloco entra no lote do material. Devolve o id (para mostrar, esconder e tirar).
  adicionar(nome, geometria) {
    const lote = this.lotes.get(nome)
    if (!lote) return null
    const vertices = geometria.getAttribute('position')?.count ?? 0
    if (!vertices) return null
    this.crescer(lote, vertices)
    // o three tem um limite de instâncias por lote (o mapa tem mais de mil blocos de casas): quando
    // ele enche, o lote do material ganha outra malha e a casa nova entra nela
    let mesh = lote.mesh
    let geometriaId = null
    let instanciaId = null
    try {
      geometriaId = mesh.addGeometry(geometria)
      instanciaId = mesh.addInstance(geometriaId)
    } catch (erro) {
      // sem espaço para mais instâncias: outra malha para o mesmo material
      if (!geometriaId) {
        this.criarLote(lote, vertices)
        mesh = lote.mesh
        geometriaId = mesh.addGeometry(geometria)
        instanciaId = mesh.addInstance(geometriaId)
      } else {
        // a geometria entrou mas a instância não: desfaz e tenta na malha nova
        mesh.deleteGeometry(geometriaId)
        this.criarLote(lote, vertices)
        mesh = lote.mesh
        geometriaId = mesh.addGeometry(geometria)
        instanciaId = mesh.addInstance(geometriaId)
      }
    }
    mesh.setMatrixAt(instanciaId, IDENTIDADE)
    mesh.setVisibleAt(instanciaId, false) // o bloco só aparece quando o LOD mandar
    mesh.userData.verticesUsados = (mesh.userData.verticesUsados ?? 0) + vertices
    lote.vertices += vertices
    this.verticesTotais += vertices
    this.bloco.set(nome, (this.bloco.get(nome) || 0) + vertices)
    this.totalBloco += vertices
    const id = this.proximoId++
    lote.itens.set(id, { geometria, instancia: instanciaId, geometriaId, vertices, visivel: false, mesh })
    return id
  }

  // O fim de um bloco de casas: o que entrou nele é a referência das fatias (cada material recebe
  // do espaço reservado a parte dele, na proporção do que ocupa).
  fecharBloco() {
    this.blocoAnterior = this.bloco
    this.totalBlocoAnterior = this.totalBloco
    this.bloco = new Map()
    this.totalBloco = 0
  }

  // quantos vértices este material deve reservar: a sua fatia do espaço total
  capacidadeDesejada(lote) {
    if (!this.totalBlocoAnterior) return Math.round(this.verticesReservados * 0.2)
    const parte = (this.blocoAnterior.get(lote.nome) || 0) / this.totalBlocoAnterior
    return Math.max(20000, Math.round(this.verticesReservados * Math.max(0.02, Math.min(1, parte))))
  }

  // espaço para mais vértices: o lote cresce (o three recria o buffer e copia o que tinha)
  crescer(lote, vertices) {
    if (!lote.mesh) { this.criarLote(lote, vertices); return }
    const usados = lote.mesh.userData.verticesUsados ?? 0
    if (usados + vertices <= lote.capacidade) return
    const nova = Math.max(usados + vertices, Math.ceil(lote.capacidade * 1.5), this.capacidadeDesejada(lote))
    lote.mesh.setGeometrySize(nova, nova)
    lote.capacidade = nova
    lote.mesh.userData.verticesReservados = nova
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
      this.verticesTotais -= item.vertices
      if (item.visivel) lote.visiveis--
      lote.itens.delete(id)
      return true
    }
    return false
  }

  // quantos bytes a geometria ocupa na placa (o orçamento de subida do quadro, Fase 1)
  static bytes(geometria) {
    let n = 0
    for (const k in geometria.attributes) n += geometria.attributes[k].array.byteLength
    if (geometria.index) n += geometria.index.array.byteLength
    return n
  }

  stats() {
    let geometrias = 0, visiveis = 0, vertices = 0, lotes = 0, reservados = 0, malhas = 0
    for (const lote of this.lotes.values()) {
      if (!lote.mesh) continue
      lotes++
      malhas += lote.meshes.length
      geometrias += lote.itens.size
      visiveis += lote.visiveis
      vertices += lote.vertices
      // o espaço reservado: o de cada malha do material
      for (const m of lote.meshes) reservados += m.userData.verticesReservados ?? 0
    }
    return { lotes, malhas, geometrias, visiveis, vertices, reservados }
  }
}
