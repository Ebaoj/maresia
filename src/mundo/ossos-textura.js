// Fase 2b dos atores de fundo: as matrizes de osso dos movimentos gravados (Mixamo, via retarget.js) assadas
// numa textura, uma linha por quadro. Os atores instanciados leem a pose daí em vez de recompor 28 ossos por
// boneco por quadro. Nada é inventado: cada linha é o que o AnimationMixer produz no clipe naquele tempo, o
// relógio continua sendo o mixer (quem escolhe a linha é atores.js). A textura é assada uma vez, na abertura.

import * as THREE from 'three'
import { criarBoneco } from '../jogador/esqueleto.js'

// Ordem fixa das peças do boneco: uma malha instanciada por papel (a cor de cada uma vem por instância).
export const PAPEIS = ['pele', 'camisa', 'listra', 'calca', 'chapeu', 'cabelo']

const CLIPES = ['andar', 'parado']

// Assa os clipes { andar, parado } do boneco numa textura de float.
// Texel (osso * 4 + c, linha) = coluna c da matriz que o skinning do three multiplica (bone.matrixWorld *
// boneInverse, a mesma de esqueleto.boneMatrices). Uma linha tem nOssos * 16 floats, o mesmo layout de
// boneMatrices, então cada quadro é uma cópia direta. Posição animada = bindMatrixInverse * M[osso] * bindMatrix * p;
// no boneco a bind é a identidade e o peso é 1 num osso só, então a posição é M[osso] * p.
// O boneco precisa estar com a raiz na origem (as matrizes incluem o mundo da raiz). Sai na pose de repouso.
// O quadro k é o tempo k / fps; o último NÃO repete o primeiro, o wrap é de quem lê.
export function assarOssos({ boneco, clipes, fps = 30 }) {
  const { raiz, esqueleto } = boneco
  const nOssos = esqueleto.bones.length
  const porLinha = nOssos * 16

  const saida = {}
  let total = 0
  for (const nome of CLIPES) {
    const clipe = clipes[nome]
    if (!clipe) throw new Error(`assarOssos: falta o clipe "${nome}"`)
    const quadros = Math.max(2, Math.round(clipe.duration * fps))
    saida[nome] = { linha0: total, quadros, duracao: clipe.duration }
    total += quadros
  }

  const dados = new Float32Array(total * porLinha)
  const mixer = new THREE.AnimationMixer(raiz)
  for (const nome of CLIPES) {
    const { linha0, quadros } = saida[nome]
    const acao = mixer.clipAction(clipes[nome])
    acao.play() // peso 1, LoopRepeat
    for (let k = 0; k < quadros; k++) {
      mixer.setTime(k / fps)
      raiz.updateMatrixWorld(true)
      esqueleto.update()
      dados.set(esqueleto.boneMatrices, (linha0 + k) * porLinha)
    }
    acao.stop()
  }
  // de volta ao repouso: o chamador pode reaproveitar o boneco
  mixer.stopAllAction()
  mixer.uncacheRoot(raiz)
  raiz.updateMatrixWorld(true)
  esqueleto.update()

  const textura = new THREE.DataTexture(dados, nOssos * 4, total, THREE.RGBAFormat, THREE.FloatType)
  textura.name = 'OssosAtores'
  textura.magFilter = THREE.NearestFilter
  textura.minFilter = THREE.NearestFilter
  textura.generateMipmaps = false
  textura.flipY = false
  textura.needsUpdate = true
  return { textura, nOssos, clipes: saida, fps }
}

// Peças do boneco por papel, para virarem InstancedMesh. criarBoneco agrupa as geometrias por cor, então
// uma cor-sentinela única por papel dá uma malha por papel; o papel sai da cor do material. A geometria já
// vem mesclada, sem índice, com skinIndex/skinWeight (cada vértice preso a um osso com peso 1).
// O resto do boneco é descartado (não vai para a cena).
const SENTINELAS = Object.fromEntries(PAPEIS.map((p, i) => [p, '#0' + (i + 1) + '0000']))

export function pecasPorPapel() {
  const boneco = criarBoneco(SENTINELAS)
  const pecas = {}
  for (const m of boneco.malhas) {
    const papel = PAPEIS.find((p) => SENTINELAS[p].slice(1) === m.material.color.getHexString())
    if (!papel) throw new Error(`pecasPorPapel: malha com cor ${m.material.color.getHexString()} sem papel`)
    if (pecas[papel]) throw new Error(`pecasPorPapel: papel "${papel}" apareceu duas vezes`)
    pecas[papel] = m.geometry
    m.material.dispose()
  }
  for (const p of PAPEIS) if (!pecas[p]) throw new Error(`pecasPorPapel: papel "${p}" sem malha no boneco`)
  // devolve na ordem de PAPEIS (a das malhas do boneco é a da primeira peça de cada cor)
  return Object.fromEntries(PAPEIS.map((p) => [p, pecas[p]]))
}
