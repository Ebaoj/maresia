// Peças de fachada dos prédios de 1932 (janela recuada, porta em arco, sacada de ferro, pilastra com bossagem,
// pináculo, bandeira). Cada peça é desenhada no "referencial da face" (x ao longo da parede, z saindo dela,
// y para cima) e depois girada para a parede: ang = 0 é a parede que olha para +z da obra; ang = π/2, +x.
// Assim a mesma janela serve para as fachadas retas e para a esquina curva do Excelsior.

import * as THREE from 'three'
import { PERFIL } from './obra.js'

const tmp = new THREE.Matrix4()

// põe a geometria da face na obra: gira por ang e leva para (px, y, pz)
function naFace(obra, chave, geo, ang, px, y, pz) {
  geo.rotateY(ang)
  geo.translate(px, y, pz)
  obra.add(chave, geo)
}
const caixa = (sx, sy, sz, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z)

// janela (ou porta) recuada: o vão escuro um pouco para dentro da face, a moldura saliente, o peitoril e o
// montante de madeira. arco: o vão termina em meia-volta (o 7º andar do Excelsior). k = { vao, moldura, esquadria }
export function janela(obra, k, ang, px, y, pz, w, h, { arco = false, moldura = 0.14, peitoril = true, aceso = false } = {}) {
  const hReta = arco ? h - w / 2 : h
  const kv = aceso ? k.vaoAceso : k.vao
  naFace(obra, kv, caixa(w, hReta, 0.06, 0, hReta / 2, -0.02), ang, px, y, pz)
  if (arco) naFace(obra, kv, new THREE.CircleGeometry(w / 2, 10, 0, Math.PI).translate(0, hReta, 0.005), ang, px, y, pz)
  // o montante e a travessa da esquadria (a janela de duas folhas)
  if (k.esquadria) {
    naFace(obra, k.esquadria, caixa(0.06, hReta, 0.05, 0, hReta / 2, 0.02), ang, px, y, pz)
    naFace(obra, k.esquadria, caixa(w, 0.06, 0.05, 0, hReta * 0.72, 0.02), ang, px, y, pz)
  }
  // a moldura
  for (const s of [-1, 1]) naFace(obra, k.moldura, caixa(moldura, hReta, 0.12, s * (w / 2 + moldura / 2), hReta / 2, 0.06), ang, px, y, pz)
  if (arco) {
    const r = w / 2 + moldura / 2
    for (let i = 0; i < 6; i++) {
      const am = ((i + 0.5) / 6) * Math.PI
      const g = caixa((Math.PI * r) / 6 + 0.03, moldura, 0.12).rotateZ(am - Math.PI / 2)
      naFace(obra, k.moldura, g.translate(Math.cos(am) * r, hReta + Math.sin(am) * r, 0.06), ang, px, y, pz)
    }
    // a pedra de fecho do arco
    naFace(obra, k.moldura, caixa(0.22, 0.3, 0.16, 0, h + 0.06, 0.08), ang, px, y, pz)
  } else {
    naFace(obra, k.moldura, caixa(w + moldura * 2 + 0.1, moldura + 0.04, 0.16, 0, h + moldura / 2, 0.07), ang, px, y, pz)
  }
  if (peitoril) naFace(obra, k.moldura, caixa(w + 0.3, 0.1, 0.22, 0, -0.05, 0.1), ang, px, y, pz)
}

// sacada individual de ferro sobre consolos: laje de massa, dois consolos, gradil de barras
export function sacada(obra, k, ang, px, y, pz, w, { fundo = 0.6, alt = 0.95 } = {}) {
  naFace(obra, k.moldura, caixa(w + 0.4, 0.12, fundo, 0, -0.06, fundo / 2), ang, px, y, pz)
  for (const s of [-1, 1]) naFace(obra, k.moldura, caixa(0.14, 0.32, fundo * 0.8, s * (w / 2), -0.28, fundo * 0.4), ang, px, y, pz)
  const L = w + 0.3
  naFace(obra, k.ferro, caixa(L, 0.045, 0.045, 0, alt, fundo - 0.04), ang, px, y, pz)
  naFace(obra, k.ferro, caixa(L, 0.035, 0.035, 0, 0.12, fundo - 0.04), ang, px, y, pz)
  for (const s of [-1, 1]) naFace(obra, k.ferro, caixa(0.045, 0.045, fundo, s * L / 2, alt, fundo / 2), ang, px, y, pz)
  const n = Math.max(3, Math.round(L / 0.13))
  for (let i = 0; i <= n; i++) naFace(obra, k.ferro, caixa(0.022, alt, 0.022, -L / 2 + (i / n) * L, alt / 2, fundo - 0.04), ang, px, y, pz)
  // as volutas do meio (a "renda" do ferro trabalhado)
  for (const s of [-1, 1]) naFace(obra, k.ferro, new THREE.TorusGeometry(0.13, 0.016, 4, 10).translate(s * 0.16, alt * 0.55, fundo - 0.04), ang, px, y, pz)
  obra.detalhe.add(k.ferro)
}

// pilastra com bossagem em faixas: um prisma saliente com sulcos horizontais (a "rusticação" do Excelsior)
export function pilastra(obra, k, ang, px, y, pz, w, h, { sai = 0.12, passo = 0.45 } = {}) {
  naFace(obra, k.parede, caixa(w, h, sai, 0, h / 2, sai / 2), ang, px, y, pz)
  for (let t = passo; t < h - 0.1; t += passo) naFace(obra, k.sulco, caixa(w + 0.01, 0.05, 0.02, 0, t, sai + 0.002), ang, px, y, pz)
}

// porta em arco pleno com portão de ferro (a portaria do nº 172 da Guilherme Rocha, com o monograma)
export function portaArco(obra, k, ang, px, y, pz, w, h) {
  janela(obra, k, ang, px, y, pz, w, h, { arco: true, peitoril: false, moldura: 0.22 })
  const hReta = h - w / 2
  const n = 9
  for (let i = 1; i < n; i++) naFace(obra, k.ferro, caixa(0.03, hReta, 0.03, -w / 2 + (i / n) * w, hReta / 2, 0.03), ang, px, y, pz)
  for (const t of [0.15, 0.55, 0.95]) naFace(obra, k.ferro, caixa(w, 0.04, 0.04, 0, hReta * t, 0.03), ang, px, y, pz)
  naFace(obra, k.ferro, new THREE.TorusGeometry(0.28, 0.035, 5, 14).translate(0, hReta * 0.75, 0.04), ang, px, y, pz)
  // dois degraus de mármore
  naFace(obra, k.moldura, caixa(w + 0.8, 0.14, 0.5, 0, 0.07, 0.25), ang, px, y - 0.14, pz)
}

// pináculo de platibanda sobre um pedestalzinho
export function pinaculo(obra, chave, x, y, z, esc = 1) {
  obra.caixa(chave, x, y + 0.2 * esc, z, 0.5 * esc, 0.4 * esc, 0.5 * esc)
  obra.torno(chave, x, y + 0.4 * esc, z, PERFIL.pinaculo, 8, esc)
}

// mastro com bandeira (a inauguração do Excelsior, postal de 1931): pano verde com o losango amarelo
export function bandeira(obra, k, x, y, z, ang, { alt = 4.2, pano = [1.5, 1.0] } = {}) {
  obra.cilindro(k.ferro, x, y + alt / 2, z, 0.035, 0.05, alt, 6)
  obra.add(k.ferro, new THREE.SphereGeometry(0.07, 6, 4).translate(x, y + alt + 0.05, z))
  const [w, h] = pano
  // o pano levemente ondulado, saindo do mastro para o lado ang
  const g = new THREE.PlaneGeometry(w, h, 6, 1)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / w + 0.5) * Math.PI * 1.6) * 0.09)
  g.translate(w / 2 + 0.05, 0, 0)
  tmp.makeRotationY(ang)
  const pano1 = g.clone().applyMatrix4(tmp).translate(x, y + alt - h / 2 - 0.1, z)
  obra.add(k.bandeira, pano1)
  const los = new THREE.CircleGeometry(h * 0.38, 4).scale(1.35, 1, 1).translate(w / 2 + 0.05, 0, 0.11)
  obra.add(k.bandeiraOuro, los.applyMatrix4(tmp).translate(x, y + alt - h / 2 - 0.1, z))
  const los2 = new THREE.CircleGeometry(h * 0.38, 4).scale(1.35, 1, 1).rotateY(Math.PI).translate(w / 2 + 0.05, 0, -0.11)
  obra.add(k.bandeiraOuro, los2.applyMatrix4(tmp).translate(x, y + alt - h / 2 - 0.1, z))
  obra.detalhe.add(k.bandeiraOuro)
}
