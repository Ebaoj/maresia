// Fase 2b: a textura de ossos é amostragem fiel do AnimationMixer nos clipes recebidos (sem GPU).
// Clipe sintético: o braço esquerdo gira de 0 a 90 graus em 1 s; o "parado" tem 0,5 s e não mexe em nada.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { criarBoneco, NOMES } from '../../src/jogador/esqueleto.js'
import { assarOssos, pecasPorPapel, PAPEIS } from '../../src/mundo/ossos-textura.js'

function clipes() {
  const q0 = new THREE.Quaternion()
  const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
  const trilha = new THREE.QuaternionKeyframeTrack('LeftArm.quaternion', [0, 1], [...q0.toArray(), ...q1.toArray()])
  return {
    andar: new THREE.AnimationClip('andar', 1, [trilha]),
    parado: new THREE.AnimationClip('parado', 0.5, []),
  }
}

const ARM = NOMES.indexOf('LeftArm')

function linha(assado, l) {
  const n = assado.nOssos * 16
  return assado.textura.image.data.subarray(l * n, (l + 1) * n)
}
function osso(assado, l, i) {
  return Array.from(linha(assado, l).subarray(i * 16, i * 16 + 16))
}
function proximo(a, b, tol = 1e-6) {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) expect(Math.abs(a[i] - b[i])).toBeLessThan(tol)
}
const IDENTIDADE = new THREE.Matrix4().identity().toArray()

describe('assarOssos', () => {
  const boneco = criarBoneco()
  const assado = assarOssos({ boneco, clipes: clipes(), fps: 4 })

  it('layout: quadros por clipe, linha0 e tamanho da textura', () => {
    expect(assado.nOssos).toBe(28)
    expect(assado.fps).toBe(4)
    expect(assado.clipes.andar).toEqual({ linha0: 0, quadros: 4, duracao: 1 })
    expect(assado.clipes.parado).toEqual({ linha0: 4, quadros: 2, duracao: 0.5 })
    const t = assado.textura
    expect(t.name).toBe('OssosAtores')
    expect(t.image.width).toBe(112)
    expect(t.image.height).toBe(6)
    expect(t.type).toBe(THREE.FloatType)
    expect(t.format).toBe(THREE.RGBAFormat)
    expect(t.image.data).toBeInstanceOf(Float32Array)
    expect(t.image.data.length).toBe(112 * 6 * 4)
    expect(t.magFilter).toBe(THREE.NearestFilter)
    expect(t.minFilter).toBe(THREE.NearestFilter)
    expect(t.generateMipmaps).toBe(false)
    expect(t.flipY).toBe(false)
  })

  it('a linha do meio do braço é o que o mixer põe em 0,5 s', () => {
    const outro = criarBoneco()
    const mixer = new THREE.AnimationMixer(outro.raiz)
    mixer.clipAction(clipes().andar).play()
    mixer.setTime(0.5)
    outro.raiz.updateMatrixWorld(true)
    outro.esqueleto.update()
    const esperado = outro.esqueleto.boneMatrices
    proximo(osso(assado, 2, ARM), Array.from(esperado.subarray(ARM * 16, ARM * 16 + 16)))
    // o antebraço (filho) acompanha, e não é a identidade
    const FORE = NOMES.indexOf('LeftForeArm')
    proximo(osso(assado, 2, FORE), Array.from(esperado.subarray(FORE * 16, FORE * 16 + 16)))
    expect(Math.abs(osso(assado, 2, ARM)[0] - 1)).toBeGreaterThan(0.1)
    // linha inteira (todos os ossos) igual à do mixer feito à mão
    proximo(Array.from(linha(assado, 2)), Array.from(esperado))
  })

  it('o osso animado muda ao longo do clipe e começa no repouso', () => {
    proximo(osso(assado, 0, ARM), IDENTIDADE)
    const g = (l) => osso(assado, l, ARM)
    expect(Math.abs(g(1)[0] - g(3)[0])).toBeGreaterThan(0.1)
    // 90 graus em torno de Z em t = 1 não está na textura (o último quadro é 0,75 s): wrap é de quem lê
    expect(g(3)[0]).toBeCloseTo(Math.cos((Math.PI / 2) * 0.75), 5)
  })

  it('osso não animado é bone.matrixWorld * boneInverse = identidade em todas as linhas', () => {
    for (let l = 0; l < 6; l++) {
      for (const n of ['Hips', 'Head', 'RightArm', 'LeftLeg', 'Chapeu']) {
        proximo(osso(assado, l, NOMES.indexOf(n)), IDENTIDADE)
      }
    }
    // o clipe parado não mexe em nada: toda a linha é identidade
    for (const l of [4, 5]) for (let i = 0; i < 28; i++) proximo(osso(assado, l, i), IDENTIDADE)
  })

  it('devolve o boneco na pose de repouso', () => {
    boneco.raiz.updateMatrixWorld(true)
    boneco.esqueleto.update()
    for (let i = 0; i < 28; i++) proximo(Array.from(boneco.esqueleto.boneMatrices.subarray(i * 16, i * 16 + 16)), IDENTIDADE)
    expect(boneco.ossos.get('LeftArm').quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(1e-6)
  })

  it('texel (osso * 4 + c, linha) é a coluna c da matriz do osso', () => {
    const d = assado.textura.image.data
    const w = assado.textura.image.width
    const m = osso(assado, 2, ARM)
    for (let c = 0; c < 4; c++) {
      const base = (2 * w + ARM * 4 + c) * 4
      expect(Array.from(d.subarray(base, base + 4))).toEqual(m.slice(c * 4, c * 4 + 4))
    }
  })
})

describe('pecasPorPapel', () => {
  const pecas = pecasPorPapel()

  it('uma geometria por papel, na ordem fixa', () => {
    expect(PAPEIS).toEqual(['pele', 'camisa', 'listra', 'calca', 'chapeu', 'cabelo'])
    expect(Object.keys(pecas)).toEqual(PAPEIS)
    for (const p of PAPEIS) {
      const g = pecas[p]
      expect(g.index).toBeNull()
      expect(g.attributes.position.count).toBeGreaterThan(0)
      expect(g.attributes.skinIndex.count).toBe(g.attributes.position.count)
      expect(g.attributes.skinWeight.count).toBe(g.attributes.position.count)
    }
  })

  it('skinWeight é (1,0,0,0) em todo vértice e skinIndex.x é um osso válido', () => {
    for (const p of PAPEIS) {
      const w = pecas[p].attributes.skinWeight.array
      const si = pecas[p].attributes.skinIndex.array
      for (let i = 0; i < w.length; i += 4) {
        expect([w[i], w[i + 1], w[i + 2], w[i + 3]]).toEqual([1, 0, 0, 0])
        expect(si[i]).toBeGreaterThanOrEqual(0)
        expect(si[i]).toBeLessThan(28)
      }
    }
  })

  it('a soma dos vértices é a de um boneco normal', () => {
    const normal = criarBoneco()
    const total = normal.malhas.reduce((s, m) => s + m.geometry.attributes.position.count, 0)
    expect(PAPEIS.reduce((s, p) => s + pecas[p].attributes.position.count, 0)).toBe(total)
  })

  it('o bindMatrix do boneco é a identidade (a posição animada é só M[osso] * p)', () => {
    const b = criarBoneco()
    for (const m of b.malhas) {
      expect(m.bindMatrix.equals(new THREE.Matrix4())).toBe(true)
      expect(m.bindMatrixInverse.equals(new THREE.Matrix4())).toBe(true)
    }
  })
})
