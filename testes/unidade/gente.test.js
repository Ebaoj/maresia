// A gente de 1932 (22/10/2026, docs/gente-22-10.md): as fichas, a figura de perto e de longe, a multidão que escolhe
// uma ou outra pela câmera e o corpo dos atores vestido pela mesma ficha.
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { criarAleatorio } from '../../src/utils.js'
import { fichasDaCidade, figuraGeo, figuraLod } from '../../src/mundo/gente-figurino.js'
import { fichasDoCampo, modelosDoCampo } from '../../src/mundo/urubu-gente.js'
import { pecasDosAtores, PAPEIS_ATOR } from '../../src/mundo/gente-ator.js'
import { criarMultidao } from '../../src/mundo/multidao.js'
import { NOMES } from '../../src/jogador/esqueleto.js'

const tris = (g) => (g.index ? g.index.count : g.attributes.position.count) / 3

describe('as fichas da cidade', () => {
  // a figura antiga sorteava, por figura: pele, roupa, (baixo se homem), (chance de chapéu se mulher), (cor do chapéu
  // se tem), cabelo; 12 de pé e 6 sentadas. As fichas novas têm de gastar o mesmo do rnd da cidade, senão todo mundo
  // muda de lugar (o rnd 808 sorteia depois as posições)
  it('gastam do rnd da cidade os mesmos sorteios da figura antiga', () => {
    const antigo = criarAleatorio(808)
    const sorteia = (mulher) => {
      antigo.proximo(); antigo.proximo()
      if (!mulher) antigo.proximo()
      let chapeu = !mulher
      if (mulher) chapeu = antigo.proximo() < 0.35
      if (chapeu) antigo.proximo()
      antigo.proximo()
    }
    for (let i = 0; i < 12; i++) sorteia(i % 3 === 0)
    for (let i = 0; i < 6; i++) sorteia(i % 3 === 0)
    const novo = criarAleatorio(808)
    fichasDaCidade(novo)
    expect(novo.proximo()).toBe(antigo.proximo())
  })

  it('toda ficha tem as cores de todos os papéis', () => {
    const { pe, sentadas } = fichasDaCidade(criarAleatorio(808))
    for (const f of [...pe, ...sentadas, ...fichasDoCampo().pe]) for (const p of PAPEIS_ATOR) expect(f.cores[p], p).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('a figura de perto e a média', () => {
  const { pe } = fichasDaCidade(criarAleatorio(808))
  it('a média tem menos de 75% dos vértices da de perto e menos da metade da figura antiga (2.400), e a altura é a de gente', () => {
    for (const f of pe) {
      const { perto, medio } = figuraLod(f)
      expect(medio.attributes.position.count).toBeLessThan(perto.attributes.position.count * 0.75)
      expect(medio.attributes.position.count).toBeLessThan(1200)
      perto.computeBoundingBox()
      const h = perto.boundingBox.max.y
      if (f.crianca) expect(h).toBeLessThan(1.35)
      else { expect(h).toBeGreaterThan(1.6); expect(h).toBeLessThan(2.3) }
      expect(perto.boundingBox.min.y).toBeGreaterThan(-0.02) // o pé no chão, sem afundar
    }
  })
  it('cor por vértice em toda figura (o material é o toon com vertexColors)', () => {
    const g = figuraGeo(pe[1])
    expect(g.attributes.color.count).toBe(g.attributes.position.count)
  })
  it('o campo tem criança de tamanho de criança, a lata na cabeça e o portão', () => {
    const m = modelosDoCampo()
    for (const c of m.crianca) { c.perto.computeBoundingBox(); expect(c.perto.boundingBox.max.y).toBeLessThan(1.35) }
    m.latacabeca.perto.computeBoundingBox()
    expect(m.latacabeca.perto.boundingBox.max.y).toBeGreaterThan(1.9)
    expect(m.guarda.perto.attributes.position.count).toBeGreaterThan(0)
  })
})

describe('a multidão', () => {
  it('arruma as visíveis no começo da malha: a contagem é quem aparece (sem as ocultas e as além de ate)', () => {
    const cena = new THREE.Scene()
    const md = criarMultidao(cena, new THREE.MeshBasicMaterial(), { nome: 'teste', ate: 60 })
    const t = md.tipo(new THREE.BoxGeometry())
    const e = [0, 10, 50, 100].map((x) => md.adicionar(t, new THREE.Matrix4().makeTranslation(x, 0, 0)))
    md.montar()
    expect(t.malha.count).toBe(4) // sem câmera, todos
    md.atualizar(new THREE.Vector3(0, 0, 0))
    expect(t.malha.count).toBe(3) // a de 100 m fica de fora
    e[0].oculta = true
    md.sujar()
    md.atualizar(new THREE.Vector3(0, 0, 0))
    expect(t.malha.count).toBe(2)
    // as que aparecem ficam no começo, na ordem das entradas
    const m = new THREE.Matrix4()
    t.malha.getMatrixAt(0, m)
    expect(m.elements[12]).toBe(10)
    md.ate = 1000
    md.atualizar(new THREE.Vector3(0, 0, 0))
    expect(t.malha.count).toBe(3)
    expect(cena.children.filter((o) => o.name === 'teste')).toHaveLength(1)
  })
  it('com a câmera inteira, quem está fora do quadro (além da folga) não é desenhado', () => {
    const md = criarMultidao(new THREE.Scene(), new THREE.MeshBasicMaterial(), { nome: 'teste', ate: 400, folga: 2 })
    const t = md.tipo(new THREE.BoxGeometry())
    for (const z of [20, -20, 60]) md.adicionar(t, new THREE.Matrix4().makeTranslation(0, 0, z))
    md.adicionar(t, new THREE.Matrix4().makeTranslation(80, 0, 10)) // de lado, fora do quadro
    md.montar()
    const cam = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 1000)
    cam.position.set(0, 1.5, 0)
    cam.lookAt(0, 1.5, 100)
    cam.updateMatrixWorld(true)
    md.atualizar(cam, true)
    expect(t.malha.count).toBe(2) // as duas da frente; a de trás e a do lado ficam de fora
  })
})

describe('o corpo dos atores', () => {
  const { pe } = fichasDaCidade(criarAleatorio(808))
  const fichas = pe.filter((f) => !f.crianca)
  const kit = pecasDosAtores(fichas)
  it('uma geometria por papel, cada vértice com um osso válido e a máscara das fichas', () => {
    for (const p of PAPEIS_ATOR) {
      const g = kit.pecas[p]
      expect(g.attributes.skinIndex.count).toBe(g.attributes.position.count)
      // skinIndex.x é o osso; skinIndex.y, a máscara das fichas (o peso dele é 0)
      const si = g.attributes.skinIndex.array
      const sw = g.attributes.skinWeight.array
      for (let i = 0; i < si.length; i += 4) { expect(si[i]).toBeLessThan(NOMES.length); expect(sw[i + 1]).toBe(0) }
    }
  })
  it('as peças de uma ficha, só pela máscara, são as mesmas do porFicha (o caminho do WebGL, com o skinIndex.y zerado)', () => {
    const mascaras = (g) => g.attributes.skinIndex.array.filter((_, i) => i % 4 === 1)
    fichas.forEach((f, k) => {
      const bit = 1 << kit.formaDe[k]
      const porMascara = PAPEIS_ATOR.reduce((s, p) => s + mascaras(kit.pecas[p]).filter((m) => m & bit).length, 0)
      const geos = kit.porFicha(k)
      const direto = PAPEIS_ATOR.reduce((s, p) => s + geos[p].attributes.position.count, 0) - PAPEIS_ATOR.filter((p) => geos[p].attributes.position.count === 3).length * 3
      expect(direto).toBe(porMascara)
      for (const p of PAPEIS_ATOR) expect(mascaras(geos[p]).every((m) => m === 0)).toBe(true)
      expect(porMascara).toBeGreaterThan(1000) // cabeça, tronco, braços, pernas
    })
  })
  it('a máscara cabe em 15 bits (o WebGPU lê o skinIndex com sinal)', () => {
    expect(kit.formas).toBeLessThanOrEqual(15)
    for (const p of PAPEIS_ATOR) for (let i = 1; i < kit.pecas[p].attributes.skinIndex.array.length; i += 4) expect(kit.pecas[p].attributes.skinIndex.array[i]).toBeLessThan(32768)
  })
  it('a mulher de vestido tem saia e não tem calça; o homem de terno, o contrário', () => {
    const m = fichas.findIndex((f) => f.roupa === 'vestido')
    const h = fichas.findIndex((f) => f.roupa === 'terno')
    const n = (k, p) => kit.porFicha(k)[p].attributes.position.count
    expect(n(m, 'calca')).toBeLessThan(n(h, 'calca'))
  })
})
