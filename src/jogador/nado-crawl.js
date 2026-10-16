// Nado crawl feito no código (o Mixamo não tem): braçada alternada, pernada curta, o corpo rolando de
// um lado para o outro a cada braçada e a cabeça virando para respirar a cada três braçadas, de um lado
// e depois do outro. Gera um AnimationClip para o esqueleto padrão (esqueleto.js), que tem os ossos
// sem rotação no repouso em T: os giros abaixo valem nos eixos do próprio boneco.
// Eixos do corpo deitado: o quadril gira 90° em X, então o "cima" do tronco aponta para a frente
// (para onde nada) e a frente do peito aponta para o fundo.

import * as THREE from 'three'

const CICLO = 1.4 // segundos por ciclo completo (duas braçadas): ~1,2 m/s de nado tranquilo
const CICLOS = 3 // a respiração alterna os lados a cada três braçadas, então o clipe tem três ciclos
const FPS = 30

const q = (eixo, ang) => new THREE.Quaternion().setFromAxisAngle(eixo, ang)
const X = new THREE.Vector3(1, 0, 0)
const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

export function criarNadoCrawl() {
  const n = Math.round(CICLO * CICLOS * FPS) + 1
  const tempos = new Float32Array(n)
  const trilhas = new Map()
  const por = (nome) => {
    if (!trilhas.has(nome)) trilhas.set(nome, new Float32Array(n * 4))
    return trilhas.get(nome)
  }
  const gravar = (nome, quat, f) => quat.toArray(por(nome), f * 4)
  const duracao = CICLO * CICLOS
  // respiração: um sino em volta de cada momento de respirar (lado: +1 direita, -1 esquerda)
  const respiracoes = [[CICLO * 0.75, 1], [CICLO * 2.25, -1]]
  for (let f = 0; f < n; f++) {
    const t = (f / (n - 1)) * duracao
    tempos[f] = t
    const fase = (t / CICLO) * Math.PI * 2 // ângulo da braçada esquerda; a direita vem meio ciclo depois
    // o corpo rola para o lado do braço que está puxando debaixo d'água
    const rolar = 0.45 * Math.sin(fase)
    gravar('Hips', q(X, Math.PI / 2).multiply(q(Y, rolar)), f)
    gravar('Spine', q(Y, -rolar * 0.25), f)
    gravar('Spine1', q(Y, -rolar * 0.15), f)
    gravar('Spine2', new THREE.Quaternion(), f)
    // cabeça: olhando para o fundo, um pouco à frente; vira de lado para respirar
    let virar = 0
    for (const [tr, lado] of respiracoes) virar += lado * Math.exp(-(((t - tr) / 0.22) ** 2))
    gravar('Neck', q(X, -0.25), f)
    gravar('Head', q(Y, virar * 1.2 - rolar * 0.6).multiply(q(X, -0.1)), f)
    // braços: o ombro gira em volta do eixo lateral do corpo. 0 = esticado à frente (acima da cabeça),
    // π/2 = apontando para o fundo (puxando), π = junto do quadril, 3π/2 = voltando por cima d'água
    for (const [L, sinal, desloc] of [['Left', 1, 0], ['Right', -1, Math.PI]]) {
      const th = (fase + desloc) % (Math.PI * 2)
      // do T para "acima da cabeça", e o braço girado no próprio eixo (-90°) para a palma, que na pose em
      // T olha para baixo, ficar virada para o fundo com o braço esticado à frente
      const aFrente = q(Z, sinal * Math.PI / 2).multiply(q(X, -Math.PI / 2))
      gravar(L + 'Shoulder', new THREE.Quaternion(), f)
      // cotovelo: dobra alto na volta por cima d'água e no meio da puxada (pegada de cotovelo alto)
      const volta = th > Math.PI ? Math.sin(th - Math.PI) : 0
      // puxada de cotovelo alto: o braço fica para trás (atrasa) e o antebraço vai na frente, vertical,
      // com a palma virada para trás empurrando a água
      const puxada = th < Math.PI ? Math.sin(th) * 0.9 : 0
      // na volta o braço passa por fora, rente à água, em vez de subir reto: abre para o lado em
      // torno do eixo do tronco (Y)
      gravar(L + 'Arm', q(Y, -sinal * volta * 1.0).multiply(q(X, th - puxada)).multiply(aFrente), f)
      // eixo lateral do corpo, visto do antebraço depois dos giros: -Z no esquerdo, +Z no direito.
      // Com o cotovelo dobrado na puxada, a palma fica virada para trás e empurra a água.
      gravar(L + 'ForeArm', q(Z, -sinal * (volta * 1.5 + puxada)), f)
      // punho: a mão entra na água pela ponta dos dedos e segue o antebraço na puxada
      gravar(L + 'Hand', q(Z, -sinal * 0.25 * volta), f)
      // pernas: pernada curta e rápida (seis batidas por ciclo), joelho quase reto
      const batida = Math.sin(fase * 3 + (L === 'Left' ? 0 : Math.PI))
      gravar(L + 'UpLeg', q(X, -0.28 * batida), f)
      gravar(L + 'Leg', q(X, 0.15 + 0.2 * Math.max(0, batida)), f)
      gravar(L + 'Foot', q(X, 0.9), f) // pé esticado, em ponta
    }
  }
  const lista = [...trilhas].map(([nome, valores]) => new THREE.QuaternionKeyframeTrack(`${nome}.quaternion`, tempos, valores))
  lista.push(new THREE.VectorKeyframeTrack('Hips.position', [0, duracao], [0, 0.93, 0, 0, 0.93, 0]))
  const clipe = new THREE.AnimationClip('nadar', duracao, lista)
  clipe.userData = { procedural: true, velocidade: 1.2 }
  return clipe
}
