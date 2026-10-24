// Medidor de desempenho (só no modo de desenvolvimento).
// Mede o custo real de um quadro (CPU + GPU) por vazão, fora da tela.
// Uso no console:
//   await maresia.medir({ lugares: [[x, z, yaw, hora]], largura: 1600, altura: 900, resolucao: 1.25,
//                          variantes: { semGrama: (m) => { ...; return () => desfaz } } })
// Devolve, por lugar e variante, ms por quadro (ms) e quanto disso é JavaScript (cpu), e o quadro dos picos:
// quantos quadros estouraram 33 ms (picos33) e 50 ms (picos50), o percentil 99 (p99) e o pior quadro (pior).
// A média esconde o que incomoda: dois quadros de 80 ms num lugar viram um número que parece bom.

import * as THREE from 'three'
import { criarRastreador } from './rastreador.js'

const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b)
  return +s[s.length >> 1].toFixed(2)
}

// o percentil p dos tempos (p em %): o valor abaixo do qual está p% dos quadros
const percentil = (v, p) => {
  if (!v.length) return 0
  const s = [...v].sort((a, b) => a - b)
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))
  return +s[i].toFixed(2)
}

export function instalar(m) {
  const px = new Uint8Array(4)

  // Vazão: N quadros seguidos e uma leitura no fim, que obriga a GPU a terminar tudo.
  // O último passe (a tela) vai para uma imagem fora da tela: ler a tela de verdade com o
  // painel escondido custa ~17 ms falsos. O cronômetro de GPU do WebGL no Mac (ANGLE/Metal)
  // deu números incoerentes, por isso não é usado.
  // WebGPU: não há leitura síncrona; a leitura assíncrona de 1 pixel espera a placa terminar o que foi mandado
  const ler = async (alvo) => {
    // o WebGLRenderer do three 0.186 também tem readRenderTargetPixelsAsync, mas pede o buffer: sem ele dava
    // "Cannot read properties of undefined (reading 'byteLength')" e o medidor não rodava no WebGL (21/10/2026)
    if (m.webgpu) await m.renderer.readRenderTargetPixelsAsync(alvo, 0, 0, 1, 1)
    else m.renderer.readRenderTargetPixels(alvo, 0, 0, 1, 1, px)
  }
  // Quadro novo para o WebGPU a cada passo (22/10/2026): o three só anda o contador de quadros dele no quadro do
  // navegador, e o que é "por quadro" (os mapas de sombra, os ossos) só é refeito quando ele anda. Num laço de
  // passos seguidos sem isto, a sombra era desenhada uma vez em 20 quadros e o medidor deixava de fora o custo dela
  // (na Coluna da Hora, 12 objetos de sombra por quadro em vez de ~700). O mesmo que a foto justa já fazia.
  const passo = () => {
    if (m.webgpu) m.renderer._nodes.nodeFrame.update()
    m.passo(1 / 60)
  }
  async function medirAqui(quadros, alvo, vezes = 3) {
    const rodadas = []
    for (let r = 0; r < vezes; r++) {
      m.renderer.setRenderTarget(alvo)
      await ler(alvo)
      const t0 = performance.now()
      let cpu = 0
      // o tempo de cada quadro: do fim de um ao fim do seguinte. Inclui a fila da GPU (quando a placa não
      // acompanha, o quadro seguinte demora mais), que é o que o jogador sente
      const tempos = []
      let anterior = t0
      const rast = criarRastreador(m)
      const detalhe = []
      for (let i = 0; i < quadros; i++) {
        const a = performance.now()
        passo()
        cpu += performance.now() - a
        const agora = performance.now()
        tempos.push(agora - anterior)
        const d = rast.quadro(anterior, agora, 50)
        if (d) detalhe.push(d)
        anterior = agora
      }
      rast.parar()
      await ler(alvo)
      rodadas.push({ total: (performance.now() - t0) / quadros, cpu: cpu / quadros, tempos, detalhe })
      await new Promise((res) => setTimeout(res, 30))
    }
    return { ms: mediana(rodadas.map((x) => x.total)), cpu: mediana(rodadas.map((x) => x.cpu)), tempos: rodadas.flatMap((x) => x.tempos), detalhe: rodadas.flatMap((x) => x.detalhe) }
  }

  // Ao vivo (24/10/2026): o jogo rodando de verdade (requestAnimationFrame), sem passo fixo. Cada quadro acima de
  // `limite` ms volta com as pistas do que aconteceu nele. Uso: await maresia.rastrear({ segundos: 30 })
  // enquanto anda ou se teleporta (o pico de ~160 ms uma vez por rodada apareceu assim na T4).
  m.rastrear = ({ segundos = 30, limite = 50 } = {}) => new Promise((resolver) => {
    const rast = criarRastreador(m)
    const picos = []
    const tempos = []
    const fim = performance.now() + segundos * 1000
    let anterior = performance.now()
    const f = (agora) => {
      tempos.push(agora - anterior)
      const d = rast.quadro(anterior, agora, limite)
      if (d) picos.push(d)
      anterior = agora
      if (agora < fim) requestAnimationFrame(f)
      else {
        rast.parar()
        resolver({ quadros: tempos.length, p99: percentil(tempos, 99), pior: +Math.max(0, ...tempos).toFixed(1), picos })
      }
    }
    requestAnimationFrame((t) => { anterior = t; requestAnimationFrame(f) })
  })

  // repeticoes: as variantes se alternam (A, B, A, B...) para a GPU do Mac, que muda de
  // frequência sozinha, afetar todas igual; o resultado é a mediana das repetições.
  m.medir = async ({ lugares, quadros = 20, largura = 1600, altura = 900, resolucao = 1.25, repeticoes = 1, variantes = { base: () => {} } } = {}) => {
    m.controle.pausado = true
    const pausado = m.cfg.tempo.pausado
    m.cfg.tempo.pausado = true
    m.renderer.setPixelRatio(resolucao)
    m.renderer.setSize(largura, altura, false)
    m.cam.camera.aspect = largura / altura
    m.cam.camera.updateProjectionMatrix()
    m.pos.tamanho(largura, altura, resolucao)
    const Alvo = m.gpu ? m.gpu.W.RenderTarget : THREE.WebGLRenderTarget
    const alvo = new Alvo(Math.round(largura * resolucao), Math.round(altura * resolucao))
    const passoOriginal = m.pos.passo
    m.pos.passo = function (material, destino) { return passoOriginal.call(this, material, destino ?? alvo) }
    const res = {}
    try {
      for (const [x, z, yaw, hora = 12] of lugares) {
        const nome = `${Math.round(x)},${Math.round(z)}`
        res[nome] = {}
        const amostras = {}
        for (let rep = 0; rep < repeticoes; rep++) {
          for (const [v, aplicar] of Object.entries(variantes)) {
            m.irPara(x, z, yaw, hora)
            const desfaz = aplicar(m)
            for (let i = 0; i < 20; i++) passo() // câmera e streaming assentam
            ;(amostras[v] ||= []).push(await medirAqui(quadros, alvo, repeticoes > 1 ? 1 : 3))
            if (typeof desfaz === 'function') desfaz()
          }
        }
        for (const [v, l] of Object.entries(amostras)) {
          const tempos = l.flatMap((a) => a.tempos || [])
          res[nome][v] = {
            ms: mediana(l.map((a) => a.ms)),
            cpu: mediana(l.map((a) => a.cpu)),
            // os picos: a média esconde o quadro que travou
            quadros: tempos.length,
            picos33: tempos.filter((t) => t > 33).length,
            picos50: tempos.filter((t) => t > 50).length,
            p99: percentil(tempos, 99),
            pior: tempos.length ? +tempos.reduce((a, b) => (b > a ? b : a), 0).toFixed(2) : 0,
            // 24/10/2026: cada quadro acima de 50 ms com o que aconteceu nele (debug/rastreador.js)
            picosDetalhe: l.flatMap((a) => a.detalhe || []),
          }
        }
      }
    } finally {
      m.pos.passo = passoOriginal
      alvo.dispose()
      m.cfg.tempo.pausado = pausado
      dispatchEvent(new Event('resize'))
      m.controle.pausado = false
    }
    return { pixels: Math.round(largura * resolucao) + 'x' + Math.round(altura * resolucao), res }
  }
}
