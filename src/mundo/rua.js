// Fase 3: rua habitada. Lampiões a gás de coluna nas ruas (até 22/10/2026, postes de madeira com
// fiação), bancos e lixeiras no calçadão, carrinhos de tapioca e de água de coco, placas azuis,
// bancas de revista e varais nas lajes da favela.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  linhaCosta, larguraPraia, distCosta, rioX, RIO_MEIA_LARGURA, FIM_AVENIDA, LARG_CALCADAO,
  NIVEL_CIDADE, pesos,
} from './mapa.js'
import { esticamentoJogo, trechosJogo } from './fortaleza1932.js'
import { dentroDaPraca } from './praca1932.js'
import { RUAS, comprimentoRua, pontoNaRua } from './casario1932.js'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { LIMITES, pesoCidade1932 } from './mapa.js'
import { alturaTerreno } from './terreno.js'
import { toon, toonVertice, texturaCanvas, pintar, gradienteToon, texturizar } from '../materiais.js'
import { globais } from '../globais.js'
import { ref } from '../render/gpu/comum.js'
import { adicionarCaixa, adicionarCirculo } from './colisao.js'
import { registrarLampiaoColuna } from './cenografia.js'
import { ocupacao } from './ocupacao.js'
import { criarAleatorio } from '../utils.js'
import { instanciarEmBlocos } from './blocos.js'

const rnd = criarAleatorio(314)
const Y = new THREE.Vector3(0, 1, 0)

function matriz(x, y, z, yaw = 0, s = 1) {
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, yaw), new THREE.Vector3(s, s, s))
}

function instanciar(cena, geo, material, matrizes, cores = null, nome = '', opcoes = {}) {
  if (!matrizes.length) return null
  return instanciarEmBlocos(cena, geo, material, matrizes, cores, { nome, ...opcoes })
}

// Pinta a geometria inteira de uma cor (para juntar peças coloridas numa malha só).
function colorir(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return g
}

const tangenteCosta = (x) => -Math.atan((linhaCosta(x + 1) - linhaCosta(x - 1)) / 2)
const pertoDoRio = (x, z, folga = 1.6) => pesos(x).recife > 0.3 && Math.abs(x - rioX(z)) < RIO_MEIA_LARGURA * folga

// ---------- lampiões das ruas ----------

// o poste de madeira com cruzeta: saiu das ruas do jogo em 22/10/2026 (virou lampião a gás); fica para a
// cidade de estresse (src/debug/cidade.js), que só mede densidade
export function geometriaPoste() {
  const haste = new THREE.CylinderGeometry(0.11, 0.2, 9, 4).rotateY(Math.PI / 4).translate(0, 4.5, 0)
  const cruzeta = new THREE.BoxGeometry(1.8, 0.14, 0.14).translate(0, 8.3, 0)
  return mergeGeometries([colorir(haste, '#7a5a3c'), colorir(cruzeta, '#6b4e34')]) // madeira
}

function catenaria(a, b, flecha, segs = 10) {
  const pts = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const p = a.clone().lerp(b, t)
    p.y -= flecha * 4 * t * (1 - t)
    pts.push(p)
  }
  return pts
}

// Tubo fino montado à mão (bem mais leve que TubeGeometry para centenas de fios).
function geometriaFios(fios, raio = 0.028) {
  const pos = []
  const idx = []
  let base = 0
  const lados = 3
  for (const pts of fios) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const q = pts[Math.min(i + 1, pts.length - 1)]
      const r = pts[Math.max(i - 1, 0)]
      const t = q.clone().sub(r).normalize()
      const n1 = new THREE.Vector3().crossVectors(t, Y).normalize()
      if (n1.lengthSq() < 0.01) n1.set(1, 0, 0)
      const n2 = new THREE.Vector3().crossVectors(t, n1).normalize()
      for (let k = 0; k < lados; k++) {
        const a = (k / lados) * Math.PI * 2
        const v = p.clone().addScaledVector(n1, Math.cos(a) * raio).addScaledVector(n2, Math.sin(a) * raio)
        pos.push(v.x, v.y, v.z)
      }
    }
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 0; k < lados; k++) {
        const a = base + i * lados + k
        const b = base + i * lados + ((k + 1) % lados)
        const c = a + lados
        const d = b + lados
        idx.push(a, c, b, b, c, d)
      }
    }
    base += pts.length * lados
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// 1932: a iluminação pública de Fortaleza era a GÁS até 25/10/1935 (docs/mapa-1932.md): lampião de coluna
// de ferro nas ruas, a uns 30 m um do outro, além do de braço na fachada (src/mundo/cenografia.js).
// Até 22/10/2026 aqui havia postes de madeira com cruzeta e dois fios em toda rua, que liam como poste de luz
// elétrica; decisão do Joabe: viram lampiões a gás. O poste e o fio aéreo do bonde elétrico (a Light roda
// bondes desde 1913) ficam, só sobre o trilho (src/mundo/vida1932.js).
// Nada de poste de concreto, transformador ou "gato" (saíram em 16/10/2026).
function lampioesDasRuas(cena, predios, grade) {
  const favela = []
  void grade
  // Os lampiões ficam nas ruas de verdade: a linha da frente dos lotes de 1932, que
  // e a propria rede viaria da planta. Um a cada ~10 unidades (uns 30 m de
  // rua), na beira do calco.
  // O passo e o recuo seguem a escala local da rua: perto da praca (que foi
  // descomprimida para 1:1) 10 unidades sao 10 m de verdade, e o poste tem de
  // ficar a uns 30 m do outro como em qualquer rua.
  const linhas = []
  const pontos = [] // cada ponto aceito, uma vez (as linhas abaixo repetem e perdem pontos: ver o fim)
  for (const rua of RUAS) {
    const comp = comprimentoRua(rua)
    const [mx, mz] = pontoNaRua(rua, Math.min(comp / 2, 40))
    const estica = esticamentoJogo(mx, mz)
    if (comp < 14 * estica) continue
    const atual = []
    const passo = 10 * estica
    const recuo = 0.9 * estica
    let ultimoD = -passo // a distancia do ultimo poste aceito: um poste novo so entra
    // depois de um passo inteiro, senao a linha que se quebra deixa dois postes
    // colados na retomada
    for (let d = 0; d <= comp; d += passo) {
      const [x, z, nx, nz] = pontoNaRua(rua, d)
      const px = x + nx * recuo
      const pz = z + nz * recuo
      // a praça é livre: nenhum poste no meio dela, e o fio da rua para na borda
      const naPraca = dentroDaPraca(px, pz)
      const ok = !naPraca && distCosta(px, pz) > larguraPraia(px) + FIM_AVENIDA + 4 && ocupacao.livre(px, pz, 0.5, 0.5)
      if (!ok || d - ultimoD < passo) {
        if (atual.length > 1) linhas.push(atual)
        atual.length = 0
        if (!ok) continue
      }
      ultimoD = d
      const p = new THREE.Vector3(px, alturaTerreno(px, pz), pz)
      atual.push(p)
      pontos.push(p)
    }
    if (atual.length > 1) linhas.push(atual)
  }
  void predios

  // As linhas eram as dos fios entre postes. Elas guardam a mesma lista (atual) várias vezes e a esvaziam
  // na quebra, então só o último trecho de cada rua sobrava, repetido. O lampião não tem fio: entra em cada
  // ponto aceito. Os sorteios dos postes e dos fios continuam iguais (yaw por poste, flecha por fio), para o
  // resto da rua (bancos do calçadão, varais) sair no mesmo lugar de antes.
  for (const linha of linhas) {
    linha.forEach(() => rnd.entre(0, 4))
    for (let i = 0; i < linha.length - 1; i++) for (let k = 0; k < 2; k++) rnd.entre(0.4, 0.8)
  }
  // A praça não tem lampião de rua: o de ferro dela fica no limite da praça (src/mundo/praca.js). A energia
  // elétrica só chegou à Praça do Ferreira em 8/dez/1934.
  const postes = pontos.map((p) => ({ p }))
  for (const { p } of postes) {
    registrarLampiaoColuna(p.x, p.y, p.z)
    adicionarCirculo(p.x, p.z, 0.25)
  }
  void favela
  return { postes }
}

// carros: saíram em 16/10/2026 (anacronismo: os modelos eram de carro moderno, e a rua de 1932
// é de bonde, carroça e gente a pé)

// ---------- calçadão: bancos, lixeiras, carrinhos ----------

// banco de madeira gasta (a cidade de estresse do KAN-73 usa o mesmo)
export function geometriaBanco() {
  return mergeGeometries([
    colorir(new THREE.BoxGeometry(1.8, 0.08, 0.5).translate(0, 0.45, 0), '#8f7a5c'),
    colorir(new THREE.BoxGeometry(1.8, 0.45, 0.08).translate(0, 0.75, -0.24), '#857154'),
    colorir(new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(-0.8, 0.22, 0), '#5f4f3d'),
    colorir(new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(0.8, 0.22, 0), '#5f4f3d'),
  ])
}

function calcadao(cena) {
  const lugares = { bancos: [], carrinhos: [] } // para as interações (sentar, pedir água de coco)
  const bancos = []
  const lixeiras = []
  const carrinhos = []
  const cocos = []
  const trechos = [trechosJogo.praiaIracema, trechosJogo.praiaFormosa]
  for (let x = LIMITES.x0; x < LIMITES.x1; x += 13) {
    if (!trechos.some(([a, b]) => x > a && x < b)) continue
    const zc = linhaCosta(x) + larguraPraia(x)
    if (pertoDoRio(x, zc + 5, 2.4)) continue
    const yaw = tangenteCosta(x)
    const k = Math.round((x - LIMITES.x0) / 13)
    if (k % 3 === 0) {
      // banco virado para o mar
      const z = zc + 1.4
      bancos.push(matriz(x, NIVEL_CIDADE + 0.05, z, yaw + Math.PI))
      lugares.bancos.push({ x, y: NIVEL_CIDADE + 0.05, z, yaw: yaw + Math.PI })
      adicionarCaixa(x, z, 0.9, 0.35, yaw)
    } else if (k % 3 === 1 && rnd.chance(0.6)) {
      lixeiras.push(matriz(x, NIVEL_CIDADE + 0.05, zc + 1.0, yaw))
      adicionarCirculo(x, zc + 1.0, 0.3)
    } else if (rnd.chance(0.22)) {
      const z = zc + 3.6
      const coco = rnd.chance(0.5)
      carrinhos.push({ m: matriz(x, NIVEL_CIDADE + 0.05, z, yaw), coco })
      lugares.carrinhos.push({ x, y: NIVEL_CIDADE + 0.05, z, yaw, coco })
      adicionarCaixa(x, z, 1.0, 0.6, yaw)
    }
  }
  // banco de madeira gasta (era tábua laranja com pé azul-marinho, cara de praça moderna e de objeto sem
  // pintura ao lado do menino pintado): madeira desbotada com a textura pintada de madeira
  const geoBanco = geometriaBanco()
  instanciar(cena, geoBanco, texturizar(toonVertice(), { topo: 'madeira', lado: 'madeira', tam: 0.8 }), bancos, null, 'bancos')
  const geoLixeira = mergeGeometries([
    colorir(new THREE.CylinderGeometry(0.28, 0.24, 0.7, 10).translate(0, 0.55, 0), '#ff8c1a'),
    colorir(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4).translate(0, 0.2, 0), '#2a2840'),
  ])
  instanciar(cena, geoLixeira, toonVertice(), lixeiras, null, 'lixeiras')

  const geoCarrinho = mergeGeometries([
    colorir(new THREE.BoxGeometry(1.6, 0.8, 0.9).translate(0, 0.9, 0), '#fff6e0'),
    colorir(new THREE.BoxGeometry(1.62, 0.18, 0.92).translate(0, 1.0, 0), '#e63946'),
    colorir(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10).rotateX(Math.PI / 2).translate(-0.5, 0.3, 0.48), '#1a1a22'),
    colorir(new THREE.CylinderGeometry(0.28, 0.28, 0.1, 10).rotateX(Math.PI / 2).translate(-0.5, 0.3, -0.48), '#1a1a22'),
    colorir(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 4).translate(0.3, 2.1, 0), '#2a2840'),
    colorir(new THREE.ConeGeometry(1.2, 0.5, 8).translate(0.3, 2.9, 0), '#ffd23f'),
  ])
  instanciar(cena, geoCarrinho, toonVertice(), carrinhos.map((c) => c.m), null, 'carrinhos')
  // pilha de cocos verdes ao lado dos carrinhos de água de coco
  const p = new THREE.Vector3()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  for (const c of carrinhos.filter((c) => c.coco)) {
    c.m.decompose(p, q, s)
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2
      const r = i < 6 ? 0.45 : 0.2
      cocos.push(matriz(p.x + 1.3 + Math.cos(a) * r, p.y + (i < 6 ? 0.2 : 0.5), p.z + Math.sin(a) * r, a, 1))
    }
  }
  instanciar(cena, new THREE.SphereGeometry(0.22, 8, 6), toon('#6f9a2a'), cocos, null, 'cocos')
  return lugares
}

// ---------- placas, bancas, varais ----------

function placas(cena, postes) {
  const tex = texturaCanvas(256, 96, (ctx, W, H) => {
    ctx.fillStyle = '#1f4fa3'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 6
    ctx.strokeRect(6, 6, W - 12, H - 12)
    ctx.fillStyle = '#fff'
    ctx.fillRect(30, 34, 140, 10)
    ctx.fillRect(30, 54, 190, 8)
  }, { repetir: false })
  const lista = postes.filter(() => rnd.chance(0.3)).map((p) => matriz(p.x, p.y + 3.2, p.z + 0.25, rnd.chance(0.5) ? 0 : Math.PI / 2))
  instanciar(cena, new THREE.BoxGeometry(1.0, 0.38, 0.04), toon('#ffffff', { map: tex }), lista, null, 'placas')
}

function bancas(cena) {
  const tex = texturaCanvas(256, 128, (ctx, W, H) => {
    ctx.fillStyle = '#1f7a4c'
    ctx.fillRect(0, 0, W, H)
    const cores = ['#ffd23f', '#e63946', '#3a86ff', '#fff6e0', '#ff7a3d', '#06d6a0']
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = cores[i % cores.length]
      ctx.fillRect(10 + (i % 6) * 40, 14 + Math.floor(i / 6) * 38, 32, 30)
    }
  }, { repetir: false })
  const geo = new THREE.BoxGeometry(3, 2.6, 2.2).translate(0, 1.3, 0)
  const lista = []
  for (const [x, zOff] of [[-60, 8], [40, 10], [180, 8], [250, 9], [-180, 8]]) {
    const z = linhaCosta(x) + larguraPraia(x) + FIM_AVENIDA + zOff
    if (!ocupacao.livre(x, z, 1.8, 1.4)) continue
    ocupacao.marcar(x, z, 1.8, 1.4)
    lista.push(matriz(x, alturaTerreno(x, z), z, tangenteCosta(x)))
    adicionarCaixa(x, z, 1.5, 1.1, tangenteCosta(x))
  }
  const materiais = [toon('#1f7a4c'), toon('#1f7a4c'), toon('#2a8a58'), toon('#1f7a4c'), toon('#ffffff', { map: tex }), toon('#1f7a4c')]
  const im = new THREE.InstancedMesh(geo, materiais, lista.length)
  lista.forEach((m, i) => im.setMatrixAt(i, m))
  im.castShadow = im.receiveShadow = true
  registrarEstatico(im)
  cena.add(im)
}

function varais(cena, predios) {
  const lajes = predios.filter((p) => p.tipo === 'favela' && rnd.chance(0.16))
  const fios = []
  const roupas = []
  const cores = []
  const CORES = ['#e63946', '#ffd23f', '#3a86ff', '#ffffff', '#ff7a3d', '#06d6a0', '#f15bb5', '#8338ec']
  for (const c of lajes) {
    const y = c.y + c.h + 1.5
    const cs = Math.cos(c.rot)
    const sn = Math.sin(c.rot)
    const meia = c.w / 2 - 0.4
    const a = new THREE.Vector3(c.x - meia * cs, y, c.z + meia * sn)
    const b = new THREE.Vector3(c.x + meia * cs, y, c.z - meia * sn)
    const pts = catenaria(a, b, 0.25, 6)
    fios.push(pts)
    const n = 3 + Math.floor(rnd.entre(0, 4))
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const p = a.clone().lerp(b, t)
      p.y -= 0.25 * 4 * t * (1 - t) + 0.35
      roupas.push(matriz(p.x, p.y, p.z, c.rot, 1))
      cores.push(rnd.escolha(CORES))
    }
  }
  const m = new THREE.Mesh(geometriaFios(fios, 0.015), toon('#efe9da'))
  cena.add(m)
  const geoRoupa = new THREE.PlaneGeometry(0.55, 0.65)
  const matRoupa = new THREE.MeshToonMaterial({ color: 0xffffff, side: THREE.DoubleSide, gradientMap: gradienteToon() })
  matRoupa.onBeforeCompile = (sh) => {
    sh.uniforms.uTempoR = globais.uTempo
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTempoR;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // presa no alto: quanto mais embaixo, mais o pano voa
        float solto = 0.325 - position.y;
        float fase = 0.0;
        #ifdef USE_INSTANCING
          fase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.3;
        #endif
        transformed.z += sin(uTempoR * 3.2 + fase + position.x * 4.0) * 0.16 * solto;
        transformed.x += sin(uTempoR * 2.1 + fase) * 0.05 * solto;`)
  }
  pintar(matRoupa, 'roupa-pintada')
  // a mesma conta no modo webgpu (motor F2, KAN-68)
  matRoupa.userData.tsl = {
    nome: 'roupa-varal',
    posicao({ W, instancia }) {
      const { vec3, float, sin, positionLocal } = W
      const t = ref(globais.uTempo)
      const p = positionLocal
      // presa no alto: quanto mais embaixo, mais o pano voa
      const solto = float(0.325).sub(p.y)
      const fase = instancia ? instancia.element(3).x.mul(0.7).add(instancia.element(3).z.mul(0.3)) : float(0.0)
      return vec3(
        p.x.add(sin(t.mul(2.1).add(fase)).mul(0.05).mul(solto)),
        p.y,
        p.z.add(sin(t.mul(3.2).add(fase).add(p.x.mul(4.0))).mul(0.16).mul(solto)))
    },
  }
  instanciar(cena, geoRoupa, matRoupa, roupas, cores, 'roupas', { sombra: false })
}

export function criarRua(cena, predios, grade) {
  lampioesDasRuas(cena, predios, grade)
  const lugares = calcadao(cena)
  varais(cena, predios)
  return lugares
}
void placas
void bancas

export { LARG_CALCADAO }
