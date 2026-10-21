// Coqueiros. O tronco é uma malha curva; as folhas são tiras recortadas por um alpha map
// (máscara preto e branco desenhada no canvas: branco fica, preto some).

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  linhaCosta, larguraPraia, distCosta, rioX, RIO_MEIA_LARGURA, FIM_AVENIDA, pesos, fbm,
} from './mapa.js'
import { coqueirosDasVilas } from './vilas.js'
import { LIMITES, pesoCidade1932 } from './mapa.js'
import { alturaTerreno, inclinacao } from './terreno.js'
import { gradienteToon, texturaCanvas, pintar, texturizar } from '../materiais.js'
import { adicionarCirculo } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { criarAleatorio } from '../utils.js'
import { globais } from '../globais.js'
import { ref } from '../render/gpu/comum.js'
import { instanciarEmBlocos } from './blocos.js'
import { VARIANTES_SOMBRA, desenharMascaraSombra, tamanhoMascaraSombra } from './sombra-copa.js'

const rnd = criarAleatorio(99)

export function geometriaTronco() {
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25, 2.6, 0),
    new THREE.Vector3(0.9, 5.6, 0),
    new THREE.Vector3(1.9, 8.2, 0),
  ])
  const aneis = 16
  const lados = 6
  const pos = []
  const cor = []
  const idx = []
  // tronco do coqueiro gigante: cinza-pardo claro, fino (~35 cm na base), anéis um pouco mais escuros
  // (fotos de Platt, 1935: os troncos leem claros contra a copa)
  const marrom = new THREE.Color('#a59a86')
  const anel = new THREE.Color('#8a7f6c')
  for (let i = 0; i <= aneis; i++) {
    const t = i / aneis
    const p = curva.getPointAt(t)
    const tg = curva.getTangentAt(t)
    const lado = new THREE.Vector3(0, 0, 1)
    const frente = new THREE.Vector3().crossVectors(tg, lado).normalize()
    // os anéis do tronco do coqueiro
    const r = (0.19 - 0.06 * t + 0.08 * Math.max(0, 0.12 - t) / 0.12) * (1 + 0.08 * ((i % 2) === 0 ? 1 : -0.4)) // pé alargado
    const c = i % 2 === 0 ? anel : marrom
    for (let j = 0; j <= lados; j++) {
      const a = (j / lados) * Math.PI * 2
      const v = new THREE.Vector3().addScaledVector(lado, Math.cos(a) * r).addScaledVector(frente, Math.sin(a) * r).add(p)
      pos.push(v.x, v.y, v.z)
      cor.push(c.r, c.g, c.b)
    }
  }
  for (let i = 0; i < aneis; i++) {
    for (let j = 0; j < lados; j++) {
      const a = i * (lados + 1) + j
      const b = a + lados + 1
      idx.push(a, b, a + 1, a + 1, b, b + 1)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3))
  geo.setIndex(idx)
  geo.computeVertexNormals()

  // cocos
  const cocos = []
  const topo = curva.getPointAt(1)
  for (let k = 0; k < 4; k++) {
    const s = new THREE.SphereGeometry(0.22, 8, 6)
    const a = (k / 4) * Math.PI * 2
    s.translate(topo.x + Math.cos(a) * 0.3, topo.y - 0.35, topo.z + Math.sin(a) * 0.3)
    const n = s.attributes.position.count
    const cc = new THREE.Color('#6f8a2a')
    s.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n).fill(0).flatMap(() => [cc.r, cc.g, cc.b]), 3))
    s.deleteAttribute('uv')
    cocos.push(s)
  }
  geo.deleteAttribute('uv')
  return { geo: mergeGeometries([geo.toNonIndexed(), ...cocos.map((c) => c.toNonIndexed())]), topo }
}

export function geometriaCopa(topo) {
  const folhas = []
  const nFolhas = 10
  // cada folha usa uma variante da máscara da sombra (sombra-copa.js), sorteada com semente
  const rndV = criarAleatorio(1933)
  const variantes = Array.from({ length: nFolhas }, (_, k) => k % VARIANTES_SOMBRA)
  for (let i = variantes.length - 1; i > 0; i--) { const j = Math.floor(rndV.proximo() * (i + 1)); [variantes[i], variantes[j]] = [variantes[j], variantes[i]] }
  for (let k = 0; k < nFolhas; k++) {
    const ang = (k / nFolhas) * Math.PI * 2 + (k % 2) * 0.2
    const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang))
    const lateral = new THREE.Vector3(-dir.z, 0, dir.x)
    const comp = 4.2 + (k % 3) * 0.5
    const segs = 7
    const pos = []
    const uv = []
    const uv1 = [] // a máscara da sombra: variante k na textura de variantes lado a lado
    const cor = []
    const idx = []
    const base = new THREE.Color('#2f8f3a')
    const ponta = new THREE.Color('#a6d94f')
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      // sobe um pouco e depois cai, como folha de coqueiro
      const centro = topo.clone()
        .addScaledVector(dir, t * comp)
        .add(new THREE.Vector3(0, Math.sin(t * Math.PI * 0.7) * 1.1 - t * t * 2.4, 0))
      const larg = 1.5 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.04))
      const c = base.clone().lerp(ponta, t)
      // três vértices por fatia: a folha dobra em V ao longo da nervura
      for (const [u, l, dobra] of [[0, -1, -0.3], [0.5, 0, 0.12], [1, 1, -0.3]]) {
        const v = centro.clone().addScaledVector(lateral, (l * larg) / 2)
        v.y += dobra * larg
        pos.push(v.x, v.y, v.z)
        uv.push(u, t)
        uv1.push((variantes[k] + u) / VARIANTES_SOMBRA, t)
        cor.push(c.r, c.g, c.b)
      }
    }
    for (let i = 0; i < segs; i++) {
      const a = i * 3
      const b = a + 3
      idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3))
    g.setIndex(idx)
    folhas.push(g)
  }
  const geo = mergeGeometries(folhas)
  geo.computeVertexNormals()
  return geo
}

// A máscara da folha: nervura no meio e folíolos em diagonal (a que se vê). A da sombra é outra: sombra-copa.js.
function mascaraFolha(grossura = 5, n = 46) {
  return texturaCanvas(128, 512, (ctx, W, H) => {
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = '#fff'
    ctx.lineCap = 'round'
    for (let i = 0; i < n; i++) {
      const y = (i / n) * H
      ctx.lineWidth = grossura
      for (const lado of [-1, 1]) {
        ctx.beginPath()
        ctx.moveTo(W / 2, y)
        ctx.quadraticCurveTo(W / 2 + lado * W * 0.3, y + H * 0.02, W / 2 + lado * W * 0.48, y + H * 0.07)
        ctx.stroke()
      }
    }
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(W / 2, 0)
    ctx.lineTo(W / 2, H)
    ctx.stroke()
  }, { repetir: false, cor: false })
}

// 1932: coqueiral denso nas vilas de jangadeiros (fotos de Platt, 1935, e do Arquivo Nirez; ver
// docs/referencias-fotos-1932.md); as posições vêm de vilas.js. Fora delas, alguns em quintais da
// periferia. Só o coqueiro gigante (alto e fino).
function posicoes() {
  const lista = []
  const tentar = (x, z, escala = 1, noQuintal = false) => {
    if (!noQuintal && !ocupacao.livre(x, z, 1.2, 1.2)) return
    if (Math.abs(x - rioX(z)) < RIO_MEIA_LARGURA * 1.5) return
    if (!noQuintal) ocupacao.marcar(x, z, 1.4, 1.4)
    lista.push({ x, z, y: alturaTerreno(x, z), escala })
  }
  for (const c of coqueirosDasVilas) tentar(c.x, c.z, c.escala, c.noQuintal)
  const nVilas = lista.length
  for (let i = 0; i < 3000 && lista.length < nVilas + 90; i++) {
    const x = rnd.entre(LIMITES.x0 + 20, LIMITES.x1 - 20)
    const z = rnd.entre(-200, 700)
    if (distCosta(x, z) < larguraPraia(x) + FIM_AVENIDA + 4) continue
    const d = pesoCidade1932(x, z)
    if (d < 0.08 || d > 0.4) continue // quintal da periferia, não o centro
    if (rnd.chance(0.04)) tentar(x, z, rnd.entre(1.0, 1.3))
  }
  return lista
}

// O vento balança as folhas: mais na ponta, quase nada perto do tronco.
// Cada coqueiro tem sua fase (pela posição), para não balançarem todos juntos.
function balancarCopa(mat, cfg) {
  const u = { uTempoV: globais.uTempo, uVentoPalm: globais.uVentoPalm }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTempoV; uniform float uVentoPalm;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 baseV = vec3(0.0);
        #ifdef USE_INSTANCING
          baseV = instanceMatrix[3].xyz;
        #endif
        float ponta = max(0.0, length(transformed.xz - vec2(1.9, 0.0)) - 0.6);
        float fase = baseV.x * 0.13 + baseV.z * 0.07;
        float rajada = 0.6 + 0.4 * sin(uTempoV * 0.35 + baseV.x * 0.01);
        transformed.y += sin(uTempoV * 1.7 + fase + ponta * 0.6) * 0.07 * ponta * rajada * uVentoPalm;
        transformed.x += sin(uTempoV * 1.3 + fase) * 0.05 * ponta * rajada * uVentoPalm;
        transformed.z += cos(uTempoV * 1.1 + fase) * 0.05 * ponta * rajada * uVentoPalm;`)
  }
  // a mesma conta no modo webgpu (motor F2, KAN-68)
  mat.userData.tsl = {
    nome: 'copa-vento',
    posicao({ W, instancia }) {
      const { vec2, vec3, max, length, sin, cos, positionLocal } = W
      const t = ref(u.uTempoV), vento = ref(u.uVentoPalm)
      const p = positionLocal
      const baseV = instancia ? instancia.element(3).xyz : vec3(0.0)
      const ponta = max(0.0, length(p.xz.sub(vec2(1.9, 0.0))).sub(0.6))
      const fase = baseV.x.mul(0.13).add(baseV.z.mul(0.07))
      const rajada = sin(t.mul(0.35).add(baseV.x.mul(0.01))).mul(0.4).add(0.6)
      const k = ponta.mul(rajada).mul(vento)
      return vec3(
        p.x.add(sin(t.mul(1.3).add(fase)).mul(0.05).mul(k)),
        p.y.add(sin(t.mul(1.7).add(fase).add(ponta.mul(0.6))).mul(0.07).mul(k)),
        p.z.add(cos(t.mul(1.1).add(fase)).mul(0.05).mul(k)))
    },
  }
  return mat
}

// WebGL: o three monta o material de profundidade da sombra copiando o alphaMap do material; aqui, logo antes do
// desenho na sombra, ele troca pela máscara da sombra (lida pelo uv1; o material de profundidade é só da copa)
function sombraDaCopa(renderer, objeto, camera, cameraSombra, geometria, materialProf) {
  const mascara = objeto.material && objeto.material.userData.alphaMapSombra
  if (mascara && materialProf && !materialProf.isNodeMaterial) materialProf.alphaMap = mascara
}

// a máscara da sombra das folhas: variantes lado a lado, lidas pelo uv1 (geometriaCopa)
function mascaraSombraCopa() {
  const { largura, altura } = tamanhoMascaraSombra()
  const tex = texturaCanvas(largura, altura, (ctx) => desenharMascaraSombra(ctx), { repetir: false, cor: false })
  tex.channel = 1
  return tex
}

// formas e materiais do coqueiro (o jogo e a cidade de estresse do KAN-73 usam os mesmos)
export function pecasDoCoqueiro(cfg) {
  const { geo: geoTronco, topo } = geometriaTronco()
  const geoCopa = geometriaCopa(topo)
  // casca pintada com os anéis (visual Arcane)
  const matTronco = texturizar(pintar(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() }), 'toon-pintado'), { topo: 'tronco', lado: 'tronco', tam: 1.4, contraste: 1.3 })
  const matCopa = balancarCopa(new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: gradienteToon(),
    alphaMap: mascaraFolha(),
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  }), cfg)
  pintar(matCopa, 'copa-pintada')
  // a sombra da copa sai de uma máscara própria (sombra-copa.js): lida pelo passe de sombra do WebGL (sombraDaCopa,
  // em onBeforeShadow) e pelo do WebGPU (render/renderizador.js, sombraComoWebgl). Decidido ao criar (recarregar)
  if (cfg?.mundo?.sombraCopaCheia !== false) {
    Object.defineProperty(matCopa.userData, 'alphaMapSombra', { value: mascaraSombraCopa(), enumerable: false, configurable: true, writable: true })
  }
  texturizar(matCopa, { topo: 'folha', lado: 'folha', tam: 1.2, contraste: 0.9, massa: 0.3 }) // folhagem pintada (visual Arcane)
  return { geoTronco, geoCopa, matTronco, matCopa }
}

export function criarCoqueiros(cena, cfg) {
  const { geoTronco, geoCopa, matTronco, matCopa } = pecasDoCoqueiro(cfg)

  const lista = posicoes()
  const matrizes = []
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const s = new THREE.Vector3()
  const p = new THREE.Vector3()
  lista.forEach((c, i) => {
    e.set(rnd.entre(-0.05, 0.05), rnd.entre(0, Math.PI * 2), rnd.entre(-0.05, 0.05))
    q.setFromEuler(e)
    s.setScalar(c.escala)
    p.set(c.x, c.y - 0.2, c.z)
    m.compose(p, q, s)
    matrizes.push(m.clone())
    adicionarCirculo(c.x, c.z, 0.4 * c.escala)
  })
  instanciarEmBlocos(cena, geoTronco, matTronco, matrizes, null, { nome: 'coqueiros', placa: true })
  // as folhas não entram no passe de normais (a máscara não vale lá); o contorno vem da profundidade
  const copas = instanciarEmBlocos(cena, geoCopa, matCopa, matrizes, null, { nome: 'copas', semNormal: true, placa: true })
  if (matCopa.userData.alphaMapSombra) for (const im of [].concat(copas || [])) if (im && im.isObject3D) im.onBeforeShadow = sombraDaCopa
  // para a física: onde fica cada coqueiro e de onde o coco cai
  return {
    quantidade: lista.length,
    coqueiros: matrizes.map((mm) => ({ pos: new THREE.Vector3().setFromMatrixPosition(mm), copa: new THREE.Vector3(1.9, 8.0, 0).applyMatrix4(mm), espera: 0 })),
  }
}
