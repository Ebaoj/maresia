// LOD de longe (27/10/2026, perf-governador): simplificação por grade, sombra leve, mancha das copas e LOD cópia a
// cópia nas células de muito longe.
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { simplificarPorGrade, registrarSombraLeve, instalarSombraLeve } from '../../src/render/simplificar.js'
import { MuitoLonge, LongeMascarado, LOD_MANCHA, LOD_COPIAS, definirMuitoLonge } from '../../src/mundo/muito-longe.js'

describe('simplificar por grade', () => {
  it('a esfera densa vira poucas dezenas de triângulos e guarda os atributos', () => {
    const g = new THREE.SphereGeometry(1, 64, 32)
    const s = simplificarPorGrade(g, 0.4)
    expect(s.userData.simplificada.de).toBeGreaterThan(3000)
    expect(s.userData.simplificada.para).toBeLessThan(400)
    expect(s.attributes.normal.count).toBe(s.attributes.position.count)
    expect(s.attributes.uv).toBeTruthy()
  })

  it('sombra leve: a geometria troca só durante o desenho das sombras', () => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32))
    m.castShadow = true
    new THREE.Scene().add(m)
    expect(registrarSombraLeve(m, 6)).toBe(true)
    const original = m.geometry
    let vista = null
    const r = { shadowMap: { render: () => { vista = m.geometry } } }
    instalarSombraLeve(r)
    r.shadowMap.render()
    expect(vista).toBe(m.userData.sombraLeve)
    expect(m.geometry).toBe(original)
  })
})

describe('células de muito longe', () => {
  const cena = () => new THREE.Scene()
  it('cópia a cópia: a grande fica cheia, a pequena simplificada, a minúscula sai; a junta só faz sombra', () => {
    definirMuitoLonge({ desempenho: { cortePx: 3, muitoLonge: true } })
    LOD_COPIAS.ligado = true
    const s = cena()
    const geo = new THREE.SphereGeometry(5, 64, 32) // peça de 10 m
    const mat = new THREE.MeshBasicMaterial()
    const ml = new MuitoLonge(s, { tam: 4000 })
    const xs = [150, 600, 9000] // ~70 px (cheia), ~17 px (simples), < 3 px (sai)
    for (const x of xs) {
      const im = new THREE.InstancedMesh(geo, mat, 1)
      im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 0, 0))
      im.castShadow = true
      s.add(im)
      ml.adicionar({ x, z: 0, r: 5, longe: [im], todas: [im], distancia: (c) => Math.abs(c.position.x - x) - 5, retomar: () => { im.visible = true } })
    }
    ml.montar()
    const cam = new THREE.PerspectiveCamera(50)
    ml.atualizar(cam, 10)
    const c = ml.lista.find((x) => x.familias.length)
    const f = c.familias[0]
    expect(f.cheia.count).toBe(1)
    expect(f.simples.count).toBe(1)
    expect(f.j.layers.isEnabled(0)).toBe(false) // a junta: só sombra
  })

  it('mancha: a copa pequena na tela vai para o elipsoide de 20 triângulos', () => {
    definirMuitoLonge({ desempenho: { cortePx: 3, muitoLonge: true } })
    LOD_MANCHA.ligado = true
    const s = cena()
    const geo = new THREE.SphereGeometry(4, 24, 12).translate(0, 6, 0)
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(0.5), 3))
    const mat = new THREE.MeshBasicMaterial()
    const mk = (x) => { const im = new THREE.InstancedMesh(geo, mat, 1); im.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x, 0, 0)); s.add(im); return im }
    const ma = new LongeMascarado()
    const u1 = { longe: [mk(100)] }, u2 = { longe: [mk(2500)] }
    ma.adicionar(u1); ma.adicionar(u2); ma.montar()
    const cam = new THREE.PerspectiveCamera(50)
    ma.atualizar(cam)
    ma.mostrar(u1, true); ma.mostrar(u2, true); ma.aplicar()
    const f = ma.familias[0]
    expect(f.malha.count).toBe(1)
    expect(f.mancha.count).toBe(1)
    expect(f.mancha.geometry.attributes.position.count / 3).toBe(20)
  })
})
