// Muita gente gastando pouco (fase 8 do corpo): a cidade continua cheia de figuras simples
// (pessoas.js), e as mais próximas do jogador viram atores de verdade, no mesmo esqueleto e com os
// mesmos movimentos de mocap do jogador, cada um com a sua roupa e a sua pele. Quando o jogador se
// afasta, o ator vai ocupar outra pessoa e a figura simples volta. A pose é "em 2" (12 por segundo),
// com os atores defasados entre si para não andarem todos no mesmo passo.

import * as THREE from 'three'
import { criarBoneco } from '../jogador/esqueleto.js'
import { criarAleatorio } from '../utils.js'

const rnd = criarAleatorio(1932)
// 1932 (docs/figurino.md e fotos de 1935): linho branco e creme, algodão cor de couro, chapéu de palha
const PELES = ['#e8bf9a', '#c98e62', '#a8693f', '#8a5235', '#6b3f26', '#4e2c1a']
const CAMISAS = ['#efe9dc', '#e4dccb', '#d9cbb0', '#8a5a3c', '#a5764f', '#9aa0a3', '#c9b48a']
const LISTRAS = ['#efe9dc', '#b8553b', '#6f7f8f', '#d9cbb0']
const CALCAS = ['#efe9dc', '#d9cbb0', '#6b5a4a', '#8a5a3c', '#5a5a5e']
const CHAPEUS = ['#d9bf86', '#c8a86a', '#e9dcc0', '#3b3330']

export function criarAtores(cena, pessoas, clipes, { quantos = 16, raio = 35, passadaAndar = 1.5 } = {}) {
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
