// A Estação Central de Fortaleza em 1932 (dossiê marcos-1932.md, seção 4; conceito estacao-central.png).
//
// O que vem do dossiê (FATO): inaugurada em 9/6/1880; na Rua Dr. João Moreira, de frente para a
// Praça Castro Carreira, logo a fachada olha para o sul da malha e a gare fica atrás, ao norte;
// UM SÓ PAVIMENTO; corpo central com colunas sobre pedestais e frontão triangular, escadaria de
// acesso; alas laterais com vãos em arco pleno, cornijas e platibandas; relógio de algarismos
// romanos no topo do frontão; neoclássica; tesouras da gare feitas de trilho. Planta do OSM:
// 132 x 28 m (o bloco comprido paralelo à praça).
// O que é HIPÓTESE: corpo central de 20 m; cor creme clara com cimalhas brancas; telhado de telha
// escondido pela platibanda; gare de ferro de duas águas com lanternim; o relógio já em 1932.
// Desvio do conceito corrigido (README dos conceitos): o pórtico do conceito parece de dois andares;
// aqui o entablamento fica a 10,6 m, só um metro acima da platibanda das alas.
//
// Tamanho real (os prédios ficam no tamanho de verdade; o mapa em volta é que é comprimido): o
// centro é o do prédio no OSM, puxado 15 m para oeste da malha para a ala leste não cair em cima
// do quarteirão vizinho (no jogo comprimido ele fica a 50 m, não a 65). A Praça da Estação
// continua na frente do corpo central.

import { CAL } from '../paleta.js'
import { PEGADAS } from './lotes-marcos.js'
import { alturaTerreno } from './terreno.js'
import { Obra, materiaisObra } from './obra1932.js'
import { fronton, molduraFronton, tramoComVao, relogio, urna, lampiaoColuna } from './ornatos1932.js'

// medidas (m): comprimento e fundo do bloco, corpo central, piso, alturas
export const ESTACAO = { L: 130, P: 28, centro: 20, piso: 1.0, cornija: 7.6, platibanda: 9.5, entablamento: 10.6 }

const TABELA = (cor) => ({
  // o reboco caiado das casas (quarteirao.js): manchas grandes, salitre na base, cal caída nas quinas
  parede: { tipo: 'reboco', cor: cor.parede, recebe: false },
  cimalha: { tipo: 'reboco', cor: '#f6f1e6', recebe: false },
  pedra: { cor: '#bfae8e', tex: 'pedra', tam: 2.5, contraste: 0.5 }, // embasamento: a barra mais escura
  porta: { cor: CAL.verde },
  telha: { tipo: 'telha', cor: CAL.telha },
  zinco: { cor: CAL.mangue },
  ferro: { cor: cor.ferro, proprio: true },
  vidroGare: { cor: '#3a4650' },
  relogio: { cor: '#f2ead6' },
  urna: { cor: '#f4eee2', detalhe: true, recebe: false },
  lamp: { cor: cor.ferro, detalhe: true, proprio: true },
  vidro: { tipo: 'vidro' },
  trilho: { cor: '#6b5f52', detalhe: true },
  dormente: { cor: '#5a4a3a', detalhe: true },
  lastro: { cor: '#9a8f80' },
})

function terrenoMin(o, x0, x1, z0, z1) {
  let min = Infinity
  for (let lx = x0; lx <= x1; lx += 6) for (let lz = z0; lz <= z1; lz += 6) min = Math.min(min, alturaTerreno(...o.mundo(lx, lz)))
  return min
}

// uma ala: de xa a xb (|xa| < |xb|), vãos em arco a cada 5 m, pilastras, cornija e platibanda
function ala(o, xa, xb) {
  const { P, cornija, platibanda } = ESTACAO
  const zf = P / 2
  const sentido = Math.sign(xb - xa)
  const n = Math.round(Math.abs(xb - xa) / 5)
  const passo = (xb - xa) / n
  for (let i = 0; i < n; i++) {
    const cx = xa + passo * (i + 0.5)
    const ultimo = i === n - 1
    const zz = ultimo ? zf + 0.5 : zf // o pavilhão da ponta avança meio metro
    tramoComVao(o, { parede: 'parede', folha: 'porta', moldura: 'cimalha' }, cx, 0, zz - 0.3, Math.abs(passo), cornija, 2.4, 4.7, 1.25, 0.3, true)
    // a fachada dos fundos, para a gare
    tramoComVao(o, { parede: 'parede', folha: 'porta' }, cx, 0, -zf + 0.3, Math.abs(passo), cornija, 2.4, 4.7, 1.25, 0.3, true, Math.PI)
  }
  // pilastras entre os tramos e nas pontas
  for (let i = 0; i <= n; i++) {
    const px = xa + passo * i
    if (i >= n - 1) o.caixa('cimalha', px, cornija / 2, zf + 0.3, 0.7, cornija, 0.8) // fecha a junta do pavilhão
    else o.caixa('cimalha', px, cornija / 2, zf + 0.1, 0.7, cornija, 0.2)
  }
  const meio = (xa + xb) / 2
  const comp = Math.abs(xb - xa)
  o.caixa('pedra', meio, 0.55, zf + 0.25, comp, 1.1, 0.5) // embasamento
  // cornija em três faixas, platibanda e o remate
  o.caixa('cimalha', meio, cornija + 0.15, zf + 0.12, comp + 0.6, 0.3, 0.7)
  o.caixa('cimalha', meio, cornija + 0.45, zf + 0.25, comp + 0.8, 0.3, 0.95)
  o.caixa('parede', meio, (cornija + 0.6 + platibanda) / 2, zf + 0.05, comp, platibanda - cornija - 0.6, 0.4)
  o.caixa('cimalha', meio, platibanda + 0.08, zf + 0.08, comp + 0.4, 0.16, 0.6)
  for (let i = 0; i <= n; i += 2) urna(o, 'urna', xa + passo * i, platibanda + 0.16, zf + 0.08, 1.1)
  // a ponta da ala (empena lateral lisa, com o mesmo remate)
  const xp = xb + sentido * 0.15
  o.caixa('parede', xp, platibanda / 2, 0, 0.3, platibanda, P)
  o.caixa('cimalha', xp + sentido * 0.1, cornija + 0.3, 0, 0.4, 0.6, P + 0.8)
  // telhado baixo de telha, escondido pela platibanda (só se vê de cima ou de longe)
  for (const lado of [-1, 1]) o.caixa('telha', meio, cornija + 1.7, lado * (P / 4), comp, 0.25, P / 2 + 0.6, 0, lado * 0.16)
}

function corpoCentral(o) {
  const { P, piso, centro, entablamento } = ESTACAO
  const zf = P / 2 + 2.5
  const w = centro
  // o volume que avança, com três portais em arco
  for (const cx of [-6, 0, 6]) tramoComVao(o, { parede: 'parede', folha: 'porta', moldura: 'cimalha' }, cx, 0, zf - 0.3, 6, 8.8, cx === 0 ? 3.4 : 2.8, cx === 0 ? 6.4 : 5.8, piso + 0.05, 0.3, true)
  for (const lado of [-1, 1]) {
    o.caixa('parede', lado * (w / 2 - 0.5), 4.4, zf - 1.3, 1.0, 8.8, 2.6)
    o.caixa('cimalha', lado * (w / 2 - 0.3), 4.4, zf + 0.05, 0.6, 8.8, 0.2)
  }
  o.caixa('parede', 0, 4.4, P / 2 + 0.1, w - 2, 8.8, 2.6) // o miolo do corpo central, atrás dos portais
  // o piso do pórtico e a escadaria (seis degraus)
  o.bloco('pedra', 0, -1.5, zf + 1.1, w + 1, piso + 1.5, 4.2)
  o.escada(0, zf + 3.2, 0, 3.2, w - 2, piso, 0, 'pedra')
  o.piso(0, zf + 1.1, w / 2, 2.1, piso)
  // quatro colunas sobre pedestais
  const zc = zf + 2.3
  for (const cx of [-8.4, -3.2, 3.2, 8.4]) {
    o.bloco('pedra', cx, piso, zc, 1.3, 1.5, 1.3)
    o.bloco('cimalha', cx, piso + 1.5, zc, 1.45, 0.2, 1.45)
    o.cilindro('cimalha', cx, piso + 1.7, zc, 0.38, 0.43, 6.1, 14)
    o.bloco('cimalha', cx, piso + 7.8, zc, 1.15, 0.45, 1.15)
    o.coluna(cx, zc, 0.7)
  }
  // entablamento e frontão com o relógio
  const ze = zf + 3.1
  o.caixa('parede', 0, entablamento - 0.95, (P / 2 + ze) / 2, w + 1.2, 1.5, ze - P / 2)
  o.caixa('cimalha', 0, entablamento - 0.15, (P / 2 + ze + 0.3) / 2, w + 1.8, 0.35, ze - P / 2 + 0.3)
  fronton(o, 'parede', 0, entablamento, P / 2 - 3, w + 1.2, 3.6, ze - P / 2 + 3 - 0.1)
  molduraFronton(o, 'cimalha', 0, entablamento + 0.15, ze - 0.2, w + 1.4, 3.65, 0.35, 0.6)
  relogio(o, 'relogio', 'ferro', 0, entablamento + 1.45, ze - 0.12, 1.05)
  for (const ux of [-(w / 2 + 0.4), 0, w / 2 + 0.4]) urna(o, 'urna', ux, entablamento + (ux === 0 ? 3.75 : 0.1), ze - 0.4, 1.5)
  // o telhado do corpo central, atrás do frontão (dá a silhueta de longe)
  for (const lado of [-1, 1]) o.caixa('telha', lado * (w / 4 + 0.3), entablamento + 1.8, 0, w / 2 + 1.2, 0.3, P, 0, 0, -lado * 0.33)
}

// a gare de ferro atrás do prédio: colunas, tesouras de trilho, duas águas e lanternim
function gare(o, yBase) {
  const { P } = ESTACAO
  const z0 = -P / 2 - 1
  const z1 = -P / 2 - 27
  const zm = (z0 + z1) / 2
  const eave = 7.5
  const cume = 12
  for (let x = -55; x <= 55; x += 10) {
    for (const zc of [z0 - 0.5, z1 + 0.5]) {
      o.cilindro('ferro', x, yBase, zc, 0.16, 0.2, eave - yBase, 8)
      o.coluna(x, zc, 0.3)
    }
    // a tesoura: banzo de baixo, as duas pernas e os montantes
    o.caixa('ferro', x, eave, zm, 0.16, 0.18, z0 - z1)
    const meia = (z0 - z1) / 2
    const ang = Math.atan2(cume - eave, meia)
    for (const lado of [-1, 1]) {
      o.caixa('ferro', x, (eave + cume) / 2, zm + (lado * meia) / 2, 0.16, 0.2, Math.hypot(meia, cume - eave), 0, lado * ang)
      for (const t of [0.33, 0.66]) o.caixa('ferro', x, eave + (cume - eave) * (1 - t) / 2, zm + lado * meia * t, 0.08, (cume - eave) * (1 - t), 0.08)
    }
  }
  const meia = (z0 - z1) / 2
  const ang = Math.atan2(cume - eave, meia)
  for (const lado of [-1, 1]) {
    o.caixa('zinco', 0, (eave + cume) / 2 + 0.25, zm + (lado * (meia - 1.5)) / 2 + lado * 0.8, 112, 0.14, Math.hypot(meia - 1.5, cume - eave) + 1.5, 0, lado * ang)
  }
  // lanternim: a faixa levantada ao longo da cumeeira, com a vidraça escura dos lados
  o.caixa('vidroGare', 0, cume + 0.55, zm, 112, 1.1, 2.8)
  o.caixa('zinco', 0, cume + 1.2, zm, 113, 0.14, 4.0)
  // plataformas e as duas linhas, que seguem para oeste (o Baturité)
  o.bloco('pedra', 0, yBase, -P / 2 - 3, 112, 0.9 - yBase, 5)
  o.piso(0, -P / 2 - 3, 56, 2.5, 0.9)
  o.bloco('pedra', 0, yBase, zm, 100, 0.9 - yBase, 3.6)
  o.piso(0, zm, 50, 1.8, 0.9)
  for (const zt of [-P / 2 - 8.2, zm - 5.2]) {
    o.bloco('lastro', -40, yBase - 1, zt, 200, 1.15 - yBase, 3.4)
    for (const d of [-0.72, 0.72]) o.caixa('trilho', -40, 0.22, zt + d, 200, 0.14, 0.08)
    for (let x = -139; x < 60; x += 0.9) o.caixa('dormente', x, 0.12, zt, 0.24, 0.1, 2.5)
  }
}

export function criarEstacao(cena, cfg) {
  const p = PEGADAS.estacao
  const { L, P, centro, platibanda } = ESTACAO
  // o chão do prédio: o terreno na fachada (a praça); atrás o terreno desce para a praia
  const tmp = new Obra('', p.x, p.z, 0, p.rot)
  const y0 = alturaTerreno(...tmp.mundo(0, P / 2 + 4))
  const o = new Obra('estacao-central', p.x, p.z, y0, p.rot)
  const yBase = Math.min(-0.5, terrenoMin(o, -L / 2, L / 2, -P / 2 - 28, P / 2) - y0 - 0.5)
  // o miolo do prédio (atrás das paredes com vão)
  o.bloco('parede', 0, yBase, -0.4, L - 0.2, ESTACAO.cornija + 0.6 - yBase, P - 1.6)
  o.bloco('pedra', 0, yBase, 0, L + 0.4, 1.1 - yBase, P + 0.4)
  ala(o, centro / 2, L / 2)
  ala(o, -centro / 2, -L / 2)
  corpoCentral(o)
  gare(o, yBase)
  // lampiões a gás na praça, ao pé da escadaria e ao longo das alas
  for (const lx of [-11, 11]) lampiaoColuna(o, 'lamp', 'vidro', lx, 0, P / 2 + 8.2)
  for (const lx of [-50, -32, 32, 50]) lampiaoColuna(o, 'lamp', 'vidro', lx, 0, P / 2 + 3.2)
  // colisão: o bloco, o corpo central, e a câmera não atravessa as paredes
  o.solido(0, -0.2, L / 2 + 0.3, P / 2 + 0.6)
  o.ocupa(-20, -12, L / 2 + 30, P / 2 + 16) // o prédio, a gare e as linhas
  o.ocupa(0, P / 2 + 5, centro / 2 + 2, 5) // o pórtico e a escadaria
  o.solido(0, P / 2 + 1.3, centro / 2, 1.3)
  o.bloqueiaCamera(0, platibanda / 2, 0, L, platibanda, P)
  o.bloqueiaCamera(0, 5.5, P / 2 + 1.3, centro, 11, 2.6)
  const cor = cfg.mundo.marcosNorte
  return o.montar(cena, materiaisObra(TABELA({ parede: cor.corEstacao, ferro: cor.corFerro })))
}

