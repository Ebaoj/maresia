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
import { alturaTerreno, alturas, NX, NZ } from './terreno.js'
import { LIMITES } from './mapa.js'
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
// a travessa: a madeira sob o trilho (12 de altura, 25 de largura). Fica enterrada no calçamento, com o topo
// rente ao chão (FOLGA_TRAVESSA acima dele, só para não piscar contra o chão). Até 22/10/2026 ficava 14 cm
// acima do chão, sobre a altura interpolada (bilinear), que não é a da malha desenhada.
export const ALTURA_TRAVESSA = 0.12
const LARGURA_TRAVESSA = 0.25
export const FOLGA_TRAVESSA = 0.015
// o aço assenta na travessa: o topo dele fica ALTURA_TRILHO acima dela
export const TOPO_TRILHO = FOLGA_TRAVESSA + ALTURA_TRILHO
export { BITOLA }

// A altura do chão como a malha desenhada a tem (terreno.js): dois triângulos por célula, com a diagonal de
// (i+1, j) a (i, j+1). A bilinear (alturaTerreno) passa centímetros acima ou abaixo dela no meio da célula, e
// o que fica rente ao chão some ou flutua. Fora da grade, a do terreno.
export function alturaMalha(x, z) {
  const { x0, z0, passo } = LIMITES
  const fx = (x - x0) / passo
  const fz = (z - z0) / passo
  if (!(fx >= 0 && fz >= 0 && fx <= NX - 1 && fz <= NZ - 1)) return alturaTerreno(x, z)
  const i = Math.min(NX - 2, Math.floor(fx))
  const j = Math.min(NZ - 2, Math.floor(fz))
  const tx = fx - i
  const tz = fz - j
  const a = alturas[j * NX + i]
  const b = alturas[j * NX + i + 1]
  const c = alturas[(j + 1) * NX + i]
  const d = alturas[(j + 1) * NX + i + 1]
  if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz
  return d + (c - d) * (1 - tx) + (b - d) * (1 - tz)
}

// A rota da linha (bondes.js) vem com idas e voltas: pontos a menos de um metro um do outro e espetos (a rota
// vai e volta em poucos metros, como na ponta da linha em frente à Estação, que entrava 5 m no prédio e voltava
// em zigue-zague). A travessa seguia cada trechinho torto e o aço virava pedacinhos soltos: aquele ramal ficava
// com travessa e sem trilho. Aqui sai o ponto colado e a ponta de todo espeto (virada de mais de 120 graus com
// uma das pernas menor que 12 m), passada a passada, sem mexer no resto: a volta longa pela mesma rua (a linha
// vai ao fim e volta) fica, desenhada por cima de si mesma.
const MINIMO = 0.8
const ESPETO = (120 * Math.PI) / 180
const PERNA = 12
const virada = (a, b, c) => {
  const ux = b[0] - a[0]
  const uz = b[1] - a[1]
  const vx = c[0] - b[0]
  const vz = c[1] - b[1]
  return Math.atan2(ux * vz - uz * vx, ux * vx + uz * vz)
}
const longe = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
export function limparLinha(pontos) {
  let k = []
  for (const p of pontos) if (!k.length || longe(p, k[k.length - 1]) >= MINIMO) k.push(p)
  for (let passada = 0; passada < 40; passada++) {
    let mudou = false
    const n = []
    for (let i = 0; i < k.length; i++) {
      if (n.length && i < k.length - 1) {
        const a = n[n.length - 1]
        if (Math.abs(virada(a, k[i], k[i + 1])) > ESPETO && Math.min(longe(a, k[i]), longe(k[i], k[i + 1])) < PERNA) { mudou = true; continue }
      }
      if (n.length && longe(k[i], n[n.length - 1]) < MINIMO) { mudou = true; continue }
      n.push(k[i])
    }
    k = n
    if (!mudou) break
  }
  return k.length >= 2 ? k : []
}

// o aço segue o chão: o trecho é cortado em pedaços de até 3 m (a célula do chão), e mais finos onde o meio
// do pedaço fica mais de 8 mm fora da reta entre as pontas
function seguirChao(a, b, saida, nivel = 0) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const curva = Math.abs(alturaMalha(m[0], m[1]) - (alturaMalha(a[0], a[1]) + alturaMalha(b[0], b[1])) / 2)
  if (nivel < 6 && (longe(a, b) > 3 || curva > 0.008)) {
    seguirChao(a, m, saida, nivel + 1)
    seguirChao(m, b, saida, nivel + 1)
    return
  }
  saida.push(b)
}

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
  const e = LARGURA_TRILHO / 2
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
      for (const lado of [-1, 1]) {
        const ox = (nx * BITOLA * lado) / 2
        const oz = (nz * BITOLA * lado) / 2
        // o aço desta banda, cortado onde o chão dobra, com o topo TOPO_TRILHO acima da malha
        const a0 = [x0 + ox, z0 + oz]
        const cortes = [a0]
        seguirChao(a0, [x1 + ox, z1 + oz], cortes)
        for (let k = 0; k < cortes.length - 1; k++) {
          const [ax, az] = cortes[k]
          const [bx, bz] = cortes[k + 1]
          const ya = alturaMalha(ax, az) + TOPO_TRILHO
          const yb = alturaMalha(bx, bz) + TOPO_TRILHO
          // o topo do trilho
          quad(
            [ax - nx * e, ya, az - nz * e],
            [bx - nx * e, yb, bz - nz * e],
            [bx + nx * e, yb, bz + nz * e],
            [ax + nx * e, ya, az + nz * e]
          )
          // as duas laterais, para o trilho ter volume de um ponto de vista baixo
          quad(
            [ax - nx * e, ya, az - nz * e],
            [bx - nx * e, yb, bz - nz * e],
            [bx - nx * e, yb - ALTURA_TRILHO, bz - nz * e],
            [ax - nx * e, ya - ALTURA_TRILHO, az - nz * e]
          )
          quad(
            [ax + nx * e, ya, az + nz * e],
            [ax + nx * e, ya - ALTURA_TRILHO, az + nz * e],
            [bx + nx * e, yb - ALTURA_TRILHO, bz + nz * e],
            [bx + nx * e, yb, bz + nz * e]
          )
        }
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
  const rotas = rotasDosBondes()
  const { paradas, relatorio } = rotas
  // a rota limpa (sem ponto colado, espeto nem grampo): travessa e aço seguem a mesma linha
  const linhas = rotas.linhas.map(limparLinha).filter((l) => l.length >= 2)

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
        // enterrada: o topo rente ao chão desenhado
        matrizesTravessa.push(m4.clone().compose(
          new THREE.Vector3(x, alturaMalha(x, z) - ALTURA_TRAVESSA + FOLGA_TRAVESSA, z), q, new THREE.Vector3(1, 1, 1)
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
