// Colisão simples em 2D (vista de cima): caixas giradas e círculos.
// "Decks" são pisos acima do chão (pontes, píer) onde o personagem pode andar.

import { alturaTerreno } from './terreno.js'
import { distCosta, larguraPraia, FIM_AVENIDA, NIVEL_CIDADE } from './mapa.js'

const CEL = 16
const baldes = new Map()
const baldesDeck = new Map()
let carimbo = 0

const chave = (i, j) => (i + 2000) * 10000 + (j + 2000)

function inserir(mapa, obj, x, z, r) {
  const i0 = Math.floor((x - r) / CEL)
  const i1 = Math.floor((x + r) / CEL)
  const j0 = Math.floor((z - r) / CEL)
  const j1 = Math.floor((z + r) / CEL)
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const k = chave(i, j)
      if (!mapa.has(k)) mapa.set(k, [])
      mapa.get(k).push(obj)
    }
  }
}

function vizinhos(mapa, x, z) {
  return mapa.get(chave(Math.floor(x / CEL), Math.floor(z / CEL))) || []
}

export function adicionarCaixa(cx, cz, hx, hz, rot = 0) {
  inserir(baldes, { tipo: 0, cx, cz, hx, hz, c: Math.cos(rot), s: Math.sin(rot), marca: 0 }, cx, cz, Math.hypot(hx, hz) + 1)
}

export function adicionarCirculo(cx, cz, r) {
  inserir(baldes, { tipo: 1, cx, cz, r, marca: 0 }, cx, cz, r + 1)
}

// Piso com altura própria. "arco" levanta o meio (ponte em arco), ao longo do eixo x local.
export function adicionarDeck(cx, cz, hx, hz, rot, y, arco = 0) {
  inserir(baldesDeck, { cx, cz, hx, hz, c: Math.cos(rot), s: Math.sin(rot), y, arco, marca: 0 }, cx, cz, Math.hypot(hx, hz) + 1)
}

// Converte para as coordenadas da caixa (a mesma convenção do rotation.y do three).
function paraLocal(o, x, z) {
  const dx = x - o.cx
  const dz = z - o.cz
  return [dx * o.c - dz * o.s, dx * o.s + dz * o.c]
}

// Empurra a posição para fora de tudo que for sólido.
export function resolverColisoes(pos, raio) {
  carimbo++
  for (const o of vizinhos(baldes, pos.x, pos.z)) {
    if (o.marca === carimbo) continue
    o.marca = carimbo
    if (o.tipo === 0) {
      let [lx, lz] = paraLocal(o, pos.x, pos.z)
      const px = o.hx + raio - Math.abs(lx)
      const pz = o.hz + raio - Math.abs(lz)
      if (px > 0 && pz > 0) {
        if (px < pz) lx += Math.sign(lx || 1) * px
        else lz += Math.sign(lz || 1) * pz
        pos.x = o.cx + lx * o.c + lz * o.s
        pos.z = o.cz - lx * o.s + lz * o.c
      }
    } else {
      const dx = pos.x - o.cx
      const dz = pos.z - o.cz
      const d = Math.hypot(dx, dz)
      const min = o.r + raio
      if (d < min && d > 1e-4) {
        pos.x = o.cx + (dx / d) * min
        pos.z = o.cz + (dz / d) * min
      }
    }
  }
}

function alturaDeck(x, z, yRef) {
  let melhor = -Infinity
  carimbo++
  for (const d of vizinhos(baldesDeck, x, z)) {
    if (d.marca === carimbo) continue
    d.marca = carimbo
    const [lx, lz] = paraLocal(d, x, z)
    if (Math.abs(lx) <= d.hx && Math.abs(lz) <= d.hz) {
      const y = d.y + d.arco * (1 - (lx / d.hx) ** 2)
      if (y <= yRef + 0.7 && y > melhor) melhor = y
    }
  }
  return melhor
}

// Altura do que está debaixo do pé: terreno, calçadão/avenida (que viram ponte sobre o rio) ou deck.
export function alturaChao(x, z, yRef = Infinity) {
  let h = alturaTerreno(x, z)
  const s = distCosta(x, z)
  const bw = larguraPraia(x)
  if (s >= bw - 0.5 && s <= bw + FIM_AVENIDA + 0.5) h = Math.max(h, NIVEL_CIDADE + 0.05)
  return Math.max(h, alturaDeck(x, z, yRef))
}

// Tudo que é sólido ou deck perto de um ponto (para a física carregar só o que está por perto).
export function fixosPerto(x, z, raio, fn) {
  const vistos = new Set()
  const i0 = Math.floor((x - raio) / CEL)
  const i1 = Math.floor((x + raio) / CEL)
  const j0 = Math.floor((z - raio) / CEL)
  const j1 = Math.floor((z + raio) / CEL)
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (const o of baldes.get(chave(i, j)) || []) if (!vistos.has(o)) { vistos.add(o); fn(o, false) }
      for (const d of baldesDeck.get(chave(i, j)) || []) if (!vistos.has(d)) { vistos.add(d); fn(d, true) }
    }
  }
}
