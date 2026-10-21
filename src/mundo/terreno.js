import * as THREE from 'three'
import {
  LIMITES, alturaBruta, distCosta, larguraPraia, fbm, smooth, mix,
  FIM_AVENIDA, densidadeGrama, rioX, RIO_MEIA_LARGURA, pesoCidade1932,
} from './mapa.js'
import { lagoasJogo, lugaresJogo } from './fortaleza1932.js'
import { gradienteToon, pintar, texturizar } from '../materiais.js'
import { congelar } from './congelar.js'
import { ref } from '../render/gpu/comum.js'
import { GLSL_CALAMENTO, GLSL_CALAMENTO_UNIFORM, sincronizarCalamento, tslCalamento, uCalamento } from './calamento.js'

const { x0, x1, z0, z1, passo } = LIMITES
export const NX = Math.round((x1 - x0) / passo) + 1
export const NZ = Math.round((z1 - z0) / passo) + 1
export const alturas = new Float32Array(NX * NZ)
const densidades = new Float32Array(NX * NZ)
const areias = new Float32Array(NX * NZ) // 1 = praia (areia que afunda)

// A malha fina de areia (areia.js) ocupa um quadrado em volta do jogador; ali o chão grosso some.
export const uAreiaTerreno = { uAreiaCentro: { value: new THREE.Vector2(1e6, 1e6) }, uAreiaMeia: { value: 0 } }

// Calcula a altura de cada ponto da grade uma vez só, no início.
export function calcularAlturas() {
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      alturas[j * NX + i] = alturaBruta(x0 + i * passo, z0 + j * passo)
    }
  }
}

// Altura em qualquer ponto, interpolando a grade (bate com a malha desenhada).
export function alturaTerreno(x, z) {
  const fx = (x - x0) / passo
  const fz = (z - z0) / passo
  if (fx < 0 || fz < 0 || fx > NX - 1 || fz > NZ - 1) return alturaBruta(x, z)
  const i = Math.min(NX - 2, Math.floor(fx))
  const j = Math.min(NZ - 2, Math.floor(fz))
  const tx = fx - i
  const tz = fz - j
  const a = alturas[j * NX + i]
  const b = alturas[j * NX + i + 1]
  const c = alturas[(j + 1) * NX + i]
  const d = alturas[(j + 1) * NX + i + 1]
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz
}

// Num retângulo do mundo: a maior densidade de grama e a faixa de altura do chão.
// A grama usa para pular blocos sem nenhuma folha viva e para testar se o bloco está na tela.
export function resumoRetangulo(xa, za, xb, zb, saida) {
  const ia = Math.max(0, Math.floor((xa - x0) / passo))
  const ib = Math.min(NX - 1, Math.ceil((xb - x0) / passo))
  const ja = Math.max(0, Math.floor((za - z0) / passo))
  const jb = Math.min(NZ - 1, Math.ceil((zb - z0) / passo))
  let dens = 0
  let hMin = Infinity
  let hMax = -Infinity
  for (let j = ja; j <= jb; j++) {
    for (let i = ia; i <= ib; i++) {
      const k = j * NX + i
      if (densidades[k] > dens) dens = densidades[k]
      if (alturas[k] < hMin) hMin = alturas[k]
      if (alturas[k] > hMax) hMax = alturas[k]
    }
  }
  if (ia > ib || ja > jb) { dens = 0; hMin = 0; hMax = 0 } // fora do mapa: não há grama
  saida.dens = dens
  saida.hMin = hMin
  saida.hMax = hMax
  return saida
}

export function inclinacao(x, z) {
  const e = 1.5
  const hx = alturaTerreno(x + e, z) - alturaTerreno(x - e, z)
  const hz = alturaTerreno(x, z + e) - alturaTerreno(x, z - e)
  return Math.hypot(hx, hz) / (2 * e)
}

const C = (hex) => new THREE.Color(hex)
const PALETA = {
  areiaSeca: C('#f6d9a0'),
  areiaMolhada: C('#d6ab72'),
  fundoMar: C('#c9a46e'),
  grama: C('#7aa85a'),
  gramaEscura: C('#3f7f52'),
  baseGrama: C('#3d6e3a'), // mesma cor da base das folhas: o vão entre elas não vira buraco
  mata: C('#1d7a4c'),
  rocha: C('#a3909a'),
  pedra: C('#d3b08e'),
  pedra2: C('#b98f78'),
  areiaChao: C('#e9d7ae'),
  terraBatida: C('#cdb58c'),
  duna: C('#f8e3b4'),
  serra: C('#3f9a62'),
  lama: C('#8e7a5c'),
}

const [pfX, pfZ] = lugaresJogo.pracaFerreira
// calçamento de pedra só no centro de 1932; no resto as ruas eram de areia
function calcamento(x, z) {
  const centro = 1 - smooth(260, 380, Math.hypot(x - pfX, (z - pfZ) * 1.15))
  return centro * smooth(0.12, 0.3, pesoCidade1932(x, z))
}

export function corChao(x, z, h, incl, dens, alvo) {
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  const variacao = fbm(x * 0.09, z * 0.09, 2, 71)
  if (s < 0) {
    alvo.copy(PALETA.fundoMar)
  } else if (s < bw) {
    alvo.copy(PALETA.areiaMolhada).lerp(PALETA.areiaSeca, smooth(0, 7, s))
  } else {
    // chão de Fortaleza: areia clara do tabuleiro, batida onde havia gente
    const cidade = smooth(0.05, 0.3, pesoCidade1932(x, z))
    alvo.copy(PALETA.areiaChao).lerp(PALETA.terraBatida, cidade * 0.8)
    // rua da praia: areia batida
    alvo.lerp(PALETA.terraBatida, 1 - smooth(bw + FIM_AVENIDA, bw + FIM_AVENIDA + 4, s))
    // dunas: areia branca, mais clara quanto mais alta
    alvo.lerp(PALETA.duna, smooth(7, 12, h) * (1 - cidade))
    // onde tem grama, o chão fica verde
    alvo.lerp(PALETA.baseGrama.clone().lerp(PALETA.gramaEscura, smooth(-0.3, 0.3, variacao) * 0.4), smooth(0.05, 0.45, dens))
  }
  // margens do rio e das lagoas: lama de mangue e de várzea
  const dr = Math.abs(x - rioX(z))
  if (s > 0) alvo.lerp(PALETA.lama, 1 - smooth(RIO_MEIA_LARGURA * 0.9, RIO_MEIA_LARGURA * 1.8, dr))
  for (const l of lagoasJogo) {
    const q = Math.hypot((x - l.x) / l.rx, (z - l.z) / l.rz)
    if (q < 1.6) alvo.lerp(PALETA.lama, 1 - smooth(0.9, 1.5, q))
  }
  // encosta íngreme
  alvo.lerp(PALETA.rocha, smooth(0.85, 1.3, incl) * 0.5)
  // manchas de pintura
  alvo.multiplyScalar(1 + variacao * 0.12)
  return alvo
}

// O terreno é montado em pedaços de 96 m (48 células). Cada pedaço tem duas malhas: a detalhada
// (passo 2 m) perto da câmera e a simples (passo 8 m) longe, com uma saia vertical que esconde a
// fresta entre resoluções. Normais, cor e piso vêm da grade inteira: nada de costura entre pedaços.
const CEL_PEDACO = 48
export function criarTerreno(cena, cfg) {
  const t0 = performance.now()
  calcularAlturas()
  sincronizarCalamento(cfg)
  const t1 = performance.now()

  const cores = new Float32Array(NX * NZ * 3)
  const piso = new Float32Array(NX * NZ)
  const normais = new Float32Array(NX * NZ * 3)
  const cor = new THREE.Color()
  const h = (i, j) => alturas[Math.min(NZ - 1, Math.max(0, j)) * NX + Math.min(NX - 1, Math.max(0, i))]
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i
      const x = x0 + i * passo
      const z = z0 + j * passo
      const hh = alturas[k]
      const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * passo)
      const dz = (h(i, j + 1) - h(i, j - 1)) / (2 * passo)
      const incl = Math.hypot(dx, dz)
      const nl = 1 / Math.sqrt(dx * dx + dz * dz + 1)
      normais[k * 3] = -dx * nl
      normais[k * 3 + 1] = nl
      normais[k * 3 + 2] = -dz * nl
      const dens = densidadeGrama(x, z, hh, incl)
      densidades[k] = dens
      const sc = distCosta(x, z)
      areias[k] = sc > -3 && sc < larguraPraia(x) - 0.3 ? 1 : 0
      corChao(x, z, hh, incl, dens, cor)
      piso[k] = calcamento(x, z) * (1 - dens) * (sc > larguraPraia(x) + FIM_AVENIDA + 2 ? 1 : 0)
      cores[k * 3] = cor.r
      cores[k * 3 + 1] = cor.g
      cores[k * 3 + 2] = cor.b
    }
  }

  const t2 = performance.now()
  const material = materialTerreno()
  const grupo = new THREE.Group()
  grupo.name = 'terreno'
  const pedacos = []
  const montar = (i0, j0, n, salto, saia) => {
    const m = Math.floor(n / salto) + 1
    const pos = []
    const nor = []
    const col = []
    const ps = []
    const ar = []
    const idx = []
    const ponto = (i, j, desce) => {
      const ii = Math.min(NX - 1, i0 + i * salto)
      const jj = Math.min(NZ - 1, j0 + j * salto)
      const k = jj * NX + ii
      pos.push(x0 + ii * passo, alturas[k] - desce, z0 + jj * passo)
      nor.push(normais[k * 3], normais[k * 3 + 1], normais[k * 3 + 2])
      col.push(cores[k * 3], cores[k * 3 + 1], cores[k * 3 + 2])
      ps.push(piso[k])
      ar.push(areias[k])
      return pos.length / 3 - 1
    }
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) ponto(i, j, 0)
    for (let j = 0; j < m - 1; j++) {
      for (let i = 0; i < m - 1; i++) {
        const a = j * m + i
        idx.push(a, a + m, a + 1, a + 1, a + m, a + m + 1)
      }
    }
    if (saia) {
      // borda que desce 2 m nos quatro lados
      const borda = []
      for (let i = 0; i < m; i++) borda.push([i, 0])
      for (let j = 1; j < m; j++) borda.push([m - 1, j])
      for (let i = m - 2; i >= 0; i--) borda.push([i, m - 1])
      for (let j = m - 2; j > 0; j--) borda.push([0, j])
      borda.push([0, 0])
      for (let b = 0; b < borda.length - 1; b++) {
        const [ia, ja] = borda[b]
        const [ib, jb] = borda[b + 1]
        const a = ja * m + ia
        const c = jb * m + ib
        const a2 = ponto(ia, ja, 2)
        const c2 = ponto(ib, jb, 2)
        idx.push(a, c, a2, c, c2, a2, a, a2, c, c, a2, c2)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    g.setAttribute('aPiso', new THREE.Float32BufferAttribute(ps, 1))
    g.setAttribute('aAreia', new THREE.Float32BufferAttribute(ar, 1))
    g.setIndex(idx)
    g.computeBoundingSphere()
    const malha = new THREE.Mesh(g, material)
    malha.receiveShadow = true
    malha.castShadow = false // o chão só recebe sombra; projetar custava caro
    malha.name = 'terreno'
    return malha
  }
  for (let j0 = 0; j0 < NZ - 1; j0 += CEL_PEDACO) {
    for (let i0 = 0; i0 < NX - 1; i0 += CEL_PEDACO) {
      const n = Math.min(CEL_PEDACO, NX - 1 - i0, NZ - 1 - j0)
      const nI = Math.min(CEL_PEDACO, NX - 1 - i0)
      const nJ = Math.min(CEL_PEDACO, NZ - 1 - j0)
      const lado = Math.max(nI, nJ)
      const perto = montar(i0, j0, lado, 1, false)
      const longe = montar(i0, j0, lado, 4, true)
      longe.visible = false
      grupo.add(congelar(perto), congelar(longe))
      pedacos.push({ perto, longe, cx: x0 + (i0 + lado / 2) * passo, cz: z0 + (j0 + lado / 2) * passo, ehPerto: true })
      void n
    }
  }
  cena.add(congelar(grupo))
  // tempo de cada parte (para medir o carregamento no console: window.__tTerreno)
  window.__tTerreno = { alturas: Math.round(t1 - t0), coresEGrama: Math.round(t2 - t1), pedacos: Math.round(performance.now() - t2) }

  const LONGE = 230
  return {
    malha: grupo,
    mapaAltura: criarMapaAltura(),
    atualizar(camera) {
      sincronizarCalamento(cfg) // o painel mexe no calçamento ao vivo
      const px = camera.position.x
      const pz = camera.position.z
      for (const p of pedacos) {
        const d = Math.hypot(p.cx - px, p.cz - pz)
        const perto = p.ehPerto ? d < LONGE + 20 : d < LONGE
        if (perto === p.ehPerto) continue
        p.ehPerto = perto
        p.perto.visible = perto
        p.longe.visible = !perto
      }
    },
  }
}

// Chão com paralelepípedo desenhado no shader (fileiras desencontradas, rejunte escuro),
// que some com a distância para não virar chiado.
function materialTerreno() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uAreiaTerreno, uCalamento)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPiso; varying float vPiso; attribute float aAreia; varying float vAreia;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPiso = aPiso; vAreia = aAreia;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vPiso; varying float vAreia;
        uniform vec2 uAreiaCentro; uniform float uAreiaMeia;
        ${GLSL_CALAMENTO_UNIFORM}
        float hPav(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // dentro do quadrado da areia fina, quem desenha a praia é ela
        vec2 dA = abs(vPMundo.xz - uAreiaCentro);
        if (vAreia > 0.7 && max(dA.x, dA.y) < uAreiaMeia) discard;
        if (vPiso > 0.01) {
          ${GLSL_CALAMENTO}
        }`)
  }
  mat.userData.tsl = terrenoTsl()
  // textura pintada (visual Arcane): a mesma da areia fina, senão o quadrado de 24 m em volta do jogador emenda
  return texturizar(pintar(mat, 'terreno-pintado'), { topo: 'areia', lado: 'pedra', tam: 3, contraste: 1.4, massa: 0.9 })
}

// O mesmo trecho de cor em TSL, para o modo webgpu (motor F2, KAN-68)
function terrenoTsl() {
  return {
    nome: 'terreno',
    cor({ W }, rgb0) {
      const { Fn, vec2, vec3, abs, max, attribute, positionWorld, Discard } = W
      return Fn(() => {
        const vPiso = attribute('aPiso', 'float')
        const vAreia = attribute('aAreia', 'float')
        const rgb = vec3(rgb0).toVar()
        // dentro do quadrado da areia fina, quem desenha a praia é ela
        const dA = abs(positionWorld.xz.sub(ref(uAreiaTerreno.uAreiaCentro)))
        Discard(vAreia.greaterThan(0.7).and(max(dA.x, dA.y).lessThan(ref(uAreiaTerreno.uAreiaMeia))))
        rgb.assign(tslCalamento(W, rgb, vPiso))
        return rgb
      })()
    },
  }
}

// O mesmo mapa de alturas vira uma textura para a GPU:
// a grama e o mar leem a altura do chão direto no shader.
// Canal R = altura, G = densidade de grama, B = praia.
function criarMapaAltura() {
  const dados = new Uint16Array(NX * NZ * 4)
  const um = THREE.DataUtils.toHalfFloat(1)
  for (let k = 0; k < NX * NZ; k++) {
    dados[k * 4] = THREE.DataUtils.toHalfFloat(alturas[k])
    dados[k * 4 + 1] = THREE.DataUtils.toHalfFloat(densidades[k])
    dados[k * 4 + 2] = THREE.DataUtils.toHalfFloat(areias[k])
    dados[k * 4 + 3] = um
  }
  const tex = new THREE.DataTexture(dados, NX, NZ, THREE.RGBAFormat, THREE.HalfFloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return {
    textura: tex,
    uMapa: new THREE.Vector4(x0, z0, passo, 0),
    uMapaTam: new THREE.Vector2(NX, NZ),
  }
}

export { mix }
