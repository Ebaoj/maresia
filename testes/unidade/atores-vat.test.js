// KAN-74 fase 2b-3: os atores de fundo como 6 InstancedMesh com a pose em textura de ossos (atores.js, vat: true).
// Os módulos de 2b-1 (ossos-textura) e 2b-2 (material em TSL) são trocados por dublês que seguem o contrato
// dos briefings: o que se testa aqui é a lógica de atores.js (ocupação, soltura, linhas e pesos escritos).
import { describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'

vi.mock('../../src/mundo/ossos-textura.js', () => ({
  PAPEIS: ['pele', 'camisa', 'listra', 'calca', 'chapeu', 'cabelo'],
  pecasPorPapel: () => Object.fromEntries(['pele', 'camisa', 'listra', 'calca', 'chapeu', 'cabelo'].map((p) => [p, new THREE.BoxGeometry(0.1, 0.1, 0.1)])),
  assarOssos: ({ clipes }) => ({
    textura: null,
    nOssos: 28,
    clipes: {
      andar: { linha0: 0, quadros: Math.max(2, Math.round(clipes.andar.duration * 30)), duracao: clipes.andar.duration },
      parado: { linha0: 30, quadros: Math.max(2, Math.round(clipes.parado.duration * 30)), duracao: clipes.parado.duration },
    },
    fps: 30,
  }),
}))
// o que o material recebeu, e o estado dos atributos na hora em que ele foi criado
const chamadasMaterial = vi.hoisted(() => [])
vi.mock('../../src/mundo/atores-vat-material.js', () => ({
  ATRIBUTOS: { animA: 'aAnimA', animB: 'aAnimB' },
  materialAtoresVat: (opcoes) => {
    chamadasMaterial.push({ opcoes, usoA: opcoes.atributos?.animA?.usage, usoB: opcoes.atributos?.animB?.usage })
    return new THREE.MeshBasicMaterial()
  },
  quadroDoTempo: (c, t) => {
    const f = (((t % c.duracao) + c.duracao) % c.duracao) / c.duracao * c.quadros
    const k = Math.floor(f)
    return { linhaA: c.linha0 + k, linhaB: c.linha0 + ((k + 1) % c.quadros), frac: f - k }
  },
}))

const { criarAtores } = await import('../../src/mundo/atores.js')

function clipe(nome, duracao) {
  return new THREE.AnimationClip(nome, duracao, [new THREE.VectorKeyframeTrack('Hips.position', [0, duracao], [0, 0, 0, 0, 0, 0])])
}
const clipes = () => ({ andar: clipe('andar', 1), parado: clipe('parado', 0.5) })

function mundo() {
  const registro = [
    { matriz: new THREE.Matrix4().makeTranslation(5, 0, 0), estado: 'andar', vel: 1.5, ator: null },
    { matriz: new THREE.Matrix4().makeTranslation(0, 0, 8), estado: 'parado', ator: null },
    { matriz: new THREE.Matrix4().makeTranslation(20, 0, 0), estado: 'parado', ator: null },
  ]
  const pessoas = { registro, ocupar: vi.fn((r, a) => { r.ator = a }) }
  return { registro, pessoas }
}

describe('atores em textura (vat)', () => {
  it('cria 6 InstancedMesh com uma cópia por ator, desocupadas no começo', () => {
    const { pessoas } = mundo()
    const cena = new THREE.Scene()
    const r = criarAtores(cena, pessoas, clipes(), { vat: true, quantos: 2 })
    expect(r.malhas).toHaveLength(6)
    expect(r.atores).toHaveLength(2)
    for (const m of r.malhas) {
      expect(m.isInstancedMesh).toBe(true)
      expect(m.count).toBe(2)
      expect(m.frustumCulled).toBe(false)
      expect(cena.children).toContain(m)
      expect(m.instanceColor.count).toBe(2)
    }
    expect(r.malhas.map((m) => m.name)).toEqual(['pele', 'camisa', 'listra', 'calca', 'chapeu', 'cabelo'].map((n) => 'atores-' + n))
    // os atributos de animação são o mesmo objeto nas 6 geometrias
    expect(new Set(r.malhas.map((m) => m.geometry.getAttribute('aAnimA'))).size).toBe(1)
    expect(new Set(r.malhas.map((m) => m.geometry.getAttribute('aAnimB'))).size).toBe(1)
    const m = new THREE.Matrix4()
    r.malhas[0].getMatrixAt(0, m)
    expect(m.determinant()).toBe(0)
  })

  it('passa ao material os mesmos atributos (vec4 por cópia, DynamicDrawUsage já na criação) que vão às geometrias', () => {
    chamadasMaterial.length = 0
    const r = criarAtores(new THREE.Scene(), mundo().pessoas, clipes(), { vat: true, quantos: 3 })
    expect(chamadasMaterial).toHaveLength(1)
    const { opcoes, usoA, usoB } = chamadasMaterial[0]
    expect(opcoes.opacity).toBe(0.85)
    expect(opcoes.nOssos).toBe(28)
    const { animA, animB } = opcoes.atributos
    expect(animA.isInstancedBufferAttribute).toBe(true)
    expect(animA.itemSize).toBe(4)
    expect(animA.count).toBe(3)
    expect(animB.count).toBe(3)
    expect(animA).not.toBe(animB)
    expect(usoA).toBe(THREE.DynamicDrawUsage)
    expect(usoB).toBe(THREE.DynamicDrawUsage)
    for (const m of r.malhas) {
      expect(m.geometry.getAttribute('aAnimA')).toBe(animA)
      expect(m.geometry.getAttribute('aAnimB')).toBe(animB)
    }
  })

  it('ocupa os 2 mais próximos, escreve matriz e linhas válidas, e deixa 1 pessoa livre', () => {
    const { registro, pessoas } = mundo()
    const r = criarAtores(new THREE.Scene(), pessoas, clipes(), { vat: true, quantos: 2, raio: 35 })
    r.atualizar(1 / 12, { x: 0, z: 0 })
    const ocupadas = registro.filter((x) => x.ator)
    expect(ocupadas).toHaveLength(2)
    expect(registro.filter((x) => !x.ator)).toHaveLength(1)
    expect(registro[2].ator).toBeNull() // a de 20 m fica de fora: só há 2 atores
    const A = r.malhas[0].geometry.getAttribute('aAnimA')
    const B = r.malhas[0].geometry.getAttribute('aAnimB')
    const { andar, parado } = r.assado.clipes
    const m = new THREE.Matrix4()
    for (let i = 0; i < 2; i++) {
      for (const malha of r.malhas) {
        malha.getMatrixAt(i, m)
        expect(m.determinant()).not.toBe(0)
      }
      expect(A.getW(i)).toBeGreaterThanOrEqual(0)
      expect(A.getW(i)).toBeLessThanOrEqual(1)
      for (const [attr, c] of [[A, andar], [B, parado]]) {
        for (const linha of [attr.getX(i), attr.getY(i)]) {
          expect(linha).toBeGreaterThanOrEqual(c.linha0)
          expect(linha).toBeLessThan(c.linha0 + c.quadros)
        }
        expect(attr.getZ(i)).toBeGreaterThanOrEqual(0)
        expect(attr.getZ(i)).toBeLessThan(1)
      }
      expect(B.getW(i)).toBe(0)
    }
    // quem anda tem peso 1 no andar; quem está parado, 0 (primeira passada: vai direto ao alvo)
    const iAndando = r.atores.find((a) => a.pessoa === registro[0]).i
    const iParado = r.atores.find((a) => a.pessoa === registro[1]).i
    expect(A.getW(iAndando)).toBe(1)
    expect(A.getW(iParado)).toBe(0)
    expect(A.version).toBeGreaterThan(0)
  })

  it('a cópia recém-ocupada já recebe aAnimA/aAnimB no mesmo atualizar (sem esperar o passo em 2)', () => {
    const { registro, pessoas } = mundo()
    const r = criarAtores(new THREE.Scene(), pessoas, clipes(), { vat: true, quantos: 2, raio: 35 })
    const { animA: A, animB: B } = chamadasMaterial.at(-1).opcoes.atributos
    expect(A.array.every((v) => v === 0)).toBe(true)
    const v0 = A.version
    // dt minúsculo: nenhum ator completa 1/12 s, então só vale o que foi escrito ao ocupar
    r.atualizar(0.001, { x: 0, z: 0 })
    expect(registro.filter((x) => x.ator)).toHaveLength(2)
    expect(A.version).toBeGreaterThan(v0)
    expect(B.version).toBeGreaterThan(v0)
    const { andar, parado } = r.assado.clipes
    for (const a of r.atores) {
      expect(a.estado).toBeNull() // o passo em 2 ainda não rodou
      expect(a.acc).toBeGreaterThan(0)
      const andando = a.pessoa.estado === 'andar'
      expect(A.getW(a.i)).toBe(andando ? 1 : 0)
      expect(B.getW(a.i)).toBe(0)
      // linhas do clipe certo e fração em [0, 1), com o tempo sorteado ao ocupar
      for (const [attr, c, acao] of [[A, andar, a.acoes.andar], [B, parado, a.acoes.parado]]) {
        const k = Math.floor((acao.time % c.duracao) / c.duracao * c.quadros)
        expect(attr.getX(a.i)).toBe(c.linha0 + k)
        expect(attr.getY(a.i)).toBe(c.linha0 + ((k + 1) % c.quadros))
        expect(attr.getZ(a.i)).toBeGreaterThanOrEqual(0)
        expect(attr.getZ(a.i)).toBeLessThan(1)
      }
      // os pesos do relógio (mixer) batem com o que foi escrito
      expect(a.acoes.andar.getEffectiveWeight()).toBe(andando ? 1 : 0)
      expect(a.acoes.parado.getEffectiveWeight()).toBe(andando ? 0 : 1)
    }
    // o parado respira no seu tempo: os 2 atores não escrevem a mesma linha/fração
    const [a0, a1] = r.atores
    expect(B.getZ(a0.i) !== B.getZ(a1.i) || B.getX(a0.i) !== B.getX(a1.i)).toBe(true)
  })

  it('a cópia segue a pessoa (posição, escala do ator, y mais baixo se anda)', () => {
    const { registro, pessoas } = mundo()
    const r = criarAtores(new THREE.Scene(), pessoas, clipes(), { vat: true, quantos: 2 })
    r.atualizar(1 / 12, { x: 0, z: 0 })
    const a = r.atores.find((x) => x.pessoa === registro[0])
    const m = new THREE.Matrix4().fromArray(r.malhas[0].instanceMatrix.array, a.i * 16)
    const pos = new THREE.Vector3(); const esc = new THREE.Vector3()
    m.decompose(pos, new THREE.Quaternion(), esc)
    expect(pos.x).toBeCloseTo(5)
    expect(pos.y).toBeCloseTo(-0.03)
    expect(esc.x).toBeCloseTo(a.escala)
  })

  it('ao afastar o jogador, solta as pessoas e zera a escala das cópias', () => {
    const { registro, pessoas } = mundo()
    const r = criarAtores(new THREE.Scene(), pessoas, clipes(), { vat: true, quantos: 2, raio: 35 })
    r.atualizar(1 / 12, { x: 0, z: 0 })
    const ocupadas = registro.filter((x) => x.ator)
    pessoas.ocupar.mockClear()
    r.atualizar(1 / 12, { x: 500, z: 500 })
    for (const pessoa of ocupadas) expect(pessoas.ocupar).toHaveBeenCalledWith(pessoa, null)
    expect(registro.every((x) => !x.ator)).toBe(true)
    const m = new THREE.Matrix4()
    for (const malha of r.malhas) for (let i = 0; i < 2; i++) { malha.getMatrixAt(i, m); expect(m.determinant()).toBe(0) }
  })

  it('quantos = 0 desliga (devolve null)', () => {
    expect(criarAtores(new THREE.Scene(), mundo().pessoas, clipes(), { vat: true, quantos: 0 })).toBeNull()
  })

  it('sem clipes de andar e parado devolve null nos dois caminhos', () => {
    expect(criarAtores(new THREE.Scene(), mundo().pessoas, {}, { vat: true })).toBeNull()
    expect(criarAtores(new THREE.Scene(), mundo().pessoas, {})).toBeNull()
  })

  it('vat: false mantém o formato de antes (raiz e mixer por ator)', () => {
    const { pessoas } = mundo()
    const cena = new THREE.Scene()
    const r = criarAtores(cena, pessoas, clipes(), { quantos: 2 })
    expect(r.atores).toHaveLength(2)
    expect(typeof r.atualizar).toBe('function')
    expect(r.malhas).toBeUndefined()
    for (const a of r.atores) {
      expect(a.raiz.isGroup).toBe(true)
      expect(a.mixer).toBeInstanceOf(THREE.AnimationMixer)
      expect(Object.keys(a.acoes)).toEqual(['andar', 'parado'])
      expect(a.raiz.visible).toBe(false)
    }
    expect(cena.children).toHaveLength(2)
  })
})
