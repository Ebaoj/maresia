// Vilas de jangadeiros de 1932 (Pirambu, Praia do Peixe, Mucuripe): casas baixas de taipa com
// cobertura de palha de coqueiro ou carnaúba, na areia, em fileiras soltas atrás da praia.
// Referências: casas de palha na orla em 1925 (Acervo Nirez, via Diário do Nordeste); IBGE,
// "Jangadeiros" (choupanas de taipa cobertas de palha); foto do subúrbio de 1907 (Museu do Ceará).

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { linhaCosta, larguraPraia, FIM_AVENIDA, distCosta } from './mapa.js'
import { alturaTerreno } from './terreno.js'
import { toonVertice } from '../materiais.js'
import { adicionarCaixa } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { instanciarEmBlocos } from './blocos.js'
import { trechosJogo, VILAS } from './fortaleza1932.js'
import { criarAleatorio } from '../utils.js'

const rnd = criarAleatorio(1881)

function colorir(geo, hex, var_ = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i += 3) {
    const k = 1 + (rnd.proximo() - 0.5) * var_ // variação por triângulo, com semente
    for (let j = 0; j < 3; j++) { a[(i + j) * 3] = c.r * k; a[(i + j) * 3 + 1] = c.g * k; a[(i + j) * 3 + 2] = c.b * k }
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}

// cobertura de palha: duas águas grossas e baixas, a beira desfiada em dentes
function palha(w, d, alto, beiral, hex) {
  const partes = []
  const meiaW = w / 2 + beiral
  const meiaD = d / 2 + beiral
  const pos = []
  const quad = (a, b, c, e) => pos.push(...a, ...b, ...c, ...a, ...c, ...e)
  const cume = [0, alto, 0]
  quad([-meiaW, 0, meiaD], [meiaW, 0, meiaD], [meiaW, alto, 0], [-meiaW, alto, 0])
  quad([meiaW, 0, -meiaD], [-meiaW, 0, -meiaD], [-meiaW, alto, 0], [meiaW, alto, 0])
  void cume
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  partes.push(colorir(g, hex, 0.18))
  // espessura e franja da palha na beira (dentes irregulares pendurados)
  for (const sz of [-1, 1]) {
    for (let x = -meiaW; x < meiaW; x += 0.28) {
      const comp = 0.18 + rnd.proximo() * 0.22
      const dente = new THREE.ConeGeometry(0.16, comp, 3).rotateX(Math.PI).translate(x + 0.14, -comp / 2 + 0.02, sz * meiaD)
      partes.push(colorir(dente, hex, 0.3))
    }
  }
  partes.push(colorir(new THREE.BoxGeometry(meiaW * 2, 0.18, 0.18).translate(0, alto + 0.06, 0), new THREE.Color(hex).multiplyScalar(0.8).getHex()))
  return mergeGeometries(partes)
}

// casa de taipa: paredes de barro (algumas caiadas), porta e janela como vãos escuros, palha em cima
function casaPalha(variante) {
  const w = [4.2, 5.2, 3.6][variante]
  const d = [3.4, 4.0, 3.2][variante]
  const h = [2.1, 2.3, 2.0][variante]
  const parede = ['#b8875e', '#e4d6bb', '#a8774f'][variante]
  const partes = [colorir(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), parede, 0.08)]
  // empenas de taipa fechando o triângulo
  for (const sx of [-1, 1]) {
    const tri = new THREE.BufferGeometry()
    const x = sx * w / 2
    tri.setAttribute('position', new THREE.Float32BufferAttribute([x, h, d / 2, x, h, -d / 2, x, h + 1.1, 0, x, h, -d / 2, x, h, d / 2, x, h + 1.1, 0], 3))
    tri.computeVertexNormals()
    partes.push(colorir(tri, parede, 0.05))
  }
  // porta e janela (vãos escuros, um palmo para dentro da parede)
  partes.push(colorir(new THREE.BoxGeometry(0.85, 1.75, 0.06).translate(-w * 0.18, 0.88, d / 2 + 0.01), '#2e221c'))
  if (variante !== 2) partes.push(colorir(new THREE.BoxGeometry(0.7, 0.6, 0.06).translate(w * 0.24, 1.25, d / 2 + 0.01), '#2e221c'))
  // trama de varas aparecendo na taipa sem reboco (foto de 1907)
  if (variante !== 1) {
    for (let y = 0.35; y < h; y += 0.32) partes.push(colorir(new THREE.BoxGeometry(w + 0.02, 0.035, 0.03).translate(0, y, d / 2 + 0.02), '#7a5638'))
    for (let x = -w / 2 + 0.3; x < w / 2; x += 0.55) partes.push(colorir(new THREE.BoxGeometry(0.035, h, 0.03).translate(x, h / 2, d / 2 + 0.025), '#7a5638'))
  }
  partes.push(palha(w, d, 1.15, 0.45, ['#c8a86a', '#b9975a', '#d1b578'][variante]).translate(0, h, 0))
  return { geo: mergeGeometries(partes), w, d }
}

export function criarVilas(cena) {
  const tipos = [0, 1, 2].map((v) => ({ ...casaPalha(v), mats: [] }))
  const Y = new THREE.Vector3(0, 1, 0)
  for (const vila of VILAS) {
    const [a, b] = trechosJogo[vila]
    // fileiras soltas atrás da praia, viradas para o mar, cada uma com seu desalinho
    for (let fila = 0; fila < 4; fila++) {
      for (let x = a; x < b; x += rnd.entre(6, 11)) {
        if (rnd.chance(0.18)) continue
        const bw = larguraPraia(x)
        const s = bw - 6 + fila * rnd.entre(9, 12) + rnd.entre(-1.5, 1.5)
        const z = linhaCosta(x) + s
        if (distCosta(x, z) < bw * 0.55) continue
        const t = rnd.escolha(tipos)
        const tangente = Math.atan2(linhaCosta(x + 1) - linhaCosta(x - 1), 2)
        const rot = -tangente + Math.PI + rnd.entre(-0.25, 0.25) // porta para o mar
        if (!ocupacao.livre(x, z, t.w / 2 + 0.8, t.d / 2 + 0.8, rot)) continue
        ocupacao.marcar(x, z, t.w / 2 + 0.6, t.d / 2 + 0.6, rot)
        adicionarCaixa(x, z, t.w / 2, t.d / 2, rot)
        const y = alturaTerreno(x, z) - 0.15
        t.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, rot), new THREE.Vector3(1, 1, 1)))
      }
    }
  }
  const mat = toonVertice()
  let n = 0
  for (const t of tipos) {
    if (!t.mats.length) continue
    instanciarEmBlocos(cena, t.geo, mat, t.mats, null, { nome: 'casas-de-palha', solido: true })
    n += t.mats.length
  }
  void FIM_AVENIDA
  return n
}
