// O desenho dos bondes: o trilho no chao, as travessas e as paradas com o nome.
//
// O dado (o grafo das ruas e a rota de cada linha) esta em src/mundo/bondes.js.
// Aqui so entra geometria.
//
// O trilho e aco fino assentado no paralelepipedo, sobre travessas de madeira, e
// nao uma viga: a bitola e pequena, o topo do trilho e claro (o aco pegando a luz
// de cima) e as laterais ficam escuras. O letreiro da parada leva o nome do
// lugar em letra de epoca, num atlas: um desenho so para todas as placas.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { alturaTerreno } from './terreno.js'
import { toon, texturaCanvas } from '../materiais.js'
import { instanciarEmBlocos } from './blocos.js'
import { rotasDosBondes } from './bondes.js'
import { eraRua1932 } from './ocupacao1932.js'

// a bitola: a distancia entre os dois trilhos (uns 2 m no jogo, a compressao do
// mapa encolhe a rua mas nao o trilho)
const BITOLA = 0.7
// o trilho: a chapa de aco do trilho (7 cm de largura, 5 de altura)
const LARGURA_TRILHO = 0.07
const ALTURA_TRILHO = 0.05
// a travessa: a madeira sob o trilho (12 de altura, 25 de largura)
const ALTURA_TRAVESSA = 0.12
const LARGURA_TRAVESSA = 0.25
// o conjunto fica logo acima do calco (a grade do terreno, de 3 m, pode cortar o
// chao uns 15 cm: o trilho sobe o suficiente para nao sumir). O topo do aco fica
// 5 cm acima da travessa, senao o trilho some entre as madeiras.
const ALTURA_VIA = 0.19

// dois trilhos de aco assentados no paralelepipedo, no caminho da linha.
// A geometria e montada na mao (um quad no topo e dois de lado por trecho): uma
// BoxGeometry por trecho custava 178 mil vertices e 1 s de carga.
function geometriaTrilho(linhas) {
  const pos = []
  const idx = []
  let base = 0
  const quad = (a, b, c, d) => {
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2])
    idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
    base += 4
  }
  for (const pontos of linhas) {
    for (let i = 0; i < pontos.length - 1; i++) {
      const [x0, z0] = pontos[i]
      const [x1, z1] = pontos[i + 1]
      const dx = x1 - x0
      const dz = z1 - z0
      const comp = Math.hypot(dx, dz)
      if (comp < 0.01) continue
      const nx = -dz / comp
      const nz = dx / comp
      const y0 = alturaTerreno(x0, z0) + ALTURA_VIA
      const y1 = alturaTerreno(x1, z1) + ALTURA_VIA
      for (const lado of [-1, 1]) {
        const ox = (nx * BITOLA * lado) / 2
        const oz = (nz * BITOLA * lado) / 2
        const e = LARGURA_TRILHO / 2
        // o topo do trilho
        quad(
          [x0 + ox - nx * e, y0, z0 + oz - nz * e],
          [x1 + ox - nx * e, y1, z1 + oz - nz * e],
          [x1 + ox + nx * e, y1, z1 + oz + nz * e],
          [x0 + ox + nx * e, y0, z0 + oz + nz * e]
        )
        // as duas laterais, para o trilho ter volume de um ponto de vista baixo
        quad(
          [x0 + ox - nx * e, y0, z0 + oz - nz * e],
          [x1 + ox - nx * e, y1, z1 + oz - nz * e],
          [x1 + ox - nx * e, y1 - ALTURA_TRILHO, z1 + oz - nz * e],
          [x0 + ox - nx * e, y0 - ALTURA_TRILHO, z0 + oz - nz * e]
        )
        quad(
          [x0 + ox + nx * e, y0, z0 + oz + nz * e],
          [x0 + ox + nx * e, y0 - ALTURA_TRILHO, z0 + oz + nz * e],
          [x1 + ox + nx * e, y1 - ALTURA_TRILHO, z1 + oz + nz * e],
          [x1 + ox + nx * e, y1, z1 + oz + nz * e]
        )
      }
    }
  }
  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// as travessas de madeira: sem elas o trilho some de longe (7 cm de aco viram
// um pixel a 40 m)
function geometriaTravessa() {
  return new THREE.BoxGeometry(BITOLA + 0.5, ALTURA_TRAVESSA, LARGURA_TRAVESSA)
    .translate(0, ALTURA_TRAVESSA / 2, 0)
}

// a parada: um poste de madeira com a placa, no chao de paralelepipedo. O nome
// fica na face da placa (o letreiro e um atlas, montado a parte).
function geometriaParada() {
  const poste = new THREE.CylinderGeometry(0.07, 0.09, 2.3, 6).translate(0, 1.15, 0)
  const tabua = new THREE.BoxGeometry(1.15, 0.38, 0.05).translate(0, 2.05, 0)
  return mergeGeometries([poste, tabua])
}

// ---------- o letreiro ----------

// o atlas: uma faixa por nome, com a letra de epoca (serifada, em caixa alta e
// minuscula misturadas) num fundo creme. Uma textura so para todas as placas.
function atlasDosNomes(nomes) {
  const L = 64
  const W = 320
  const tex = texturaCanvas(W, L * nomes.length, (ctx) => {
    for (let i = 0; i < nomes.length; i++) {
      const y = i * L
      ctx.fillStyle = '#e9dcc0'
      ctx.fillRect(0, y, W, L)
      ctx.strokeStyle = '#3b3038'
      ctx.lineWidth = 4
      ctx.strokeRect(2, y + 2, W - 4, L - 4)
      ctx.fillStyle = '#2b2622'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      let fonte = 28
      ctx.font = `600 ${fonte}px Georgia, "Times New Roman", serif`
      while (ctx.measureText(nomes[i]).width > W - 40 && fonte > 12) {
        fonte -= 2
        ctx.font = `600 ${fonte}px Georgia, "Times New Roman", serif`
      }
      ctx.fillText(nomes[i], W / 2, y + L / 2 + 1)
    }
  }, { repetir: false })
  return tex
}

// a placa na calcada: dos dois lados da via, o que for rua de verdade (a planta de
// 1932 sabe o que era rua e o que era lote)
function ladoDaCalçada(x, z, direcao) {
  const candidatos = [
    [x + -direcao[1] * 1.6, z + direcao[0] * 1.6],
    [x + direcao[1] * 1.6, z - direcao[0] * 1.6],
  ]
  for (const c of candidatos) {
    if (eraRua1932(c[0], c[1])) return c
  }
  return candidatos[0]
}

// a placa fica na calcada, do lado da via, com o letreiro virado para a rua
// (paralelo a via: e assim que se le o nome de quem passa na rua)
function geometriaLetreiros(paradas, faixaDe) {
  const pos = []
  const uv = []
  const idx = []
  let base = 0
  const ALTO = 0.3
  const LARG = 1.05
  for (const p of paradas) {
    const [x, z] = p.ponto
    const [dx, dz] = p.direcao
    const [px, pz] = ladoDaCalçada(x, z, p.direcao)
    const y = alturaTerreno(px, pz) + 2.05
    // a placa e parallela a via: a largura vai no sentido da via, e a normal
    // aponta para a rua
    const ex = dx * (LARG / 2)
    const ez = dz * (LARG / 2)
    const nx = dz
    const nz = -dx
    const [v0, v1] = faixaDe(p.nome)
    for (const lado of [1, -1]) {
      // a face fica logo fora da tábua (a tábua tem 5 cm de espessura), senao a
      // letra fica enterrada dentro dela. O deslocamento vai no sentido da
      // normal da face.
      const off = 0.032 * lado
      const cx = px + nx * off
      const cz = pz + nz * off
      const a = [cx - ex, y - ALTO, cz - ez]
      const b = [cx + ex, y - ALTO, cz + ez]
      const c = [cx + ex, y + ALTO, cz + ez]
      const d = [cx - ex, y + ALTO, cz - ez]
      for (const q of lado === 1 ? [a, b, c, d] : [d, c, b, a]) pos.push(q[0], q[1], q[2])
      uv.push(0, v0, 1, v0, 1, v1, 0, v1)
      idx.push(base, base + 2, base + 1, base, base + 3, base + 2)
      base += 4
    }
  }
  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// ---------- o desenho ----------

export function criarBondes(cena) {
  const { linhas, paradas, relatorio } = rotasDosBondes()

  // as travessas de madeira, atravessadas na via
  const matrizesTravessa = []
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  for (const pontos of linhas) {
    for (let i = 0; i < pontos.length - 1; i++) {
      const [x0, z0] = pontos[i]
      const [x1, z1] = pontos[i + 1]
      const comp = Math.hypot(x1 - x0, z1 - z0)
      if (comp < 0.05) continue
      // a travessa e atravessada na via: o comprimento dela fica de um lado da
      // linha para o outro
      const ang = Math.atan2(x1 - x0, z1 - z0)
      q.setFromAxisAngle(Y, ang)
      for (let d = 0; d < comp; d += 0.45) {
        const t = d / comp
        const x = x0 + (x1 - x0) * t
        const z = z0 + (z1 - z0) * t
        matrizesTravessa.push(m4.clone().compose(
          new THREE.Vector3(x, alturaTerreno(x, z) + 0.02, z), q, new THREE.Vector3(1, 1, 1)
        ))
      }
    }
  }
  if (matrizesTravessa.length) {
    instanciarEmBlocos(cena, geometriaTravessa(), toon('#6b4f2f'), matrizesTravessa, null, { nome: 'travessas-bonde' })
  }

  // o trilho: aco fino, claro no topo
  const geo = geometriaTrilho(linhas)
  if (geo) {
    const malha = new THREE.Mesh(geo, toon('#a9a8a0', { side: THREE.DoubleSide }))
    malha.name = 'trilhos-bonde'
    malha.receiveShadow = true
    cena.add(malha)
  }

  // as paradas, cada uma no seu lugar
  if (paradas.length) {
    const matrizes = paradas.map(({ ponto: [x, z], direcao }) => {
      // na calçada, do lado que for rua de verdade
      const [px, pz] = ladoDaCalçada(x, z, direcao)
      const y = alturaTerreno(px, pz)
      // a placa e parallela a via, com o letreiro virado para a rua
      const ang = Math.atan2(-direcao[1], direcao[0])
      q.setFromAxisAngle(Y, ang)
      return m4.clone().compose(new THREE.Vector3(px, y, pz), q, new THREE.Vector3(1, 1, 1))
    })
    instanciarEmBlocos(cena, geometriaParada(), toon('#7a6248'), matrizes, null, { nome: 'paradas-bonde' })
  }

  // o letreiro: o nome de cada parada, em letra de epoca
  const nomes = [...new Set(paradas.map((p) => p.nome))]
  if (nomes.length) {
    const L = 64
    const H = L * nomes.length
    const indice = new Map(nomes.map((n, i) => [n, i]))
    const faixaDe = (nome) => {
      const i = indice.get(nome) ?? 0
      return [1 - ((i + 1) * L) / H, 1 - (i * L) / H]
    }
    const geoLetreiro = geometriaLetreiros(paradas, faixaDe)
    if (geoLetreiro) {
      const malha = new THREE.Mesh(geoLetreiro, toon('#ffffff', { map: atlasDosNomes(nomes) }))
      malha.name = 'letreiros-bonde'
      cena.add(malha)
    }
  }

  return { linhas: linhas.length, paradas: paradas.length, relatorio }
}
