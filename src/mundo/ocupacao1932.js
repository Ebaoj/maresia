// A ocupação real de Fortaleza em 1932: onde havia lote, onde era rua e onde era
// terreno vazio.
//
// A fonte é o raster src/mundo/mapa1932-malha.png, escrito por docs/mapa-1932-lotes.py
// a partir da camada oficial "Evolucao Urbana 1932" da Prefeitura (10.519 lotes com
// o uso de cada um). O raster tem 3 m por pixel e três classes: a cor do uso (lote),
// a cor da rua e o fundo (terreno vazio).
//
// No jogo isso vira uma grade do mesmo passo do terreno (3 m), para o motor perguntar
// em O(1) se um ponto era cidade, era rua ou era campo. A leitura acontece no começo
// do jogo (carregarOcupacao1932), antes de montar o terreno.

import malhaUrl from './mapa1932-malha.png'
import { LON_POR_X, LAT_POR_Z, LIMITES, LUGARES_RESERVADOS, lugaresJogo } from './fortaleza1932.js'
import dados from './mapa1932-dados.json'
import { PEGADAS, noLargo } from './lotes-marcos.js'
import lotes from './mapa1932-lotes.json'

export const OCUPA_VAZIO = 0
export const OCUPA_RUA = 1
export const OCUPA_LOTE = 2 // 2 = o primeiro uso da lista; o uso 99 (favela) = 101

const CEL = LIMITES.passo
const NX = Math.ceil((LIMITES.x1 - LIMITES.x0) / CEL)
const NZ = Math.ceil((LIMITES.z1 - LIMITES.z0) / CEL)

// a grade da ocupação: a classe de cada célula, o uso e o peso (0 a 1) de cidade
let classe = null
let uso = null
let peso = null
let carregado = false
let desenho = null // o raster desenhado, para o minimapa mostrar a planta de verdade

// cor (rgb) -> classe do raster
function classesDasCores() {
  const mapa = new Map()
  const chave = (r, g, b) => (r << 16) | (g << 8) | b
  for (const [nome, cor] of Object.entries(dados.paleta)) {
    const r = parseInt(cor.slice(1, 3), 16)
    const g = parseInt(cor.slice(3, 5), 16)
    const b = parseInt(cor.slice(5, 7), 16)
    const cod = lotes.usos.indexOf(nome) + 1
    if (cod <= 0) continue
    // "Sem" e "Residencial" compartilham a cor no raster: quem entra primeiro fica
    if (!mapa.has(chave(r, g, b))) mapa.set(chave(r, g, b), cod + 1)
  }
  const rua = lotes.cor_rua
  mapa.set(chave(parseInt(rua.slice(1, 3), 16), parseInt(rua.slice(3, 5), 16), parseInt(rua.slice(5, 7), 16)), OCUPA_RUA)
  mapa.set(chave(0x6b, 0x4a, 0x2e), 99 + 1) // a favela
  return mapa
}

// longitude/latitude -> pixel do raster (a linha 0 e o norte)
function pixelDe(lon, lat) {
  const j = dados.janela
  const px = ((lon - j.lon_min) / (j.lon_max - j.lon_min)) * j.pixels[0]
  const py = ((j.lat_max - lat) / (j.lat_max - j.lat_min)) * j.pixels[1]
  return [px, py]
}

// o raster e lido uma vez; a classe de cada pixel vem da cor
async function lerRaster() {
  const res = await fetch(malhaUrl)
  if (!res.ok) throw new Error(`malha de 1932 nao carregou (${res.status})`)
  const bitmap = await createImageBitmap(await res.blob(), { imageOrientation: 'none' })
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(bitmap, 0, 0)
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  return { dados: img.data, w: canvas.width, h: canvas.height, canvas }
}

// Carrega o raster e monta a grade de ocupação do mundo.
export async function carregarOcupacao1932() {
  const { dados: pix, w, h, canvas } = await lerRaster()
  const cores = classesDasCores()
  const fundo = (244 << 16) | (236 << 8) | 216

  const classePx = new Uint8Array(w * h)
  const usoPx = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const k = (pix[o] << 16) | (pix[o + 1] << 8) | pix[o + 2]
    if (k === fundo) continue
    const c = cores.get(k)
    if (c === undefined) continue
    classePx[i] = c
    usoPx[i] = c - 1
  }

  classe = new Uint8Array(NX * NZ)
  uso = new Uint8Array(NX * NZ)
  peso = new Float32Array(NX * NZ)

  // cada célula do mundo pergunta ao raster: o centro e os quatro cantos
  for (let j = 0; j < NZ; j++) {
    const z = LIMITES.z0 + (j + 0.5) * CEL
    for (let i = 0; i < NX; i++) {
      const x = LIMITES.x0 + (i + 0.5) * CEL
      let melhor = OCUPA_VAZIO
      let melhorUso = 0
      let rua = false
      for (let k = 0; k < 5; k++) {
        const dx = k === 0 ? 0 : (k === 1 || k === 2 ? -CEL / 2 : CEL / 2)
        const dz = k === 0 ? 0 : (k === 1 || k === 3 ? -CEL / 2 : 0)
        const lon = LON_POR_X(x + dx)
        const lat = LAT_POR_Z(z + dz)
        const [px, py] = pixelDe(lon, lat)
        const ix = px | 0
        const iy = py | 0
        if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue
        const c = classePx[iy * w + ix]
        if (c >= OCUPA_LOTE) { melhor = c; melhorUso = usoPx[iy * w + ix] }
        else if (c === OCUPA_RUA) rua = true
      }
      const idx = j * NX + i
      classe[idx] = melhor !== OCUPA_VAZIO ? melhor : (rua ? OCUPA_RUA : OCUPA_VAZIO)
      uso[idx] = melhorUso
    }
  }

  // o peso: 1 dentro da cidade, 0 fora, com a borda macia (caixa 3x3)
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      let s = 0
      for (let b = -1; b <= 1; b++) {
        const jj = j + b
        if (jj < 0 || jj >= NZ) continue
        for (let a = -1; a <= 1; a++) {
          const ii = i + a
          if (ii < 0 || ii >= NX) continue
          if (classe[jj * NX + ii] !== OCUPA_VAZIO) s++
        }
      }
      peso[j * NX + i] = s / 9
    }
  }

  // As pracas e a estacao: a planta oficial nao tem lote ali (o terreo era publico),
  // mas o chao era de cidade, nao mato. Sem isso, a Praca do Ferreira virava capim.
  for (const [chave, raio] of LUGARES_RESERVADOS) {
    const [cx, cz] = lugaresJogo[chave]
    const r = raio + CEL
    const i0 = Math.max(0, Math.floor((cx - r - LIMITES.x0) / CEL))
    const i1 = Math.min(NX - 1, Math.floor((cx + r - LIMITES.x0) / CEL))
    const j0 = Math.max(0, Math.floor((cz - r - LIMITES.z0) / CEL))
    const j1 = Math.min(NZ - 1, Math.floor((cz + r - LIMITES.z0) / CEL))
    for (let j = j0; j <= j1; j++) {
      const z = LIMITES.z0 + (j + 0.5) * CEL
      for (let i = i0; i <= i1; i++) {
        const x = LIMITES.x0 + (i + 0.5) * CEL
        if (Math.hypot(x - cx, z - cz) > raio) continue
        const k = j * NX + i
        if (classe[k] === OCUPA_VAZIO) classe[k] = OCUPA_RUA
        peso[k] = 1
      }
    }
  }

  // Os marcos de 1932 em tamanho real (lotes-marcos.js): o terreno deles e o largo da frente são
  // chão de cidade (terra batida, pedra), não mato, mesmo onde a planta oficial não tem lote
  for (const p of Object.values(PEGADAS)) {
    const l = p.largo || [0, 0, 0, 0]
    const r = Math.hypot(Math.max(-p.x0, p.x1, -l[0], l[1]), Math.max(-p.z0, p.z1, -l[2], l[3])) + CEL
    const i0 = Math.max(0, Math.floor((p.x - r - LIMITES.x0) / CEL))
    const i1 = Math.min(NX - 1, Math.floor((p.x + r - LIMITES.x0) / CEL))
    const j0 = Math.max(0, Math.floor((p.z - r - LIMITES.z0) / CEL))
    const j1 = Math.min(NZ - 1, Math.floor((p.z + r - LIMITES.z0) / CEL))
    for (let j = j0; j <= j1; j++) {
      const z = LIMITES.z0 + (j + 0.5) * CEL
      for (let i = i0; i <= i1; i++) {
        const x = LIMITES.x0 + (i + 0.5) * CEL
        if (!noLargo(x, z)) continue
        const k = j * NX + i
        if (classe[k] === OCUPA_VAZIO) classe[k] = OCUPA_RUA
        peso[k] = 1
      }
    }
  }

  desenho = canvas
  carregado = true
  return { celulas: NX * NZ }
}

function indice(x, z) {
  const i = Math.floor((x - LIMITES.x0) / CEL)
  const j = Math.floor((z - LIMITES.z0) / CEL)
  if (i < 0 || j < 0 || i >= NX || j >= NZ) return -1
  return j * NX + i
}

// a classe do ponto: 0 vazio, 1 rua, 2+ o uso do lote
export function ocupacao1932(x, z) {
  if (!classe) return OCUPA_VAZIO
  const k = indice(x, z)
  return k < 0 ? OCUPA_VAZIO : classe[k]
}

// o uso do lote no ponto (0 = nada); 99 = a favela
export function uso1932(x, z) {
  if (!uso) return 0
  const k = indice(x, z)
  return k < 0 ? 0 : uso[k]
}

// 0 a 1: o quanto aquele ponto era cidade de verdade
export function pesoCidade1932(x, z) {
  if (!peso) return 0
  const k = indice(x, z)
  return k < 0 ? 0 : peso[k]
}

// era rua de verdade (e nao o interior de um lote)?
export function eraRua1932(x, z) {
  return ocupacao1932(x, z) === OCUPA_RUA
}

// o ponto estava dentro do tecido construido de 1932?
export function naCidade1932(x, z) {
  return ocupacao1932(x, z) !== OCUPA_VAZIO
}

export function ocupacaoCarregada() {
  return carregado
}

// A grade de ocupacao pronta, para quem precisa dela inteira (o chao de 1932
// mede a distancia de cada celula ate a rua). A classe de cada celula: 0
// vazio, 1 rua, 2+ o uso do lote.
export function gradeOcupacao1932() {
  if (!classe) return null
  return { classe, nx: NX, nz: NZ, x0: LIMITES.x0, z0: LIMITES.z0, passo: CEL }
}

// o raster desenhado: o minimapa usa para mostrar a planta de 1932 como ela e
export function malha1932() {
  return desenho
}
