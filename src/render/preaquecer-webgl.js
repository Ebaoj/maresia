// Pré-aquecimento dos shaders no WebGL (Fase 1 do plano de performance, docs/PLANO-PERFORMANCE.md).
//
// Por que: depois de um teleporte os blocos de casas entram na cena com material novo, e o
// three compila o programa nesse mesmo quadro (o navegador traduz o GLSL na hora). O quadro
// trava por centenas de milissegundos, e é o pico que aparece no rastreador depois do
// teleporte. O pré-aquecimento faz esse trabalho antes de o jogo aparecer:
//   1. renderer.compileAsync(cena, camera, cena), com o alvo real do pós-processamento ligado
//      (é o alvo que decide a variante do shader: a cor de saída de um alvo não é a da tela);
//   2. um desenho da cena num alvo de 1x1 do mesmo formato, para o programa ser linkado e
//      usado de verdade (e para o passe de sombra rodar, que compila os materiais de
//      profundidade das casas);
//   3. as malhas representativas dos materiais das casas (que ainda não foram montadas)
//      entram na cena só durante o aquecimento.
//
// O A/B: ?semPreaquecer na URL desliga o aquecimento (e a chave cfg.desempenho.preaquecerShaders).

import * as THREE from 'three'
import { marcar } from '../debug/marcas.js'

// o formato do alvo de aquecimento: o mesmo do alvo real (o programa tem de ser o mesmo)
export function formatoDoAlvo(alvo) {
  if (!alvo) return { type: THREE.HalfFloatType, count: 2 }
  const texturas = alvo.textures || (alvo.texture ? [alvo.texture] : [])
  return { type: texturas[0]?.type ?? THREE.HalfFloatType, count: texturas.length || 1 }
}

// espera com prazo: um shader quebrado deixa o compileAsync esperando para sempre
function comPrazo(promessa, ms) {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    promessa.then((v) => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(null) })
  })
}

// Aquece os shaders do WebGL. Devolve o que fez (para o console e para a prova).
export async function preaquecerWebgl(renderer, cena, camera, { alvo = null, extras = [], prazoMs = 10000 } = {}) {
  const t0 = performance.now()
  const alvoAnterior = renderer.getRenderTarget()
  const programasAntes = renderer.info.programs?.length ?? 0
  const mexidos = []
  const guardar = (o) => {
    mexidos.push([o, o.visible, o.frustumCulled, o.geometry?.isInstancedBufferGeometry ? o.geometry.instanceCount : null])
    o.visible = true
    o.frustumCulled = false
    // a grama: o bloco com zero folhas no momento também precisa do shader pronto
    if (o.geometry?.isInstancedBufferGeometry && o.geometry.instanceCount === 0) o.geometry.instanceCount = 1
  }
  // os extras (as malhas representativas dos materiais das casas) entram antes da compilação:
  // o compileAsync percorre a cena inteira, e é ele que translate o GLSL
  for (const e of extras) { cena.add(e); guardar(e) }
  // 1. compilar os programas, com o alvo real ligado (a variante do shader depende dele)
  if (alvo) renderer.setRenderTarget(alvo)
  await comPrazo(renderer.compileAsync(cena, camera, cena), prazoMs)
  const msCompilar = performance.now() - t0

  // 2. o desenho de 1x1: linka os programas e usa os materiais de sombra
  const formato = formatoDoAlvo(alvo)
  const quente = new THREE.WebGLRenderTarget(1, 1, { type: formato.type, count: formato.count, depthBuffer: true })
  cena.traverse((o) => {
    if (o.userData.nuncaDesenha) return // as caixas de colisão da câmera: invisíveis sempre
    if (mexidos.some(([x]) => x === o)) return // os extras já foram guardados
    guardar(o)
  })
  const sombraAntes = renderer.shadowMap.needsUpdate
  renderer.shadowMap.needsUpdate = true // o passe de sombra: compila os materiais de profundidade
  try {
    renderer.setRenderTarget(quente)
    renderer.setViewport(0, 0, 1, 1)
    renderer.setScissor(0, 0, 1, 1)
    renderer.setScissorTest(true)
    renderer.render(cena, camera)
  } finally {
    for (const [o, visivel, corte, n] of mexidos) {
      o.visible = visivel
      o.frustumCulled = corte
      if (n !== null) o.geometry.instanceCount = n
    }
    for (const e of extras) cena.remove(e)
    renderer.shadowMap.needsUpdate = sombraAntes
    renderer.setScissorTest(false)
    renderer.setRenderTarget(alvoAnterior)
    quente.dispose()
  }
  const res = {
    msCompilar: Math.round(msCompilar),
    msTotal: Math.round(performance.now() - t0),
    programas: renderer.info.programs?.length ?? 0,
    programasNovos: (renderer.info.programs?.length ?? 0) - programasAntes,
  }
  marcar('preaquecimento', res)
  return res
}
