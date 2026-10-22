// Desempenho do mapa grande (22/10/2026, docs/desempenho-22-10.md): o chão solto punha 5.854 blocos na cena (434 mil
// pedras e 96 mil touceiras no mapa de 4,9 x 3,2 km) para mostrar uns 10 perto da câmera, e cada objeto da cena custa
// CPU por quadro mesmo escondido. Agora só as células perto da câmera viram objeto. Estes testes pegam a volta do
// mapa inteiro na cena (o primeiro falha no código de antes, 53ff6f0, que punha todos os blocos na cena) e conferem que quem aparece é
// exatamente quem aparecia (a esfera do bloco a menos de cfg.chao.soltoRaio da câmera).
import { beforeAll, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { criarChaoSolto, celulasEmVolta } from '../../src/mundo/chao-solto.js'
import { instanciarEmBlocos } from '../../src/mundo/blocos.js'
import { criarAleatorio } from '../../src/utils.js'

const cfg = { chao: { solto: true, soltoRaio: 40, soltoDensidade: 1 } }
let cena, chao, antigos

beforeAll(() => {
  globalThis.window ||= {}
  // o sorteio do jogo depende do terreno montado (criarTerreno, com materiais): aqui, pedras e touceiras espalhadas
  // com a mesma densidade desigual do mapa (ruas cheias, campo ralo), num mapa de 1,5 x 1 km
  const rnd = criarAleatorio(1881)
  const pedras = [], coresPedra = [], tufos = [], coresTufo = []
  for (let i = 0; i < 60000; i++) {
    const rua = rnd.chance(0.7)
    const x = rua ? Math.round(rnd.entre(-700, 800) / 40) * 40 + rnd.entre(-4, 4) : rnd.entre(-700, 800)
    const z = rnd.entre(-400, 600)
    const r = rnd.entre(0.02, 0.13)
    pedras.push(new THREE.Matrix4().compose(new THREE.Vector3(x, rnd.entre(0, 6), z), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.5, r)))
    coresPedra.push('#a08060')
    if (rnd.chance(0.2)) { tufos.push(new THREE.Matrix4().makeTranslation(x + 1, 0, z)); coresTufo.push('#909070') }
  }
  cena = new THREE.Scene()
  chao = criarChaoSolto(cena, cfg, { pedras, coresPedra, tufos, coresTufo })
  // o jeito de antes: todos os blocos de 64 m (sem junção), a visibilidade pela esfera
  const fora = new THREE.Scene()
  const mat = new THREE.MeshBasicMaterial()
  antigos = [
    ...instanciarEmBlocos(fora, chao.geometrias[0], mat, pedras, coresPedra, { tam: 64, nome: 'chao-solto-pedras', sombra: false }),
    ...instanciarEmBlocos(fora, chao.geometrias[1], mat, tufos, coresTufo, { tam: 64, nome: 'chao-solto-touceiras', sombra: false }),
  ]
})

const chave = (b) => {
  const m = new THREE.Matrix4()
  b.getMatrixAt(0, m)
  return `${b.name}:${b.count}:${m.elements[12].toFixed(2)},${m.elements[14].toFixed(2)}`
}

describe('chão solto só perto da câmera', () => {
  it('a cena guarda poucos blocos, em qualquer lugar do mapa (eram 5.854)', () => {
    const rnd = criarAleatorio(22)
    const camera = new THREE.PerspectiveCamera()
    let pior = 0
    for (let i = 0; i < 60; i++) {
      camera.position.set(rnd.entre(-700, 800), rnd.entre(1, 12), rnd.entre(-400, 600))
      chao.atualizar(camera)
      const n = cena.children.filter((o) => o.name.startsWith('chao-solto')).length
      pior = Math.max(pior, n)
    }
    // faixa de raio + 64 m: no máximo 5 x 5 células, dois tipos, mais o bloco fixo de cada tipo
    expect(pior).toBeLessThanOrEqual(5 * 5 * 2 + 2)
  })

  it('aparece exatamente o que aparecia antes (a esfera do bloco a menos do raio)', () => {
    const camera = new THREE.PerspectiveCamera()
    const c = new THREE.Vector3()
    const rnd = criarAleatorio(1932)
    let conferidos = 0
    for (let i = 0; i < 400 && conferidos < 40; i++) {
      // perto de alguma pedra, para o teste não ficar só em lugar vazio
      const b = antigos[Math.floor(rnd.proximo() * antigos.length)]
      const s = b.boundingSphere
      camera.position.set(s.center.x + rnd.entre(-60, 60), rnd.entre(1, 10), s.center.z + rnd.entre(-60, 60))
      chao.atualizar(camera)
      const antes = new Set(antigos.filter((a) => c.copy(a.boundingSphere.center).distanceTo(camera.position) - a.boundingSphere.radius < 40).map(chave))
      const agora = new Set(cena.children.filter((o) => o.name.startsWith('chao-solto') && o.visible).map(chave))
      expect([...agora].sort()).toEqual([...antes].sort())
      if (antes.size) conferidos++
    }
    expect(conferidos).toBeGreaterThan(20)
  })

  it('o teste de cima pega o jeito de antes (a chave chaoSoltoPerto desligada põe todos os blocos na cena)', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 3, 0)
    cfg.desempenho = { chaoSoltoPerto: false }
    chao.atualizar(camera)
    const n = cena.children.filter((o) => o.name.startsWith('chao-solto')).length
    cfg.desempenho.chaoSoltoPerto = true
    chao.atualizar(camera)
    expect(n).toBe(antigos.length)
    expect(n).toBeGreaterThan(5 * 5 * 2 + 2)
    expect(cena.children.filter((o) => o.name.startsWith('chao-solto')).length).toBeLessThanOrEqual(5 * 5 * 2 + 2)
  })

  it('desligado no painel, nada aparece', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 3, 0)
    cfg.chao.solto = false
    chao.atualizar(camera)
    cfg.chao.solto = true
    expect(cena.children.filter((o) => o.name.startsWith('chao-solto') && o.visible)).toEqual([])
  })

  it('as células em volta cobrem o quadrado pedido', () => {
    expect(celulasEmVolta(10, 10, 64, 64).length).toBe(9)
    expect(celulasEmVolta(-1, -1, 1, 64).sort()).toEqual(['-1,-1', '-1,0', '0,-1', '0,0'].sort())
  })
})
