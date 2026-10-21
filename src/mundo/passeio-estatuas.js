// As peças do Passeio Público (detalhe-4-marcos.md, seção 4): as estátuas, as esfinges, o tanque com a
// baigneuse, o coreto, o botequim e a caixa-d'água com o cata-vento. Formas procedurais e
// simplificadas (uma fase depois pode trocar cada estátua por uma esculpida: cada uma tem a sua
// função aqui). Tudo vai para a Obra do Passeio (obra1932.js), em metros e no sistema local dele.
//
// FATO: as estátuas são cópias reduzidas de originais europeus, de pedra artificial ou de ferro
// fundido, brancas nas fotos de 1908; as duas esfinges "confrontantes" de pedra artificial no alto da
// escada para o 2º plano; o tanque circular da entrada da Major Facundo, com a coluna central e a
// baigneuse de Val d'Osne em cima e quatro jarrões sobre pedestais na borda; o coreto octogonal de
// cobertura em pirâmide (de lona em 1908); o botequim de telhado baixo de quatro águas; a caixa
// metálica sobre torre com cata-vento (foto de 1903).
// Nota do Joabe nos conceitos: as esfinges são de pedra lisa, de uma cor só, forma egípcia com o
// nemes (sem dourado nem listras).

import * as THREE from 'three'

// cápsula entre dois pontos (membro de figura): raio r
function membro(o, chave, a, b, r) {
  const d = new THREE.Vector3().subVectors(b, a)
  const comp = d.length()
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, comp), 3, 8)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  g.applyQuaternion(q)
  const m = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
  g.translate(m.x, m.y, m.z)
  o.geo(chave, g)
}

const V = (x, y, z) => new THREE.Vector3(x, y, z)

// Figura em pé de ~1,75 m sobre (x, y, z), olhando para (sen ry, cos ry). pose:
//   'apolo' (Prometeu, braço apontando o céu), 'voo' (Mercúrio na ponta do pé, braço erguido),
//   'lutador' (o Gladiador Borghese, em investida), 'drapeada' (Vênus, Ceres, Diana: manto até o pé),
//   'banhista' (a baigneuse, agachada)
export function figura(o, chave, x, y, z, pose, ry = 0) {
  const partes = []
  const p = (a, b, r) => partes.push([a, b, r])
  const inclina = pose === 'lutador' ? 0.5 : pose === 'voo' ? 0.12 : 0
  const quadril = pose === 'banhista' ? V(0, 0.55, 0) : V(0, 0.95, 0)
  const ombro = quadril.clone().add(V(0, 0.55 * Math.cos(inclina), 0.55 * Math.sin(inclina)))
  const cabeca = ombro.clone().add(V(0, 0.22, 0.05 * Math.sin(inclina)))
  // pernas
  if (pose === 'drapeada') {
    const manto = new THREE.CylinderGeometry(0.17, 0.3, 0.95, 10)
    manto.translate(0, 0.475, 0)
    partes.push(['geo', manto])
  } else if (pose === 'banhista') {
    p(quadril.clone().add(V(-0.1, 0, 0)), V(-0.12, 0.3, 0.35), 0.075)
    p(V(-0.12, 0.3, 0.35), V(-0.1, 0.04, 0.3), 0.06)
    p(quadril.clone().add(V(0.1, 0, 0)), V(0.15, 0.08, 0.05), 0.075)
  } else if (pose === 'lutador') {
    p(quadril.clone().add(V(-0.1, 0, 0)), V(-0.12, 0.05, 0.6), 0.075)
    p(quadril.clone().add(V(0.1, 0, 0)), V(0.12, 0.05, -0.55), 0.075)
  } else if (pose === 'voo') {
    p(quadril.clone().add(V(-0.08, 0, 0)), V(-0.06, 0.03, 0.02), 0.07)
    p(quadril.clone().add(V(0.1, 0, 0)), V(0.16, 0.45, -0.35), 0.07)
  } else {
    p(quadril.clone().add(V(-0.1, 0, 0)), V(-0.11, 0.03, 0.03), 0.075)
    p(quadril.clone().add(V(0.1, 0, 0)), V(0.14, 0.03, -0.08), 0.075)
  }
  // tronco e cabeça
  p(quadril, ombro, 0.14)
  partes.push(['geo', new THREE.SphereGeometry(0.115, 10, 8).translate(cabeca.x, cabeca.y, cabeca.z)])
  // braços
  const oe = ombro.clone().add(V(-0.2, -0.04, 0))
  const od = ombro.clone().add(V(0.2, -0.04, 0))
  if (pose === 'apolo' || pose === 'voo') {
    p(od, od.clone().add(V(0.12, 0.62, 0.08)), 0.055)
    p(oe, oe.clone().add(V(-0.15, -0.5, 0.1)), 0.055)
  } else if (pose === 'lutador') {
    p(od, od.clone().add(V(0.05, 0.25, 0.55)), 0.055)
    p(oe, oe.clone().add(V(-0.2, -0.1, -0.5)), 0.055)
  } else if (pose === 'banhista') {
    p(od, od.clone().add(V(-0.15, -0.3, 0.3)), 0.05)
    p(oe, oe.clone().add(V(0.05, -0.35, 0.3)), 0.05)
  } else {
    p(od, od.clone().add(V(0.05, -0.32, 0.22)), 0.055)
    p(oe, oe.clone().add(V(-0.08, -0.5, 0.02)), 0.055)
    // o manto no ombro
    p(oe, quadril.clone().add(V(0.12, 0.1, 0.06)), 0.07)
  }
  // monta numa geometria só, girada e posta
  const geos = []
  for (const it of partes) {
    if (it[0] === 'geo') { geos.push(it[1]); continue }
    const tmp = { lista: [], geo(k, g) { this.lista.push(g) } }
    membro(tmp, null, it[0], it[1], it[2])
    geos.push(tmp.lista[0])
  }
  for (const g of geos) { g.rotateY(ry); g.translate(x, y, z); o.geo(chave, g) }
}

// pedestal de estátua (cubo com base e cimalha) e a figura em cima
export function estatua(o, pedra, branco, x, y, z, pose, ry = 0, alto = 1.6) {
  o.bloco(pedra, x, y, z, 1.1, 0.25, 1.1)
  o.bloco(pedra, x, y + 0.25, z, 0.8, alto - 0.45, 0.8)
  o.bloco(pedra, x, y + alto - 0.2, z, 1.0, 0.2, 1.0)
  figura(o, branco, x, y + alto, z, pose, ry)
  o.coluna(x, z, 0.65)
}

// Esfinge deitada de ~2,2 m, olhando para (sen ry, cos ry), sobre (x, y, z): corpo de leão, patas
// para a frente, peito, cabeça com o nemes (o pano listrado vira só a forma: trapézio que cai em
// duas abas pelos ombros). Pedra lisa, uma cor só.
export function esfinge(o, chave, x, y, z, ry = 0) {
  const gs = []
  const elip = (cx, cy, cz, rx, ryy, rz, seg = 12) => { const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7)); g.scale(rx, ryy, rz); g.translate(cx, cy, cz); gs.push(g) }
  const perna = (a, b, r) => { const t = { lista: [], geo(k, g) { this.lista.push(g) } }; membro(t, null, a, b, r); gs.push(t.lista[0]) }
  // o plinto
  const plinto = new THREE.BoxGeometry(0.95, 0.14, 2.35)
  plinto.translate(0, 0.07, 0)
  gs.push(plinto)
  // o corpo de leão deitado: lombo comprido, quartos traseiros redondos, peito alto
  elip(0, 0.5, -0.2, 0.36, 0.34, 0.85)
  elip(0, 0.42, -0.78, 0.4, 0.3, 0.38)
  elip(0, 0.66, 0.38, 0.33, 0.42, 0.34)
  // as patas da frente estendidas e as de trás dobradas ao lado
  for (const lado of [-1, 1]) {
    perna(V(lado * 0.2, 0.32, 0.45), V(lado * 0.21, 0.22, 1.02), 0.085)
    elip(lado * 0.21, 0.2, 1.06, 0.1, 0.07, 0.11, 8)
    elip(lado * 0.3, 0.27, -0.62, 0.12, 0.13, 0.34, 8)
  }
  // a cabeça com o nemes: o rosto arredondado, o pano que desce atrás em trapézio e as duas abas no peito
  elip(0, 1.12, 0.47, 0.14, 0.18, 0.15)
  const s = new THREE.Shape()
  s.moveTo(-0.17, 0.2)
  s.quadraticCurveTo(0, 0.3, 0.17, 0.2)
  s.lineTo(0.3, -0.34)
  s.lineTo(-0.3, -0.34)
  s.lineTo(-0.17, 0.2)
  const nemes = new THREE.ExtrudeGeometry(s, { depth: 0.34, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2, curveSegments: 6 })
  nemes.translate(0, 1.06, 0.12)
  gs.push(nemes)
  for (const lado of [-1, 1]) {
    const aba = new THREE.BoxGeometry(0.1, 0.42, 0.12)
    aba.rotateX(-0.12)
    aba.translate(lado * 0.19, 0.84, 0.53)
    gs.push(aba)
  }
  // a faixa da testa e o rabo enrolado ao lado do quarto
  const faixa = new THREE.TorusGeometry(0.15, 0.025, 4, 12, Math.PI)
  faixa.rotateX(-Math.PI / 2)
  faixa.translate(0, 1.22, 0.47)
  gs.push(faixa)
  const rabo = new THREE.TorusGeometry(0.2, 0.04, 5, 10, Math.PI)
  rabo.rotateY(Math.PI / 2)
  rabo.translate(0.4, 0.18, -0.72)
  gs.push(rabo)
  for (const g of gs) { g.rotateY(ry); g.translate(x, y, z); o.geo(chave, g) }
}

// O tanque circular com repuxo (entrada da Major Facundo): diâmetro 9 m (HIPÓTESE pela figura 8),
// coluna central com taça e a baigneuse menor em cima, quatro jarrões nos pedestais da borda.
export function tanque(o, pedra, branco, agua, x, y, z, r = 4.5) {
  const borda = new THREE.TorusGeometry(r, 0.28, 6, 36)
  borda.rotateX(Math.PI / 2)
  borda.translate(x, y + 0.45, z)
  o.geo(pedra, borda)
  o.cilindro(pedra, x, y - 0.3, z, r + 0.15, r + 0.2, 0.62, 36)
  o.cilindro(agua, x, y + 0.32, z, r - 0.2, r - 0.2, 0.04, 36)
  o.cilindro(pedra, x, y, z, 0.35, 0.5, 2.6, 10)
  const taca = new THREE.CylinderGeometry(1.0, 0.25, 0.35, 16)
  taca.translate(x, y + 2.75, z)
  o.geo(pedra, taca)
  o.cilindro(pedra, x, y + 2.9, z, 0.12, 0.16, 0.6, 8)
  figura(o, branco, x, y + 3.5, z, 'banhista', 0.8)
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2
    const px = x + Math.cos(a) * r
    const pz = z + Math.sin(a) * r
    o.bloco(pedra, px, y, pz, 0.8, 1.0, 0.8)
    const jarro = new THREE.LatheGeometry([[0.12, 0], [0.22, 0.1], [0.32, 0.35], [0.3, 0.6], [0.18, 0.8], [0.2, 0.9]].map(([a2, b]) => new THREE.Vector2(a2, b)), 10)
    jarro.translate(px, y + 1.0, pz)
    o.geo(branco, jarro)
  }
  o.coluna(x, z, r + 0.3)
}

// O coreto octogonal (7,5 m), base de alvenaria com degraus, oito colunas de ferro e a cobertura em
// pirâmide de lona (o toldo da foto de 1908)
export function coreto(o, chaves, x, y, z) {
  const { pedra, ferro, lona } = chaves
  const R = 3.75
  o.cilindro(pedra, x, y - 0.4, z, R, R + 0.1, 1.3, 8, Math.PI / 8)
  o.cilindro(pedra, x, y + 0.9, z, R + 0.15, R + 0.15, 0.12, 8, Math.PI / 8)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    o.cilindro(ferro, x + Math.cos(a) * (R - 0.25), y + 1.0, z + Math.sin(a) * (R - 0.25), 0.06, 0.08, 3.0, 6)
    // o guarda-corpo entre as colunas (menos onde fica a escada, no sul)
    if (k === 2) continue
    const b = ((k + 0.5) / 8) * Math.PI * 2
    const lado = 2 * (R - 0.25) * Math.sin(Math.PI / 8)
    o.caixa(ferro, x + Math.cos(b) * (R - 0.25) * 0.924, y + 1.85, z + Math.sin(b) * (R - 0.25) * 0.924, lado, 0.05, 0.05, -b + Math.PI / 2)
    o.caixa(ferro, x + Math.cos(b) * (R - 0.25) * 0.924, y + 1.45, z + Math.sin(b) * (R - 0.25) * 0.924, lado, 0.04, 0.04, -b + Math.PI / 2)
  }
  // a pirâmide de lona, fechada embaixo (de baixo se vê o forro da lona)
  const teto = new THREE.ConeGeometry(R + 0.6, 2.2, 8, 1)
  teto.rotateY(Math.PI / 8)
  teto.translate(x, y + 4.0 + 1.1, z)
  o.geo(lona, teto)
  o.cilindro(ferro, x, y + 6.2, z, 0.03, 0.05, 0.6, 5)
  // a escada (sul) e o piso
  o.escada(x, z + R, 0, 1.6, 2.2, 0.9, 0, pedra)
  o.piso(x, z, R * 0.92, R * 0.92, 0.9)
  for (let k = 0; k < 8; k++) {
    if (k === 2) continue
    const b = ((k + 0.5) / 8) * Math.PI * 2
    o.coluna(x + Math.cos(b) * R, z + Math.sin(b) * R, 0.4)
  }
}

// O botequim (depois "do Amarílio"): pavilhão térreo aberto, telhado baixo de quatro águas, guarda-corpo
// de madeira (foto do blog, pavilhao_e_combustores.jpg)
export function botequim(o, chaves, x, y, z) {
  const { madeira, telha, pedra } = chaves
  o.bloco(pedra, x, y - 0.3, z, 8.4, 0.6, 6.4)
  for (const [px, pz] of [[-3.9, -2.9], [3.9, -2.9], [-3.9, 2.9], [3.9, 2.9], [0, -2.9], [0, 2.9]]) {
    o.bloco(madeira, x + px, y + 0.3, z + pz, 0.22, 2.8, 0.22)
    o.coluna(x + px, z + pz, 0.2)
  }
  for (const [cx, cz, sx, sz] of [[0, -2.9, 7.8, 0.08], [0, 2.9, 7.8, 0.08], [-3.9, 0, 0.08, 5.8], [3.9, 0, 0.08, 5.8]]) {
    o.caixa(madeira, x + cx, y + 1.25, z + cz, sx, 0.08, sz)
    o.caixa(madeira, x + cx, y + 0.8, z + cz, sx, 0.05, sz)
  }
  const teto = new THREE.ConeGeometry(6.6, 1.6, 4, 1)
  teto.rotateY(Math.PI / 4)
  teto.scale(1, 1, 0.78)
  teto.translate(x, y + 3.1 + 0.8, z)
  o.geo(telha, teto)
  o.bloco(madeira, x, y + 0.3, z - 1.5, 3.0, 1.0, 0.7) // o balcão
  o.piso(x, z, 4.2, 3.2, 0.3)
}

// A caixa-d'água metálica sobre torre de ferro, com o cata-vento americano em cima (foto de 1903)
export function caixaDagua(o, ferro, x, y, z) {
  const h = 9
  for (const [px, pz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    o.cilindro(ferro, x + px, y, z + pz, 0.08, 0.1, h, 6)
    o.coluna(x + px, z + pz, 0.15)
  }
  for (const yy of [2.2, 4.6, 7.0]) {
    o.caixa(ferro, x, y + yy, z - 1.3, 2.6, 0.06, 0.06)
    o.caixa(ferro, x, y + yy, z + 1.3, 2.6, 0.06, 0.06)
    o.caixa(ferro, x - 1.3, y + yy, z, 0.06, 0.06, 2.6)
    o.caixa(ferro, x + 1.3, y + yy, z, 0.06, 0.06, 2.6)
  }
  for (const lado of [-1, 1]) {
    o.caixa(ferro, x, y + h / 2, z + lado * 1.3, 0.05, h * 1.02, 0.05, 0, 0, 0.27)
    o.caixa(ferro, x + lado * 1.3, y + h / 2, z, 0.05, h * 1.02, 0.05, 0, 0.27, 0)
  }
  o.cilindro(ferro, x, y + h, z, 1.6, 1.6, 2.2, 14)
  o.cilindro(ferro, x, y + h + 2.2, z, 0.2, 1.65, 0.4, 14)
  // o cata-vento: haste, roda de pás e o leme
  o.cilindro(ferro, x, y + h + 2.6, z, 0.05, 0.06, 2.6, 5)
  const yc = y + h + 5.0
  o.cilindro(ferro, x, yc - 0.12, z + 0.25, 0.14, 0.14, 0.24, 8)
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2
    o.caixa(ferro, x + Math.cos(a) * 0.95, yc + Math.sin(a) * 0.95, z + 0.35, 0.28, 1.25, 0.02, 0, 0.35, -a + Math.PI / 2)
  }
  o.caixa(ferro, x, yc, z - 1.0, 0.03, 0.9, 1.6)
  o.caixa(ferro, x, yc, z - 0.2, 0.05, 0.05, 1.4)
}
