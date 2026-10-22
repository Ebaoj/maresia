// O galpão do Campo do Urubu e as redes (geometria; a planta está em urubu-planta.js).
//
// FATO (relatório médico de ago/1933, via Diário do Nordeste): "grandes galpões cobertos de folha de zinco";
// "no travejamento de madeira e em estacas numerosas eram armadas as redes".
// HIPÓTESE: a medida (48 x 12 m), os esteios a cada 4 m, as paredes parciais de tábua e de taipa (o conceito
// aprovado, docs/referencias/conceito-sertao/3-campo-urubu.png, mostra o galpão de tábua e zinco aberto).
//
// Coordenada local do galpão: x ao longo do comprimento, z na largura (o vão das redes), y para cima, origem
// no chão, no meio. Tudo com cor por vértice (toonVertice escreve gLuz) e sem índice, para juntar por bloco.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { colorir } from './cenografia.js'
import { CAL } from '../paleta.js'
import { criarAleatorio } from '../utils.js'

export const ZINCO = '#c4c0b4'
const ZINCO_VELHO = '#b5b0a4'
const FERRUGEM = '#a48a74' // a folha velha: ferrugem apagada (taipa com o cinza do zinco), como no conceito
const ESTEIO = '#6e5a44'
const TABUAS = [CAL.piuba, '#8f785c', '#7d6a52', CAL.piuba, '#96806a']
const caixa = (l, a, p, x, y, z, cor) => colorir(new THREE.BoxGeometry(l, a, p).translate(x, y, z), cor)

// folha de zinco ondulado: a onda é feita pela normal (faixas que acendem e apagam no toon), não por geometria.
// Deitada no plano xz, largura em x, comprimento em z, origem na beira de cima
function folhaZinco (larg, comp, cor, faixas = 6) {
  const pos = []
  const nor = []
  const c = new THREE.Color(cor)
  for (let i = 0; i < faixas; i++) {
    const x0 = -larg / 2 + (i * larg) / faixas
    const x1 = x0 + larg / faixas
    const inc = (i % 2 ? 1 : -1) * 0.42 // metade das faixas olha para um lado, metade para o outro
    const nx = Math.sin(inc)
    const ny = Math.cos(inc)
    // em cima
    pos.push(x0, 0, 0, x0, 0, comp, x1, 0, 0, x1, 0, 0, x0, 0, comp, x1, 0, comp)
    for (let k = 0; k < 6; k++) nor.push(nx, ny, 0)
  }
  // embaixo, lisa (de dentro do galpão se vê a folha por baixo)
  pos.push(-larg / 2, -0.02, 0, larg / 2, -0.02, 0, -larg / 2, -0.02, comp, larg / 2, -0.02, 0, larg / 2, -0.02, comp, -larg / 2, -0.02, comp)
  for (let k = 0; k < 6; k++) nor.push(0, -1, 0)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  const n = pos.length / 3
  const cores = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) cores.set([c.r, c.g, c.b], i * 3)
  g.setAttribute('color', new THREE.BufferAttribute(cores, 3))
  return g
}

// as duas águas do telhado: folhas de 0,8 m em fileiras de 2,4 m, com sobreposição e algumas enferrujadas
function telhado (L, P, beiral, cumeeira, ferrugem, rnd, partes) {
  const beira = 0.6
  const meia = P / 2 + beira
  const queda = (cumeeira - beiral) / (P / 2)
  const ang = Math.atan(queda)
  const compAgua = meia / Math.cos(ang)
  const fileiras = Math.ceil(compAgua / 2.2)
  for (const lado of [1, -1]) {
    for (let x = -L / 2 - 0.4; x < L / 2 + 0.4; x += 0.8) {
      for (let f = 0; f < fileiras; f++) {
        const r = rnd.proximo()
        const cor = r < ferrugem ? FERRUGEM : r < ferrugem + 0.2 ? ZINCO_VELHO : ZINCO
        const s0 = f * 2.2
        const folha = folhaZinco(0.84, Math.min(2.4, compAgua - s0 + 0.05), cor)
        // da cumeeira para fora, caindo; cada fileira um pouco acima da anterior (a folha de cima cobre a de baixo)
        const s = s0
        const m = new THREE.Matrix4().makeRotationY(lado < 0 ? Math.PI : 0)
        m.multiply(new THREE.Matrix4().makeTranslation(0, cumeeira + 0.06 - Math.sin(ang) * s + 0.015 * (fileiras - f), Math.cos(ang) * s))
        m.multiply(new THREE.Matrix4().makeRotationX(ang))
        folha.applyMatrix4(m.premultiply(new THREE.Matrix4().makeTranslation(x + rnd.entre(-0.02, 0.02), 0, 0)))
        partes.push(folha)
      }
    }
  }
}

// parede de tábua em pé, de x0 a x1 em z, até a altura h (com as frestas entre as tábuas)
function paredeTabua (x0, x1, z, h, rnd, partes, eixo = 'x') {
  for (let x = x0; x < x1 - 0.05; x += 0.25) {
    const a = h - rnd.entre(0, 0.12)
    const cor = rnd.escolha(TABUAS)
    if (eixo === 'x') partes.push(caixa(0.22, a, 0.03, x + 0.11, a / 2, z, cor))
    else partes.push(caixa(0.03, a, 0.22, z, a / 2, x + 0.11, cor))
  }
}

// cabeceira de taipa: barro na trama de vara, cal descascando por cima
function paredeTaipa (x, P, h, rnd, partes) {
  partes.push(caixa(0.16, h, P, x, h / 2, 0, CAL.taipa))
  for (let i = 0; i < 5; i++) {
    const l = rnd.entre(0.8, 2.6)
    const a = rnd.entre(0.5, 1.4)
    partes.push(caixa(0.18, a, l, x, rnd.entre(0.4, h - 0.6), rnd.entre(-P / 2 + l / 2, P / 2 - l / 2), CAL.calVelha))
  }
}

// tipo: 'aberto' (rodapé de tábua num lado, uma cabeceira de taipa), 'parede' (parede de tábua inteira num lado,
// as duas cabeceiras de taipa), 'fechado' (o galpão dos fundos: tábua nos dois lados, porta no meio)
export function geometriaGalpao (L, P, beiral, cumeeira, tipo, ferrugem = 0.35, semente = 1) {
  const rnd = criarAleatorio(semente)
  const partes = []
  const queda = (cumeeira - beiral) / (P / 2)
  const alturaEm = (z) => cumeeira - Math.abs(z) * queda
  // esteios: a cada 4 m no comprimento, quatro linhas na largura; os do meio sobem até o telhado
  const linhas = []
  for (let z = -P / 2; z <= P / 2 + 0.01; z += 4) linhas.push(z)
  for (let x = -L / 2; x <= L / 2 + 0.01; x += 4) {
    for (const z of linhas) {
      const h = alturaEm(z) + 0.8
      partes.push(caixa(0.15, h, 0.15, x + rnd.entre(-0.03, 0.03), h / 2 - 0.8, z, ESTEIO))
    }
    // pendural da cumeeira a cada 8 m
    if (Math.round(x / 4) % 2 === 0) partes.push(caixa(0.12, cumeeira + 0.8, 0.12, x, (cumeeira + 0.8) / 2 - 0.8, 0, ESTEIO))
  }
  // o travejamento: a travessa das redes em cada linha de esteios (2,05 m), o frechal no beiral, a cumeeira
  for (const z of linhas) partes.push(caixa(L + 0.3, 0.13, 0.11, 0, 2.05, z, ESTEIO))
  for (const z of [-P / 2, P / 2]) partes.push(caixa(L + 0.3, 0.12, 0.12, 0, beiral, z, ESTEIO))
  partes.push(caixa(L + 0.3, 0.14, 0.12, 0, cumeeira - 0.05, 0, ESTEIO))
  // caibros a cada 2 m, das duas águas
  const ang = Math.atan(queda)
  const compCaibro = (P / 2 + 0.6) / Math.cos(ang)
  for (let x = -L / 2; x <= L / 2 + 0.01; x += 2) {
    for (const lado of [1, -1]) {
      const g = new THREE.BoxGeometry(0.07, 0.1, compCaibro).translate(0, 0, compCaibro / 2)
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(ang))
      if (lado < 0) g.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI))
      g.translate(x, cumeeira - 0.04, 0)
      partes.push(colorir(g, ESTEIO))
    }
  }
  telhado(L, P, beiral, cumeeira, ferrugem, rnd, partes)
  // as paredes
  if (tipo === 'aberto') {
    paredeTabua(-L / 2, L / 2, -P / 2 - 0.1, 1.1, rnd, partes)
    paredeTaipa(-L / 2 - 0.1, P, beiral, rnd, partes)
  } else {
    paredeTabua(-L / 2, L / 2, -P / 2 - 0.1, beiral, rnd, partes)
    if (tipo === 'fechado') {
      paredeTabua(-L / 2, -1.2, P / 2 + 0.1, beiral, rnd, partes)
      paredeTabua(1.2, L / 2, P / 2 + 0.1, beiral, rnd, partes)
    }
    for (const x of [-L / 2 - 0.1, L / 2 + 0.1]) paredeTaipa(x, P, beiral, rnd, partes)
  }
  // empenas de tábua nas duas pontas (o triângulo entre o beiral e a cumeeira)
  for (const x of [-L / 2 - 0.12, L / 2 + 0.12]) {
    for (let z = -P / 2; z < P / 2; z += 0.25) {
      const a = alturaEm(z + 0.11) - beiral
      if (a > 0.05) partes.push(caixa(0.03, a, 0.22, x, beiral + a / 2, z + 0.11, rnd.escolha(TABUAS)))
    }
  }
  return mergeGeometries(partes)
}

// onde as redes ficam no galpão: os vãos entre as linhas de esteios, uma a cada `passo` m. Cada rede vai de
// uma travessa à outra (z), centrada no vão. Devolve [{ x, z, vao }] no local do galpão
export function vagasDeRede (L, P, passo) {
  const vagas = []
  let vao = 0
  for (let z0 = -P / 2; z0 < P / 2 - 0.01; z0 += 4, vao++) {
    const zc = z0 + 2
    for (let x = -L / 2 + 0.6; x <= L / 2 - 0.5; x += passo) {
      // em zigue-zague: uma rede um pouco mais para cá, a outra para lá (as redes se cruzam no aperto)
      vagas.push({ x, z: zc + (Math.round(x / passo) % 2 ? 0.12 : -0.12), vao })
    }
  }
  return vagas
}

// a rede armada: pano de algodão com faixas, pendurada pelos punhos na travessa (z = ±2, y = 2,05).
// forma: 'aberta' (vazia), 'ocupada' (alguém deitado, coberto: só o volume do pano), 'enrolada' (presa num nó)
export function geometriaRede (forma = 'aberta') {
  const partes = []
  const punho = '#d9cbb0'
  if (forma === 'enrolada') {
    // o pano torcido, pendendo pouco de uma travessa à outra
    const N = 8
    for (let i = 0; i < N; i++) {
      const t0 = i / N
      const t1 = (i + 1) / N
      const y = (t) => 1.95 - 0.42 * (1 - (2 * t - 1) ** 2)
      const z = (t) => -1.9 + 3.8 * t
      const a = new THREE.Vector3(0, y(t0), z(t0))
      const b = new THREE.Vector3(0, y(t1), z(t1))
      const meio = a.clone().add(b).multiplyScalar(0.5)
      const comp = a.distanceTo(b)
      const raio = i === 0 || i === N - 1 ? 0.04 : 0.09
      const g = new THREE.CylinderGeometry(raio, raio, comp, 5).rotateX(Math.PI / 2)
      g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.atan2(b.y - a.y, b.z - a.z)))
      partes.push(colorir(g.translate(meio.x, meio.y, meio.z), '#ffffff'))
    }
    return mergeGeometries(partes)
  }
  // o pano: 8 cortes no comprimento (z), 4 na largura (x), em catenária; ocupada afunda e enche no meio
  const NZ = 8
  const NX = 4
  const fundo = forma === 'ocupada' ? 0.6 : 0.75
  const ponto = (i, j) => {
    const t = i / NZ
    const s = j / NX * 2 - 1
    const z = -1.45 + 2.9 * t
    const queda = 1 - (2 * t - 1) ** 2
    let y = 1.62 - (1.62 - fundo) * queda + 0.22 * s * s * queda
    let x = s * (0.32 + 0.22 * queda)
    if (forma === 'ocupada') {
      // o volume do corpo coberto pelo pano, sem forma de corpo (docs/direcao-de-arte.md: nada de close de corpo)
      const corpo = Math.max(0, 1 - Math.abs(2 * t - 1.08) * 1.25) * (1 - s * s)
      y += 0.2 * corpo
      x *= 1 - 0.25 * corpo
    }
    return [x, y, z]
  }
  const pos = []
  const cor = []
  const faixa = [1, 0.78, 1, 0.66]
  for (let i = 0; i < NZ; i++) {
    for (let j = 0; j < NX; j++) {
      const a = ponto(i, j)
      const b = ponto(i + 1, j)
      const c = ponto(i, j + 1)
      const d = ponto(i + 1, j + 1)
      pos.push(...a, ...b, ...c, ...c, ...b, ...d)
      // faixas ao comprido, como a rede cearense; a cor de verdade vem de cada cópia
      const k = faixa[j] * (i === 0 || i === NZ - 1 ? 0.85 : 1)
      for (let v = 0; v < 6; v++) cor.push(k, k, k * 0.97)
    }
  }
  const pano = new THREE.BufferGeometry()
  pano.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  pano.computeVertexNormals()
  pano.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3))
  partes.push(pano)
  // os punhos e as cordas até a travessa
  for (const lado of [-1, 1]) {
    const a = new THREE.Vector3(0, 1.62, lado * 1.45)
    const b = new THREE.Vector3(0, 2.0, lado * 2.0)
    const g = new THREE.BoxGeometry(0.03, 0.03, a.distanceTo(b))
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(-lado * Math.atan2(b.y - a.y, Math.abs(b.z - a.z))))
    partes.push(colorir(g.translate(0, (a.y + b.y) / 2, (a.z + b.z) / 2), punho))
  }
  return mergeGeometries(partes)
}

// as cores das redes: algodão gasto, com algumas tingidas (a cor forte de 1932 vai no pano: docs/direcao-de-arte.md)
export const CORES_REDE = ['#e9dfcc', '#ded3bd', '#d4c6aa', '#e9dfcc', '#c9b48a', '#d9cbb0', '#b9a888',
  '#c98f72', '#a9b0a0', '#d8b77a', '#b78a6e', '#9fa9b5', '#c2412d', '#d6a64a', '#6f86a8']
