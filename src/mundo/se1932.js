// A velha Sé de Fortaleza (Matriz de São José) em 1932 (dossiê marcos-1932.md, seção 3; conceito
// se-velha.png; aquarela de José dos Reis Carvalho, 1859, em fotos/se-antiga).
//
// FATO (dossiê): a matriz reaberta em 2/4/1854, neoclássica, de duas torres, que ainda estava de pé
// em 1932 (a última missa é de 11/9/1938; demolida depois); "templo de construção sólida, de boa
// altura"; tinha relógio ("o Big-Ben da vila"); tijolo inglês e cal de Lisboa; as torres
// continuavam lá nos anos 1930 (há foto tirada de uma delas). Fica no terreno da catedral de hoje.
// Pela aquarela (a única imagem livre do prédio): duas torres de planta quadrada com dois andares de
// vãos e o campanário em arco no alto, cada uma rematada por cúpula em bulbo com lanternim e cruz;
// frontão triangular entre as torres; pilastras; três portas; janelas do coro; nave longa de duas
// águas de telha vermelha com corredores laterais mais baixos (de dois andares de janelas); fachada
// verde-acinzentada clara com as cimalhas brancas e o corpo lateral branco; diante dela o Santo
// Cruzeiro, alto, num pedestal, cercado por gradil de ferro.
// HIPÓTESE (dossiê): nave de 18 a 22 m de largura (aqui 21 com os corredores) e 45 a 55 m de comprimento
// (aqui 51 com a capela-mor); torres de 25 a 30 m (aqui 29,6 até a cruz); fachada para o sul da malha
// (para a praça e o Palácio do Bispo), o fundo para o mar; o mostrador do relógio no óculo da torre da
// esquerda (como no conceito); os lampiões a gás do largo.

import { CAL, ESQUADRIAS } from '../paleta.js'
import { PEGADAS } from './lotes-marcos.js'
import { alturaTerreno } from './terreno.js'
import { Obra, materiaisObra } from './obra1932.js'
import { fronton, molduraFronton, tramoComVao, bulbo, cruz, relogio, urna, lampiaoColuna, gradil } from './ornatos1932.js'
import * as THREE from 'three'

export const SE = { largura: 22, torre: 6.5, cornija: 13.2, nave: 11, corredor: 5, comprimento: 42, capela: 9 }

const TABELA = (c) => ({
  // o reboco caiado das casas (quarteirao.js): manchas, salitre na base, cal caída; a cor de cada parte por vértice
  fachada: { tipo: 'reboco', cor: c.corSe, recebe: false },
  branco: { tipo: 'reboco', cor: '#f6f1e6', recebe: false }, // cimalhas, pilastras e molduras: brancas, à parte
  nave: { tipo: 'reboco', cor: CAL.cal, recebe: false },
  pedra: { cor: '#b9a888', tex: 'pedra', tam: 2.5, contraste: 0.5 }, // o socco: a barra mais escura
  telha: { tipo: 'telha', cor: CAL.telha },
  porta: { cor: ESQUADRIAS[1] },
  janela: { cor: '#3c4a48' },
  cupula: { cor: '#e6e0d4', recebe: false },
  sino: { cor: '#6e5a3a' },
  relogio: { cor: '#f2ead6' },
  ferro: { cor: c.corFerro, proprio: true },
  lamp: { cor: c.corFerro, detalhe: true, proprio: true },
  vidro: { tipo: 'vidro' },
  detalhe: { cor: '#f4eee2', detalhe: true, recebe: false },
})

// uma torre: x0..x1 em x, z -T..0; os andares de cima, o campanário, o bulbo, o lanternim e a cruz
function torre(o, cx, comRelogio) {
  const { torre: T, cornija } = SE
  const zc = -T / 2
  // os andares de cima da torre (acima da cornija do corpo)
  o.bloco('fachada', cx, cornija, zc, T - 0.4, 4.8, T - 0.4)
  o.bloco('branco', cx, cornija + 4.8, zc, T + 0.1, 0.6, T + 0.1)
  for (const lado of [-1, 1]) for (const fz of [-1, 1]) o.bloco('branco', cx + lado * (T / 2 - 0.35), cornija, zc + fz * (T / 2 - 0.35), 0.7, 4.8, 0.7)
  if (comRelogio) relogio(o, 'relogio', 'ferro', cx, cornija + 2.4, -0.2, 1.05, 10.15)
  else {
    // o óculo da outra torre
    const g = new THREE.TorusGeometry(0.85, 0.18, 6, 18)
    g.translate(cx, cornija + 2.4, -0.15)
    o.geo('branco', g)
    o.caixa('janela', cx, cornija + 2.4, -0.22, 1.3, 1.3, 0.05)
  }
  // o campanário: quatro faces com o vão em arco e o sino dentro
  const yb = cornija + 5.4
  const Tb = T - 0.6
  const h = 4.0
  const e = 0.35
  tramoComVao(o, { parede: 'fachada', folha: 'janela', moldura: 'branco' }, cx, yb, -0.3 - e, Tb, h, 1.7, 3.1, 0.5, e, true)
  tramoComVao(o, { parede: 'fachada', folha: 'janela', moldura: 'branco' }, cx, yb, -T + 0.3 + e, Tb, h, 1.7, 3.1, 0.5, e, true, Math.PI)
  tramoComVao(o, { parede: 'fachada', folha: 'janela', moldura: 'branco' }, cx + Tb / 2 - e, yb, zc, Tb, h, 1.7, 3.1, 0.5, e, true, Math.PI / 2)
  tramoComVao(o, { parede: 'fachada', folha: 'janela', moldura: 'branco' }, cx - Tb / 2 + e, yb, zc, Tb, h, 1.7, 3.1, 0.5, e, true, -Math.PI / 2)
  const sino = new THREE.LatheGeometry([[0.05, 0], [0.62, 0], [0.55, 0.15], [0.42, 0.6], [0.36, 1.0], [0.2, 1.15], [0.02, 1.2]].map(([r, y]) => new THREE.Vector2(r, y)), 10)
  sino.translate(cx, yb + 1.4, zc)
  o.geo('sino', sino)
  // cornija do campanário, pináculos nas quinas
  o.bloco('branco', cx, yb + h, zc, T + 0.2, 0.6, T + 0.2)
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) urna(o, 'detalhe', cx + lx * (T / 2 - 0.15), yb + h + 0.6, zc + lz * (T / 2 - 0.15), 1.6)
  // o tambor, o bulbo, o lanternim e a cruz
  const yd = yb + h + 0.6
  o.cilindro('branco', cx, yd, zc, 2.75, 2.85, 0.6, 16)
  bulbo(o, 'cupula', cx, yd + 0.6, zc, 2.6, 3.4, 16)
  o.cilindro('branco', cx, yd + 3.7, zc, 0.42, 0.48, 1.0, 8)
  bulbo(o, 'cupula', cx, yd + 4.7, zc, 0.5, 0.75, 8)
  cruz(o, 'ferro', cx, yd + 5.35, zc, 1.9, 0.95, 0.09)
}

function fachada(o) {
  const { largura: W, torre: T, cornija } = SE
  const xT = W / 2 - T / 2
  const e = 0.35
  // o corpo da fachada até a cornija: os três vãos de baixo e os do coro
  // torres (uma porta embaixo, uma janela em cima)
  for (const lado of [-1, 1]) {
    const cx = lado * xT
    tramoComVao(o, { parede: 'fachada', folha: 'porta', moldura: 'branco' }, cx, 0, -e, T, 7.0, 1.7, 3.6, 0.6, e)
    tramoComVao(o, { parede: 'fachada', folha: 'janela', moldura: 'branco' }, cx, 7.0, -e, T, cornija - 7.0, 1.25, 2.4, 1.2, e)
    o.bloco('fachada', cx, 0, -T / 2, T - 0.8, cornija, T - 0.8) // o miolo da torre
  }
  // o vão do meio: porta principal e as três janelas do coro com sacada de ferro
  const Wc = W - 2 * T
  tramoComVao(o, { parede: 'fachada', folha: 'porta', moldura: 'branco' }, 0, 0, -e, Wc, 7.0, 2.3, 4.6, 0.6, e)
  // frontão da porta principal
  fronton(o, 'branco', 0, 5.45, 0.02, 3.4, 0.9, 0.2)
  for (const jx of [-3, 0, 3]) {
    tramoComVao(o, { parede: 'fachada', folha: 'janela', moldura: 'branco' }, jx, 7.0, -e, Wc / 3, cornija - 7.0, 1.25, 2.5, 1.2, e)
    o.caixa('ferro', jx, 8.75, 0.35, 1.6, 0.05, 0.6) // a sacada
    o.caixa('ferro', jx, 9.25, 0.62, 1.6, 0.05, 0.04)
    for (let k = 0; k < 9; k++) o.caixa('ferro', jx - 0.75 + k * 0.1875, 9.0, 0.62, 0.025, 0.5, 0.025)
  }
  // pilastras, faixa do primeiro andar, cornija e socco
  for (const px of [-W / 2, -W / 2 + T, W / 2 - T, W / 2]) o.bloco('branco', px, 0, 0.1, 0.8, cornija, 0.4)
  o.bloco('branco', 0, 6.8, 0.12, W + 0.4, 0.45, 0.5)
  o.bloco('branco', 0, cornija - 0.2, 0.15, W + 0.8, 0.5, 0.75)
  o.bloco('branco', 0, cornija + 0.3, 0.05, W + 1.0, 0.3, 0.9)
  o.bloco('pedra', 0, -0.6, 0.15, W + 0.6, 1.2, 0.5)
  // o frontão entre as torres, com o óculo e a cruz
  fronton(o, 'fachada', 0, cornija + 0.6, -1.0, Wc + 0.4, 3.5, 1.0)
  molduraFronton(o, 'branco', 0, cornija + 0.75, 0.05, Wc + 0.6, 3.5, 0.3, 0.45)
  const oc = new THREE.TorusGeometry(0.6, 0.14, 6, 16)
  oc.translate(0, cornija + 1.85, 0.06)
  o.geo('branco', oc)
  o.caixa('janela', 0, cornija + 1.85, 0.02, 0.9, 0.9, 0.04)
  cruz(o, 'pedra', 0, cornija + 4.05, -0.3, 1.5, 0.8, 0.14)
  o.bloco('fachada', 0, cornija, -3, Wc, 0.6, 6)
  torre(o, -xT, true)
  torre(o, xT, false)
}

// a nave, os corredores laterais (dois andares de janelas) e a capela-mor
function corpo(o) {
  const { nave: N, corredor: C, comprimento: L, capela, torre: T } = SE
  const z0 = -T
  const z1 = -L
  const zm = (z0 + z1) / 2
  const comp = z0 - z1
  // nave: paredes até 14 m e o telhado de duas águas (cumeeira a ~17,3 m, a altura do frontão)
  o.bloco('nave', 0, -2, zm, N, 16, comp + 0.2)
  for (const lado of [-1, 1]) o.caixa('telha', lado * (N / 4 + 0.15), 14 + 1.65, zm, N / 2 + 1.3, 0.3, comp + 1.2, 0, 0, -lado * 0.55)
  // janelas altas da nave (acima do telhado dos corredores)
  for (let z = z0 - 4; z > z1 + 2; z -= 5) for (const lado of [-1, 1]) o.caixa('janela', lado * (N / 2 + 0.02), 12.4, z, 0.06, 1.6, 1.1)
  // corredores laterais
  for (const lado of [-1, 1]) {
    const xc = lado * (N / 2 + C / 2)
    o.bloco('nave', xc, -2, zm, C, 11.5, comp)
    o.caixa('telha', xc + lado * 0.2, 9.5 + 0.95, zm, C + 1.4, 0.28, comp + 1, 0, 0, -lado * 0.33) // meia-água, descendo para fora
    o.bloco('branco', lado * (N / 2 + C + 0.05), 9.1, zm, 0.3, 0.4, comp + 0.3) // cimalha
    for (let z = z0 - 3; z > z1 + 1.5; z -= 4.2) {
      for (const y of [2.6, 6.6]) {
        o.caixa('janela', lado * (N / 2 + C + 0.02), y, z, 0.06, 1.9, 1.0)
        o.caixa('branco', lado * (N / 2 + C + 0.06), y - 1.05, z, 0.12, 0.14, 1.3)
      }
    }
  }
  // capela-mor e consistórios
  o.bloco('nave', 0, -1, z1 - capela / 2 + 0.1, N - 1.5, 13, capela)
  for (const lado of [-1, 1]) o.caixa('telha', lado * ((N - 1.5) / 4 + 0.1), 12 + 1.4, z1 - capela / 2, (N - 1.5) / 2 + 1.1, 0.28, capela + 0.8, 0, 0, -lado * 0.55)
  for (const lado of [-1, 1]) {
    o.bloco('nave', lado * (N / 2 + 2.2), -1, z1 - 3.2, 4.4, 8, 6.4)
    o.caixa('telha', lado * (N / 2 + 2.2), 7.6, z1 - 3.2, 5.0, 0.26, 7.0, 0, 0, 0)
  }
}

// o adro com os degraus e o Santo Cruzeiro com o gradil
function adro(o) {
  const { largura: W } = SE
  o.bloco('pedra', 0, -1.2, 2.6, W + 6, 1.2 + 0.6, 5.2)
  o.piso(0, 2.6, (W + 6) / 2, 2.6, 0.6)
  o.escada(0, 5.2, 0, 1.3, 12, 0.6, 0, 'pedra')
  // a mureta branca do adro, dos lados da escada
  for (const lado of [-1, 1]) {
    o.bloco('branco', lado * 10, 0.6, 5.0, 8, 0.8, 0.35)
    o.solido(lado * 10, 5.0, 4, 0.25)
  }
  // o cruzeiro: degraus, pedestal com cimalha, cruz alta com resplendor de ferro
  const cx = 16
  const cz = 17
  for (const [l, y] of [[4.4, 0], [3.6, 0.45], [2.8, 0.9]]) o.bloco('pedra', cx, y - (y ? 0 : 0.6), cz, l, 0.45 + (y ? 0 : 0.6), l)
  o.bloco('branco', cx, 1.35, cz, 1.7, 2.6, 1.7)
  o.bloco('branco', cx, 3.95, cz, 2.1, 0.3, 2.1)
  o.bloco('pedra', cx, 4.25, cz, 1.2, 0.8, 1.2)
  cruz(o, 'pedra', cx, 5.05, cz, 6.2, 2.6, 0.32)
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2
    o.caixa('ferro', cx + Math.cos(a) * 0.75, 5.05 + 6.2 * 0.7 + Math.sin(a) * 0.75, cz, 0.05, 0.95, 0.05, 0, 0, a - Math.PI / 2)
  }
  const r = 3.4
  const cantos = [[-r, -r], [r, -r], [r, r], [-r, r]]
  for (let i = 0; i < 4; i++) {
    const [ax, az] = cantos[i]
    const [bx, bz] = cantos[(i + 1) % 4]
    gradil(o, 'pedra', 'ferro', cx + ax, cz + az, cx + bx, cz + bz, 0, { alto: 1.7, mureta: 0.3, vao: 6.8, passoBarra: 0.14, semPilar: true })
    o.cilindro('ferro', cx + ax, 0, cz + az, 0.07, 0.09, 1.9, 6)
  }
  o.solido(cx, cz, r + 0.2, r + 0.2)
  lampiaoColuna(o, 'lamp', 'vidro', -8, 0, 8.5)
  lampiaoColuna(o, 'lamp', 'vidro', 8, 0, 8.5)
}

export function criarSe(cena, cfg) {
  const p = PEGADAS.se
  const tmp = new Obra('', p.x, p.z, 0, p.rot)
  const y0 = alturaTerreno(...tmp.mundo(0, 6)) // o chão do largo, na frente da porta
  const o = new Obra('se-velha', p.x, p.z, y0 + 0.6, p.rot)
  // o chão da igreja fica no nível do adro (0,6 m acima do largo): tudo abaixo de 0 desce até o terreno
  fachada(o)
  corpo(o)
  const ad = new Obra('se-velha-adro', p.x, p.z, y0, p.rot)
  adro(ad)
  const { largura: W, comprimento: L, capela } = SE
  o.solido(0, -L / 2 - 1, W / 2 + 0.3, L / 2 + 1)
  o.solido(0, -L - capela / 2, SE.nave / 2 + 4.6, capela / 2)
  o.bloqueiaCamera(0, 8, -L / 2, W, 16, L)
  o.bloqueiaCamera(0, 22, -SE.torre / 2, W, 14, SE.torre)
  o.ocupa(0, -L / 2 + 8, W / 2 + 4, L / 2 + 14)
  o.ocupa(16, 17, 4, 4)
  const mats = materiaisObra(TABELA(cfg.mundo.marcosNorte))
  const a = o.montar(cena, mats)
  const b = ad.montar(cena, mats)
  // os dois pedaços se comportam como um marco só
  return {
    grupo: a.grupo,
    triangulos: a.triangulos + b.triangulos,
    atualizar(camera, ligado, detalheAte) { a.atualizar(camera, ligado, detalheAte); b.atualizar(camera, ligado, detalheAte) },
  }
}
