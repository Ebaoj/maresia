import * as THREE from 'three'
import {
  LIMITES, alturaBruta, distCosta, larguraPraia, pesos, fbm, smooth, mix,
  FIM_AVENIDA, densidadeGrama, rioX, RIO_MEIA_LARGURA,
} from './mapa.js'
import { gradienteToon, pintar } from '../materiais.js'

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
  duna: C('#f8e3b4'),
  serra: C('#3f9a62'),
  lama: C('#8e7a5c'),
}

function corChao(x, z, h, incl, dens, alvo) {
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  const variacao = fbm(x * 0.09, z * 0.09, 2, 71)
  if (s < 0) {
    alvo.copy(PALETA.fundoMar)
  } else if (s < bw) {
    alvo.copy(PALETA.areiaMolhada).lerp(PALETA.areiaSeca, smooth(0, 7, s))
  } else if (s < bw + FIM_AVENIDA + 3) {
    alvo.copy(PALETA.pedra)
  } else {
    const p = pesos(x)
    const t = new THREE.Color()
    // chão de cada bairro, misturado nas transições
    const rio = PALETA.grama.clone().lerp(PALETA.mata, smooth(6, 34, h))
    const recife = PALETA.pedra.clone().lerp(PALETA.pedra2, smooth(-0.3, 0.4, variacao))
    const forta = PALETA.areiaSeca.clone().lerp(PALETA.grama, 0.35)
    t.setRGB(0, 0, 0)
      .add(rio.multiplyScalar(p.rio))
      .add(recife.multiplyScalar(p.recife))
      .add(forta.multiplyScalar(p.fortaleza))
    // dunas
    t.lerp(PALETA.duna, smooth(290, 340, x) * smooth(4, 9, h))
    // onde tem grama, o chão fica verde
    t.lerp(PALETA.baseGrama.clone().lerp(PALETA.gramaEscura, smooth(-0.3, 0.3, variacao) * 0.4), smooth(0.05, 0.45, dens))
    // serra
    t.lerp(PALETA.serra, smooth(310, 360, z))
    alvo.copy(t)
  }
  // barranco do rio
  const dr = Math.abs(x - rioX(z))
  if (pesos(x).recife > 0.5 && dr < RIO_MEIA_LARGURA * 1.5 && s > 0) alvo.lerp(PALETA.lama, 1 - smooth(RIO_MEIA_LARGURA * 0.9, RIO_MEIA_LARGURA * 1.5, dr))
  // encosta íngreme mostra a pedra
  alvo.lerp(PALETA.rocha, smooth(0.85, 1.3, incl))
  // manchas de pintura
  alvo.multiplyScalar(1 + variacao * 0.12)
  return alvo
}

export function criarTerreno(cena) {
  calcularAlturas()

  const pos = new Float32Array(NX * NZ * 3)
  const cores = new Float32Array(NX * NZ * 3)
  const piso = new Float32Array(NX * NZ)
  const cor = new THREE.Color()
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i
      const x = x0 + i * passo
      const z = z0 + j * passo
      const h = alturas[k]
      pos[k * 3] = x
      pos[k * 3 + 1] = h
      pos[k * 3 + 2] = z
      const incl = inclinacao(x, z)
      const dens = densidadeGrama(x, z, h, incl)
      densidades[k] = dens
      const sc = distCosta(x, z)
      areias[k] = sc > -3 && sc < larguraPraia(x) - 0.3 ? 1 : 0
      corChao(x, z, h, incl, dens, cor)
      // paralelepípedo nas ruas do Recife e de Fortaleza (onde não é grama nem areia)
      const pp = pesos(x)
      const cidade = smooth(larguraPraia(x) + FIM_AVENIDA + 1, larguraPraia(x) + FIM_AVENIDA + 3, distCosta(x, z))
      piso[k] = cidade * (1 - dens) * (pp.recife + pp.fortaleza * (1 - smooth(290, 330, x))) * (1 - smooth(4, 8, h)) * (h > 0.8 ? 1 : 0)
      cores[k * 3] = cor.r
      cores[k * 3 + 1] = cor.g
      cores[k * 3 + 2] = cor.b
    }
  }

  const indices = new Uint32Array((NX - 1) * (NZ - 1) * 6)
  let n = 0
  for (let j = 0; j < NZ - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i
      const b = a + 1
      const c = a + NX
      const d = c + 1
      indices[n++] = a; indices[n++] = c; indices[n++] = b
      indices[n++] = b; indices[n++] = c; indices[n++] = d
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3))
  geo.setAttribute('aPiso', new THREE.BufferAttribute(piso, 1))
  geo.setAttribute('aAreia', new THREE.BufferAttribute(areias, 1))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  geo.computeVertexNormals()

  const malha = new THREE.Mesh(geo, materialTerreno())
  malha.receiveShadow = true
  malha.castShadow = false // o chão só recebe sombra; projetar custava caro
  malha.name = 'terreno'
  cena.add(malha)

  return { malha, mapaAltura: criarMapaAltura() }
}

// Chão com paralelepípedo desenhado no shader (fileiras desencontradas, rejunte escuro),
// que some com a distância para não virar chiado.
function materialTerreno() {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon() })
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uAreiaTerreno)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPiso; varying float vPiso; attribute float aAreia; varying float vAreia;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPiso = aPiso; vAreia = aAreia;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vPiso; varying float vAreia;
        uniform vec2 uAreiaCentro; uniform float uAreiaMeia;
        float hPav(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // dentro do quadrado da areia fina, quem desenha a praia é ela
        vec2 dA = abs(vPMundo.xz - uAreiaCentro);
        if (vAreia > 0.7 && max(dA.x, dA.y) < uAreiaMeia) discard;
        if (vPiso > 0.01) {
          // pedra tosca de 1932: células irregulares (voronoi), cada pedra com seu tom,
          // juntas de areia, centro abaulado e beira escura. Nada de grade de tijolinho.
          vec2 q = vPMundo.xz * 3.8; // pedras de ~26 cm
          vec2 iq = floor(q), fq = fract(q);
          float d1 = 8.0, d2 = 8.0; vec2 idp = vec2(0.0);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = vec2(hPav(iq + g), hPav(iq + g + 17.3)) * 0.8 + 0.1;
            vec2 r = g + o - fq;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; idp = iq + g; } else if (d < d2) { d2 = d; }
          }
          float borda = sqrt(d2) - sqrt(d1);
          float pedra = smoothstep(0.04, 0.14, borda);
          float tom = hPav(idp + 3.1);
          // pedra do Mucuripe: acinzentada, com algumas mais quentes
          vec3 baseP = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))) * vec3(1.02, 0.98, 0.93), 0.45);
          vec3 c = baseP * mix(0.74, 1.14, tom) * mix(vec3(1.0), vec3(1.06, 0.97, 0.88), step(0.72, hPav(idp + 9.7)));
          c *= 1.0 + 0.1 * smoothstep(0.14, 0.4, borda) - 0.06; // centro abaulado
          vec3 junta = mix(c * 0.5, vec3(0.72, 0.62, 0.48), 0.45);
          c = mix(junta, c, pedra);
          float longe = 1.0 - smoothstep(25.0, 70.0, distance(cameraPosition, vPMundo));
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.92, c, longe), vPiso);
        }`)
  }
  return pintar(mat, 'terreno-pintado')
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
