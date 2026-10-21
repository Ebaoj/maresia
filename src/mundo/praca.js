// A Praça do Ferreira em 1932: o que a reforma do prefeito Godofredo Maciel deixou nela.
//
// Fonte (com a marca de confiança em docs/mapa-1932.md):
//   D  1920: Maciel fecha o poço central, manda retirar os quiosques de café dos
//      quatro cantos, mosaica a praça e faz vários jardins.
//   D  1923: o palanque do centro é trocado por outro, coberto: o coreto da banda.
//   D  a iluminação da praça era a gás: a energia elétrica da Light só chegou lá
//      em 8/dez/1934, e o lampião de ferro fica no limite da praça.
//   H  quantos jardins são, onde eles ficam e o desenho do coreto.
//
// Não entram (anacronismo): a Coluna da Hora (o relógio da praça é de 1933) e os
// quiosques de café dos quatro cantos (retirados na reforma de 1920).
//
// O que este módulo monta: o coreto coberto no centro, quatro jardins com grade de
// ferro, arvoreira e bancos, os lampiões a gás do limite, e reserva o terreo na
// grade de ocupacao para as arvores soltas nao cairem em cima.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { alturaTerreno } from './terreno.js'
import { ocupacao } from './ocupacao.js'
import { toon, toonVertice, luzFixa } from '../materiais.js'
import { colorir } from './cenografia.js'
import { geometriaBanco } from './rua.js'
import { instanciarEmBlocos } from './blocos.js'
import { criarAleatorio } from '../utils.js'
import { cajueiro, murici, oiti } from './especies.js'
import { adicionarCirculo } from './colisao.js'
import { globais } from '../globais.js'
import { CENTRO, CONTORNO, RAIO_MAX, dentroDaPraca, raioEm } from './praca1932.js'

const rnd = criarAleatorio(1932)

// A praça está em tamanho real (1:1) desde a descompressão local da
// transformação lon/lat -> jogo (src/mundo/fortaleza1932.js): 1 unidade = 1 m
// aqui dentro. Por isso as medidas daqui são metros de verdade, e não as
// medidas da praça comprimida de antes.
//   D  o coreto de 1923 (palanque coberto) e os jardins da reforma de 1920
//   H  o tamanho do coreto (10 m de diâmetro, como os coretos de ferro da
//      época), o tamanho dos canteiros (6 m) e onde eles ficam
const CORETO = { raio: 5, altura: 3.2, telhado: 1.3, grade: 0.9 }

// onde os jardins podem ficar: uma direção só serve se o canteiro inteiro couber
// dentro da praça, com folga do coreto
function escolherJardins() {
  const cantos = 16
  const bons = []
  for (let k = 0; k < cantos; k++) {
    const ang = (k / cantos) * Math.PI * 2
    const r = raioEm(ang)
    const rr = r * 0.52
    if (rr < CORETO.raio + 3 || rr > RAIO_MAX - 4) continue
    const cx = CENTRO[0] + Math.cos(ang) * rr
    const cz = CENTRO[1] + Math.sin(ang) * rr
    // o canteiro (7 x 7) tem de caber inteiro na praça
    let cabe = true
    for (const [dx, dz] of [[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5], [0, 0]]) {
      if (!dentroDaPraca(cx + dx, cz + dz)) { cabe = false; break }
    }
    if (cabe) bons.push({ ang, x: cx, z: cz })
  }
  // quatro bem espalhados: o mais longe de cada um já escolhido
  const escolhidos = []
  for (const b of bons) {
    if (escolhidos.length >= 4) break
    if (escolhidos.some((e) => Math.abs(((b.ang - e.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.7)) continue
    escolhidos.push(b)
  }
  return escolhidos
}

// o coreto coberto: plataforma de alvenaria, oito colunas, telhado e grade de ferro
function geometriaCoreto() {
  const partes = []
  const r = CORETO.raio
  // a plataforma
  partes.push(colorir(new THREE.CylinderGeometry(r, r + 0.15, 0.55, 16).translate(0, 0.27, 0), '#cfc4a8'))
  partes.push(colorir(new THREE.CylinderGeometry(r - 0.25, r - 0.25, 0.08, 16).translate(0, 0.56, 0), '#8d6f4f'))
  // as colunas
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    partes.push(colorir(new THREE.CylinderGeometry(0.14, 0.16, CORETO.altura, 8)
      .translate(Math.cos(a) * (r - 0.5), CORETO.altura / 2 + 0.55, Math.sin(a) * (r - 0.5)), '#e8dcc0'))
  }
  // o aro da cobertura e o telhado de zinco
  partes.push(colorir(new THREE.CylinderGeometry(r + 0.2, r + 0.2, 0.22, 16).translate(0, CORETO.altura + 0.6, 0), '#b9b3a4'))
  partes.push(colorir(new THREE.ConeGeometry(r + 0.45, CORETO.telhado, 16).translate(0, CORETO.altura + 0.6 + CORETO.telhado / 2, 0), '#9c9a8c'))
  partes.push(colorir(new THREE.SphereGeometry(0.16, 8, 6).translate(0, CORETO.altura + 0.6 + CORETO.telhado + 0.1, 0), '#8a6f3f'))
  // a grade de ferro em volta do coreto
  const nGrade = 20
  for (let k = 0; k < nGrade; k++) {
    const a = (k / nGrade) * Math.PI * 2
    partes.push(colorir(new THREE.BoxGeometry(0.05, CORETO.grade, 0.05)
      .translate(Math.cos(a) * (r - 0.15), CORETO.altura * 0.5 + 0.4, Math.sin(a) * (r - 0.15)), '#3b3038'))
  }
  partes.push(colorir(new THREE.TorusGeometry(r - 0.15, 0.05, 6, 24).rotateX(Math.PI / 2).translate(0, CORETO.altura * 0.5 + 0.4, 0), '#3b3038'))
  return mergeGeometries(partes.map((g) => g.toNonIndexed()))
}

// o jardim: canteiro de alvenaria com grade de ferro, terra e arvoreira
function geometriaCanteiro() {
  const partes = []
  const a = 3.5
  // mureta de alvenaria
  partes.push(colorir(new THREE.BoxGeometry(a * 2, 0.42, 0.3).translate(0, 0.21, -a), '#d6c9a6'))
  partes.push(colorir(new THREE.BoxGeometry(a * 2, 0.42, 0.3).translate(0, 0.21, a), '#d6c9a6'))
  partes.push(colorir(new THREE.BoxGeometry(0.3, 0.42, a * 2).translate(-a, 0.21, 0), '#d6c9a6'))
  partes.push(colorir(new THREE.BoxGeometry(0.3, 0.42, a * 2).translate(a, 0.21, 0), '#d6c9a6'))
  // a terra dentro
  partes.push(colorir(new THREE.BoxGeometry(a * 2 - 0.3, 0.12, a * 2 - 0.3).translate(0, 0.38, 0), '#6b5136'))
  // a grade de ferro
  for (let k = -4; k <= 4; k++) {
    const x = (k / 4) * (a - 0.2)
    partes.push(colorir(new THREE.BoxGeometry(0.045, 0.75, 0.045).translate(x, 0.78, -a), '#3b3038'))
    partes.push(colorir(new THREE.BoxGeometry(0.045, 0.75, 0.045).translate(x, 0.78, a), '#3b3038'))
    partes.push(colorir(new THREE.BoxGeometry(0.045, 0.75, 0.045).translate(-a, 0.78, x), '#3b3038'))
    partes.push(colorir(new THREE.BoxGeometry(0.045, 0.75, 0.045).translate(a, 0.78, x), '#3b3038'))
  }
  partes.push(colorir(new THREE.BoxGeometry(a * 2, 0.06, 0.06).translate(0, 1.12, -a), '#3b3038'))
  partes.push(colorir(new THREE.BoxGeometry(a * 2, 0.06, 0.06).translate(0, 1.12, a), '#3b3038'))
  partes.push(colorir(new THREE.BoxGeometry(0.06, 0.06, a * 2).translate(-a, 1.12, 0), '#3b3038'))
  partes.push(colorir(new THREE.BoxGeometry(0.06, 0.06, a * 2).translate(a, 1.12, 0), '#3b3038'))
  return mergeGeometries(partes.map((g) => g.toNonIndexed()))
}

// arbusto: massa verde baixa
function geometriaArbusto(rndA) {
  const g = new THREE.IcosahedronGeometry(0.45, 1)
  const p = g.attributes.position
  const v = new THREE.Vector3()
  const cores = []
  const c1 = new THREE.Color('#2f6b38')
  const c2 = new THREE.Color('#5f9c46')
  const cor = new THREE.Color()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i)
    const k = 1 + rndA.entre(-0.25, 0.25)
    v.multiplyScalar(k)
    v.y *= 0.75
    p.setXYZ(i, v.x, v.y + 0.5, v.z)
    cor.copy(c1).lerp(c2, THREE.MathUtils.clamp(v.y + 0.4, 0, 1))
    cores.push(cor.r, cor.g, cor.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.deleteAttribute('uv')
  g.computeVertexNormals()
  return g.toNonIndexed()
}

// ---------- lampião a gás ----------

// Em 1932 a iluminação da praça era a gás: a energia elétrica da Light só
// chegou à Praça do Ferreira em 8/dez/1934 (Aderaldo/UECE, Diário do Nordeste
// de 28/08/2022, Acervo Fortaleza), e antes disso quem iluminava a praça era a
// Companhia do Gás. O lampião de ferro vai no limite da praça, um a cada ~30 m
// (a distância que João Nogueira deu para a iluminação de 1848), e sem fio
// nenhum: o anel de postes da Light com o fio dando a volta era anacrônico —
// e o fio dele cortava a praça em diagonal, por causa do "braço" falso do
// contorno antigo. As contas e as fontes estão em docs/mapa-1932.md.
const PASSO_LAMPIAO = 30 // 30 m de rua (João Nogueira, a iluminação de 1848): a praça
// está em tamanho real, então o passo é o do mundo real
const FOLGA_LAMPIAO = 2.6 // o lampião fica na calçada, um pouco para dentro

// o ponto do contorno a uma distancia d do começo (o contorno é fechado)
function pontoNoContorno(d) {
  let acc = 0
  for (let i = 0; i < CONTORNO.length; i++) {
    const a = CONTORNO[i]
    const b = CONTORNO[(i + 1) % CONTORNO.length]
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (acc + seg >= d) {
      const t = seg > 0 ? (d - acc) / seg : 0
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    }
    acc += seg
  }
  return null
}

// o lampião de pé: pedestal e coluna de ferro fundido, caixa de vidro de quatro
// faces e chapéu piramidal. Sem cor por vértice (o material é liso): o atributo
// `color` faz a malha sumir no WebGPU (docs/motor-f4-otimizacao-webgpu.md).
function geometriaLampiaoPe() {
  const partes = [
    new THREE.CylinderGeometry(0.16, 0.2, 0.2, 8).translate(0, 0.1, 0),
    new THREE.CylinderGeometry(0.05, 0.085, 3.0, 8).translate(0, 1.7, 0),
    new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8).translate(0, 2.56, 0),
    new THREE.BoxGeometry(0.36, 0.06, 0.36).translate(0, 3.23, 0),
    new THREE.ConeGeometry(0.3, 0.32, 4).rotateY(Math.PI / 4).translate(0, 3.9, 0),
    new THREE.SphereGeometry(0.05, 6, 5).translate(0, 4.1, 0),
  ]
  // as quinas da caixa de vidro
  for (const [x, z] of [[-0.15, -0.15], [0.15, -0.15], [-0.15, 0.15], [0.15, 0.15]]) {
    partes.push(new THREE.BoxGeometry(0.035, 0.52, 0.035).translate(x, 3.5, z))
  }
  return mergeGeometries(partes)
}

// onde ficam os lampiões: no limite da praça, na calçada, um a cada ~30 m
function lampioesDaPraca() {
  let perimetro = 0
  for (let i = 0; i < CONTORNO.length; i++) {
    const a = CONTORNO[i]
    const b = CONTORNO[(i + 1) % CONTORNO.length]
    perimetro += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  const lista = []
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const um = new THREE.Vector3(1, 1, 1)
  let ultimo = null
  for (let d = PASSO_LAMPIAO / 2; d < perimetro; d += PASSO_LAMPIAO) {
    const p = pontoNoContorno(d)
    if (!p) break
    const dx = CENTRO[0] - p[0]
    const dz = CENTRO[1] - p[1]
    const r = Math.hypot(dx, dz) || 1
    const x = p[0] + (dx / r) * FOLGA_LAMPIAO
    const z = p[1] + (dz / r) * FOLGA_LAMPIAO
    // nunca no meio da praça, nunca em cima de canteiro ou do coreto
    if (!dentroDaPraca(x, z)) continue
    if (!ocupacao.livre(x, z, 0.45, 0.45)) continue
    // e nunca colado no lampião anterior
    if (ultimo && Math.hypot(x - ultimo[0], z - ultimo[1]) < PASSO_LAMPIAO * 0.55) continue
    ultimo = [x, z]
    // a lanterna de quatro faces alinhada com o mundo, para não parecer torta
    const yaw = Math.round(Math.atan2(dz, dx) / (Math.PI / 2)) * (Math.PI / 2)
    q.setFromAxisAngle(Y, yaw)
    lista.push(new THREE.Matrix4().compose(new THREE.Vector3(x, alturaTerreno(x, z), z), q, um))
    ocupacao.marcar(x, z, 0.4, 0.4)
    adicionarCirculo(x, z, 0.25)
  }
  return lista
}

// cfg.marcos.pracaReforma: a praça depois da reforma de 1932-33 vem de src/mundo/marcos1932/praca-reforma.js;
// esta (a de 1932 com o coreto) fica para quando a reforma está desligada
export function criarPraca(cena, cfg = null) {
  if (cfg?.marcos?.ligados && cfg.marcos.pracaReforma) return { jardins: 0, coreto: null, lampioes: 0, reforma: true }
  const y0 = alturaTerreno(CENTRO[0], CENTRO[1])
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)

  // ---- o coreto coberto, no centro da praça (1923)
  const coreto = new THREE.Mesh(geometriaCoreto(), toonVertice())
  coreto.position.set(CENTRO[0], y0, CENTRO[1])
  coreto.castShadow = true
  coreto.receiveShadow = true
  coreto.name = 'coreto'
  cena.add(coreto)
  ocupacao.marcar(CENTRO[0], CENTRO[1], CORETO.raio + 0.6, CORETO.raio + 0.6)

  // ---- os jardins (1920): canteiro com grade, arvoreira, arbustos e bancos
  const jardins = escolherJardins()
  const canteiros = []
  const bancos = []
  const matrizesArvoreira = { oiti: [], murici: [], cajueiro: [] }
  const matrizesArbusto = []
  const rndA = criarAleatorio(778)
  const geoArvores = { oiti: oiti(rndA), murici: murici(rndA), cajueiro: cajueiro(rndA) }
  for (const j of jardins) {
    const y = alturaTerreno(j.x, j.z)
    const ang = rnd.entre(0, Math.PI * 2)
    q.setFromAxisAngle(Y, ang)
    canteiros.push(m.clone().compose(new THREE.Vector3(j.x, y, j.z), q, new THREE.Vector3(1, 1, 1)))
    ocupacao.marcar(j.x, j.z, 3.9, 3.9)
    // arvoreira dentro do canteiro: oiti e murici, de copa pequena (a praça é
    // pequena no jogo e a copa do cajueiro a tomava inteira)
    for (let k = 0; k < 3; k++) {
      const ax = j.x + rnd.entre(-2.4, 2.4)
      const az = j.z + rnd.entre(-2.4, 2.4)
      const esp = rnd.chance(0.6) ? 'oiti' : 'murici'
      const esc = rnd.entre(0.7, 0.95)
      q.setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2))
      matrizesArvoreira[esp].push(m.clone().compose(
        new THREE.Vector3(ax, alturaTerreno(ax, az) - 0.1, az), q, new THREE.Vector3(esc, esc, esc)
      ))
    }
    // arbustos na frente da mureta
    for (let k = 0; k < 6; k++) {
      const ax = j.x + rnd.entre(-2.9, 2.9)
      const az = j.z + rnd.entre(-2.9, 2.9)
      if (Math.hypot(ax - j.x, az - j.z) > 2.9) continue
      const e = rnd.entre(0.8, 1.2)
      q.setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2))
      matrizesArbusto.push(m.clone().compose(new THREE.Vector3(ax, alturaTerreno(ax, az), az), q, new THREE.Vector3(e, e, e)))
    }
    // bancos em volta do jardim, virados para o canteiro
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4
      const bx = j.x + Math.cos(a) * 4.8
      const bz = j.z + Math.sin(a) * 4.8
      if (!dentroDaPraca(bx, bz)) continue
      const y = alturaTerreno(bx, bz)
      q.setFromAxisAngle(Y, -a + Math.PI / 2)
      bancos.push(m.clone().compose(new THREE.Vector3(bx, y, bz), q, new THREE.Vector3(1, 1, 1)))
    }
  }

  const mat = toonVertice()
  if (canteiros.length) {
    instanciarEmBlocos(cena, geometriaCanteiro(), mat, canteiros, null, { nome: 'canteiros' })
  }
  if (bancos.length) {
    instanciarEmBlocos(cena, geometriaBanco(), toonVertice(), bancos, null, { nome: 'bancos-praca' })
  }
  if (matrizesArbusto.length) {
    instanciarEmBlocos(cena, geometriaArbusto(rndA), mat, matrizesArbusto, null, { nome: 'arbustos' })
  }
  for (const [esp, lista] of Object.entries(matrizesArvoreira)) {
    if (!lista.length) continue
    instanciarEmBlocos(cena, geoArvores[esp], mat, lista, null, { nome: `arvores-praca-${esp}`, placa: true })
  }

  // ---- os lampiões a gás do limite da praça (a luz elétrica só chegou em 1934)
  const lampioes = lampioesDaPraca()
  if (lampioes.length) {
    instanciarEmBlocos(cena, geometriaLampiaoPe(), toon('#2b2622'), lampioes, null, { nome: 'lampioes-praca' })
    // o vidro: apagado de dia, quente à noite (a luz fixa vem do uNoite)
    const vidro = luzFixa(new THREE.MeshBasicMaterial({ color: '#e8e0c8' }), 1, globais.uNoite)
    instanciarEmBlocos(cena, new THREE.BoxGeometry(0.3, 0.48, 0.3).translate(0, 3.5, 0), vidro, lampioes, null, {
      nome: 'lampioes-praca-vidro',
      sombra: false,
    })
  }

  return { jardins: jardins.length, coreto: [CENTRO[0], y0, CENTRO[1]], lampioes: lampioes.length }
}
