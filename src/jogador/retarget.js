// Carrega movimentos (FBX do Mixamo, GLB de qualquer lugar) e converte para outro esqueleto.
// Conversão pela diferença em relação ao repouso: para cada osso, quanto ele girou no mundo a partir
// da pose em T da fonte; o mesmo giro é aplicado à pose em T do alvo. Assim não importa como cada
// programa orienta os eixos dos ossos, só que as duas poses de repouso sejam em T.

import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { nomeCanonico, NOMES } from './esqueleto.js'
import { usarDedosGravados, prepararTransferenciaDedos } from './dedos.js'
import { PADRAO } from '../config.js'
import { daBase } from '../caminho.js'

export const ehDedo = nome => /^(Left|Right)Hand(Thumb|Index|Middle|Ring|Pinky)[1-4]$/.test(nome)

const fbx = new FBXLoader()
const gltf = new GLTFLoader()

export async function carregar(url) {
  if (url.endsWith('.fbx')) {
    const obj = await fbx.loadAsync(daBase(url))
    return { raiz: obj, clipes: obj.animations }
  }
  const g = await gltf.loadAsync(daBase(url))
  return { raiz: g.scene, clipes: g.animations }
}

// ossos de um objeto, pelo nome canônico
export function ossosPorNome(raiz) {
  const m = new Map()
  raiz.traverse((o) => { if (o.isBone && !m.has(nomeCanonico(o.name))) m.set(nomeCanonico(o.name), o) })
  return m
}

// Retrato da pose atual: rotação e posição de cada osso no mundo, mais a rotação do pai do quadril
function retrato(ossos) {
  const r = new Map()
  for (const [n, b] of ossos) {
    b.updateWorldMatrix(true, false)
    const q = new THREE.Quaternion()
    const p = new THREE.Vector3()
    b.matrixWorld.decompose(p, q, new THREE.Vector3())
    r.set(n, { q, p })
  }
  return r
}

// Repouso da fonte e do alvo: tirado do jeito que estão agora (devem estar em T).
export function repouso(ossos) {
  return retrato(ossos)
}

// altura do quadril acima do pé mais baixo, no repouso (para escalar o sobe e desce)
function alturaQuadril(rep) {
  const q = rep.get('Hips').p.y
  const pes = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].filter((n) => rep.has(n)).map((n) => rep.get(n).p.y)
  return q - Math.min(...pes)
}

// Converte um clipe. fonte: {raiz, ossos, rep}; alvo: {ossos, rep}.
// noLugar: tira o deslocamento horizontal do quadril (o jogo é quem anda).
export function converter(clipe, fonte, alvo, { fps = 30, noLugar = true, nome = clipe.name } = {}) {
  const mixer = new THREE.AnimationMixer(fonte.raiz)
  const acao = mixer.clipAction(clipe)
  // uma vez só e parado no fim: com repetição, pedir o último quadro devolve o primeiro
  acao.setLoop(THREE.LoopOnce, 1)
  acao.clampWhenFinished = true
  acao.play()
  const n = Math.max(2, Math.round(clipe.duration * fps) + 1)
  const tempos = new Float32Array(n)
  const candidatos = [...new Set([...NOMES, ...[...fonte.ossos.keys()].filter(ehDedo)])]
  const nomes = candidatos.filter((k) => fonte.ossos.has(k) && alvo.ossos.has(k))
  // ordem do pai para o filho, para ter o mundo do pai antes do filho
  const ordem = nomes.slice().sort((a, b) => profundidade(alvo.ossos.get(a)) - profundidade(alvo.ossos.get(b)))
  const qs = new Map(ordem.map((k) => [k, new Float32Array(n * 4)]))
  const posQuadril = new Float32Array(n * 3)
  const escala = alturaQuadril(alvo.rep) / alturaQuadril(fonte.rep)
  const paiQuadrilAlvo = alvo.ossos.get('Hips').parent
  const transferirDedo = prepararTransferenciaDedos(fonte, alvo)
  const dq = new THREE.Quaternion()
  const tmp = new THREE.Quaternion()
  const p0 = new THREE.Vector3()
  for (let f = 0; f < n; f++) {
    const t = Math.min(clipe.duration, f / fps)
    tempos[f] = t
    mixer.setTime(t)
    const atual = retrato(fonte.ossos)
    const mundoAlvo = new Map()
    for (const k of ordem) {
      // giro no mundo desde o repouso, na fonte
      dq.copy(atual.get(k).q).multiply(tmp.copy(fonte.rep.get(k).q).invert())
      const qMundo = transferirDedo(k, atual, mundoAlvo) || dq.clone().multiply(alvo.rep.get(k).q)
      mundoAlvo.set(k, qMundo)
      // local = inverso do mundo do pai × mundo
      const pai = alvo.ossos.get(k).parent
      const kPai = pai && pai.isBone ? nomeCanonico(pai.name) : null
      let qPai
      if (kPai && mundoAlvo.has(kPai)) qPai = mundoAlvo.get(kPai)
      else { qPai = new THREE.Quaternion(); pai?.getWorldQuaternion(qPai) }
      const local = qPai.clone().invert().multiply(qMundo)
      local.toArray(qs.get(k), f * 4)
    }
    // quadril: o deslocamento desde o repouso, escalado, levado para o espaço do pai do alvo
    const d = atual.get('Hips').p.clone().sub(fonte.rep.get('Hips').p).multiplyScalar(escala)
    if (noLugar) { d.x = 0; d.z = 0 }
    p0.copy(alvo.rep.get('Hips').p).add(d)
    if (paiQuadrilAlvo) paiQuadrilAlvo.worldToLocal(p0)
    p0.toArray(posQuadril, f * 3)
  }
  acao.stop()
  mixer.uncacheRoot(fonte.raiz)
  const trilhas = ordem.map((k) => new THREE.QuaternionKeyframeTrack(`${alvo.ossos.get(k).name}.quaternion`, tempos, qs.get(k)))
  trilhas.push(new THREE.VectorKeyframeTrack(`${alvo.ossos.get('Hips').name}.position`, tempos, posQuadril))
  return new THREE.AnimationClip(nome, clipe.duration, trilhas)
}

function profundidade(o) {
  let d = 0
  while (o.parent) { d++; o = o.parent }
  return d
}

// Velocidade natural de um ciclo de passada "no lugar": enquanto um pé está no chão ele anda para
// trás em relação ao quadril na velocidade do corpo. Mede no próprio alvo.
export function medirPassada(clipe, alvo, raiz) {
  const mixer = new THREE.AnimationMixer(raiz)
  const acao = mixer.clipAction(clipe)
  acao.play()
  const fps = 60
  const pes = ['LeftFoot', 'RightFoot'].map((k) => alvo.ossos.get(k))
  const quadril = alvo.ossos.get('Hips')
  const amostras = []
  let ant = null
  for (let f = 0; f <= Math.round(clipe.duration * fps); f++) {
    mixer.setTime(f / fps)
    raiz.updateMatrixWorld(true)
    const q = quadril.getWorldPosition(new THREE.Vector3())
    const ps = pes.map((p) => p.getWorldPosition(new THREE.Vector3()))
    if (ant) {
      // o pé mais baixo é o que está apoiado
      const i = ps[0].y < ps[1].y ? 0 : 1
      const rel = ps[i].clone().sub(q)
      const relAnt = ant.ps[i].clone().sub(ant.q)
      amostras.push(Math.hypot(rel.x - relAnt.x, rel.z - relAnt.z) * fps)
    }
    ant = { q, ps }
  }
  acao.stop()
  mixer.uncacheRoot(raiz)
  amostras.sort((a, b) => a - b)
  return amostras[Math.floor(amostras.length / 2)] // mediana: ignora a troca de pé
}

// Carrega o Y Bot (repouso da fonte) e cada movimento do Mixamo da pasta, já convertidos para o alvo.
// alvo: { ossos (Map), raiz }. Devolve { clipes, crus, passadas, faltando, ybot, fontes: crus }.
export async function carregarMovimentosMixamo({ alvo, pasta, nomes, dedos = PADRAO.personagem, semDeslocamento = ['sentar', 'levantar', 'empurrar'] }) {
  const existe = async (url) => {
    try {
      const r = await fetch(daBase(url), { method: 'HEAD' })
      return r.ok && !(r.headers.get('content-type') || '').includes('text/html')
    } catch { return false }
  }
  let repFonte = null
  let ybot = null
  if (await existe(pasta + 'ybot.fbx')) {
    ybot = (await carregar(pasta + 'ybot.fbx')).raiz
    ybot.updateMatrixWorld(true)
    repFonte = repouso(ossosPorNome(ybot)) // antes de qualquer escala: mesma unidade dos movimentos
  }
  alvo.raiz.updateMatrixWorld(true)
  const destino = { ossos: alvo.ossos, rep: repouso(alvo.ossos) }
  const clipes = {}
  const crus = {}
  const faltando = []
  await Promise.all(nomes.map(async (nome) => {
    const url = pasta + nome + '.fbx'
    if (!(await existe(url))) { faltando.push(nome); return }
    const f = await carregar(url)
    if (!f.clipes[0]) { faltando.push(nome); return }
    f.raiz.updateMatrixWorld(true)
    crus[nome] = { raiz: f.raiz, clipe: f.clipes[0] }
  }))
  const refNome = dedos.dedosReferenciaAndar
  if (crus.andar && refNome && refNome !== 'andar' && await existe(pasta + refNome + '.fbx')) {
    const ref = await carregar(pasta + refNome + '.fbx')
    if (ref.clipes[0]) crus.andar.referenciaDedos = { registro: { raiz: ref.raiz, clipe: ref.clipes[0] }, fechamento: dedos.dedosFecharCiclo }
  }
  // a conversão mexe nos ossos do alvo só pela leitura do repouso; uma por vez
  for (const nome of nomes) {
    const c = crus[nome]
    if (!c) continue
    const ossosF = ossosPorNome(c.raiz)
    const fonte = { raiz: c.raiz, ossos: ossosF, rep: repFonte || repouso(ossosF) }
    clipes[nome] = converter(c.clipe, fonte, destino, { nome, noLugar: !semDeslocamento.includes(nome) })
    if (c.referenciaDedos) {
      const ref = c.referenciaDedos, ossos = ossosPorNome(ref.registro.raiz)
      const dedosConvertidos = converter(ref.registro.clipe, { raiz: ref.registro.raiz, ossos, rep: repFonte || repouso(ossos) }, destino, { nome })
      clipes[nome] = usarDedosGravados(clipes[nome], dedosConvertidos, { fechamento: ref.fechamento })
    }
  }
  const passadas = {}
  for (const k of ['andar', 'correr', 'disparada', 'velho-andar', 'carregar-andando']) {
    if (clipes[k]) passadas[k] = medirPassada(clipes[k], destino, alvo.raiz)
  }
  return { clipes, crus: Object.fromEntries(Object.entries(crus).map(([k, v]) => [k, v.clipe])), passadas, faltando, ybot, fontes: crus }
}

// O caminho Mixamo -> boneco simplificado -> Neto perdia os dedos no primeiro passo.
// Reaproveita os registros originais para essas falanges; mantém as demais trilhas do jogo.
export function anexarDedos(clipe, registro, alvo, repFonte) {
  if (!registro || ![...alvo.ossos.keys()].some(ehDedo)) return clipe
  if (registro.referenciaDedos) {
    const ref = registro.referenciaDedos, ossos = ossosPorNome(ref.registro.raiz)
    const direto = converter(ref.registro.clipe, { raiz: ref.registro.raiz, ossos, rep: repFonte || repouso(ossos) }, alvo, { nome: clipe.name })
    return usarDedosGravados(clipe, direto, { fechamento: ref.fechamento })
  }
  const ossos = ossosPorNome(registro.raiz)
  if (![...ossos.keys()].some(ehDedo)) return clipe
  const fonte = { raiz: registro.raiz, ossos, rep: repFonte || repouso(ossos) }
  const direto = converter(registro.clipe, fonte, alvo, { nome: clipe.name })
  const dedos = direto.tracks.filter(t => ehDedo(t.name.replace(/\.quaternion$/, '').replace(/^mixamorig\d*[:_]?/i, '')))
  clipe.tracks = [...clipe.tracks.filter(t => !ehDedo(t.name.replace(/\.quaternion$/, '').replace(/^mixamorig\d*[:_]?/i, ''))), ...dedos]
  return clipe
}
