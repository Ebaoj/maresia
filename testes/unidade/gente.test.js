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

describe('a figura de perto e a de longe', () => {
  const { pe } = fichasDaCidade(criarAleatorio(808))
  it('a de longe tem menos de 40% dos triângulos da de perto, e a altura é a de gente', () => {
    for (const f of pe) {
      const { perto, longe } = figuraLod(f)
      expect(tris(longe)).toBeLessThan(tris(perto) * 0.4)
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
  it('põe cada pessoa na malha de perto ou na de longe pela distância da câmera, e some com a oculta', () => {
    const cena = new THREE.Scene()
    const md = criarMultidao(cena, new THREE.MeshBasicMaterial(), { nome: 'teste', lodPerto: 30, ate: 400 })
    const t = md.tipo({ perto: new THREE.BoxGeometry(), longe: new THREE.BoxGeometry() })
    const e = [0, 10, 50, 100].map((x) => md.adicionar(t, new THREE.Matrix4().makeTranslation(x, 0, 0)))
    md.montar()
    expect(t.perto.count + t.longe.count).toBe(4)
    md.atualizar(new THREE.Vector3(0, 0, 0))
    expect([t.perto.count, t.longe.count]).toEqual([2, 2])
    e[0].oculta = true
    md.sujar()
    md.atualizar(new THREE.Vector3(0, 0, 0))
    expect([t.perto.count, t.longe.count]).toEqual([1, 2])
    md.atualizar(new THREE.Vector3(100, 0, 0), true)
    expect([t.perto.count, t.longe.count]).toEqual([1, 2])
    expect(cena.children.filter((o) => o.name === 'teste')).toHaveLength(2) // perto e longe
    // além de `ate`, ninguém
    md.ate = 60
    md.atualizar(new THREE.Vector3(0, 0, 0))
    expect([t.perto.count, t.longe.count]).toEqual([1, 1])
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
