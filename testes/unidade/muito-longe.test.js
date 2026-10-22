// Desempenho do mapa grande (22/10/2026, docs/desempenho-22-10.md): a camada de muito longe junta as malhas de longe
// dos blocos de LOD numa malha por célula grande. Estes testes conferem o que não pode mudar: a malha junta tem as
// mesmas cópias (matriz e cor) que as de longe dos blocos; a célula só fecha com todas as unidades longe com folga e
// abre de novo no mesmo quadro em que alguma chega perto; desligada no painel, tudo volta ao LOD de sempre.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { MuitoLonge, LongeMascarado, definirMuitoLonge, juntarCopias } from '../../src/mundo/muito-longe.js'
import { criarAleatorio } from '../../src/utils.js'

function blocoDeCopias(geo, mat, x, z, n, rnd) {
  const im = new THREE.InstancedMesh(geo, mat, n)
  for (let i = 0; i < n; i++) {
    im.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + rnd.entre(0, 96), 0, z + rnd.entre(0, 96)))
    im.setColorAt(i, new THREE.Color().setHSL(rnd.proximo(), 0.5, 0.5))
  }
  im.computeBoundingSphere()
  im.castShadow = true
  im.name = 'teste-longe'
  return im
}

function montar() {
  const rnd = criarAleatorio(22)
  const cena = new THREE.Scene()
  const geo = new THREE.BoxGeometry()
  const mat = new THREE.MeshBasicMaterial()
  const unidades = []
  // 4 x 4 blocos de 96 m numa célula de 768 m (de 0 a 384 m) e 2 blocos noutra
  const posicoes = []
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) posicoes.push([i * 96, j * 96])
  posicoes.push([800, 0], [896, 0])
  for (const [x, z] of posicoes) {
    const longe = blocoDeCopias(geo, mat, x, z, 5, rnd)
    const perto = blocoDeCopias(geo, mat, x, z, 5, rnd)
    cena.add(longe, perto)
    const u = { x: x + 48, z: z + 48, r: 68, longe: [longe], todas: [perto, longe], estado: null }
    u.distancia = (camera) => Math.hypot(camera.position.x - u.x, camera.position.z - u.z) - u.r
    u.retomar = () => { u.estado = null }
    unidades.push(u)
  }
  const ml = new MuitoLonge(cena, { tam: 768, folga: 40 })
  for (const u of unidades) ml.adicionar(u)
  ml.montar()
  return { cena, ml, unidades }
}

const copias = (malhas) => malhas.flatMap((im) => Array.from({ length: im.count }, (_, j) => {
  const m = new THREE.Matrix4(); const c = new THREE.Color()
  im.getMatrixAt(j, m); im.getColorAt(j, c)
  return `${m.elements[12].toFixed(3)},${m.elements[14].toFixed(3)}:${c.getHexString()}`
})).sort()

describe('camada de muito longe', () => {
  it('a malha junta tem exatamente as cópias de longe das unidades', () => {
    const { ml } = montar()
    for (const c of ml.lista) {
      if (!c.malhas.length) continue
      expect(copias(c.malhas)).toEqual(copias(c.unidades.flatMap((u) => u.longe)))
    }
    expect(ml.lista.filter((c) => c.malhas.length).length).toBe(2)
  })

  it('fecha só com todas longe e com folga; abre no mesmo quadro em que uma chega perto', () => {
    definirMuitoLonge({ desempenho: { muitoLonge: true } })
    const { ml } = montar()
    const camera = new THREE.PerspectiveCamera()
    const c0 = ml.lista[0]
    const limite = 100
    // a unidade mais perto a 100 + 30 m: ainda aberta (precisa de 40 de folga)
    camera.position.set(-68 - 30 - 100 + 48 - 48, 2, 48)
    // u(0,0) fica em x = 48: distância = 48 - x - 68
    camera.position.x = 48 - 68 - (limite + 30)
    ml.atualizar(camera, limite)
    expect(c0.junta).toBe(false)
    camera.position.x = 48 - 68 - (limite + 45)
    ml.atualizar(camera, limite)
    expect(c0.junta).toBe(true)
    expect(c0.malhas.every((m) => m.visible)).toBe(true)
    expect(c0.unidades.every((u) => u.suspenso && u.todas.every((m) => !m.visible))).toBe(true)
    // volta a 100 + 25: fica fechada (abre na metade da folga, 20 m)
    camera.position.x = 48 - 68 - (limite + 25)
    ml.atualizar(camera, limite)
    expect(c0.junta).toBe(true)
    // a 100 + 15: abre, e as unidades voltam ao LOD de sempre
    camera.position.x = 48 - 68 - (limite + 15)
    ml.atualizar(camera, limite)
    expect(c0.junta).toBe(false)
    expect(c0.malhas.every((m) => !m.visible)).toBe(true)
    expect(c0.unidades.every((u) => !u.suspenso)).toBe(true)
  })

  it('desligada no painel, toda célula abre', () => {
    const cfg = { desempenho: { muitoLonge: true } }
    definirMuitoLonge(cfg)
    const { ml } = montar()
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(-5000, 2, -5000)
    ml.atualizar(camera, 100)
    expect(ml.lista.every((c) => !c.malhas.length || c.junta)).toBe(true)
    cfg.desempenho.muitoLonge = false
    ml.atualizar(camera, 100)
    expect(ml.lista.every((c) => !c.junta)).toBe(true)
    definirMuitoLonge({ desempenho: { muitoLonge: true } })
  })

  it('juntar cópias guarda a ordem e a cor, e copia sombra e nome', () => {
    const rnd = criarAleatorio(7)
    const geo = new THREE.BoxGeometry()
    const mat = new THREE.MeshBasicMaterial()
    const a = blocoDeCopias(geo, mat, 0, 0, 3, rnd)
    const b = blocoDeCopias(geo, mat, 100, 0, 4, rnd)
    const j = juntarCopias([a, b], 'x-muito-longe')
    expect(j.count).toBe(7)
    expect(copias([j])).toEqual(copias([a, b]))
    expect(j.castShadow).toBe(true)
    expect(j.name).toBe('x-muito-longe')
    expect(j.userData.muitoLonge).toBe(true)
  })
})

// a versão de longe mascarada (árvores e palhoças): uma malha por forma para o mapa todo
describe('longe mascarado', () => {
  const visiveis = (malhas) => malhas.flatMap((im) => Array.from({ length: im.count }, (_, j) => {
    const m = new THREE.Matrix4(); const c = new THREE.Color()
    im.getMatrixAt(j, m); im.getColorAt(j, c)
    if (m.elements[0] === 0 && m.elements[5] === 0 && m.elements[10] === 0) return null
    return `${m.elements[12].toFixed(3)},${m.elements[14].toFixed(3)}:${c.getHexString()}`
  })).filter(Boolean).sort()

  function cenario() {
    definirMuitoLonge({ desempenho: { muitoLonge: true } })
    const rnd = criarAleatorio(5)
    const cena = new THREE.Scene()
    const mat = new THREE.MeshBasicMaterial()
    const formas = [new THREE.BoxGeometry(), new THREE.SphereGeometry(), new THREE.ConeGeometry()]
    const unidades = []
    for (let i = 0; i < 12; i++) {
      const longe = blocoDeCopias(formas[i % 3], mat, rnd.entre(0, 3000), rnd.entre(0, 2000), 3, rnd)
      longe.visible = false
      cena.add(longe)
      unidades.push({ longe: [longe] })
    }
    const ml = new LongeMascarado()
    for (const u of unidades) ml.adicionar(u)
    ml.montar()
    ml.atualizar()
    return { ml, unidades }
  }

  it('uma malha por forma; mostra exatamente as cópias das unidades longe, e só elas passam pelo desenho', () => {
    const { ml, unidades } = cenario()
    expect(ml.malhas.length).toBe(3)
    expect(visiveis(ml.malhas)).toEqual([])
    const longe = unidades.filter((_, i) => i % 4 !== 1)
    for (const u of unidades) ml.mostrar(u, longe.includes(u))
    ml.aplicar()
    expect(visiveis(ml.malhas)).toEqual(copias(longe.flatMap((u) => u.longe)))
    expect(ml.malhas.reduce((n, m) => n + m.count, 0)).toBe(longe.length * 3)
    // as originais nunca mais aparecem
    expect(unidades.every((u) => u.longe.every((m) => !m.visible))).toBe(true)
    // volta uma para perto
    ml.mostrar(longe[0], false)
    ml.aplicar()
    expect(visiveis(ml.malhas)).toEqual(copias(longe.slice(1).flatMap((u) => u.longe)))
  })

  it('desligada no painel, as malhas de sempre voltam no estado de cada unidade', () => {
    const { ml, unidades } = cenario()
    ml.mostrar(unidades[0], true)
    ml.aplicar()
    const cfg = { desempenho: { muitoLonge: false } }
    definirMuitoLonge(cfg)
    ml.atualizar()
    expect(ml.malhas.every((m) => !m.visible)).toBe(true)
    expect(unidades[0].longe[0].visible).toBe(true)
    expect(unidades[1].longe[0].visible).toBe(false)
    ml.mostrar(unidades[1], true)
    expect(unidades[1].longe[0].visible).toBe(true)
    cfg.desempenho.muitoLonge = true
    ml.atualizar()
    expect(unidades.every((u) => u.longe.every((m) => !m.visible))).toBe(true)
    expect(visiveis(ml.malhas)).toEqual(copias([unidades[0].longe[0], unidades[1].longe[0]]))
  })
})
