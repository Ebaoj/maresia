// Medidor de desempenho (só no modo de desenvolvimento).
// Mede o custo real de um quadro (CPU + GPU) por vazão, fora da tela.
// Uso no console:
//   await maresia.medir({ lugares: [[x, z, yaw, hora]], largura: 1600, altura: 900, resolucao: 1.25,
//                          variantes: { semGrama: (m) => { ...; return () => desfaz } } })
// Devolve, por lugar e variante, ms por quadro (ms) e quanto disso é JavaScript (cpu).

import * as THREE from 'three'

const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b)
  return +s[s.length >> 1].toFixed(2)
}

export function instalar(m) {
  const px = new Uint8Array(4)

  // Vazão: N quadros seguidos e uma leitura no fim, que obriga a GPU a terminar tudo.
  // O último passe (a tela) vai para uma imagem fora da tela: ler a tela de verdade com o
  // painel escondido custa ~17 ms falsos. O cronômetro de GPU do WebGL no Mac (ANGLE/Metal)
  // deu números incoerentes, por isso não é usado.
  // WebGPU: não há leitura síncrona; a leitura assíncrona de 1 pixel espera a placa terminar o que foi mandado
  const ler = async (alvo) => {
    if (m.renderer.readRenderTargetPixelsAsync) await m.renderer.readRenderTargetPixelsAsync(alvo, 0, 0, 1, 1)
    else m.renderer.readRenderTargetPixels(alvo, 0, 0, 1, 1, px)
  }
  async function medirAqui(quadros, alvo, vezes = 3) {
    const rodadas = []
    for (let r = 0; r < vezes; r++) {
      m.renderer.setRenderTarget(alvo)
      await ler(alvo)
      const t0 = performance.now()
      let cpu = 0
      for (let i = 0; i < quadros; i++) {
        const a = performance.now()
        m.passo(1 / 60)
        cpu += performance.now() - a
      }
      await ler(alvo)
      rodadas.push({ total: (performance.now() - t0) / quadros, cpu: cpu / quadros })
      await new Promise((res) => setTimeout(res, 30))
    }
    return { ms: mediana(rodadas.map((x) => x.total)), cpu: mediana(rodadas.map((x) => x.cpu)) }
  }

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
            for (let i = 0; i < 20; i++) m.passo(1 / 60) // câmera e streaming assentam
            ;(amostras[v] ||= []).push(await medirAqui(quadros, alvo, repeticoes > 1 ? 1 : 3))
            if (typeof desfaz === 'function') desfaz()
          }
        }
        for (const [v, l] of Object.entries(amostras)) {
          res[nome][v] = { ms: mediana(l.map((a) => a.ms)), cpu: mediana(l.map((a) => a.cpu)) }
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
