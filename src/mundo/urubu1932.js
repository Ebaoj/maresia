// O Campo do Urubu em 1932.
//
// A história está em docs/historia-urubu.md; as posições e os tamanhos das peças estão em
// src/mundo/mapa1932.js (dados com marca de confiança: o campo é H, hipótese, e a
// reconstituição vem do desenho v3).
//
// Aqui só a geometria: os galpões de folha de zinco, as 20 tarefas de terra cercadas com
// arame, a cozinha, o posto médico, a capela e o portão da triagem, mais a gente do campo.
//
// O tom (docs/direcao-de-arte.md): o campo aparece pelo cuidado, nunca como espetáculo.
// De longe se vê telhado de zinco e arame; de perto, a fila da cozinha e o trabalho na terra.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { toonVertice } from '../materiais.js'
import { instanciarEmBlocos } from './blocos.js'
import { adicionarCaixa } from './colisao.js'
import { alturaTerreno } from './terreno.js'
import { criarAleatorio } from '../utils.js'
import { CAMPO_URUBU, llInverso } from './mapa1932.js'
import { ll } from './fortaleza1932.js'
import { colorir } from './cenografia.js'
import { CAL } from '../paleta.js'
import { PADRAO } from '../config.js'

// zinco de folha: cinza desbotado, perto do cal da paleta
const ZINCO = '#c4c0b4'
const ZINCO_ESCURO = '#a29d90'
const ARAME = '#8a8578'
const TERRA = '#d3c19b'

// quantos metros de verdade vale uma unidade de jogo aqui (o mapa é comprimido)
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

// galpão de folha de zinco: paredes, telhado de duas águas, nervura da chapa e a porteira
function geometriaGalpao (l, p, altura) {
  const partes = []
  const nervura = 1.6
  const beira = p * 0.1
  const cumeeira = altura * 0.32
  const agua = Math.hypot(p / 2 + beira, cumeeira)
  const angulo = Math.atan2(cumeeira, p / 2 + beira)
  partes.push(colorir(new THREE.BoxGeometry(l, altura, p).translate(0, altura / 2, 0), ZINCO))
  partes.push(colorir(
    new THREE.BoxGeometry(l + 0.5, 0.14, agua).rotateX(-angulo).translate(0, altura + cumeeira / 2, (p / 2 + beira) / 2), ZINCO_ESCURO))
  partes.push(colorir(
    new THREE.BoxGeometry(l + 0.5, 0.14, agua).rotateX(angulo).translate(0, altura + cumeeira / 2, -(p / 2 + beira) / 2), ZINCO_ESCURO))
  // nervura da chapa nas paredes compridas
  for (let x = -l / 2 + 0.8; x < l / 2; x += nervura) {
    for (const z of [p / 2, -p / 2]) {
      partes.push(colorir(new THREE.BoxGeometry(0.1, altura - 0.2, 0.07).translate(x, (altura - 0.2) / 2, z), ZINCO_ESCURO))
    }
  }
  // porteira e janelas altas
  partes.push(colorir(new THREE.BoxGeometry(3, 3.4, 0.12).translate(0, 1.7, p / 2 + 0.02), CAL.mangue))
  for (const x of [-l / 3, l / 3]) {
    partes.push(colorir(new THREE.BoxGeometry(1.6, 1, 0.1).translate(x, altura * 0.62, p / 2 + 0.02), '#5a5952'))
  }
  return mergeGeometries(partes)
}

// cerca de arame da tarefa: postes de estaca e três fios, com o vão da porteira
function geometriaCerca (l, p, altura) {
  const partes = []
  const passo = 2.4
  const vao = 2.8
  const poste = (x, z) => partes.push(colorir(new THREE.BoxGeometry(0.16, altura + 0.7, 0.16).translate(x, (altura + 0.7) / 2 - 0.5, z), CAL.mangue))
  const fios = (x0, x1, z) => {
    for (const y of [0.5, 0.95, altura - 0.15]) {
      partes.push(colorir(new THREE.BoxGeometry(Math.abs(x1 - x0), 0.04, 0.04).translate((x0 + x1) / 2, y, z), ARAME))
    }
  }
  for (let x = -l / 2; x <= l / 2 + 0.01; x += passo) {
    if (Math.abs(x) > vao / 2) poste(x, p / 2)
    poste(x, -p / 2)
  }
  for (const z of [-p / 2, p / 2]) poste(l / 2, z)
  poste(-l / 2, -p / 2)
  poste(-l / 2, p / 2)
  fios(-l / 2, -vao / 2, p / 2)
  fios(vao / 2, l / 2, p / 2)
  fios(-l / 2, l / 2, -p / 2)
  // a porteira: dois postes mais altos e uma travessa
  for (const x of [-vao / 2, vao / 2]) poste(x, p / 2)
  partes.push(colorir(new THREE.BoxGeometry(vao, 0.12, 0.12).translate(0, altura - 0.3, p / 2), CAL.mangue))
  return mergeGeometries(partes)
}

// cozinha, posto médico e capela: cada um com a sua silhueta
function geometriaConstrucao (tipo, r) {
  const partes = []
  const l = r * 1.7
  const p = r * 1.3
  const h = tipo === 'capela' ? 3.6 : 3.1
  partes.push(colorir(new THREE.BoxGeometry(l, h, p).translate(0, h / 2, 0), CAL.cal))
  partes.push(colorir(new THREE.BoxGeometry(l + 0.4, 0.16, p + 0.4).translate(0, h + 0.08, 0), ZINCO_ESCURO))
  if (tipo === 'cozinha') {
    // chaminé da cozinha e a lenha ao lado
    partes.push(colorir(new THREE.BoxGeometry(0.8, 2.4, 0.8).translate(l / 2 - 0.9, h + 1.2, 0), CAL.mangue))
    for (let i = 0; i < 5; i++) {
      partes.push(colorir(new THREE.CylinderGeometry(0.14, 0.14, 1.6, 5).rotateZ(Math.PI / 2).translate(-l / 2 - 0.6, 0.2 + (i % 2) * 0.3, -0.4 + i * 0.22), CAL.palha))
    }
  }
  if (tipo === 'posto medico') {
    // cruz branca na fachada
    partes.push(colorir(new THREE.BoxGeometry(0.5, 1.6, 0.1).translate(0, h * 0.55, p / 2 + 0.03), CAL.cal))
    partes.push(colorir(new THREE.BoxGeometry(1.6, 0.5, 0.1).translate(0, h * 0.55, p / 2 + 0.03), CAL.cal))
  }
  if (tipo === 'capela') {
    // torre do sino e a cruz
    partes.push(colorir(new THREE.BoxGeometry(1.1, h + 1.8, 1.1).translate(l / 2 - 0.9, (h + 1.8) / 2, 0), CAL.cal))
    partes.push(colorir(new THREE.BoxGeometry(0.16, 1.1, 0.16).translate(l / 2 - 0.9, h + 2.6, 0), CAL.mangue))
    partes.push(colorir(new THREE.BoxGeometry(0.7, 0.16, 0.16).translate(l / 2 - 0.9, h + 2.85, 0), CAL.mangue))
  }
  return mergeGeometries(partes)
}

// gente do campo: magra, com chapéu de palha. A roupa é o que separa um do outro.
function geometriaRetirante (roupa) {
  const partes = []
  const pele = '#b08968'
  const calca = '#8e8a7d'
  partes.push(colorir(new THREE.BoxGeometry(0.34, 0.72, 0.22).translate(0, 1.06, 0), roupa))
  partes.push(colorir(new THREE.BoxGeometry(0.3, 0.28, 0.22).translate(0, 1.52, 0), pele))
  partes.push(colorir(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 8).translate(0, 1.72, 0), CAL.palha))
  for (const x of [-0.11, 0.11]) {
    partes.push(colorir(new THREE.BoxGeometry(0.12, 0.72, 0.14).translate(x, 0.36, 0), calca))
  }
  for (const x of [-0.24, 0.24]) {
    partes.push(colorir(new THREE.BoxGeometry(0.11, 0.6, 0.12).translate(x, 1.08, 0), roupa))
  }
  return mergeGeometries(partes)
}

// a terra batida da tarefa, seguindo o relevo
function chaoDaTarefa (x, z, l, p, ang, r) {
  const N = 6
  const M = 4
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const pos = []
  const idx = []
  for (let j = 0; j <= M; j++) {
    for (let i = 0; i <= N; i++) {
      const lx = (i / N - 0.5) * l
      const lz = (j / M - 0.5) * p
      const wx = x + lx * c + lz * s
      const wz = z - lx * s + lz * c
      pos.push(wx, alturaTerreno(wx, wz) + 0.09, wz)
    }
  }
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i
      idx.push(a, a + 1, a + N + 2, a, a + N + 2, a + N + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return colorir(g, TERRA)
}

// a cerca do campo: o arame de contorno, com o portão da triagem no lado da cidade
function cercaDoCampo (vertices, vao) {
  const partes = []
  for (let i = 0; i < vertices.length; i++) {
    const [x0, z0] = vertices[i]
    const [x1, z1] = vertices[(i + 1) % vertices.length]
    const dx = x1 - x0
    const dz = z1 - z0
    const comp = Math.hypot(dx, dz)
    const n = Math.max(2, Math.round(comp / 2.6))
    const ang = Math.atan2(dx, dz)
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    for (let k = 0; k <= n; k++) {
      if (i === vao.lado && k >= vao.de && k <= vao.ate) continue
      const t = k / n
      const px = x0 + dx * t
      const pz = z0 + dz * t
      const h = alturaTerreno(px, pz)
      partes.push(colorir(new THREE.BoxGeometry(0.16, 2.4, 0.16).translate(px, h + 0.8, pz), CAL.mangue))
    }
    // os fios, acompanhando o terreno (e sem cruzar a porteira)
    for (const alt of [0.5, 1.0, 1.6]) {
      const passos = Math.max(2, n)
      for (let k = 0; k < passos; k++) {
        const t0 = k / passos
        const t1 = (k + 1) / passos
        const meio = (t0 + t1) / 2
        if (i === vao.lado && meio * n >= vao.de && meio * n <= vao.ate) continue
        const mx = x0 + dx * (t0 + t1) / 2
        const mz = z0 + dz * (t0 + t1) / 2
        const h = alturaTerreno(mx, mz)
        const comp2 = Math.hypot(dx, dz) / passos
        partes.push(colorir(new THREE.BoxGeometry(comp2, 0.04, 0.04).rotateY(ang).translate(mx, h + alt, mz), ARAME))
      }
    }
  }
  return mergeGeometries(partes)
}

export function criarUrubu1932 (cena) {
  const cfg = PADRAO.mundo.urubu
  const rnd = criarAleatorio(1932)
  const mat = toonVertice()
  const um = new THREE.Vector3(1, 1, 1)
  const quat = new THREE.Quaternion()
  const eixoY = new THREE.Vector3(0, 1, 0)

  // o centro do campo: onde as tarefas se juntam
  let cx = 0
  let cz = 0
  for (const t of CAMPO_URUBU.tarefas) { cx += t.ponto[0]; cz += t.ponto[1] }
  cx /= CAMPO_URUBU.tarefas.length
  cz /= CAMPO_URUBU.tarefas.length
  const escala = escalaNoCampo(cx, cz)

  // ---- os galpões ----
  // os quatro têm a mesma medida, então a geometria é uma só, no tamanho de verdade
  const galpoes = []
  let gl = 0
  let gp = 0
  for (const g of CAMPO_URUBU.galpoes) {
    const [x, z] = g.ponto
    const l = g.largura / escala.x
    const p = g.profundidade / escala.z
    gl = l
    gp = p
    const h = alturaTerreno(x, z)
    quat.setFromAxisAngle(eixoY, 0)
    galpoes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.4, z), quat, um))
    adicionarCaixa(x, z, l / 2, p / 2, 0)
  }
  instanciarEmBlocos(cena, geometriaGalpao(gl, gp, cfg.alturaGalpao), mat, galpoes, null, { nome: 'urubu-galpoes' })

  // ---- as 20 tarefas: terra cercada com arame ----
  const cercas = []
  const chaos = []
  let tl = 0
  let tp = 0
  for (const t of CAMPO_URUBU.tarefas) {
    const [x, z] = t.ponto
    const l = t.largura / escala.x
    const p = t.profundidade / escala.z
    tl = l
    tp = p
    // a tarefa aponta para fora do centro do campo
    const ang = Math.atan2(x - cx, z - cz)
    const h = alturaTerreno(x, z)
    quat.setFromAxisAngle(eixoY, ang)
    cercas.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h, z), quat, um))
    chaos.push(chaoDaTarefa(x, z, l, p, ang, escala))
    // o arame barra: uma caixa por lado da tarefa
    const c = Math.cos(ang)
    const s = Math.sin(ang)
    for (const [lx, lz, hx, hz] of [[0, p / 2, l / 2, 0.3], [0, -p / 2, l / 2, 0.3], [l / 2, 0, 0.3, p / 2], [-l / 2, 0, 0.3, p / 2]]) {
      adicionarCaixa(x + lx * c + lz * s, z - lx * s + lz * c, hx, hz, ang)
    }
  }
  instanciarEmBlocos(cena, geometriaCerca(tl, tp, cfg.alturaCerca), mat, cercas, null, { nome: 'urubu-cercas' })
  // a terra das 20 tarefas é uma malha só, já no lugar do mundo
  instanciarEmBlocos(cena, mergeGeometries(chaos), mat, [new THREE.Matrix4()], null, { nome: 'urubu-terra' })

  // ---- cozinha, posto e capela ----
  for (const c of CAMPO_URUBU.construcoes) {
    const [x, z] = c.ponto
    const r = c.raio / escala.x
    const h = alturaTerreno(x, z)
    quat.setFromAxisAngle(eixoY, 0)
    const matriz = new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.2, z), quat, um)
    const geo = geometriaConstrucao(c.nome.split(' ')[0], r)
    instanciarEmBlocos(cena, geo, mat, [matriz], null, { nome: `urubu-${c.nome}` })
    adicionarCaixa(x, z, r * 0.9, r * 0.7, 0)
  }

  // ---- o portão da triagem e a casa da guarda ----
  const poligono = CAMPO_URUBU.poligono
  const cerca = cercaDoCampo(poligono, { lado: 2, de: 2, ate: 5 })
  instanciarEmBlocos(cena, cerca, mat, [new THREE.Matrix4()], null, { nome: 'urubu-cerca' })
  // a porteira fica no lado do campo que dá para a cidade
  const [gx0, gz0] = poligono[2]
  const [gx1, gz1] = poligono[3]
  const gx = (gx0 + gx1) / 2
  const gz = (gz0 + gz1) / 2
  const guarda = geometriaConstrucao('posto', 1.6)
  quat.setFromAxisAngle(eixoY, Math.atan2(gx1 - gx0, gz1 - gz0))
  instanciarEmBlocos(cena, guarda, mat, [new THREE.Matrix4().compose(new THREE.Vector3(gx, alturaTerreno(gx, gz) - 0.2, gz), quat, um)], null, { nome: 'urubu-guarda' })
  adicionarCaixa(gx, gz, 2.4, 1.6, 0)

  // ---- a gente do campo ----
  // a fila da cozinha, a fila do portão e quem trabalha na terra
  const roupas = [CAL.calVelha, CAL.piuba, '#b0a48c', '#9a9280']
  const figuras = roupas.map((roupa) => ({ geo: geometriaRetirante(roupa), lista: [] }))
  const cozinha = CAMPO_URUBU.construcoes.find((c) => c.nome.includes('cozinha'))
  const [kz, kzz] = cozinha ? cozinha.ponto : [cx, cz]
  const filaCozinha = Math.round(cfg.gente * 0.42)
  const filaPortao = Math.round(cfg.gente * 0.33)
  const noCampo = Math.max(0, cfg.gente - filaCozinha - filaPortao)
  for (let i = 0; i < filaCozinha; i++) {
    const t = figuras[i % figuras.length]
    const x = kz - 3.4 - i * 0.85
    const z = kzz + 2.6 + rnd.entre(-0.3, 0.3)
    quat.setFromAxisAngle(eixoY, Math.PI / 2 + rnd.entre(-0.2, 0.2))
    t.lista.push(new THREE.Matrix4().compose(new THREE.Vector3(x, alturaTerreno(x, z), z), quat, um))
  }
  for (let i = 0; i < filaPortao; i++) {
    const t = figuras[i % figuras.length]
    const x = gx + 2 + rnd.entre(-0.4, 0.4)
    const z = gz - 1.2 + i * 0.9
    quat.setFromAxisAngle(eixoY, Math.PI)
    t.lista.push(new THREE.Matrix4().compose(new THREE.Vector3(x, alturaTerreno(x, z), z), quat, um))
  }
  // quem trabalha nas tarefas
  for (let i = 0; i < noCampo; i++) {
    const t = figuras[i % figuras.length]
    const tarefa = CAMPO_URUBU.tarefas[Math.floor(rnd.entre(0, CAMPO_URUBU.tarefas.length))]
    const [tx, tz] = tarefa.ponto
    const x = tx + rnd.entre(-4, 4)
    const z = tz + rnd.entre(-3, 3)
    quat.setFromAxisAngle(eixoY, rnd.entre(0, Math.PI * 2))
    t.lista.push(new THREE.Matrix4().compose(new THREE.Vector3(x, alturaTerreno(x, z), z), quat, um))
  }
  for (const f of figuras) instanciarEmBlocos(cena, f.geo, mat, f.lista, null, { nome: 'urubu-gente' })

  return { centro: [cx, cz], escala, galpao: [gl, gp], tarefa: [tl, tp] }
}
