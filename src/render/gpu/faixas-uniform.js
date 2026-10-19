// Uma gravação de buffer por binding de uniforms no WebGPU (KAN-70, briefing 7).
//
// Os uniforms do jogo que mudam todo quadro (sol, paleta por hora, tempo...) entram em cada binding do grupo
// render sem ficar lado a lado no buffer, e o three grava UMA faixa por vez: WebGPUBindingUtils.updateBinding faz um
// device.queue.writeBuffer por faixa (junta só as vizinhas). Medido na T4 com a hora andando: ~1.020 writeBuffer por
// quadro, vindos de ~150 chamadas de updateBinding, e 38 FPS contra 58 com a hora parada (60 writeBuffer) com o mesmo
// custo de JS. O gpu-process do Chrome paga por chamada, não por byte.
//
// Aqui o updateBinding do three ganha um atalho: com mais de uma faixa e o buffer pequeno (144 B a 1,9 KB), grava o
// buffer de CPU inteiro com UMA chamada. O buffer de CPU já tem o valor atual de todos os uniforms (as faixas só
// dizem o que mudou), então regravar o que não mudou não altera nada: mesmo resultado, ~170 gravações por quadro.
// O remendo não limpa as faixas: quem limpa é o chamador (Bindings._update e updateSharedForRender, logo depois de
// backend.updateBinding), como sempre.
const INSTALADO = Symbol.for('maresia.faixasUniform.instalado')

// A decisão, pura (o teste usa direto): mais de uma faixa e buffer até o limite. Com 0 faixas o three já grava tudo;
// com 1 não há o que juntar; acima do limite a regravação inteira custaria mais do que as faixas.
export function gravaInteiro(nFaixas, byteLength, limite = 4096) {
  return nFaixas > 1 && byteLength <= limite
}

// Embrulha renderer.backend.bindingUtils.updateBinding, o ponto onde o three de fato grava (backend.updateBinding só
// delega para ele, e os dois chamadores em Bindings passam por backend.updateBinding): o mesmo caminho, sem trocar
// o método do backend. Instalar duas vezes não embrulha duas vezes.
export function instalarFaixasUnicas(renderer, { limite = 4096 } = {}) {
  const backend = renderer.backend
  const utils = backend.bindingUtils
  const original = utils.updateBinding
  if (original[INSTALADO]) return
  const embrulho = function (binding) {
    const array = binding.buffer // CPU
    if (gravaInteiro(binding.updateRanges.length, array.byteLength, limite)) {
      backend.device.queue.writeBuffer(backend.get(binding).buffer, 0, array, 0) // GPU, igual ao original
      return
    }
    return original.call(this, binding)
  }
  embrulho[INSTALADO] = true
  utils.updateBinding = embrulho
}
