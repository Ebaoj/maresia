// Muita gente gastando pouco (fase 8 do corpo): a cidade continua cheia de figuras simples
// (pessoas.js), e as mais próximas do jogador viram atores de verdade, no mesmo esqueleto e com os
// mesmos movimentos de mocap do jogador, cada um com a sua roupa e a sua pele. Quando o jogador se
// afasta, o ator vai ocupar outra pessoa e a figura simples volta. A pose é "em 2" (12 por segundo),
// com os atores defasados entre si para não andarem todos no mesmo passo.

import * as THREE from 'three'
import { criarBoneco } from '../jogador/esqueleto.js'
import { criarAleatorio } from '../utils.js'
import { assarOssos, pecasPorPapel, PAPEIS } from './ossos-textura.js'
import { materialAtoresVat, quadroDoTempo, ATRIBUTOS } from './atores-vat-material.js'

const rnd = criarAleatorio(1932)
// 1932 (docs/figurino.md e fotos de 1935): linho branco e creme, algodão cor de couro, chapéu de palha
const PELES = ['#e8bf9a', '#c98e62', '#a8693f', '#8a5235', '#6b3f26', '#4e2c1a']
const CAMISAS = ['#efe9dc', '#e4dccb', '#d9cbb0', '#8a5a3c', '#a5764f', '#9aa0a3', '#c9b48a']
const LISTRAS = ['#efe9dc', '#b8553b', '#6f7f8f', '#d9cbb0']
const CALCAS = ['#efe9dc', '#d9cbb0', '#6b5a4a', '#8a5a3c', '#5a5a5e']
const CHAPEUS = ['#d9bf86', '#c8a86a', '#e9dcc0', '#3b3330']
const COR_CABELO = '#1d1411' // o COR_PADRAO.cabelo do esqueleto.js: o caminho antigo nunca sorteia o cabelo

// vat = false (padrão): 16 bonecos de 6 SkinnedMesh, como sempre. vat = true (só WebGPU): 6 InstancedMesh
// com a pose lida de uma textura de ossos (criarAtoresVat). A lógica de quem ocupa quem é a mesma.
export function criarAtores(cena, pessoas, clipes, opcoes = {}) {
  if (!clipes.andar || !clipes.parado) return null
  return opcoes.vat === true ? criarAtoresVat(cena, pessoas, clipes, opcoes) : criarAtoresSkinned(cena, pessoas, clipes, opcoes)
}

function criarAtoresSkinned(cena, pessoas, clipes, { quantos = 16, raio = 35, passadaAndar = 1.5 } = {}) {
  if (!clipes.andar || !clipes.parado) return null
  const atores = []
  for (let i = 0; i < quantos; i++) {
    const b = criarBoneco({
      pele: rnd.escolha(PELES), camisa: rnd.escolha(CAMISAS), listra: rnd.escolha(LISTRAS),
      calca: rnd.escolha(CALCAS), chapeu: rnd.escolha(CHAPEUS),
    })
    // alfa 0,85: o filtro de quadrinho dá traço de "gente" (o jogador tem 0,5, mais forte)
    for (const m of b.malhas) { m.material.opacity = 0.85; m.castShadow = true }
    const raiz = new THREE.Group()
    raiz.add(b.raiz)
    raiz.visible = false
    cena.add(raiz)
    const mixer = new THREE.AnimationMixer(b.raiz)
    const acoes = { andar: mixer.clipAction(clipes.andar), parado: mixer.clipAction(clipes.parado) }
    for (const a of Object.values(acoes)) { a.play(); a.setEffectiveWeight(0) }
    atores.push({ raiz, mixer, acoes, pessoa: null, estado: null, acc: (i / quantos) / 12, escala: rnd.entre(0.92, 1.05) })
  }
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()

  return {
    atores,
    atualizar(dt, jogador) {
      // quem está perto (fora da cidade inteira, só olha o registro, que é pequeno)
      const perto = []
      for (const r of pessoas.registro) {
        p.setFromMatrixPosition(r.matriz)
        const d = Math.hypot(p.x - jogador.x, p.z - jogador.z)
        if (d < raio) perto.push([d, r])
      }
      perto.sort((a, b) => a[0] - b[0])
      const querem = new Set(perto.slice(0, atores.length).map(([, r]) => r))
      // solta quem saiu do raio
      for (const a of atores) {
        if (a.pessoa && !querem.has(a.pessoa)) { pessoas.ocupar(a.pessoa, null); a.pessoa = null; a.raiz.visible = false }
      }
      // ocupa quem chegou
      for (const r of querem) {
        if (r.ator) continue
        const a = atores.find((x) => !x.pessoa)
        if (!a) break
        a.pessoa = r
        a.estado = null
        pessoas.ocupar(r, a)
        a.raiz.visible = true
        a.acoes.parado.time = rnd.entre(0, a.acoes.parado.getClip().duration) // cada um respira no seu tempo
        a.acoes.andar.time = rnd.entre(0, a.acoes.andar.getClip().duration)
      }
      // pose "em 2", defasada entre os atores
      for (const a of atores) {
        if (!a.pessoa) continue
        const r = a.pessoa
        r.matriz.decompose(p, q, s)
        a.raiz.position.set(p.x, p.y - (r.estado === 'andar' ? 0.03 : 0), p.z) // a figura simples balança para cima; o ator não
        a.raiz.quaternion.copy(q)
        a.raiz.scale.setScalar(a.escala)
        a.acc += dt
        if (a.acc < 1 / 12) continue
        const DT = a.acc
        a.acc = 0
        const andando = r.estado === 'andar'
        const alvo = { andar: andando ? 1 : 0, parado: andando ? 0 : 1 }
        for (const [k, acao] of Object.entries(a.acoes)) {
          const w = acao.getEffectiveWeight()
          acao.setEffectiveWeight(a.estado === null ? alvo[k] : w + (alvo[k] - w) * 0.5)
        }
        a.estado = r.estado
        // passada casada com a velocidade de quem anda
        a.acoes.andar.timeScale = andando ? Math.abs(r.vel || 1.2) / passadaAndar : 1
        a.mixer.update(DT)
      }
    },
  }
}

// Os mesmos atores, sem ossos: uma InstancedMesh por peça (pele, camisa, ...) com uma cópia por ator, e a
// pose vem da textura de ossos assada dos mesmos clipes (ossos-textura.js). 16 bonecos davam ~52 desenhos
// de SkinnedMesh por quadro; aqui são 6 x 2 (principal + sombra). O relógio continua sendo o AnimationMixer
// (mesmo tempo, mesmo loop, mesmos pesos e mesma passada de hoje), só que sobre clipes sem trilhas: ele
// conta o tempo e o peso, e quem lê a pose é o shader. Os sorteios do rnd saem na mesma ordem do
// caminho antigo (pele, camisa, listra, calça, chapéu, escala por ator; depois, ao ocupar, o tempo do
// parado e o do andar), então a gente da cidade continua com as mesmas roupas.
function criarAtoresVat(cena, pessoas, clipes, { quantos = 16, raio = 35, passadaAndar = 1.5 } = {}) {
  if (quantos <= 0) return null
  const assado = assarOssos({ boneco: criarBoneco(), clipes: { andar: clipes.andar, parado: clipes.parado } })
  const pecas = pecasPorPapel()
  // aAnimA = (linhaA, linhaB, frac, peso) do andar; aAnimB = o mesmo do parado. Os mesmos dois objetos vão ao
  // material (que os lê por nome no shader) e às 6 geometrias; nascem antes do material.
  const animA = new THREE.InstancedBufferAttribute(new Float32Array(quantos * 4), 4)
  const animB = new THREE.InstancedBufferAttribute(new Float32Array(quantos * 4), 4)
  animA.setUsage(THREE.DynamicDrawUsage)
  animB.setUsage(THREE.DynamicDrawUsage)
  const material = materialAtoresVat({ textura: assado.textura, nOssos: assado.nOssos, opacity: 0.85, atributos: { animA, animB } })

  const nula = new THREE.Matrix4().makeScale(0, 0, 0) // cópia desocupada: escala 0, não desenha nada
  const malhas = PAPEIS.map((papel) => {
    const m = new THREE.InstancedMesh(pecas[papel], material, quantos)
    m.name = 'atores-' + papel
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false // os atores ficam sempre a 35 m do jogador
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    m.geometry.setAttribute(ATRIBUTOS.animA, animA)
    m.geometry.setAttribute(ATRIBUTOS.animB, animB)
    for (let i = 0; i < quantos; i++) m.setMatrixAt(i, nula)
    return m
  })
  const malhaDe = Object.fromEntries(PAPEIS.map((papel, k) => [papel, malhas[k]]))

  // clipes sem trilhas e com a mesma duração: o mixer conta tempo e peso sem procurar ossos (com os
  // clipes de verdade e nenhum osso na cena, cada trilha de cada ator avisaria "No target node")
  const relogio = {
    andar: new THREE.AnimationClip('andar', clipes.andar.duration, []),
    parado: new THREE.AnimationClip('parado', clipes.parado.duration, []),
  }
  const atores = []
  for (let i = 0; i < quantos; i++) {
    const cor = {
      pele: rnd.escolha(PELES), camisa: rnd.escolha(CAMISAS), listra: rnd.escolha(LISTRAS),
      calca: rnd.escolha(CALCAS), chapeu: rnd.escolha(CHAPEUS), cabelo: COR_CABELO,
    }
    for (const papel of PAPEIS) malhaDe[papel].setColorAt(i, new THREE.Color(cor[papel]))
    const mixer = new THREE.AnimationMixer(new THREE.Object3D())
    const acoes = { andar: mixer.clipAction(relogio.andar), parado: mixer.clipAction(relogio.parado) }
    for (const a of Object.values(acoes)) { a.play(); a.setEffectiveWeight(0) }
    atores.push({ i, mixer, acoes, pessoa: null, estado: null, acc: (i / quantos) / 12, escala: rnd.entre(0.92, 1.05) })
  }
  for (const m of malhas) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true }
  for (const m of malhas) cena.add(m)

  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const es = new THREE.Vector3()
  const M = new THREE.Matrix4()

  const escreverMatriz = (i, matriz) => { for (const m of malhas) m.setMatrixAt(i, matriz) }
  const escreverPose = (a) => {
    const A = quadroDoTempo(assado.clipes.andar, a.acoes.andar.time)
    const B = quadroDoTempo(assado.clipes.parado, a.acoes.parado.time)
    animA.setXYZW(a.i, A.linhaA, A.linhaB, A.frac, a.acoes.andar.getEffectiveWeight())
    animB.setXYZW(a.i, B.linhaA, B.linhaB, B.frac, 0)
  }

  return {
    atores,
    malhas,
    assado,
    atualizar(dt, jogador) {
      // quem está perto (fora da cidade inteira, só olha o registro, que é pequeno)
      const perto = []
      for (const r of pessoas.registro) {
        p.setFromMatrixPosition(r.matriz)
        const d = Math.hypot(p.x - jogador.x, p.z - jogador.z)
        if (d < raio) perto.push([d, r])
      }
      perto.sort((a, b) => a[0] - b[0])
      const querem = new Set(perto.slice(0, atores.length).map(([, r]) => r))
      let matrizes = false
      let poses = false
      // solta quem saiu do raio
      for (const a of atores) {
        if (a.pessoa && !querem.has(a.pessoa)) { pessoas.ocupar(a.pessoa, null); a.pessoa = null; escreverMatriz(a.i, nula); matrizes = true }
      }
      // ocupa quem chegou
      for (const r of querem) {
        if (r.ator) continue
        const a = atores.find((x) => !x.pessoa)
        if (!a) break
        a.pessoa = r
        a.estado = null
        pessoas.ocupar(r, a)
        a.acoes.parado.time = rnd.entre(0, a.acoes.parado.getClip().duration) // cada um respira no seu tempo
        a.acoes.andar.time = rnd.entre(0, a.acoes.andar.getClip().duration)
        // já nasce com a pose escrita (pesos pelo estado de agora), sem esperar o passo "em 2"
        const andando = r.estado === 'andar'
        a.acoes.andar.setEffectiveWeight(andando ? 1 : 0)
        a.acoes.parado.setEffectiveWeight(andando ? 0 : 1)
        escreverPose(a)
        poses = true
      }
      // pose "em 2", defasada entre os atores
      for (const a of atores) {
        if (!a.pessoa) continue
        const r = a.pessoa
        r.matriz.decompose(p, q, s)
        es.setScalar(a.escala)
        M.compose(p.set(p.x, p.y - (r.estado === 'andar' ? 0.03 : 0), p.z), q, es) // a figura simples balança para cima; o ator não
        escreverMatriz(a.i, M)
        matrizes = true
        a.acc += dt
        if (a.acc < 1 / 12) continue
        const DT = a.acc
        a.acc = 0
        const andando = r.estado === 'andar'
        const alvo = { andar: andando ? 1 : 0, parado: andando ? 0 : 1 }
        for (const [k, acao] of Object.entries(a.acoes)) {
          const w = acao.getEffectiveWeight()
          acao.setEffectiveWeight(a.estado === null ? alvo[k] : w + (alvo[k] - w) * 0.5)
        }
        a.estado = r.estado
        // passada casada com a velocidade de quem anda
        a.acoes.andar.timeScale = andando ? Math.abs(r.vel || 1.2) / passadaAndar : 1
        a.mixer.update(DT)
        escreverPose(a)
        poses = true
      }
      if (matrizes) for (const m of malhas) m.instanceMatrix.needsUpdate = true
      if (poses) { animA.needsUpdate = true; animB.needsUpdate = true }
    },
  }
}
