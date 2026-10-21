// Ornatos dos marcos de 1932: as formas que a Sé, a Estação Central e o Passeio Público repetem
// (frontão, parede com vão em arco, balaustrada, cúpula em bulbo, cruz, relógio, lampião de
// coluna, banco de ferro, gradil). Cada função põe peças numa Obra (obra1932.js), em metros e no
// sistema local do marco. As formas são simplificadas de propósito, como nos conceitos do sertão:
// planos grandes e limpos, detalhe só onde o olho para (a porta, o relógio, a esfinge).

import * as THREE from 'three'

// frontão triangular: base de largura w em (x, y, z), altura h, espessura e (para +z a partir de z)
export function fronton(o, chave, x, y, z, w, h, e) {
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(0, h)
  s.lineTo(-w / 2, 0)
  const g = new THREE.ExtrudeGeometry(s, { depth: e, bevelEnabled: false })
  g.translate(x, y, z)
  o.geo(chave, g)
}

// a moldura do frontão (as duas águas da cimalha), um pouco à frente do tímpano
export function molduraFronton(o, chave, x, y, z, w, h, esp = 0.35, prof = 0.5) {
  const ang = Math.atan2(h, w / 2)
  const comp = Math.hypot(w / 2, h) + esp
  for (const lado of [-1, 1]) {
    o.caixa(chave, x + (lado * w) / 4, y + h / 2, z, comp, esp, prof, 0, 0, -lado * ang)
  }
  o.caixa(chave, x, y - esp / 2, z, w + esp * 2, esp, prof)
}

// contorno de um vão (reto ou em arco pleno) no plano xy, com o pé em y0
function contorno(p, cx, y0, w, h, arco) {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  p.moveTo(x0, y0)
  p.lineTo(x1, y0)
  if (arco) {
    p.lineTo(x1, y0 + h - w / 2)
    p.absarc(cx, y0 + h - w / 2, w / 2, 0, Math.PI, false)
  } else {
    p.lineTo(x1, y0 + h)
    p.lineTo(x0, y0 + h)
  }
  p.lineTo(x0, y0)
}

// Tramo de parede de largura w e altura h com um vão (largura vw, altura vh, peitoril py) furado,
// da face z até z + e (para fora). Atrás do vão, a folha (porta ou janela) recuada.
// chaves = { parede, folha, moldura? }; arco = true: vão de arco pleno; ry = giro do tramo em
// volta do próprio pé (Math.PI: a parede olha para -z).
export function tramoComVao(o, chaves, x, y, z, w, h, vw, vh, py, e, arco = false, ry = 0) {
  const pos = (g) => { g.rotateY(ry); g.translate(x, y, z); return g }
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, h)
  s.lineTo(-w / 2, h)
  s.lineTo(-w / 2, 0)
  const furo = new THREE.Path()
  contorno(furo, 0, py, vw, vh, arco)
  s.holes.push(furo)
  o.geo(chaves.parede, pos(new THREE.ExtrudeGeometry(s, { depth: e, bevelEnabled: false, curveSegments: 10 })))
  // a folha, recuada: fecha o vão por trás (porta de madeira, janela de venezianas)
  const f = new THREE.Shape()
  contorno(f, 0, py - 0.02, vw + 0.06, vh + 0.04, arco)
  o.geo(chaves.folha, pos(new THREE.ExtrudeGeometry(f, { depth: 0.08, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, -0.04)))
  if (chaves.moldura) {
    // a moldura clara em volta do vão, saliente
    const m = new THREE.Shape()
    contorno(m, 0, py - 0.14, vw + 0.46, vh + 0.37, arco)
    const dentro = new THREE.Path()
    contorno(dentro, 0, py, vw, vh, arco)
    m.holes.push(dentro)
    o.geo(chaves.moldura, pos(new THREE.ExtrudeGeometry(m, { depth: 0.1, bevelEnabled: false, curveSegments: 10 }).translate(0, 0, e)))
  }
}

// cúpula em bulbo (meia-laranja estrangulada), de raio r, sobre (x, y, z); gomos = lados
export function bulbo(o, chave, x, y, z, r, h, lados = 8) {
  const pts = []
  const n = 14
  for (let i = 0; i <= n; i++) {
    const t = i / n
    // perfil: sai do raio cheio, incha um pouco acima da base e fecha numa ponta
    const raio = r * (1 + 0.18 * Math.sin(t * Math.PI * 0.9)) * Math.pow(1 - t, 0.75)
    pts.push(new THREE.Vector2(Math.max(0.02, raio), t * h))
  }
  const g = new THREE.LatheGeometry(pts, lados)
  g.translate(x, y, z)
  o.geo(chave, g)
}

// cruz de ferro (ou de pedra) com o pé em (x, y, z): haste h, braço b, seção e
export function cruz(o, chave, x, y, z, h, b, e) {
  o.caixa(chave, x, y + h / 2, z, e, h, e)
  o.caixa(chave, x, y + h * 0.7, z, b, e, e)
}

// relógio de parede: disco claro, aro, doze marcas (os algarismos romanos lidos de longe como
// marcas) e os ponteiros; olha para +z a partir de z
export function relogio(o, claro, escuro, x, y, z, r, hora = 10.1) {
  const disco = new THREE.CylinderGeometry(r, r, 0.12, 24)
  disco.rotateX(Math.PI / 2)
  disco.translate(x, y, z + 0.06)
  o.geo(claro, disco)
  const aro = new THREE.TorusGeometry(r, r * 0.07, 6, 24)
  aro.translate(x, y, z + 0.13)
  o.geo(escuro, aro)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const comp = i % 3 === 0 ? r * 0.22 : r * 0.14
    o.caixa(escuro, x + Math.sin(a) * r * 0.78, y + Math.cos(a) * r * 0.78, z + 0.14, r * 0.05, comp, 0.03, 0, 0, -a)
  }
  const ah = ((hora % 12) / 12) * Math.PI * 2
  const am = ((hora % 1)) * Math.PI * 2
  o.caixa(escuro, x + Math.sin(ah) * r * 0.25, y + Math.cos(ah) * r * 0.25, z + 0.17, r * 0.07, r * 0.5, 0.03, 0, 0, -ah)
  o.caixa(escuro, x + Math.sin(am) * r * 0.36, y + Math.cos(am) * r * 0.36, z + 0.19, r * 0.05, r * 0.72, 0.03, 0, 0, -am)
}

// balaustrada ao longo de x: de x0 a x1 em (y, z), altura h, com pilarete a cada `passo`
export function balaustrada(o, chave, x0, x1, y, z, h = 0.95, passo = 3, eixo = 'x') {
  const comp = Math.abs(x1 - x0)
  const meio = (x0 + x1) / 2
  const n = Math.max(1, Math.round(comp / 0.32))
  const caixa = (a, yy, b, sa, sy, sb) => (eixo === 'x' ? o.caixa(chave, a, yy, b, sa, sy, sb) : o.caixa(chave, b, yy, a, sb, sy, sa))
  caixa(meio, y + 0.08, z, comp, 0.16, 0.42) // base
  caixa(meio, y + h - 0.07, z, comp, 0.14, 0.44) // corrimão
  for (let i = 0; i < n; i++) {
    const a = Math.min(x0, x1) + ((i + 0.5) / n) * comp
    const g = new THREE.CylinderGeometry(0.06, 0.09, h - 0.3, 6)
    if (eixo === 'x') g.translate(a, y + 0.16 + (h - 0.3) / 2, z)
    else g.translate(z, y + 0.16 + (h - 0.3) / 2, a)
    o.geo(chave, g)
  }
  const np = Math.max(1, Math.round(comp / passo))
  for (let i = 0; i <= np; i++) caixa(Math.min(x0, x1) + (i / np) * comp, y + h / 2, z, 0.34, h + 0.06, 0.34)
}

// urna (pinha de remate): vaso de pedra sobre a platibanda
export function urna(o, chave, x, y, z, s = 1) {
  const pts = [[0.16, 0], [0.2, 0.08], [0.1, 0.16], [0.1, 0.22], [0.26, 0.34], [0.3, 0.5], [0.22, 0.66], [0.1, 0.72], [0.12, 0.8], [0.02, 0.9]]
  const g = new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r * s, h * s)), 8)
  g.translate(x, y, z)
  o.geo(chave, g)
}

// lampião a gás de coluna de ferro fundido (combustor): pé em (x, y, z), lanterna de vidro de
// quatro faces a uns 3,5 m. O vidro vai na chave `vidro` (luz fixa que acende à noite) e o
// ponto entra no mapa de luz da cenografia.
export function lampiaoColuna(o, ferro, vidro, x, y, z, alto = 3.6) {
  o.cilindro(ferro, x, y, z, 0.17, 0.22, 0.35, 8)
  o.cilindro(ferro, x, y + 0.35, z, 0.055, 0.1, alto - 0.9, 8)
  o.cilindro(ferro, x, y + alto - 0.6, z, 0.12, 0.08, 0.12, 8)
  o.caixa(ferro, x, y + alto - 0.46, z, 0.42, 0.05, 0.42)
  o.caixa(vidro, x, y + alto - 0.18, z, 0.3, 0.5, 0.3)
  for (const [dx, dz] of [[-0.16, -0.16], [0.16, -0.16], [-0.16, 0.16], [0.16, 0.16]]) o.caixa(ferro, x + dx, y + alto - 0.18, z + dz, 0.035, 0.52, 0.035)
  const chapeu = new THREE.ConeGeometry(0.32, 0.34, 4)
  chapeu.rotateY(Math.PI / 4)
  chapeu.translate(x, y + alto + 0.24, z)
  o.geo(ferro, chapeu)
  o.lampiao(x, y + alto - 0.2, z)
  o.coluna(x, z, 0.22)
}

// banco de ferro com encosto de grade: centro em (x, y, z), comprimento c, de frente para (sen ry, cos ry)
export function bancoFerro(o, ferro, madeira, x, y, z, c = 2.2, ry = 0) {
  const g = []
  const c2 = c / 2
  const base = (gg) => { gg.rotateY(ry); gg.translate(x, y, z); return gg }
  g.push([madeira, new THREE.BoxGeometry(c, 0.06, 0.44).translate(0, 0.45, 0)])
  for (const yy of [0.62, 0.76, 0.88]) g.push([madeira, new THREE.BoxGeometry(c, 0.07, 0.04).rotateX(-0.2).translate(0, yy, -0.22 - (yy - 0.6) * 0.15)])
  for (const xx of [-c2 + 0.1, 0, c2 - 0.1]) {
    g.push([ferro, new THREE.BoxGeometry(0.05, 0.45, 0.4).translate(xx, 0.22, 0)])
    g.push([ferro, new THREE.BoxGeometry(0.05, 0.5, 0.05).rotateX(-0.2).translate(xx, 0.72, -0.25)])
  }
  for (const [k, gg] of g) o.geo(k, base(gg))
}

// gradil de ferro ao longo de um segmento local (a -> b): mureta, pilar de alvenaria a cada
// `vao` metros e grade de barras com ponta entre eles. As barras vão na chave `ferro`.
export function gradil(o, alvenaria, ferro, ax, az, bx, bz, y, { alto = 2.0, mureta = 0.45, vao = 3.5, passoBarra = 0.16, semPilar = false } = {}) {
  const dx = bx - ax
  const dz = bz - az
  const comp = Math.hypot(dx, dz)
  const ry = Math.atan2(-dz, dx)
  const mx = (ax + bx) / 2
  const mz = (az + bz) / 2
  o.caixa(alvenaria, mx, y + mureta / 2, mz, comp, mureta, 0.4, ry)
  const nv = Math.max(1, Math.round(comp / vao))
  if (!semPilar) {
    for (let i = 0; i <= nv; i++) {
      const t = i / nv
      const px = ax + dx * t
      const pz = az + dz * t
      o.caixa(alvenaria, px, y + alto / 2, pz, 0.48, alto, 0.48, ry)
      o.caixa(alvenaria, px, y + alto + 0.06, pz, 0.6, 0.12, 0.6, ry)
    }
  }
  const nb = Math.round(comp / passoBarra)
  const hb = alto - mureta - 0.1
  for (let i = 0; i < nb; i++) {
    const t = (i + 0.5) / nb
    const px = ax + dx * t
    const pz = az + dz * t
    o.caixa(ferro, px, y + mureta + hb / 2, pz, 0.03, hb, 0.03, ry)
    if (i % 2 === 0) {
      const ponta = new THREE.ConeGeometry(0.035, 0.12, 4)
      ponta.translate(px, y + mureta + hb + 0.06, pz)
      o.geo(ferro, ponta)
    }
  }
  // as travessas
  for (const yy of [y + mureta + 0.12, y + alto - 0.35]) o.caixa(ferro, mx, yy, mz, comp, 0.04, 0.04, ry)
}
