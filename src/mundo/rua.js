// Fase 3: rua habitada. Postes de concreto com fiação emaranhada,
// bancos e lixeiras no calçadão, carrinhos de tapioca e de água de coco, placas azuis,
// bancas de revista e varais nas lajes da favela.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  linhaCosta, larguraPraia, distCosta, rioX, RIO_MEIA_LARGURA, FIM_AVENIDA, LARG_CALCADAO,
  NIVEL_CIDADE, pesos,
} from './mapa.js'
import { trechosJogo } from './fortaleza1932.js'
import { LIMITES, densidadeLotes } from './mapa.js'
import { alturaTerreno } from './terreno.js'
import { toon, toonVertice, texturaCanvas, pintar, gradienteToon } from '../materiais.js'
import { globais } from '../globais.js'
import { adicionarCaixa, adicionarCirculo } from './colisao.js'
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

// ---------- postes e fiação ----------

function geometriaPoste() {
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

// 1932: postes de madeira da Light nas ruas do centro (fios de luz e do bonde), um a cada ~30 m.
// Nada de poste de concreto, transformador ou "gato" (saíram em 16/10/2026).
function postesEFios(cena, predios, grade) {
  const linhas = []
  const favela = []
  const [ox, oz] = grade.origem
  const passoX = grade.w + grade.rua
  const passoZ = grade.d + grade.rua
  const ponto = (a, b) => [ox + a * grade.ex[0] + b * grade.ez[0], oz + a * grade.ex[1] + b * grade.ez[1]]
  // ruas na direção ex (leste-sudeste) e na direção ez, na beira da rua (a 3,5 m do eixo)
  for (let k = -8; k <= 8; k++) {
    for (const dir of [0, 1]) {
      let atual = []
      for (let t = -9 * 43; t <= 9 * 43; t += 30) {
        const [x, z] = dir === 0 ? ponto(t, (k + 0.5) * passoZ - 3.5) : ponto((k + 0.5) * passoX - 3.5, t)
        const ok = Math.hypot(x - ox, z - oz) < 360 && densidadeLotes(x, z) > 0.2 &&
          distCosta(x, z) > larguraPraia(x) + FIM_AVENIDA + 4 && ocupacao.livre(x, z, 0.5, 0.5)
        if (!ok) { if (atual.length > 1) linhas.push(atual); atual = []; continue }
        atual.push(new THREE.Vector3(x, alturaTerreno(x, z), z))
      }
      if (atual.length > 1) linhas.push(atual)
    }
  }
  void predios

  const postes = []
  const fios = []
  const topo = (p, k) => new THREE.Vector3(p.x + (k - 1) * 0.75, p.y + 8.35, p.z)
  for (const linha of linhas) {
    linha.forEach((p) => postes.push(p))
    for (let i = 0; i < linha.length - 1; i++) {
      const a = linha[i]
      const b = linha[i + 1]
      for (let k = 0; k < 2; k++) fios.push(catenaria(topo(a, k * 2), topo(b, k * 2), rnd.entre(0.4, 0.8)))
    }
  }
  for (const p of favela) {
    postes.push(p)
    const vizinhos = favela.filter((q) => q !== p).sort((u, v) => u.distanceToSquared(p) - v.distanceToSquared(p)).slice(0, 2)
    for (const q of vizinhos) {
      if (q.distanceTo(p) > 40) continue
      for (let k = 0; k < 2 + Math.floor(rnd.entre(0, 3)); k++) fios.push(catenaria(topo(p, k % 3), topo(q, (k + 1) % 3), rnd.entre(0.6, 2.5)))
    }
    // "gatos": fios do poste para as casas em volta
    const casas = predios.filter((c) => c.tipo === 'favela' && Math.abs(c.x - p.x) < 14 && Math.abs(c.z - p.z) < 14)
    for (const c of casas.slice(0, 4)) {
      fios.push(catenaria(topo(p, rnd.chance(0.5) ? 0 : 2), new THREE.Vector3(c.x, c.y + c.h - 0.3, c.z), rnd.entre(0.4, 1.4), 6))
    }
  }

  const matrizes = postes.map((p) => matriz(p.x, p.y - 0.3, p.z, rnd.entre(-0.15, 0.15)))
  postes.forEach((p) => adicionarCirculo(p.x, p.z, 0.25))
  instanciar(cena, geometriaPoste(), toonVertice(), matrizes, null, 'postes', { peso: 0.6 })

  const malhaFios = new THREE.Mesh(geometriaFios(fios), toon('#231a33'))
  malhaFios.name = 'fios'
  malhaFios.userData.peso = 0.5
  cena.add(malhaFios)

  return { postes }
}

// carros: saíram em 16/10/2026 (anacronismo: os modelos eram de carro moderno, e a rua de 1932
// é de bonde, carroça e gente a pé)

// ---------- calçadão: bancos, lixeiras, carrinhos ----------

function calcadao(cena) {
  const lugares = { bancos: [], carrinhos: [] } // para as interações (sentar, pedir água de coco)
  const bancos = []
  const lixeiras = []
  const carrinhos = []
  const cocos = []
  const trechos = [trechosJogo.praiaDoPeixe, trechosJogo.praiaFormosa]
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
  const geoBanco = mergeGeometries([
    colorir(new THREE.BoxGeometry(1.8, 0.08, 0.5).translate(0, 0.45, 0), '#c98b4b'),
    colorir(new THREE.BoxGeometry(1.8, 0.45, 0.08).translate(0, 0.75, -0.24), '#c98b4b'),
    colorir(new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(-0.8, 0.22, 0), '#2a2840'),
    colorir(new THREE.BoxGeometry(0.08, 0.45, 0.45).translate(0.8, 0.22, 0), '#2a2840'),
  ])
  instanciar(cena, geoBanco, toonVertice(), bancos, null, 'bancos')
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
  instanciar(cena, geoRoupa, matRoupa, roupas, cores, 'roupas', { sombra: false })
}

export function criarRua(cena, predios, grade) {
  postesEFios(cena, predios, grade)
  const lugares = calcadao(cena)
  varais(cena, predios)
  return lugares
}
void placas
void bancas

export { LARG_CALCADAO }
