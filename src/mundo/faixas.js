// Calçadão (com as ondas pretas e brancas) e avenida, acompanhando a curva da praia.
// Onde cruzam o rio, continuam retos na altura da cidade: viram ponte sozinhos.

import * as THREE from 'three'
import {
  LIMITES, linhaCosta, larguraPraia, rioX, RIO_MEIA_LARGURA,
  LARG_CALCADAO, FIM_AVENIDA, NIVEL_CIDADE,
} from './mapa.js'
import { alturaTerreno } from './terreno.js'
import { toon, texturaCanvas } from '../materiais.js'
import { adicionarCaixa } from './colisao.js'
import { criarAleatorio } from '../utils.js'

// Faixa que segue a costa: de "ini" a "fim" metros depois do fim da areia.
function faixa(ini, fim, compTextura, material) {
  const passo = 2
  const xs = []
  for (let x = LIMITES.x0 + 4; x <= LIMITES.x1 - 4; x += passo) xs.push(x)
  const pos = []
  const uv = []
  const idx = []
  xs.forEach((x, k) => {
    const base = linhaCosta(x) + larguraPraia(x)
    for (const [lado, d] of [[0, ini], [1, fim]]) {
      const z = base + d
      const y = Math.max(alturaTerreno(x, z), NIVEL_CIDADE) + 0.05
      pos.push(x, y, z)
      uv.push(x / compTextura, lado)
    }
    if (k > 0) {
      const a = (k - 1) * 2
      const b = a + 1
      const c = k * 2
      const d = c + 1
      idx.push(a, b, c, c, b, d)
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  geo.setIndex(idx)
  geo.computeVertexNormals()
  const m = new THREE.Mesh(geo, material)
  m.receiveShadow = true
  return m
}

// As ondas do calçadão: listras paralelas à praia, ondulando.
function texturaCalcadao() {
  return texturaCanvas(512, 256, (ctx, W, H) => {
    const img = ctx.createImageData(W, H)
    const escuro = [29, 27, 46]
    const claro = [245, 236, 214]
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const U = (px / W) * 14 // metros ao longo
        const V = (py / H) * LARG_CALCADAO // metros de largura
        const w = V + 0.6 * Math.sin((U * 2 * Math.PI) / 3.5)
        const f = (w / 1.5) % 1
        const borda = Math.min(1, Math.max(0, (Math.abs(f - 0.5) - 0.235) * 30 + 0.5))
        const k = (py * W + px) * 4
        for (let c = 0; c < 3; c++) img.data[k + c] = escuro[c] + (claro[c] - escuro[c]) * borda
        img.data[k + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  })
}

function texturaAvenida() {
  return texturaCanvas(512, 512, (ctx, W, H) => {
    ctx.fillStyle = '#3b3d58'
    ctx.fillRect(0, 0, W, H)
    // pintinhas do asfalto (com semente)
    const rnd = criarAleatorio(77)
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = rnd.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.12)'
      ctx.fillRect(rnd.proximo() * W, rnd.proximo() * H, 2, 2)
    }
    // faixas brancas nas bordas
    ctx.fillStyle = '#efe9da'
    ctx.fillRect(0, H * 0.05, W, H * 0.015)
    ctx.fillRect(0, H * 0.935, W, H * 0.015)
    // tracejado amarelo no meio
    ctx.fillStyle = '#ffd23f'
    for (let x = 0; x < W; x += W / 2) ctx.fillRect(x, H * 0.49, W / 4, H * 0.025)
  })
}

export function criarFaixas(cena) {
  const calcadao = faixa(0, LARG_CALCADAO, 14, toon('#ffffff', { map: texturaCalcadao() }))
  const avenida = faixa(LARG_CALCADAO, FIM_AVENIDA, 12, toon('#ffffff', { map: texturaAvenida() }))
  calcadao.name = 'calcadao'
  avenida.name = 'avenida'
  cena.add(calcadao, avenida)

  // cabeceira da ponte onde a orla cruza o rio
  const zMeio = linhaCosta(rioX(30)) + larguraPraia(rioX(30)) + FIM_AVENIDA / 2
  const xr = rioX(zMeio)
  const vao = RIO_MEIA_LARGURA * 2.9
  const laje = new THREE.Mesh(new THREE.BoxGeometry(vao, 1.2, FIM_AVENIDA + 1), toon('#d9c7b0'))
  laje.position.set(xr, NIVEL_CIDADE - 0.6, zMeio)
  laje.castShadow = laje.receiveShadow = true
  cena.add(laje)

  // guarda-corpo dos dois lados
  const zMar = linhaCosta(xr) + larguraPraia(xr)
  for (const z of [zMar + 0.2, zMar + FIM_AVENIDA - 0.2]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(vao, 1.0, 0.25), toon('#f4efe6'))
    g.position.set(xr, NIVEL_CIDADE + 0.55, z)
    g.castShadow = true
    cena.add(g)
    adicionarCaixa(xr, z, vao / 2, 0.3, 0)
  }
}
