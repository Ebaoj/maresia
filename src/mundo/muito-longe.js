// Camada de muito longe (22/10/2026, docs/desempenho-22-10.md).
//
// Os sistemas com LOD por bloco (terreno, casario, palhoças, árvores) trocam perto e longe bloco a bloco, com blocos de
// 96 a 768 m: de longe sobra um objeto por bloco e por peça. Com o mapa 2,5 vezes maior (o Campo do Urubu em 1:1) eram
// ~700 objetos de longe por quadro na vista da Coluna da Hora, e no WebGPU do three cada objeto custa CPU por quadro.
//
// Aqui os blocos de LOD de um sistema (as "unidades") se juntam em células grandes (cfg.desempenho.muitoLongeTam).
// Quando todas as unidades de uma célula estão longe com folga, a célula troca as malhas de longe delas por uma malha só
// por peça: as mesmas cópias, a mesma geometria e o mesmo material, então o desenho é o mesmo. As unidades ficam
// suspensas (o laço de LOD delas pula). Chegando perto de qualquer unidade, a célula se abre e cada unidade volta ao
// LOD de sempre no mesmo quadro.
//
// Unidade: { x, z, r, longe: [malhas de longe], todas: [todas as malhas dela], distancia(camera), retomar() }
// - (x, z, r): círculo no chão tal que distancia(camera) >= dist2D(camera, (x, z)) - r (a conta rápida da célula);
// - distancia(camera): a mesma medida que o sistema compara com o limite dele;
// - retomar(): volta a unidade ao estado "longe" (a malha de longe à vista) e obriga o laço do sistema a decidir de novo.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { congelar } from './congelar.js'
import { registrarEstatico } from '../render/sombra-estatica.js'

// cfg.desempenho.muitoLonge (liga e desliga ao vivo) e muitoLongeTam (lado da célula, recarregar)
let CFG = null
let TAM = 768
export function definirMuitoLonge(cfg) { CFG = cfg; TAM = cfg?.desempenho?.muitoLongeTam ?? TAM }
const ligado = () => CFG?.desempenho?.muitoLonge !== false

const _m = new THREE.Matrix4()
const _c = new THREE.Color()

// várias InstancedMesh da mesma geometria e material numa só, cópias na mesma ordem
export function juntarCopias(malhas, nome) {
  const total = malhas.reduce((s, im) => s + im.count, 0)
  const base = malhas[0]
  const im = new THREE.InstancedMesh(base.geometry, base.material, total)
  const comCor = malhas.some((x) => x.instanceColor)
  let k = 0
  for (const x of malhas) {
    for (let j = 0; j < x.count; j++, k++) {
      x.getMatrixAt(j, _m)
      im.setMatrixAt(k, _m)
      if (comCor) im.setColorAt(k, x.instanceColor ? (x.getColorAt(j, _c), _c) : _c.setRGB(1, 1, 1))
    }
  }
  copiarJeito(base, im, nome)
  return im
}

// várias Mesh do mesmo material (pedaços de terreno) numa geometria só
export function juntarMalhas(malhas, nome) {
  const geos = malhas.map((x) => x.geometry.clone().applyMatrix4(x.matrixWorld))
  const g = mergeGeometries(geos)
  for (const x of geos) x.dispose()
  const m = new THREE.Mesh(g, malhas[0].material)
  copiarJeito(malhas[0], m, nome)
  return m
}

function copiarJeito(de, para, nome) {
  para.name = nome
  para.castShadow = de.castShadow
  para.receiveShadow = de.receiveShadow
  para.renderOrder = de.renderOrder
  para.frustumCulled = de.frustumCulled
  for (const k of ['peso', 'semNormal']) if (de.userData[k] !== undefined) para.userData[k] = de.userData[k]
  para.userData.muitoLonge = true
  para.computeBoundingSphere?.()
  if (!para.isInstancedMesh) para.geometry.computeBoundingSphere()
}

export class MuitoLonge {
  // folga: quanto além do limite do sistema a unidade mais perto precisa estar para a célula se fechar (abre na metade)
  constructor(cena, { nome = 'muito-longe', folga = 40, tam = null } = {}) {
    this.cena = cena
    this.nome = nome
    this.folga = folga
    this.tam = tam ?? TAM
    this.celulas = new Map()
    this.lista = []
    this.montada = false
  }

  adicionar(u) {
    u.suspenso = false
    const ci = Math.floor(u.x / this.tam)
    const cj = Math.floor(u.z / this.tam)
    const k = `${ci},${cj}`
    let c = this.celulas.get(k)
    if (!c) { c = { k, unidades: [], malhas: [], junta: false, x: 0, z: 0, r: 0 }; this.celulas.set(k, c); this.lista.push(c) }
    c.unidades.push(u)
  }

  // as malhas juntas de cada célula (uma por geometria e material das malhas de longe), escondidas até a célula fechar
  montar() {
    for (const c of this.lista) {
      c.x = c.unidades.reduce((s, u) => s + u.x, 0) / c.unidades.length
      c.z = c.unidades.reduce((s, u) => s + u.z, 0) / c.unidades.length
      c.r = Math.max(...c.unidades.map((u) => Math.hypot(u.x - c.x, u.z - c.z) + u.r))
      // célula de uma unidade só não ganha nada
      if (c.unidades.length < 2) continue
      const familias = new Map()
      for (const u of c.unidades) {
        for (const m of u.longe) {
          const chave = (m.isInstancedMesh ? m.geometry.uuid : 'malha') + ':' + m.material.uuid
          if (!familias.has(chave)) familias.set(chave, [])
          familias.get(chave).push(m)
        }
      }
      for (const lista of familias.values()) {
        const nome = `${lista[0].name}-muito-longe`
        const j = lista[0].isInstancedMesh ? juntarCopias(lista, nome) : juntarMalhas(lista, nome)
        j.visible = false
        ;(lista[0].parent || this.cena).add(congelar(j))
        if (j.castShadow) registrarEstatico(j)
        c.malhas.push(j)
      }
    }
    this.montada = true
    return this
  }

  // chamada todo quadro, antes do laço de LOD do sistema; limite = a distância em que o sistema troca perto e longe
  atualizar(camera, limite) {
    if (!this.montada) return
    const px = camera.position.x
    const pz = camera.position.z
    const abrirTodas = !ligado()
    for (const c of this.lista) {
      if (!c.malhas.length) continue
      let junta
      if (abrirTodas) junta = false
      else {
        const corte = limite + (c.junta ? this.folga / 2 : this.folga)
        if (Math.hypot(px - c.x, pz - c.z) - c.r > corte) junta = true
        else {
          junta = true
          for (const u of c.unidades) if (u.distancia(camera) <= corte) { junta = false; break }
        }
      }
      if (junta === c.junta) continue
      c.junta = junta
      for (const m of c.malhas) m.visible = junta
      for (const u of c.unidades) {
        u.suspenso = junta
        if (junta) for (const m of u.todas) m.visible = false
        else u.retomar()
      }
    }
  }

  stats() {
    let juntas = 0, suspensas = 0
    for (const c of this.lista) if (c.junta) { juntas++; suspensas += c.unidades.length }
    return { celulas: this.lista.length, juntas, unidadesSuspensas: suspensas }
  }
}
