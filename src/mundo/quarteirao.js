// Casas de 1932 com geometria de verdade (nasceu como fatia vertical numa rua; hoje é todo o casario
// e, na variante simples, as casas do morro). Em vez de caixa com janela pintada:
//   - fachada com espessura e vãos recuados (porta e janela), alguns em arco abatido
//   - moldura saliente, peitoril, cunhais (pilastras nas quinas), embasamento
//   - folhas de madeira em 3D, fechadas, entreabertas ou abertas para a rua
//   - interior escuro e quente atrás dos vãos
//   - platibanda com cornija em degraus, ou beiral com telha canal (capa e canal)
//   - sacada de ferro em parte dos sobrados
//   - calçada alta com meio-fio (é um deck: o personagem sobe nela)
// As casas são juntadas por bloco de 96 m em 3 malhas (reboco, peças, interior): poucas chamadas de
// desenho, e o three pula o bloco inteiro fora da tela ou da sombra.
//
// A montagem tem três tempos (26/10/2026, Fase 2): o worker monta a geometria do bloco fora da
// thread do jogo, a thread copia os vértices para o lote em fatias (com o orçamento de tempo do
// quadro) e o bloco só aparece quando a fatia toda entrou. A geometria da casa em si vive em
// src/mundo/casa1932.js (o worker usa o mesmo código) e os materiais em src/mundo/casas-materiais.js.

import * as THREE from 'three'
import { luzFixa } from '../materiais.js'
import { globais } from '../globais.js'
import { adicionarDeck } from './colisao.js'
import { MuitoLonge } from './muito-longe.js'
import { LoteCasas, estimarCapacidade } from './casas-lote.js'
import { TAM_LOD, instanciarEmBlocos } from './blocos.js'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { criarAleatorio } from '../utils.js'
import { GerenciadorDeBlocos } from './bloco-casas.js'
import { casa, pilhasVazias, planejar, geometriaDeDados, deckDaCasa, Pilha } from './casa1932.js'
import { materiaisDasCasas, materialRebocoMarco } from './casas-materiais.js'
import { prepararGeometria } from './lote-geometria.js'
import { Escritor } from './lote-fatia.js'

// rua de referência da fatia vertical (z ≈ 152, x -72 a -36): bom lugar para comparar com os filmes
export const FATIA = { x0: -73, x1: -35, z0: 134, z1: 170 }

// as cinco pilhas de uma casa (reboco, peças, interior, interior aceso e telhas)
const PILHAS = ['reboco', 'pecas', 'interior', 'aceso', 'telhas']
// quantos pedidos o worker aceita ao mesmo tempo (a geometria fica esperando na memória dele)
const MAX_PEDIDOS = 4
const TAM_BLOCO = TAM_LOD // o mesmo bloco das caixas de longe (registrarLonge acha a caixa pelo bloco)

// o que o mundo de fora usa do quarteirao (o mesmo de sempre, agora de outro arquivo)
export { Pilha, pilhasVazias, planejarCasa, montarCasa } from './casa1932.js'
export { materiaisDasCasas, materialRebocoMarco } from './casas-materiais.js'

// os dados da casa que o worker precisa (o resto não é geometria)
function dadosDaCasa(it) {
  return {
    x: it.x, y: it.y, z: it.z, w: it.w, d: it.d, h: it.h, rot: it.rot,
    cor: it.cor, frente: it.frente, chao: it.chao, alturaLote: it.alturaLote,
  }
}

export function criarCasas(cena, casario, morro, cfg = null, opcoes = {}) {
  const { reboco: matReboco, rebocoMorro: matRebocoMorro, pecas: matPecas, telhas: matTelhas } = materiaisDasCasas()
  const grupo = new THREE.Group()
  grupo.name = 'casas-1932'
  const sementeDe = (i) => 1932 + i * 7919
  const semente = (i) => criarAleatorio(sementeDe(i))
  const todas = [...casario.map((it) => [it, false]), ...morro.map((it) => [it, true])]
  planejar(true)
  const vazio = pilhasVazias
  // o gerenciador dos blocos (Fase 1): a fila com orçamento de tempo, o prefetch do destino,
  // a subida gradual para a placa e os limites já calculados (src/mundo/bloco-casas.js)
  const ger = new GerenciadorDeBlocos({
    grupo, cfg, tamBloco: TAM_BLOCO,
    gerar: (b) => gerarBloco(b),
    pedir: (b) => pedirGeometria(b),
    podePedir: () => pedidos.size < MAX_PEDIDOS,
    registrar: (b, pilhas) => registrarGeometria(b, pilhas),
  })
  todas.forEach(([it, simples], i) => {
    const b = ger.bloco(it, simples)
    // o planejamento drena o gerador da casa inteira (o mesmo sorteio de sempre)
    for (const _ of casa(it, vazio(), semente(i), simples)) { /* nada */ }
    b.itens.push([it, i])
  })
  planejar(false)
  // interior aceso: escuro de dia, candeeiro quente à noite (não recebe luz; brilha no filtro)
  const matAceso = luzFixa(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.6, globais.uNoite)

  // Fase 2: as casas de cada material num lote só (um BatchedMesh por material: um desenho por
  // material em vez de cinco por bloco). Só no WebGL: o caminho do WebGPU desenha por objeto.
  // O renderizador que vale é o que o jogo está usando (o WebGPU pode cair para o WebGL).
  const emLote = cfg?.desempenho?.casasEmLote !== false && !opcoes.webgpu
  // o espaço final de cada lote: o total reservado dividido pela estimativa de quantos vértices
  // cada material pede no mapa inteiro (src/mundo/casas-lote.js)
  const estimativa = estimarCapacidade({
    casas: casario,
    morro,
    total: cfg?.desempenho?.casasLoteVertices ?? 1500000,
  })
  const loteCasas = emLote ? new LoteCasas({
    grupo, cfg,
    capacidade: estimativa.capacidade,
    materiais: [
      { nome: 'reboco', material: matReboco, castShadow: true, receiveShadow: true },
      { nome: 'rebocoMorro', material: matRebocoMorro, castShadow: true, receiveShadow: true },
      { nome: 'pecas', material: matPecas, castShadow: true, receiveShadow: true },
      { nome: 'interior', material: matPecas, castShadow: false, receiveShadow: true },
      { nome: 'aceso', material: matAceso, castShadow: false, receiveShadow: true },
      { nome: 'telhas', material: matTelhas, castShadow: true, receiveShadow: true },
    ],
  }) : null

  // o material de cada pilha (o nome da pilha é o nome do lote)
  const MATERIAIS = {
    reboco: matReboco,
    rebocoMorro: matRebocoMorro,
    pecas: matPecas,
    interior: matPecas,
    aceso: matAceso,
    telhas: matTelhas,
  }

  // O worker que monta o bloco fora da thread do jogo. Sem worker (os testes, os lugares sem
  // Web Worker), o bloco é gerado no fio: a montagem continua, só que mais lenta.
  const worker = opcoes.semWorker ? null : criarWorker()
  const pedidos = new Map()
  let proximoPedido = 0

  function criarWorker() {
    if (typeof Worker === 'undefined') return null
    try {
      const w = new Worker(new URL('./gerador-bloco.worker.js', import.meta.url), { type: 'module' })
      w.onmessage = (evento) => {
        const { id, pilhas } = evento.data
        const pedido = pedidos.get(id)
        if (!pedido) return
        pedidos.delete(id)
        pedido.pilhas = pilhas
        pedido.pronto = true
      }
      return w
    } catch (erro) {
      console.warn('[maresia] o worker das casas não subiu: o bloco é montado no fio', erro)
      return null
    }
  }

  // o pedido da geometria do bloco ao worker (null quando não há worker)
  function pedirGeometria(b) {
    if (!worker) return null
    const id = ++proximoPedido
    const pedido = { pronto: false, pilhas: null }
    pedidos.set(id, pedido)
    worker.postMessage({
      id,
      // a semente vai como número: o worker sorteia a casa igual (mesma semente, mesmo sorteio)
      casas: b.itens.map(([it, i]) => ({ it: dadosDaCasa(it), semente: sementeDe(i), simples: b.simples })),
    })
    return pedido
  }

  // O bloco inteiro no fio (o caminho sem worker): cada casa é um passo do gerador, e o
  // gerador devolve as pilhas do bloco (cortadas no tamanho exato).
  function* gerarBloco(b) {
    const pilhas = vazio()
    for (const [it, i] of b.itens) yield* casa(it, pilhas, semente(i), b.simples)
    const dados = {}
    for (const nome of PILHAS) {
      const p = pilhas[nome]
      if (!p || !p.n) continue
      dados[nome] = prepararGeometria({
        vertices: p.n,
        pos: p.pPos, nor: p.pNor, cor: p.pCor, chao: p.pChao,
      })
    }
    return dados
  }

  // A geometria do bloco chegou. Cada pilha entra no lote do seu material: a faixa de vértices
  // fica reservada e a cópia para a placa é fatiada (cada quadro escreve um trecho dos vértices,
  // e só esse trecho sobe). Quando o espaço do lote acaba, a pilha vira uma malha como no
  // caminho de antes.
  // Devolve o escritor do bloco (as fatias de cada pilha) ou null (nada entrou no lote).
  function registrarGeometria(b, pilhas) {
    const limites = ger.limites(b)
    const escritores = []
    for (const nome of PILHAS) {
      const pilha = pilhas?.[nome]
      if (!pilha || !pilha.vertices) continue
      const material = MATERIAIS[nome]
      const ticket = loteCasas ? loteCasas.reservar(nome, pilha.vertices) : null
      if (ticket) {
        const bytes = LoteCasas.bytesDosDados(pilha)
        escritores.push(new Escritor({
          vertices: pilha.vertices,
          agora: () => performance.now(),
          escrever: (ini, n) => loteCasas.escrever(ticket, pilha, ini, n),
          // a pilha entrou toda: a instância entra no lote (o bloco só aparece quando o LOD mandar)
          aoTerminar: () => {
            const id = loteCasas.fechar(ticket, limites)
            if (id) b.lote.push({ lote: loteCasas, id, bytes })
          },
        }))
      } else {
        // o espaço do lote acabou: a casa usa uma malha como antes (o jogo continua)
        const m = new THREE.Mesh(geometriaDeDados(pilha, limites), material)
        m.name = `casas-${nome}`
        m.castShadow = nome !== 'interior' && nome !== 'aceso'
        m.receiveShadow = true
        m.visible = false
        grupo.add(m)
        registrarEstatico(m)
        b.malhas.push(m)
      }
    }
    // o deck da calçada alta (o personagem sobe nela): a casa não registra sozinha (o worker
    // não tem a colisão da thread do jogo)
    if (!b.simples) {
      for (const [it] of b.itens) {
        const d = deckDaCasa(it)
        adicionarDeck(d.x, d.z, d.hx, d.hz, d.rot, d.y)
      }
    }
    if (!escritores.length) return null
    // o escritor do bloco: cada pilha entra na sua vez, e o que sobra do orçamento passa para
    // a pilha seguinte
    let i = 0
    return {
      passo(restante) {
        let sobra = restante ?? 3
        while (i < escritores.length) {
          const r = escritores[i].passo(sobra)
          sobra -= r.ms
          if (!r.fim) return { fim: false }
          i++
        }
        return { fim: true }
      },
    }
  }

  // a câmera colide com caixas simples, uma por casa (invisíveis). Raio contra a malha detalhada
  // testava centenas de milhares de triângulos por quadro e derrubava o jogo para 40 ms.
  const caixas = []
  const eixo = new THREE.Vector3(0, 1, 0)
  for (const it of [...casario, ...morro]) {
    const f = it.fachada
    if (!f) continue
    caixas.push(new THREE.Matrix4().compose(
      new THREE.Vector3(it.x, f.chao, it.z),
      new THREE.Quaternion().setFromAxisAngle(eixo, f.ang),
      new THREE.Vector3(f.F, f.H + 0.8, f.D)
    ))
  }
  const geoCaixa = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  const matInvisivel = luzFixa(new THREE.MeshBasicMaterial()) // nunca é desenhado; luzFixa só por contrato
  // nuncaDesenha: o pré-aquecimento do WebGPU (render/renderizador.js) não liga estas caixas
  for (const m of instanciarEmBlocos(grupo, geoCaixa, matInvisivel, caixas, null, { nome: 'casas-colisao-camera', sombra: false, recebe: false, solido: true, tam: TAM_LOD })) { m.visible = false; m.userData.nuncaDesenha = true }
  cena.add(grupo)
  const escuro = new THREE.Color('#4a3a30')
  const quente = new THREE.Color('#ffb860').multiplyScalar(2.2)
  // LOD por bloco: perto da câmera a casa detalhada; longe, a caixa com fachada pintada (Lote.criar)
  const PERTO = 70
  // de muito longe, as caixas de fachada pintada dos blocos se juntam por célula grande (muito-longe.js)
  const muitoLonge = new MuitoLonge(grupo, { nome: 'casas' })
  // as malhas representativas dos materiais das casas, para o pré-aquecimento dos shaders
  // (Fase 1): os blocos são montados depois do jogo começar, e sem elas os shaders das casas
  // só entrariam no primeiro teleporte, no quadro em que o programa é compilado
  let representantes = null
  const geometriaRepresentante = () => {
    const p = new Pilha()
    p.caixa(new THREE.Matrix4(), 0, 0, 0, 1, 1, 1, '#ffffff')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(p.pPos.slice(0, p.n * 3), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(p.pNor.slice(0, p.n * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(p.pCor.slice(0, p.n * 3), 3))
    g.setAttribute('aChao', new THREE.BufferAttribute(p.pChao.slice(0, p.n), 1))
    return g
  }
  const representantesAquecimento = () => {
    if (representantes) return representantes
    representantes = []
    const geo = geometriaRepresentante()
    for (const [mat, nome] of [[matReboco, 'aq-reboco'], [matRebocoMorro, 'aq-reboco-morro'], [matPecas, 'aq-pecas'], [matTelhas, 'aq-telhas'], [matAceso, 'aq-aceso']]) {
      const m = new THREE.Mesh(geo, mat)
      m.name = nome
      m.castShadow = true
      m.receiveShadow = true
      representantes.push(m)
    }
    // Fase 2: o lote das casas é um BatchedMesh, e o programa dele é outra variante do shader
    // (o three compila uma variante por tipo de objeto). Sem esta malha representativa, o
    // programa do lote só seria compilado no quadro em que o primeiro bloco de casas entrasse.
    if (loteCasas) {
      for (const [mat, nome] of [[matReboco, 'aq-lote-reboco'], [matRebocoMorro, 'aq-lote-reboco-morro'], [matPecas, 'aq-lote-pecas'], [matTelhas, 'aq-lote-telhas'], [matAceso, 'aq-lote-aceso']]) {
        const lote = new THREE.BatchedMesh(1, geo.getAttribute('position').count, geo.getAttribute('position').count, mat)
        lote.name = nome
        const id = lote.addGeometry(geo)
        lote.addInstance(id)
        lote.castShadow = true
        lote.receiveShadow = true
        representantes.push(lote)
      }
    }
    return representantes
  }
  return {
    grupo,
    muitoLonge,
    representantesAquecimento,
    lote: loteCasas, // o lote das casas em BatchedMesh (Fase 2); null no caminho de antes
    // Fase 2: quem avisa que o conjunto de casas mudou (o cache da sombra refaz o mapa)
    aoMudarCasas: (fn) => { ger.aoMudar = fn },
    // o estado dos blocos (o console e o medidor olham isto): quantos estão montados, perto (a casa
    // detalhada à vista) e prontos (a subida na placa já aconteceu)
    estatisticas: () => {
      let perto = 0, pronto = 0, montado = 0, malhas = 0, lote = 0
      for (const b of ger.blocos.values()) {
        if (b.perto) perto++
        if (b.pronto) pronto++
        if (b.montado) montado++
        malhas += b.malhas.length
        lote += b.lote.length
      }
      return { blocos: ger.blocos.size, perto, pronto, montado, malhas, lote }
    },
    // depois do registrarLonge do casario e do morro
    montarMuitoLonge() {
      for (const b of ger.blocos.values()) {
        b.unidade = {
          x: b.x0 + TAM_BLOCO / 2, z: b.z0 + TAM_BLOCO / 2, r: TAM_BLOCO * Math.SQRT1_2,
          longe: b.longe,
          get todas() { return [...b.malhas, ...b.longe] },
          distancia: (camera) => ger.distancia(b, camera.position.x, camera.position.z),
          // Fase 2: no lote a casa detalhada não é uma malha: esconder o bloco é esconder as
          // instâncias dele no lote (a célula de muito longe troca as malhas de longe no lugar).
          // A sombra da casa detalhada some com ela: o mapa do sol é refeito.
          esconder: () => {
            for (const e of b.lote) e.lote.mostrar(e.id, false)
            for (const m of b.malhas) m.visible = false
            for (const m of b.longe) m.visible = false // a caixa de longe também some (a célula unida fica no lugar)
            b.detalhe = false
            ger.aoMudar?.('casas')
          },
          // volta ao estado de longe (a caixa à vista); o laço decide de novo neste quadro
          retomar: () => { b.perto = false; ger.aplicarVisibilidade(b) },
        }
        muitoLonge.adicionar(b.unidade)
      }
      muitoLonge.montar()
    },
    // malhas instanciadas das caixas de longe (instanciarEmBlocos usa os mesmos blocos de 96 m)
    registrarLonge(malhas, simples) {
      const v = new THREE.Vector3()
      const mt = new THREE.Matrix4()
      for (const im of malhas) {
        im.getMatrixAt(0, mt)
        v.setFromMatrixPosition(mt)
        const b = ger.blocos.get(`${simples ? 'm' : 'c'}${Math.floor(v.x / TAM_BLOCO)},${Math.floor(v.z / TAM_BLOCO)}`)
        if (b) { b.longe.push(im); im.visible = !(b.perto && b.pronto) } else im.visible = true
      }
    },
    // Fase 1: o destino do teleporte entra na fila de montagem antes de todo o resto
    prefetch(x, z) { ger.prefetch(x, z) },
    // porQuadro (cfg.desempenho.casasPorQuadro): quantos blocos de casas detalhadas montar por quadro
    atualizar(camera, porQuadro = 2) {
      matAceso.color.copy(escuro).lerp(quente, globais.uNoite.value)
      muitoLonge.atualizar(camera, PERTO + 8)
      ger.atualizar(camera, porQuadro)
    },
  }
}
