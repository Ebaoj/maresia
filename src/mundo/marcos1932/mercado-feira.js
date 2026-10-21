// A feira do Mercado de Ferro: as bancas de madeira dentro das três seções e, fora, na Praça Carolina, as barracas
// de pano, os cestos de palha, os sacos de farinha e de feijão, os potes de barro e as frutas (o conceito aprovado,
// mercado-ferro.png). Tudo HIPÓTESE de cena: o dossiê só documenta as seções (carnes, verduras, miúdos).
// Os cestos e potes daqui são próprios (os de fatia-objetos.js sorteiam no gerador da praia e mudariam a praia).

import * as THREE from 'three'
import { criarAleatorio } from '../../utils.js'
import { Obra } from './obra.js'
import { alturaTerreno } from '../terreno.js'

// a mesma obra, com tudo deslocado em y (cada barraca assenta no chão dela)
function subindo(o, dy) {
  return {
    add: (k, g) => o.add(k, g.translate(0, dy, 0)),
    caixa: (k, x, y, z, ...r) => o.caixa(k, x, y + dy, z, ...r),
    cilindro: (k, x, y, z, ...r) => o.cilindro(k, x, y + dy, z, ...r),
    por: (k, g, x, y, z, ...r) => o.por(k, g, x, y + dy, z, ...r),
  }
}

const torno = (perfil, seg = 9) => new THREE.LatheGeometry(perfil.map(([r, h]) => new THREE.Vector2(r, h)), seg)
const CESTO = torno([[0, 0], [0.2, 0], [0.28, 0.12], [0.3, 0.3], [0.3, 0.34], [0, 0.34]], 10)
const POTE = torno([[0, 0], [0.12, 0], [0.22, 0.14], [0.24, 0.28], [0.15, 0.44], [0.1, 0.5], [0.13, 0.55], [0, 0.55]], 10)
const SACO = new THREE.SphereGeometry(0.3, 8, 6).scale(1, 1.3, 0.85).translate(0, 0.36, 0)
const FRUTAS = new THREE.SphereGeometry(0.28, 8, 6).scale(1.4, 0.5, 1.0)

// uma banca: tampo e pés de madeira, a mercadoria em cima (cestos com frutas, sacos abertos)
function banca(o, x, z, giro, rnd, coberta) {
  const c = Math.cos(giro)
  const s = Math.sin(giro)
  const p = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]
  const tampo = new THREE.BoxGeometry(2.2, 0.08, 1.0).rotateY(giro)
  o.add('madeira', tampo.translate(x, 0.82, z))
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const [px, pz] = p(a * 1.0, b * 0.42)
    o.caixa('madeira', px, 0.4, pz, 0.07, 0.8, 0.07)
  }
  for (let i = 0; i < 3; i++) {
    const [px, pz] = p(-0.7 + i * 0.7, rnd.entre(-0.15, 0.15))
    const tipo = rnd.entre(0, 1)
    if (tipo < 0.5) {
      o.por('palha', CESTO, px, 0.86, pz, 0, rnd.entre(0.8, 1.0))
      o.por('fruta', FRUTAS, px, 1.2, pz, rnd.entre(0, 3), 0.85)
    } else if (tipo < 0.8) {
      o.por('algodao', SACO, px, 0.86, pz, rnd.entre(0, 3), 0.7)
    } else {
      o.por('barro', POTE, px, 0.86, pz, 0, 0.8)
    }
  }
  if (coberta) {
    // a barraca de pano com quatro paus (fora do mercado)
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const [px, pz] = p(a * 1.25, b * 0.8)
      o.cilindro('madeira', px, 1.15, pz, 0.035, 0.04, 2.3, 5)
    }
    const pano = new THREE.BoxGeometry(2.8, 0.04, 2.0).rotateZ(0.05).rotateY(giro)
    o.add('pano', pano.translate(x, 2.32, z))
    // a aba que cai na frente
    const [ax, az] = p(0, 1.0)
    o.add('pano', new THREE.BoxGeometry(2.8, 0.5, 0.03).rotateY(giro).translate(ax, 2.08, az))
  }
}

// o chão em volta: cestos empilhados, sacos e potes soltos
function montinho(o, x, z, rnd) {
  const n = 2 + Math.floor(rnd.entre(0, 4))
  for (let i = 0; i < n; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    const r = rnd.entre(0, 0.7)
    const px = x + Math.cos(a) * r
    const pz = z + Math.sin(a) * r
    const t = rnd.entre(0, 1)
    if (t < 0.35) { o.por('palha', CESTO, px, 0, pz, 0, rnd.entre(0.9, 1.2)); if (rnd.chance(0.6)) o.por('fruta', FRUTAS, px, 0.36, pz, a, 0.95) }
    else if (t < 0.7) o.por('algodao', SACO, px, 0, pz, a, rnd.entre(0.9, 1.1))
    else o.por('barro', POTE, px, 0, pz, 0, rnd.entre(0.9, 1.3))
  }
}

export function criarFeira(cena, cfg, mats, mobilia, mercado, { L, W, piso, area }) {
  void cfg
  const rnd = criarAleatorio(1897)
  const dentro = new Obra('mercado-feira-dentro', mercado.origem, mercado.y + piso)
  // dentro: duas fileiras de bancas em cada seção, deixando o corredor do meio livre
  for (let x = -L / 2 + 3; x < L / 2 - 2; x += 3.2) {
    if (Math.abs(Math.abs(x) - L / 6) < 1.6) continue // as grades entre as seções
    for (const z of [-W / 2 + 2.2, -4, 4, W / 2 - 2.2]) {
      banca(dentro, x, z, 0, rnd, false)
      dentro.colisaoCaixa(x, z, 1.1, 0.5)
    }
  }
  dentro.montar(cena, mats)
  // fora, na praça: barracas de pano em volta e montinhos no chão
  const fora = new Obra('mercado-feira-fora', mercado.origem, alturaTerreno(...mercado.origem))
  const [hu, hv] = area
  for (let i = 0; i < 34; i++) {
    let x, z
    for (let k = 0; k < 20; k++) {
      x = rnd.entre(-hu + 3, hu - 3)
      z = rnd.entre(-hv + 3, hv - 3)
      if (Math.abs(x) > L / 2 + 3.5 || Math.abs(z) > W / 2 + 3.5) break
    }
    if (Math.abs(x) < L / 2 + 3.5 && Math.abs(z) < W / 2 + 3.5) continue
    const giro = Math.abs(z) > W / 2 ? (z > 0 ? Math.PI : 0) : (x > 0 ? -Math.PI / 2 : Math.PI / 2)
    const sub = subindo(fora, alturaTerreno(...fora.mundo(x, z)) - fora.y)
    banca(sub, x, z, giro + rnd.entre(-0.2, 0.2), rnd, rnd.chance(0.75))
    fora.colisaoCaixa(x, z, 1.3, 1.0)
    const a = rnd.entre(0, Math.PI * 2)
    montinho(sub, x + Math.cos(a) * 2, z + Math.sin(a) * 2, rnd)
  }
  // e na entrada das empenas, os cestos e potes do conceito
  for (const s of [-1, 1]) for (const z of [-5, 5]) montinho(subindo(fora, alturaTerreno(...fora.mundo(s * (L / 2 + 1.6), z)) - fora.y), s * (L / 2 + 1.6), z, rnd)
  for (const k of ['palha', 'barro', 'algodao', 'fruta']) fora.detalhe.add(k)
  fora.montar(cena, mats)
  // os combustores da praça, em volta do mercado
  for (const [x, z] of [[-L / 2 - 6, -W / 2 - 6], [L / 2 + 6, -W / 2 - 6], [-L / 2 - 6, W / 2 + 6], [L / 2 + 6, W / 2 + 6], [0, -W / 2 - 7], [0, W / 2 + 7]]) {
    const [wx, wz] = mercado.mundo(x, z)
    mobilia.lampiao('lamp1', wx, alturaTerreno(wx, wz), wz, mercado.giro)
  }
  return { grupos: [dentro.grupo, fora.grupo] }
}
