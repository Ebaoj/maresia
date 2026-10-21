// O Mercado de Ferro na Praça Carolina (hoje Waldemar Falcão), de 1897 a 1937. Fonte: marcos-1932.md, seção 5.
//
//   FATO   estrutura de ferro importada da França (Guillot Pelletier, de Orléans), 1896-1897; art nouveau; três
//          seções (porco, carneiro e miúdos; verduras; carne verde e ossos) [DN-Pinhões; OP-ferro]
//   FATO   na Praça Carolina, entre a Floriano Peixoto e a General Bezerril, em frente à Assembleia [DN-Pinhões]
//   FATO   pintado de vermelho-escuro (memória de Otacílio de Azevedo) [DN-Pinhões]
//   HIP    a metade remontada nos Pinhões mede ~40 x 22 m e 11 m de altura; aqui o corpo inteiro tem 72 x 24 m
//          (as duas metades juntas); colunas finas de ferro fundido, treliças, cobertura de chapa em duas águas com
//          lanternim de ventilação na cumeeira, venezianas metálicas em cima e arcadas abertas embaixo, mãos-
//          francesas recortadas (pela peça remanescente e pelo conceito aprovado)
//
// A feira em volta e dentro (bancas, cestos, sacos, potes de barro, frutas) está em mercado-feira.js.

import * as THREE from 'three'
import { Obra, chaoMinimo, chaoMaximo } from './obra.js'
import { PEGADA } from './pegadas.js'
import { ocupacao } from '../ocupacao.js'
import { criarFeira } from './mercado-feira.js'

const L = 72 // comprimento (x local)
const W = 24 // largura (z local)
const MODULO = 6 // entre colunas
const BEIRAL = 6.4 // altura das colunas (o beiral)

// treliça de duas águas: banzo de cima (as duas pernas), banzo de baixo, montantes e diagonais
function trelica(obra, x, cume) {
  const h = cume - BEIRAL
  const ang = Math.atan2(h, W / 2)
  const perna = Math.hypot(W / 2, h)
  for (const s of [-1, 1]) {
    obra.add('mercado', new THREE.BoxGeometry(0.16, 0.22, perna + 0.4).rotateX(s * ang).translate(x, BEIRAL + h / 2, (s * W) / 4))
  }
  obra.caixa('mercado', x, BEIRAL + 0.4, 0, 0.12, 0.12, W)
  for (let i = 1; i < 6; i++) {
    const z = -W / 2 + (i / 6) * W
    const top = BEIRAL + h * (1 - Math.abs(z) / (W / 2))
    obra.caixa('mercado', x, (BEIRAL + 0.4 + top) / 2, z, 0.08, top - BEIRAL - 0.4, 0.08)
    if (i < 5) {
      const z2 = -W / 2 + ((i + 1) / 6) * W
      const top2 = BEIRAL + h * (1 - Math.abs(z2) / (W / 2))
      const dz = z2 - z
      const dy = top2 - (BEIRAL + 0.4)
      obra.add('mercado', new THREE.BoxGeometry(0.06, Math.hypot(dz, dy), 0.06).rotateX(Math.atan2(dz, dy)).translate(x, BEIRAL + 0.4 + dy / 2, z + dz / 2))
    }
  }
}

// mão-francesa recortada (art nouveau): o quarto de círculo entre a coluna e a viga do beiral, com um círculo vazado
function maoFrancesa(obra, x, z, lado) {
  // o centro do arco fica 1,1 m para o lado e 1,1 m abaixo do beiral: o arco liga a coluna à viga
  const g = new THREE.TorusGeometry(1.1, 0.06, 5, 12, Math.PI / 2)
  if (lado > 0) g.rotateZ(Math.PI / 2)
  obra.add('mercado', g.translate(x + lado * 1.1, BEIRAL - 1.1, z))
  obra.add('mercado', new THREE.TorusGeometry(0.22, 0.04, 4, 10).translate(x + lado * 0.42, BEIRAL - 0.42, z))
}

// faixa de venezianas metálicas entre y0 e y1, ao longo de x (face z) ou de z (face x)
function venezianas(obra, a0, a1, fixo, y0, y1, eixo) {
  const n = Math.floor((y1 - y0) / 0.22)
  const comp = a1 - a0
  const meio = (a0 + a1) / 2
  for (let i = 0; i < n; i++) {
    const y = y0 + (i + 0.5) * ((y1 - y0) / n)
    const g = new THREE.BoxGeometry(eixo === 'x' ? comp : 0.03, 0.16, eixo === 'x' ? 0.03 : comp)
    if (eixo === 'x') g.rotateX(0.6)
    else g.rotateZ(-0.6)
    obra.add('mercadoFino', g.translate(eixo === 'x' ? meio : fixo, y, eixo === 'x' ? fixo : meio))
  }
  obra.detalhe.add('mercadoFino')
}

export function criarMercado(cena, cfg, mats, mobilia) {
  const pg = PEGADA.mercado
  // o piso fica no ponto mais alto do chão (não se enterra) e a laje desce até o mais baixo
  const yMin = chaoMinimo([pg.x, pg.z], L / 2 + 1, W / 2 + 1)
  const y = chaoMaximo([pg.x, pg.z], L / 2 + 1, W / 2 + 1) - 0.19
  const obra = new Obra('mercado-de-ferro', [pg.x, pg.z], y)
  const cume = cfg.marcos.mercadoAltura - 1.6 // o lanternim sobe 1,6 m acima da cumeeira
  // o piso de cimento e o meio-fio
  const fundo = yMin - y - 0.2
  obra.caixa('pedra', 0, (0.24 + fundo) / 2, 0, L + 2, 0.24 - fundo, W + 2)
  // as colunas: finas, com base e capitel, nos dois lados compridos e nas empenas
  const xs = []
  for (let x = -L / 2; x <= L / 2 + 0.01; x += MODULO) xs.push(x)
  for (const x of xs) {
    for (const s of [-1, 1]) {
      const z = (s * W) / 2
      obra.cilindro('mercado', x, 0.24 + BEIRAL / 2, z, 0.1, 0.13, BEIRAL, 8)
      obra.torno('mercado', x, 0.24, z, [[0, 0], [0.24, 0], [0.24, 0.12], [0.15, 0.3], [0.13, 0.5], [0, 0.5]], 8)
      obra.torno('mercado', x, BEIRAL - 0.4, z, [[0, 0], [0.12, 0], [0.2, 0.2], [0.3, 0.35], [0.3, 0.42], [0, 0.42]], 8)
      if (x > -L / 2) maoFrancesa(obra, x, z, -1)
      if (x < L / 2) maoFrancesa(obra, x, z, 1)
      obra.colisaoCirculo(x, z, 0.2)
    }
    trelica(obra, x, cume)
  }
  for (const zc of [-6, 0, 6]) {
    for (const s of [-1, 1]) {
      obra.cilindro('mercado', (s * L) / 2, 0.24 + BEIRAL / 2, zc, 0.1, 0.13, BEIRAL, 8)
      obra.colisaoCirculo((s * L) / 2, zc, 0.2)
    }
  }
  // as vigas do beiral e as venezianas da faixa alta (entre 4,3 m e o beiral), deixando a arcada aberta embaixo
  for (const s of [-1, 1]) {
    obra.caixa('mercado', 0, BEIRAL, (s * W) / 2, L + 0.4, 0.4, 0.3)
    obra.caixa('mercado', 0, 4.3, (s * W) / 2, L + 0.2, 0.18, 0.22)
    venezianas(obra, -L / 2, L / 2, (s * W) / 2, 4.4, BEIRAL - 0.2, 'x')
    obra.caixa('mercado', (s * L) / 2, 4.3, 0, 0.22, 0.18, W)
  }
  // as empenas: tímpano de venezianas e o portal alto em arco no meio
  for (const s of [-1, 1]) {
    const x = (s * L) / 2
    for (const z of [-9, -3, 3, 9]) {
      const top = BEIRAL + (cume - BEIRAL) * (1 - (Math.abs(z) + 3) / (W / 2))
      venezianas(obra, z - 3, z + 3, x, BEIRAL + 0.25, Math.max(BEIRAL + 0.6, top), 'z')
    }
    const arco = new THREE.TorusGeometry(3.0, 0.14, 6, 18, Math.PI).rotateY(Math.PI / 2).translate(x, 4.3, 0)
    obra.add('mercado', arco)
    obra.add('chapa', new THREE.CylinderGeometry(0.05, 0.05, 0.1, 3).translate(x, cume + 1.9, 0)) // o remate
    obra.torno('mercado', x, cume + 1.6, 0, [[0, 0], [0.18, 0], [0.1, 0.3], [0.2, 0.5], [0.02, 1.2], [0, 1.25]], 8)
  }
  // a cobertura de chapa em duas águas
  const h = cume - BEIRAL
  const ang = Math.atan2(h, W / 2)
  const perna = Math.hypot(W / 2, h) + 0.9
  for (const s of [-1, 1]) {
    obra.add('chapa', new THREE.BoxGeometry(L + 1.6, 0.1, perna).rotateX(s * ang).translate(0, BEIRAL + h / 2 + 0.25, (s * W) / 4))
    // as ondas da chapa: frisos ao longo da descida, a cada 0,5 m
    for (let x = -L / 2 - 0.6; x <= L / 2 + 0.6; x += 0.5) {
      obra.add('chapaFino', new THREE.BoxGeometry(0.06, 0.06, perna).rotateX(s * ang).translate(x, BEIRAL + h / 2 + 0.31, (s * W) / 4))
    }
  }
  obra.detalhe.add('chapaFino')
  // o lanternim: um corpo de venezianas sobre a cumeeira, com telhadinho próprio e crista de ferro
  const lw = 3.2
  for (const s of [-1, 1]) venezianas(obra, -L / 2 + 2, L / 2 - 2, (s * lw) / 2, cume - 0.2, cume + 1.2, 'x')
  for (const s of [-1, 1]) {
    obra.add('chapa', new THREE.BoxGeometry(L - 3, 0.08, lw / 2 + 0.6).rotateX(s * 0.4).translate(0, cume + 1.42, (s * lw) / 4))
  }
  for (let x = -L / 2 + 2; x <= L / 2 - 2; x += 1.5) obra.torno('mercado', x, cume + 1.62, 0, [[0, 0], [0.06, 0], [0.12, 0.15], [0.02, 0.45], [0, 0.48]], 5)
  // as divisões das três seções: duas grades baixas de ferro no meio do vão
  for (const x of [-L / 6, L / 6]) {
    for (let z = -W / 2 + 1; z < W / 2 - 1; z += 0.3) if (Math.abs(z) > 2) obra.caixa('mercado', x, 0.24 + 0.6, z, 0.03, 1.2, 0.03)
    obra.caixa('mercado', x, 1.44, 0, 0.06, 0.06, W - 2)
  }
  obra.deck(0, 0, L / 2 + 1, W / 2 + 1, 0.24)

  ocupacao.marcar(pg.x, pg.z, L / 2 + 2, W / 2 + 2, obra.giro)
  obra.montar(cena, mats)
  const feira = criarFeira(cena, cfg, mats, mobilia, obra, { L, W, piso: 0.24, area: [pg.hu, pg.hv] })
  return { grupos: [obra.grupo, ...feira.grupos] }
}
