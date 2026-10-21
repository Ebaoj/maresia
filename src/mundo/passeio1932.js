// O Passeio Público (Praça dos Mártires) no auge, na cena de 1932 (detalhe-4-marcos.md, seção 4, com
// as "Correções ao dossiê anterior"; conceitos passeio-caio-prado.png e passeio-planos.png).
//
// FATO: três planos; o 1º, de ~141 x 73 m, é o jardim de verdade, com as três avenidas no mesmo nível,
// do mar para a cidade: Caio Prado (o belvedere de 1888 sobre o muro de Herbster, com o gradil de ferro
// original), Carapinima (estreita, logo atrás), quadras de jardim, Mororó (a central, a mais larga,
// cimentada, do portão da Santa Casa ao portão dos fundos do quartel), quadras, gradil com portões sobre
// a Rua Dr. João Moreira. Eixos transversais: a alameda da Rua Major Facundo (portão principal, o tanque
// circular com repuxo) e o eixo do coreto, a oeste, que chega no gradil norte onde as esfinges marcam a
// escada de dois ramos para o 2º plano, com o tanque e a estátua sob o arco. Combustores de gás a cada
// ~10 m ao longo da Caio Prado, do lado do gradil; bancos compridos de ferro sob a fileira de árvores.
// Em 1932: o 3º plano já era a usina da Light desde 1912 (galpão e chaminé alta; sem lago, sem Netuno);
// o 2º plano, campo de futebol popular desde 1913; a iluminação ainda a gás.
// HIPÓTESE (do dossiê, marcadas lá): larguras das avenidas (Caio Prado 6 m, Carapinima 5, Mororó 6);
// gradil de pilares de alvenaria a cada 3,5 m com barras de ponta, 2 m; ferro escuro; estátuas brancas;
// posições das estátuas pela figura 8 (planta atual) e pela lista de 1939; alamedas retas (os caminhos
// curvos da planta atual podem ser da reforma de 1932-1933).
// Recorte do jogo (decisão registrada no commit): o 1º plano "no auge" (fotos de 1903-1908), com o
// gradil de pé (ele só saiu em julho de 1932, numa reforma), e os planos de baixo como eram em 1932.
// As alturas dos patamares estão em passeio-terreno.js (o relevo do jogo é comprimido na altura).

import * as THREE from 'three'
import { CAL } from '../paleta.js'
import { PEGADAS } from './lotes-marcos.js'
import { PLANOS, niveisPasseio } from './passeio-terreno.js'
import { alturaBruta } from './mapa.js'
import { Obra, materiaisObra } from './obra1932.js'
import { gradil, lampiaoColuna, bancoFerro, tramoComVao, urna, balaustrada } from './ornatos1932.js'
import { estatua, esfinge, tanque, coreto, botequim, caixaDagua, figura } from './passeio-estatuas.js'
import { oiti, cajueiro, murici } from './especies.js'
import { instanciarEmBlocos } from './blocos.js'
import { toonVertice } from '../materiais.js'
import { criarAleatorio } from '../utils.js'

const TABELA = (c) => ({
  piso: { cor: '#e6dcc6', tex: 'areia', tam: 3, contraste: 0.35 },
  tijolo: { cor: '#c9a27e', tex: 'pedra', tam: 1.2, contraste: 0.5 },
  canteiro: { cor: '#7a8c4c', tex: 'folha', tam: 2, contraste: 0.5 },
  meiofio: { cor: CAL.calVelha },
  muro: { cor: CAL.cal, tex: 'cal', tam: 3, contraste: 0.3, recebe: false },
  branco: { cor: '#f4eee2', tex: 'cal', tam: 2, contraste: 0.15, recebe: false },
  pedra: { cor: '#e4dccb', tex: 'pedra', tam: 2, contraste: 0.3 },
  nicho: { cor: '#cfc6b4' },
  estatua: { cor: '#f2ede2', detalhe: true, recebe: false },
  esfinge: { cor: c.corEsfinge, proprio: true, recebe: false },
  ferro: { cor: c.corFerro, detalhe: true, proprio: true },
  ferroGrosso: { cor: c.corFerro },
  lamp: { cor: c.corFerro, detalhe: true, proprio: true },
  vidro: { tipo: 'vidro' },
  madeira: { cor: CAL.mangue, detalhe: true },
  agua: { cor: '#5f9e9a' },
  lona: { cor: '#e8dcc4', recebe: false },
  telha: { tipo: 'telha', cor: CAL.telha },
  usina: { cor: '#e9e2d2', tex: 'cal', tam: 3, contraste: 0.3, recebe: false },
  zinco: { cor: '#5b5550' },
  chamine: { cor: '#4a3d36', tex: 'pedra', tam: 1.5, contraste: 0.5 },
  carvao: { cor: '#2e2a28' },
  campo: { cor: '#d8c39a', tex: 'areia', tam: 3, contraste: 0.5 },
  trave: { cor: CAL.cal },
  janela: { cor: '#3c4a48' },
})

// as faixas do 1º plano, de norte (mar) para sul (cidade), em z local
const Z = { belvedere: -36.5, caio: [-36.5, -30], canteiro: [-30, -25], carap: [-25, -20], norte: [-20, -1], mororo: [-1, 5], sul: [5, 33], borda: [33, 36.5] }
// os eixos transversais (x do meio, largura)
const EIXOS = [[-30, 6], [4, 4], [32, 6]]

// trechos de x entre os eixos (as quadras), na faixa [za, zb]; eixos: quais eixos cortam a faixa
function trechos(eixos) {
  const cortes = [PLANOS.p1.x0 + 0.6]
  for (const [x, w] of eixos) cortes.push(x - w / 2, x + w / 2)
  cortes.push(PLANOS.p1.x1 - 0.6)
  const out = []
  for (let i = 0; i < cortes.length; i += 2) out.push([cortes[i], cortes[i + 1]])
  return out
}

function laje(o, chave, x0, x1, z0, z1, alto = 0.06, y = 0) {
  o.bloco(chave, (x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, alto, z1 - z0)
}

// um canteiro (gramado com meio-fio), em que se anda por cima
function quadra(o, x0, x1, z0, z1) {
  laje(o, 'canteiro', x0 + 0.15, x1 - 0.15, z0 + 0.15, z1 - 0.15, 0.2)
  for (const [a, b, c, d] of [[x0, x1, z0, z0 + 0.15], [x0, x1, z1 - 0.15, z1], [x0, x0 + 0.15, z0, z1], [x1 - 0.15, x1, z0, z1]]) laje(o, 'meiofio', a, b, c, d, 0.26)
  o.piso((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0.22)
}

function primeiroPlano(o, y2, arvores) {
  const { p1 } = PLANOS
  // o muro de Herbster e a laje do belvedere (o chão de baixo desce debaixo dela)
  o.bloco('muro', 0, y2 - 0.6, -34.9, p1.x1 - p1.x0, -y2 + 0.6, 3.2)
  for (let x = p1.x0 + 5; x < p1.x1; x += 10) if (Math.abs(x + 30) > 6) o.bloco('branco', x, y2 - 0.6, -36.6, 0.7, -y2 + 0.4, 0.3) // contrafortes
  o.bloco('branco', 0, -0.35, -36.55, p1.x1 - p1.x0 + 0.4, 0.3, 0.35) // a cimalha do muro
  o.piso(0, -34.9, p1.x1, 1.6, 0.06)
  // as avenidas e os eixos
  laje(o, 'piso', p1.x0, p1.x1, ...Z.caio)
  laje(o, 'tijolo', p1.x0, p1.x1, ...Z.carap)
  laje(o, 'piso', p1.x0, p1.x1, ...Z.mororo)
  laje(o, 'piso', p1.x0, p1.x1, ...Z.borda)
  for (const [x, w] of EIXOS) laje(o, 'piso', x - w / 2, x + w / 2, Z.carap[1], Z.borda[0], 0.05)
  // praças nos eixos: o coreto, a caixa-d'água, o tanque da entrada
  laje(o, 'piso', -37, -23, -17, -3, 0.055)
  laje(o, 'piso', 0, 8, -15.5, -8.5, 0.055)
  laje(o, 'piso', 25, 39, 11, 25, 0.055)
  // os canteiros compridos da Caio Prado (com a fileira de árvores) e as quadras
  for (const [a, b] of trechos(EIXOS)) {
    quadra(o, a, b, ...Z.canteiro)
    for (let x = a + 4; x < b - 2; x += 8) arvores.push(['renque', x, -27.5])
  }
  for (const [a, b] of trechos(EIXOS)) quadraCortada(o, a, b, ...Z.norte, arvores)
  for (const [a, b] of trechos([EIXOS[0], EIXOS[2]])) quadraCortada(o, a, b, ...Z.sul, arvores)
}

// quadra que contorna as praças dos eixos (o retângulo é cortado em pedaços fora delas)
function quadraCortada(o, x0, x1, z0, z1, arvores) {
  const pedacos = [[x0, x1, z0, z1]]
  const cortes = [[-37, -23, -17, -3], [0, 8, -15.5, -8.5], [25, 39, 11, 25]]
  for (const [a, b, c, d] of cortes) {
    for (let i = pedacos.length - 1; i >= 0; i--) {
      const [p0, p1, q0, q1] = pedacos[i]
      if (b <= p0 || a >= p1 || d <= q0 || c >= q1) continue
      pedacos.splice(i, 1)
      if (a > p0) pedacos.push([p0, a, q0, q1])
      if (b < p1) pedacos.push([b, p1, q0, q1])
      if (c > q0) pedacos.push([Math.max(a, p0), Math.min(b, p1), q0, c])
      if (d < q1) pedacos.push([Math.max(a, p0), Math.min(b, p1), d, q1])
    }
  }
  for (const [a, b, c, d] of pedacos) {
    if (b - a < 2 || d - c < 2) continue
    quadra(o, a, b, c, d)
    const n = Math.round(((b - a) * (d - c)) / 110)
    for (let k = 0; k < n; k++) arvores.push(['quadra', a + 1.5, b - 1.5, c + 1.5, d - 1.5])
  }
}

// a escada de dois ramos para o 2º plano, com as esfinges no alto e o tanque com a estátua sob o arco
function escadaEsfinges(o, y2) {
  const X = -30
  o.bloco('muro', X, y2, -37.7, 8.4, -y2, 2.4) // o patamar, que avança do muro
  tramoComVao(o, { parede: 'muro', folha: 'nicho', moldura: 'branco' }, X, y2, -39.1, 8.4, -y2, 2.6, Math.min(2.8, -y2 - 0.5), 0, 0.3, true, Math.PI)
  o.piso(X, -37.9, 4.2, 1.5, 0.06)
  laje(o, 'piso', X - 4.2, X + 4.2, -39.1, -36.5, 0.06)
  for (const lado of [-1, 1]) {
    const xi = X + lado * 4.2
    o.escada(xi, -37.6, lado * 6.6, 0, 2.0, 0, y2, 'pedra')
    // a grade baixa da escada, do lado de fora
    for (let k = 0; k <= 5; k++) {
      const t = k / 5
      o.cilindro('ferro', xi + lado * 6.6 * t, y2 * t, -38.65, 0.03, 0.03, 0.95, 5)
    }
    const ang = Math.atan2(-y2, 6.6)
    o.caixa('ferro', xi + lado * 3.3, y2 / 2 + 0.92, -38.65, Math.hypot(6.6, y2), 0.05, 0.05, 0, 0, -lado * ang)
    o.solido(xi + lado * 3.3, -38.75, 3.3, 0.1)
  }
  o.solido(X, -39.2, 4.2, 0.1)
  // os pilares das esfinges, no alto, e as esfinges confrontantes (uma olha para a outra)
  for (const lado of [-1, 1]) {
    const px = X + lado * 4.6
    o.bloco('branco', px, 0, -36.1, 1.3, 1.9, 1.3)
    o.bloco('branco', px, 1.9, -36.1, 1.55, 0.22, 1.55)
    esfinge(o, 'esfinge', px, 2.12, -36.1, lado > 0 ? -Math.PI / 2 : Math.PI / 2)
    o.solido(px, -36.1, 0.75, 0.75)
  }
  // o tanque ao pé, com a terceira baigneuse
  o.cilindro('pedra', X, y2 - 0.2, -40.9, 1.6, 1.7, 0.75, 20)
  o.cilindro('agua', X, y2 + 0.5, -40.9, 1.4, 1.4, 0.04, 20)
  o.cilindro('pedra', X, y2, -40.6, 0.3, 0.35, 1.1, 8)
  figura(o, 'estatua', X, y2 + 1.1, -40.6, 'banhista', Math.PI)
  o.coluna(X, -40.9, 1.8)
}

// o gradil de ferro em volta do 1º plano (o belvedere, a Rua Dr. João Moreira e as duas laterais), com os portões
function gradis(o) {
  const { p1 } = PLANOS
  const g = (ax, az, bx, bz, op) => {
    gradil(o, 'branco', 'ferro', ax, az, bx, bz, 0, op)
    const comp = Math.hypot(bx - ax, bz - az)
    if (ax === bx) o.solido(ax, (az + bz) / 2, 0.3, comp / 2)
    else o.solido((ax + bx) / 2, az, comp / 2, 0.3)
  }
  // o belvedere: mureta com pilares e a grade original, mais baixa (dá para debruçar)
  const bel = { alto: 1.25, mureta: 0.55, vao: 3, passoBarra: 0.14 }
  g(p1.x0, -36.2, -35.4, -36.2, bel)
  g(-24.6, -36.2, p1.x1, -36.2, bel)
  // a rua: gradil alto com o portão principal no eixo da Major Facundo
  const rua = { alto: 2.0, mureta: 0.45, vao: 3.5 }
  g(p1.x0, 36.3, 29.5, 36.3, rua)
  g(34.5, 36.3, p1.x1, 36.3, rua)
  // as laterais, com os portões da Mororó (o da Santa Casa a oeste, o dos fundos do quartel a leste)
  for (const x of [p1.x0 + 0.2, p1.x1 - 0.2]) {
    g(x, -36.2, x, -0.5, rua)
    g(x, 4.5, x, 36.3, rua)
  }
  // os pilares dos portões, mais altos, com urna
  for (const [px, pz] of [[29.5, 36.3], [34.5, 36.3], [p1.x0 + 0.2, -0.5], [p1.x0 + 0.2, 4.5], [p1.x1 - 0.2, -0.5], [p1.x1 - 0.2, 4.5]]) {
    o.bloco('branco', px, 0, pz, 0.75, 2.8, 0.75)
    urna(o, 'estatua', px, 2.8, pz, 1.2)
  }
}

function lampioesEBancos(o) {
  const { p1 } = PLANOS
  // combustores a cada ~10 m ao longo da Caio Prado, do lado do gradil (fotos de 1903 e 1908)
  for (let x = p1.x0 + 5; x < p1.x1; x += 10) if (Math.abs(x + 30) > 6) lampiaoColuna(o, 'lamp', 'vidro', x, 0.06, -35.3)
  // na Mororó, alternando os lados, e nos portões
  for (let x = -60, k = 0; x <= 60; x += 15, k++) lampiaoColuna(o, 'lamp', 'vidro', x, 0.06, k % 2 ? 5.6 : -1.6)
  for (const [x, z] of [[28.2, 35], [35.8, 35], [p1.x0 + 1.5, -1.5], [p1.x0 + 1.5, 5.5], [p1.x1 - 1.5, -1.5], [p1.x1 - 1.5, 5.5]]) lampiaoColuna(o, 'lamp', 'vidro', x, 0.06, z)
  // bancos compridos de ferro debaixo da fileira de árvores, virados para a Caio Prado
  for (const [a, b] of trechos(EIXOS)) {
    for (let x = a + 3; x < b - 2; x += 7) { bancoFerro(o, 'ferro', 'madeira', x, 0.26, -29.4, 2.4, Math.PI); o.coluna(x, -29.4, 0.6) }
  }
  // e na Mororó, dos dois lados
  for (let x = -64; x <= 64; x += 12) {
    if (EIXOS.some(([ex, w]) => Math.abs(x - ex) < w / 2 + 1.5)) continue
    bancoFerro(o, 'ferro', 'madeira', x, 0.26, -1.4 + 0.2, 2.2, 0)
    bancoFerro(o, 'ferro', 'madeira', x + 6, 0.26, 5.2, 2.2, Math.PI)
  }
}

function planosDeBaixo(o, y2, y3) {
  const { p2 } = PLANOS
  // 2º plano: o campo de futebol popular (desde 1913), chão de areia e traves de madeira
  laje(o, 'campo', -30, 30, -74, -46, 0.04, y2)
  for (const xg of [-30, 30]) {
    for (const zt of [-63.6, -56.4]) o.cilindro('trave', xg, y2, zt, 0.07, 0.07, 2.44, 6)
    o.caixa('trave', xg, y2 + 2.44, -60, 0.12, 0.12, 7.32)
  }
  // o muro do 2º para o 3º plano, a mureta branca com pilaretes e vasos, e a escada no eixo
  o.bloco('muro', 0, y3 - 0.6, -79.9, p2.x1 - p2.x0, y2 - y3 + 0.6, 3.2)
  o.piso(0, -79.9, p2.x1, 1.6, y2 + 0.02)
  for (const [a, b] of [[p2.x0, -32], [-28, p2.x1]]) {
    balaustrada(o, 'branco', a, b, y2, -81.2, 0.9, 6)
    o.solido((a + b) / 2, -81.2, (b - a) / 2, 0.25)
    for (let x = a; x <= b; x += 12) urna(o, 'estatua', x, y2 + 0.9, -81.2, 1.1)
  }
  o.escada(-30, -81.5, 0, -6, 3.6, y2, y3, 'pedra')
  // 3º plano: a usina termelétrica da Light (desde 1912): o galpão de empena branco, o galpão negro
  // das caldeiras, a chaminé muito alta e montes de carvão (foto usina_light_vista_do_passeio.jpg)
  const yb = y3 - 0.4
  o.bloco('usina', 8, yb, -112, 30, 7.4, 14)
  for (const lado of [-1, 1]) o.caixa('zinco', 8, y3 + 7 + 1.75, -112 + lado * 3.6, 31, 0.2, 7.9, 0, lado * 0.47)
  for (const lado of [-1, 1]) {
    const s = new THREE.Shape()
    s.moveTo(-7, 0); s.lineTo(7, 0); s.lineTo(0, 3.4); s.lineTo(-7, 0)
    const emp = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false })
    emp.rotateY(Math.PI / 2)
    emp.translate(8 + lado * 15 - (lado > 0 ? 0.3 : 0), y3 + 7, -112)
    o.geo('usina', emp)
  }
  for (let x = -4; x <= 20; x += 4) for (const zf of [-104.98, -119.02]) o.caixa('janela', x, y3 + 4.2, zf, 1.6, 2.4, 0.08)
  o.bloco('zinco', -22, yb, -108, 22, 5.4, 10)
  for (const lado of [-1, 1]) o.caixa('zinco', -22, y3 + 5 + 1.1, -108 + lado * 2.6, 22.6, 0.2, 5.6, 0, lado * 0.42)
  o.cilindro('chamine', 28, yb, -104, 0.95, 1.45, 34, 14)
  o.cilindro('chamine', 28, yb + 34, -104, 1.15, 1.1, 0.8, 14)
  o.bloco('chamine', 28, yb, -104, 3.4, 2.4, 3.4)
  for (const [x, z, r, h] of [[-8, -126, 4, 2.2], [20, -128, 3, 1.6]]) {
    const c = new THREE.ConeGeometry(r, h, 9)
    c.translate(x, y3 + h / 2, z)
    o.geo('carvao', c)
  }
  o.solido(8, -112, 15.2, 7.2)
  o.solido(-22, -108, 11.2, 5.2)
  o.coluna(28, -104, 1.8)
  o.bloqueiaCamera(8, y3 + 4, -112, 30, 8, 14)
}

function estatuas(o) {
  // posições pela figura 8 de Castro (planta atual) e pela lista de João Nogueira de 1939
  const lista = [
    ['apolo', -62, -14, 0.4], // Prometeu, perto do portão da Rua Formosa
    ['voo', -62, 8.5, Math.PI / 2], // Mercúrio, à direita de quem entra na Mororó pela Barão do Rio Branco
    ['drapeada', -12, 8.5, Math.PI], // Ceres, na Mororó
    ['lutador', -10, -12, 0.3], // o Gladiador, quadra central norte
    ['drapeada', 66, 2, -Math.PI / 2], // Vênus de Milo, ponta leste da Mororó, defronte ao quartel
    ['drapeada', -36, -1.8, 0], // Diana (?), no cruzamento do eixo do coreto com a Mororó
    ['drapeada', 24, -5, Math.PI], // Vênus com Cupido, junto ao botequim
    ['drapeada', 32, -18.5, 0], // a baigneuse maior, entre a Carapinima e a Caio Prado no eixo da Major Facundo
  ]
  for (const [pose, x, z, ry] of lista) estatua(o, 'pedra', 'estatua', x, 0.2, z, pose, ry)
  // o menino montado no golfinho (ferro fundido), quadra sul
  o.bloco('pedra', -48, 0.2, 18, 1.2, 1.0, 1.2)
  const golfinho = new THREE.TorusGeometry(0.45, 0.16, 6, 12, Math.PI * 1.3)
  golfinho.rotateY(Math.PI / 2)
  golfinho.translate(-48, 1.7, 18)
  o.geo('estatua', golfinho)
  figura(o, 'estatua', -48, 1.75, 18.1, 'banhista', 0)
  o.coluna(-48, 18, 0.8)
}

// árvores e arbustos (espécies do jogo, com semente): fícus em renque na Caio Prado e arvoredo nas quadras
function plantar(cena, o, lista) {
  const rnd = criarAleatorio(1888)
  const rndG = criarAleatorio(1879)
  const geos = { renque: oiti(rndG), quadra: cajueiro(rndG), quadra2: oiti(rndG), arbusto: murici(rndG) }
  const mats = { renque: [], quadra: [], quadra2: [], arbusto: [] }
  const Y = new THREE.Vector3(0, 1, 0)
  const por = (chave, lx, lz, esc, y = 0.2) => {
    const [x, z] = o.mundo(lx, lz)
    mats[chave].push(new THREE.Matrix4().compose(new THREE.Vector3(x, o.y0 + y, z), new THREE.Quaternion().setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2)), new THREE.Vector3(esc, esc * rnd.entre(0.9, 1.15), esc)))
  }
  for (const it of lista) {
    if (it[0] === 'renque') { por('renque', it[1], it[2], rnd.entre(1.35, 1.6)); o.coluna(it[1], it[2], 0.35); continue }
    const [, a, b, c, d] = it
    const lx = rnd.entre(a, b)
    const lz = rnd.entre(c, d)
    // o cajueiro tem a copa mais cara (4,3 mil triângulos, o oiti 1,4 mil): um em cada três; um ou dois arbustos
    por(rnd.chance(0.33) ? 'quadra' : 'quadra2', lx, lz, rnd.entre(0.8, 1.15))
    o.coluna(lx, lz, 0.4)
    const nArb = rnd.chance(0.5) ? 2 : 1
    for (let k = 0; k < nArb; k++) por('arbusto', rnd.entre(a, b), rnd.entre(c, d), rnd.entre(0.7, 1.1))
  }
  const mat = toonVertice()
  for (const [k, l] of Object.entries(mats)) if (l.length) instanciarEmBlocos(cena, geos[k], mat, l, null, { nome: `passeio-${k}`, placa: true })
}

export function criarPasseio(cena, cfg) {
  const p = PEGADAS.passeio
  const { h1, h2, h3 } = niveisPasseio(alturaBruta)
  const o = new Obra('passeio-publico', p.x, p.z, h1, p.rot)
  const y2 = h2 - h1
  const y3 = h3 - h1
  const arvores = []
  primeiroPlano(o, y2, arvores)
  escadaEsfinges(o, y2)
  gradis(o)
  lampioesEBancos(o)
  estatuas(o)
  coreto(o, { pedra: 'pedra', ferro: 'ferroGrosso', lona: 'lona' }, -30, 0, -10)
  botequim(o, { madeira: 'madeira', telha: 'telha', pedra: 'pedra' }, 16, 0, -11)
  caixaDagua(o, 'ferroGrosso', 4, 0, -12)
  tanque(o, 'pedra', 'estatua', 'agua', 32, 0, 18)
  planosDeBaixo(o, y2, y3)
  o.ocupa(0, -52, 72, 92)
  plantar(cena, o, arvores)
  return o.montar(cena, materiaisObra(TABELA(cfg.mundo.marcosNorte)))
}
