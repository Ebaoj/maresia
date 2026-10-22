// O Campo do Urubu em 1932: monta no mundo o que a planta (urubu-planta.js) diz.
//
// Fato e hipótese: ver o cabeçalho de urubu-planta.js (o que tem fonte e o que é reconstituição) e
// docs/mapa-1932.md. O tom (docs/direcao-de-arte.md, seção 6 e tabela de riscos): o campo aparece pelo
// cuidado e pelo trabalho, nunca como espetáculo; a cerca e o soldado existem e não são o centro do quadro.
//
// Custo (o mundo já é limitado pelo processador): tudo o que é parado e único (galpões, cozinha, cerca, linha)
// vira UMA malha por bloco de 96 m; o que se repete (redes, trouxas, potes, gente) vai em cópias por bloco
// (instanciarEmBlocos). Peças: urubu-galpao.js (galpão e rede), urubu-pecas.js (cozinha, pipa, guarita,
// registro, posto, capela, latrinas), urubu-linha.js (cerca e trilho), urubu-tarefas.js (as tarefas de terra).

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { toonVertice } from '../materiais.js'
import { instanciarEmBlocos, TAM_LOD } from './blocos.js'
import { adicionarCaixa, adicionarCirculo } from './colisao.js'
import { alturaTerreno, materialChao } from './terreno.js'
import { congelar } from './congelar.js'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { criarAleatorio } from '../utils.js'
import { CAMPO_URUBU, llInverso } from './mapa1932.js'
import { ll } from './fortaleza1932.js'
import { colorir } from './cenografia.js'
import { geometriaPote, geometriaVaral } from './pecas-vida1932.js'
import { PADRAO } from '../config.js'
import { criarPlanta, noNucleo } from './urubu-planta.js'
import { geometriaGalpao, geometriaRede, vagasDeRede, CORES_REDE } from './urubu-galpao.js'
import { geometriaCozinha, geometriaPipa, geometriaLata, geometriaTrouxa, geometriaGuarita, geometriaPorteira, geometriaRegistro, geometriaCasinha, geometriaLatrinas } from './urubu-pecas.js'
import { pecasCerca, pecasTrilho, geometriaVagao } from './urubu-linha.js'
import { geometriaCercaTarefa, chaoDaTarefa } from './urubu-tarefas.js'

// quantos metros de verdade vale uma unidade de jogo aqui (desde 21/10/2026 o campo é 1:1)
export function escalaNoCampo (x, z) {
  const [lon, lat] = llInverso(x, z)
  const [x2] = ll(lon + 0.001, lat)
  const [, z2] = ll(lon, lat + 0.001)
  const porGrauX = Math.abs(x2 - x) / 0.001
  const porGrauZ = Math.abs(z2 - z) / 0.001
  return {
    x: (111320 * Math.cos((lat * Math.PI) / 180)) / porGrauX,
    z: 110574 / porGrauZ,
  }
}

const um = new THREE.Vector3(1, 1, 1)
const eixoY = new THREE.Vector3(0, 1, 0)
const quat = new THREE.Quaternion()
export const matriz = (x, y, z, yaw = 0, escala = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), quat.setFromAxisAngle(eixoY, yaw), escala === 1 ? um : new THREE.Vector3(escala, escala, escala))

// junta as peças paradas (geometria já no lugar do mundo) numa malha por bloco: um objeto por bloco, não um por peça
function juntarPorBloco (cena, pecas, material, nome, tam = TAM_LOD) {
  const grupos = new Map()
  for (const p of pecas) {
    const k = `${Math.floor(p.x / tam)},${Math.floor(p.z / tam)}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(p.geo)
  }
  const malhas = []
  for (const geos of grupos.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos), material)
    m.geometry.computeBoundingSphere()
    m.castShadow = true
    m.receiveShadow = true
    m.name = nome
    registrarEstatico(m)
    cena.add(congelar(m))
    malhas.push(m)
  }
  return malhas
}

// a altura do pé de uma peça retangular: a média dos cantos (os esteios entram 0,8 m no chão)
function alturaMedia (q, cu, cw, l, p) {
  let s = 0
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) s += alturaTerreno(...q.mundo(cu + (a * l) / 2, cw + (b * p) / 2))
  return s / 5
}

// cfg: o config do jogo (o painel mexe nele; vale ao recarregar). Sem ele, o padrão
export function criarUrubu1932 (cena, cfgJogo = null) {
  const cfg = { ...PADRAO.mundo.urubu, ...(cfgJogo?.mundo?.urubu || {}) }
  const planta = criarPlanta(cfg)
  const q = planta.quadro
  const rnd = criarAleatorio(1932)
  const mat = toonVertice()
  const matPano = toonVertice({ side: THREE.DoubleSide })
  const obra = [] // peças paradas, no lugar do mundo
  const poe = (geo, x, y, z, yaw = q.rot) => { obra.push({ geo: geo.applyMatrix4(matriz(x, y, z, yaw)), x, z }) }

  // ---- os galpões ----
  const L = cfg.galpaoComprimento
  const P = cfg.galpaoLargura
  const modelos = new Map()
  const modelo = (tipo, var_) => {
    const k = `${tipo}:${var_}`
    if (!modelos.has(k)) modelos.set(k, geometriaGalpao(L, P, cfg.alturaBeiral, cfg.alturaGalpao, tipo, cfg.ferrugem, 31 + var_ * 7 + tipo.length))
    return modelos.get(k)
  }
  const vagas = vagasDeRede(L, P, cfg.redePasso)
  const redes = { aberta: [], ocupada: [], enrolada: [] }
  const coresRede = { aberta: [], ocupada: [], enrolada: [] }
  const trouxas = []
  const coresTrouxa = []
  const potes = []
  const latas = []
  const varais = []
  for (const g of planta.galpoes) {
    const base = alturaMedia(q, g.u, g.w, L, P)
    g.y = base
    poe(modelo(g.tipo, planta.galpoes.indexOf(g) % 3).clone(), g.x, base, g.z)
    // os esteios barram o passo (a colisão é 2D); as paredes de tábua, uma caixa por lado
    for (let lx = -L / 2; lx <= L / 2 + 0.01; lx += 4) {
      for (let lz = -P / 2; lz <= P / 2 + 0.01; lz += 4) adicionarCirculo(...q.mundo(g.u + lx, g.w + lz), 0.14)
    }
    adicionarCaixa(...q.mundo(g.u, g.w - P / 2 - 0.1), L / 2, 0.12, q.rot)
    if (g.tipo !== 'aberto') for (const lx of [-L / 2, L / 2]) adicionarCaixa(...q.mundo(g.u + lx, g.w), 0.12, P / 2, q.rot)
    else adicionarCaixa(...q.mundo(g.u - L / 2, g.w), 0.12, P / 2, q.rot)
    if (g.tipo === 'fechado') {
      adicionarCaixa(...q.mundo(g.u - L / 4 - 0.6, g.w + P / 2 + 0.1), L / 4 - 0.6, 0.12, q.rot)
      adicionarCaixa(...q.mundo(g.u + L / 4 + 0.6, g.w + P / 2 + 0.1), L / 4 - 0.6, 0.12, q.rot)
    }
    // as redes: de dia muitas saíram (para a fila, a turma, a água) e ficam vazias ou enroladas;
    // no galpão dos fundos ficam os doentes (conceito, ato 2)
    const ocupadas = g.tipo === 'fechado' ? 0.7 : cfg.redesOcupadasDia
    for (const v of vagas) {
      const r = rnd.proximo()
      const forma = r < ocupadas ? 'ocupada' : r < ocupadas + cfg.redesEnroladasDia ? 'enrolada' : 'aberta'
      const [x, z] = q.mundo(g.u + v.x, g.w + v.z)
      redes[forma].push(matriz(x, base, z, q.rot + rnd.entre(-0.04, 0.04)))
      coresRede[forma].push(rnd.chance(0.07) ? rnd.escolha(CORES_REDE.slice(-3)) : rnd.escolha(CORES_REDE.slice(0, -3)))
      // os pertences no chão, encostados na linha de esteios
      if (rnd.chance(0.42)) {
        const lado = rnd.chance(0.5) ? 1 : -1
        const [tx, tz] = q.mundo(g.u + v.x + rnd.entre(-0.3, 0.3), g.w + v.z + lado * rnd.entre(1.5, 1.85))
        trouxas.push(matriz(tx, alturaTerreno(tx, tz), tz, rnd.entre(0, 6.3), rnd.entre(0.8, 1.15)))
        coresTrouxa.push(rnd.escolha(CORES_REDE))
      }
      if (rnd.chance(0.07)) {
        const [px, pz] = q.mundo(g.u + v.x + 0.4, g.w + v.z + (rnd.chance(0.5) ? 1.8 : -1.8))
        potes.push(matriz(px, alturaTerreno(px, pz), pz, rnd.entre(0, 6.3)))
      }
      if (rnd.chance(0.05)) {
        const [px, pz] = q.mundo(g.u + v.x - 0.3, g.w + v.z + (rnd.chance(0.5) ? 1.7 : -1.7))
        latas.push(matriz(px, alturaTerreno(px, pz), pz, rnd.entre(0, 6.3)))
      }
    }
    // dois varais na rua da frente do galpão (a roupa de saco de mantimento lavada: o cuidado)
    for (const lu of [-L / 4, L / 4 + rnd.entre(-3, 3)]) {
      if (!rnd.chance(0.65)) continue
      const [vx, vz] = q.mundo(g.u + lu, g.w + P / 2 + 2.6)
      varais.push({ x: vx, z: vz })
    }
  }
  const coresVaral = [['#d9cbb0', '#cdbf9f', '#b0a48c'], ['#c2412d', '#e4dccb', '#9fa9b5'], ['#cdbf9f', '#a08968', '#e9dfcc'], ['#d6a64a', '#d9cbb0', '#8e8a7d']]
  const modelosVaral = coresVaral.map((c) => geometriaVaral(c))
  for (const v of varais) poe(rnd.escolha(modelosVaral).clone(), v.x, alturaTerreno(v.x, v.z), v.z, q.rot + rnd.entre(-0.05, 0.05))

  // ---- a cozinha ----
  const k = planta.cozinha
  const yK = alturaMedia(q, k.u, k.w, k.l, k.p)
  const fogosLocais = k.fogos.map((f) => [f.u - k.u, f.w - k.w])
  poe(geometriaCozinha(k.l, k.p, fogosLocais, [k.mesa.u - k.u, k.mesa.w - k.w]), k.x, yK, k.z)
  adicionarCaixa(...q.mundo(k.u - k.l / 2 - 0.1, k.w), 0.15, k.p / 2, q.rot)
  for (const f of k.fogos) adicionarCirculo(f.x, f.z, 0.75)
  adicionarCaixa(k.mesa.x, k.mesa.z, 0.45, 1.85, q.rot)
  // ---- a água ----
  const pipa = planta.agua.pipa
  poe(geometriaPipa(), pipa.x, alturaTerreno(pipa.x, pipa.z), pipa.z)
  adicionarCirculo(pipa.x, pipa.z, 0.85)
  for (const b of planta.agua.lavagem) latas.push(matriz(b.x + 0.5, alturaTerreno(b.x, b.z), b.z, rnd.entre(0, 6)))
  // ---- posto médico e capela ----
  for (const [c, tipo, h] of [[planta.posto, 'posto', 2.9], [planta.capela, 'capela', 3.4]]) {
    poe(geometriaCasinha(c.l, c.p, h, tipo), c.x, alturaMedia(q, c.u, c.w, c.l, c.p) - 0.1, c.z)
    adicionarCaixa(c.x, c.z, c.l / 2, c.p / 2, q.rot)
  }
  // ---- o portão, a guarita e o registro ----
  const pt = planta.portao
  poe(geometriaPorteira(pt.largura, true), pt.x, alturaTerreno(pt.x, pt.z), pt.z)
  const gu = planta.guarita
  poe(geometriaGuarita(gu.l, gu.p), gu.x, alturaTerreno(gu.x, gu.z) - 0.05, gu.z)
  adicionarCaixa(gu.x, gu.z, gu.l / 2, gu.p / 2, q.rot)
  const rg = planta.registro
  poe(geometriaRegistro(rg.l, rg.p), rg.x, alturaTerreno(rg.x, rg.z) - 0.03, rg.z)
  adicionarCaixa(rg.mesa.x, rg.mesa.z, 0.42, 0.78, q.rot)
  // ---- as latrinas, longe ----
  const lt = planta.latrinas
  if (lt) {
    poe(geometriaLatrinas(lt.l, lt.p, lt.cabines), lt.x, alturaTerreno(lt.x, lt.z) - 0.05, lt.z)
    adicionarCaixa(lt.x, lt.z, lt.l / 2, lt.p / 2, q.rot)
  }
  // ---- a cerca e a linha do trem ----
  const perto = (x, z) => noNucleo(planta, x, z, 30)
  obra.push(...pecasCerca(planta, { altura: cfg.alturaCerca, perto }))
  obra.push(...pecasTrilho(planta))
  const vg = planta.trilho.vagao
  poe(mergeGeometries(geometriaVagao()), vg.x, alturaTerreno(vg.x, vg.z) + 0.2, vg.z)
  adicionarCaixa(vg.x, vg.z, 3.7, 1.3, q.rot)

  const malhasObra = juntarPorBloco(cena, obra, mat, 'urubu-obra')

  // ---- as tarefas de terra que ficam fora do núcleo (terra trabalhada, como no conceito) ----
  const tarefas = cfg.tarefas ? CAMPO_URUBU.tarefas.filter((t) => !noNucleo(planta, t.ponto[0], t.ponto[1], Math.max(t.largura, t.profundidade) / 2 + 10)) : []
  if (tarefas.length) {
    const cercas = []
    const chaos = []
    let cx = 0
    let cz = 0
    for (const t of CAMPO_URUBU.tarefas) { cx += t.ponto[0] / CAMPO_URUBU.tarefas.length; cz += t.ponto[1] / CAMPO_URUBU.tarefas.length }
    for (const t of tarefas) {
      const [x, z] = t.ponto
      const ang = Math.atan2(x - cx, z - cz)
      cercas.push(matriz(x, alturaTerreno(x, z), z, ang))
      chaos.push(chaoDaTarefa(x, z, t.largura, t.profundidade, ang))
      const c = Math.cos(ang)
      const s = Math.sin(ang)
      const l = t.largura
      const p = t.profundidade
      for (const [lx, lz, hx, hz] of [[0, p / 2, l / 2, 0.3], [0, -p / 2, l / 2, 0.3], [l / 2, 0, 0.3, p / 2], [-l / 2, 0, 0.3, p / 2]]) {
        adicionarCaixa(x + lx * c + lz * s, z - lx * s + lz * c, hx, hz, ang)
      }
    }
    const t0 = tarefas[0]
    instanciarEmBlocos(cena, geometriaCercaTarefa(t0.largura, t0.profundidade, cfg.alturaCerca), mat, cercas, null, { nome: 'urubu-cercas' })
    const terra = new THREE.Mesh(mergeGeometries(chaos), materialChao() || mat)
    terra.name = 'urubu-terra'
    terra.receiveShadow = true
    cena.add(congelar(terra))
  }

  // ---- as cópias: redes, trouxas, potes, latas ----
  for (const forma of Object.keys(redes)) {
    instanciarEmBlocos(cena, geometriaRede(forma), matPano, redes[forma], coresRede[forma], { nome: `urubu-redes-${forma}` })
  }
  instanciarEmBlocos(cena, geometriaTrouxa(), mat, trouxas, coresTrouxa, { nome: 'urubu-trouxas' })
  instanciarEmBlocos(cena, geometriaPote(), mat, potes, null, { nome: 'urubu-potes' })
  instanciarEmBlocos(cena, geometriaLata(), mat, latas, null, { nome: 'urubu-latas' })

  // ---- a gente do campo (provisório: as figuras antigas, na fila da cozinha e da água) ----
  const roupas = ['#d9cbb0', '#a08968', '#b0a48c', '#9a9280']
  const figuras = roupas.map((roupa) => ({ geo: geometriaRetirante(roupa), lista: [] }))
  const filas = [...planta.cozinha.fila, ...planta.agua.fila]
  for (let i = 0; i < cfg.gente; i++) {
    const p = filas[i % filas.length]
    const off = Math.floor(i / filas.length) * 1.2
    const [x, z] = q.mundo(p.u + off, p.w)
    figuras[i % figuras.length].lista.push(matriz(x, alturaTerreno(x, z), z, q.rot + Math.PI))
  }
  for (const f of figuras) instanciarEmBlocos(cena, f.geo, mat, f.lista, null, { nome: 'urubu-gente' })

  return { centro: planta.cozinha ? [planta.cozinha.x, planta.cozinha.z] : planta.quadro.origem, planta, malhasObra }
}

// gente do campo (provisória): figura de caixas com chapéu de palha
function geometriaRetirante (roupa) {
  const partes = []
  const pele = '#b08968'
  const calca = '#8e8a7d'
  const cx = (l, a, p, x, y, z, cor) => partes.push(colorir(new THREE.BoxGeometry(l, a, p).translate(x, y, z), cor))
  cx(0.34, 0.72, 0.22, 0, 1.06, 0, roupa)
  cx(0.3, 0.28, 0.22, 0, 1.52, 0, pele)
  partes.push(colorir(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 8).translate(0, 1.72, 0), '#c8a86a'))
  for (const x of [-0.11, 0.11]) cx(0.12, 0.72, 0.14, x, 0.36, 0, calca)
  for (const x of [-0.24, 0.24]) cx(0.11, 0.6, 0.12, x, 1.08, 0, roupa)
  return mergeGeometries(partes)
}
