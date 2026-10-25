// O gerenciador dos blocos de casas (Fase 1 do plano de performance, docs/PLANO-PERFORMANCE.md).
//
// Um bloco de casas tem 96 m de lado e dezenas de casas dentro, e cada casa tem centenas de
// peças. Montar o bloco inteiro dentro de um quadro levava 150 a 300 ms na T4 e travava o jogo
// depois de um teleporte.
//
// Aqui o bloco é montado em etapas: a fila gasta só um orçamento de tempo por quadro
// (cfg.desempenho.orcamentoMontagemMs) e a malha nova só aparece quando o orçamento de bytes
// do quadro deixa (cfg.desempenho.orcamentoUploadMB). O destino de um teleporte e o anel à
// frente do jogador entram na fila com prioridade, para o casario já estar pronto quando o
// jogador chega.
//
// O módulo não sabe de geometria: quem monta as casas é o gerador que o quarteirao.js passa
// (cada passo do gerador é uma etapa da montagem).

import * as THREE from 'three'
import { criarFilaMontagem } from './fila-montagem.js'
import { marcar } from '../debug/marcas.js'

const PERTO = 70 // metros: dentro disso a casa é a de verdade, fora é a caixa pintada

export class GerenciadorDeBlocos {
  constructor({ grupo, cfg, tamBloco, gerar }) {
    this.grupo = grupo
    this.tamBloco = tamBloco
    this.gerar = gerar // (b) => o gerador das etapas do bloco
    this.blocos = new Map()
    this.fatiar = cfg?.desempenho?.fatiarMontagem !== false
    this.orcamentoMs = cfg?.desempenho?.orcamentoMontagemMs ?? 4
    this.uploadMB = cfg?.desempenho?.orcamentoUploadMB ?? 16
    this.raioPrefetch = cfg?.desempenho?.raioPrefetch ?? 96
    this.fila = criarFilaMontagem({ orcamentoMs: this.orcamentoMs })
    this.alvoPrefetch = null // o destino do teleporte (main.js irPara)
  }

  // o registro dos blocos: a chave é o bloco de 96 m (a casa é simples, do morro, ou de casario)
  bloco(it, simples) {
    const k = `${simples ? 'm' : 'c'}${Math.floor(it.x / this.tamBloco)},${Math.floor(it.z / this.tamBloco)}`
    if (!this.blocos.has(k)) {
      this.blocos.set(k, {
        chave: k, simples, itens: [], malhas: [], longe: [],
        x0: Math.floor(it.x / this.tamBloco) * this.tamBloco,
        z0: Math.floor(it.z / this.tamBloco) * this.tamBloco,
        perto: false, montado: false, pronto: false, bytes: 0, gerador: null,
      })
    }
    return this.blocos.get(k)
  }

  // a distância do bloco ao ponto (a distância até o bloco, não até o centro)
  distancia(b, cx, cz) {
    const t = this.tamBloco
    return Math.hypot(Math.max(b.x0 - cx, 0, cx - (b.x0 + t)), Math.max(b.z0 - cz, 0, cz - (b.z0 + t)))
  }

  // A extensão do bloco, calculada das casas: com ela a esfera e a caixa da malha já vêm
  // prontas, e o three não calcula a esfera no primeiro quadro em que a malha aparece.
  limites(b) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [it] of b.itens) {
      const f = it.fachada
      if (!f) continue
      const c = Math.cos(f.ang), s = Math.sin(f.ang)
      const mx = f.F / 2 + 2.5, mz = f.D / 2 + 2.5 // a folga cobre o beiral e a sacada
      for (const [dx, dz] of [[-mx, -mz], [mx, -mz], [mx, mz], [-mx, mz]]) {
        const x = it.x + dx * c + dz * s
        const z = it.z - dx * s + dz * c
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (z < z0) z0 = z
        if (z > z1) z1 = z
      }
      if (f.chao < y0) y0 = f.chao
      if (f.chao + f.H + 3 > y1) y1 = f.chao + f.H + 3
    }
    if (!Number.isFinite(x0)) {
      x0 = b.x0; x1 = b.x0 + this.tamBloco
      z0 = b.z0; z1 = b.z0 + this.tamBloco
      y0 = 0; y1 = 10
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2
    const r = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 0.5
    return {
      esfera: new THREE.Sphere(new THREE.Vector3(cx, cy, cz), r),
      caixa: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)),
    }
  }

  // perto e pronto: a malha detalhada à vista; longe: a caixa de fachada pintada
  aplicarVisibilidade(b) {
    const detalhe = b.perto && b.pronto
    for (const m of b.malhas) m.visible = detalhe
    for (const m of b.longe) m.visible = !detalhe
  }

  // quanto a malha ocupa na placa (bytes), para o orçamento de subida do quadro
  bytesDaMalha(m) {
    const g = m.geometry
    let n = 0
    for (const k in g.attributes) n += g.attributes[k].array.byteLength
    if (g.index) n += g.index.array.byteLength
    return n
  }

  // um passo da fila: a etapa seguinte do bloco
  passo(b) {
    if (!b.gerador) return
    const r = b.gerador.next()
    if (!r.done) return
    b.gerador = null
    b.montado = true
    b.bytes = b.malhas.reduce((s, m) => s + this.bytesDaMalha(m), 0)
    this.fila.remover(b.chave)
    this.aplicarVisibilidade(b)
  }

  // o bloco inteiro de uma vez (o jeito de antes, para o A/B)
  montarTodo(b) {
    b.gerador = this.gerar(b)
    let r = b.gerador.next()
    while (!r.done) r = b.gerador.next()
    b.gerador = null
    b.montado = true
    b.bytes = b.malhas.reduce((s, m) => s + this.bytesDaMalha(m), 0)
    this.fila.remover(b.chave)
  }

  // Fase 1: o destino conhecido (teleporte) entra na fila antes de todo o resto, e os vizinhos
  // dele também. As casas do destino já estão prontas quando o jogador chega. O destino só vale
  // enquanto o jogador está perto dele: andando para longe, a prioridade volta a ser a distância.
  prefetch(x, z) { this.alvoPrefetch = { x, z } }

  // porQuadro (cfg.desempenho.casasPorQuadro): quantos blocos montar por quadro, sem fatiamento
  atualizar(camera, porQuadro = 1) {
    if (!camera) return
    const cx = camera.position.x
    const cz = camera.position.z
    let montou = 0
    for (const b of this.blocos.values()) {
      if (b.unidade?.suspenso) continue
      const d = this.distancia(b, cx, cz)
      const perto = b.perto ? d < PERTO + 8 : d < PERTO // folga para não piscar na divisa
      // o bloco do destino do teleporte vem antes de todo o resto (enquanto o jogador estiver
      // perto dele); o anel à frente do jogador é montado em segundo plano
      const noDestino = !!this.alvoPrefetch
        && Math.hypot(cx - this.alvoPrefetch.x, cz - this.alvoPrefetch.z) < PERTO + this.raioPrefetch + 60
        && this.distancia(b, this.alvoPrefetch.x, this.alvoPrefetch.z) <= this.raioPrefetch + this.tamBloco
      const noAnel = this.fatiar && d < PERTO + this.raioPrefetch
      const prioridade = noDestino ? -1000 + d : d
      if ((perto || noDestino || noAnel) && !b.montado && !b.gerador) {
        if (!this.fatiar) {
          // o jeito de antes: o bloco inteiro dentro de um quadro (para o A/B)
          if (montou >= porQuadro) continue
          montou++
          b.perto = perto
          this.montarTodo(b)
          b.pronto = true
          this.aplicarVisibilidade(b)
          continue
        }
        b.gerador = this.gerar(b)
        this.fila.enfileirar(b.chave, () => this.passo(b), { prioridade, tipo: 'casa' })
      } else if (b.gerador) {
        // a prioridade anda com a câmera (o bloco mais perto é sempre o primeiro)
        this.fila.mudarPrioridade(b.chave, prioridade)
      }
      if (perto === b.perto) continue
      b.perto = perto
      this.aplicarVisibilidade(b)
    }
    if (!this.fatiar) return
    // o trabalho do quadro, com orçamento de tempo (cfg.desempenho.orcamentoMontagemMs)
    const r = this.fila.processar({ orcamentoMs: this.orcamentoMs })
    if (r.feitos) marcar('montagem', { feitos: r.feitos, ms: Math.round(r.ms) })
    // a subida das malhas novas para a placa, com orçamento de bytes por quadro
    let usados = 0
    const limite = this.uploadMB * 1048576
    for (const b of this.blocos.values()) {
      if (!b.montado || b.pronto || !b.perto) continue
      if (usados + b.bytes > limite) continue
      usados += b.bytes
      b.pronto = true
      this.aplicarVisibilidade(b)
    }
  }
}
