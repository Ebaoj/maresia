// Os cinemas da Praça do Ferreira em 1932: o Majestic Palace (1917) e o Cine Moderno (1921).
// Fonte: marcos-1932.md, seções 1 e 19, e os postais de 1925 (fotos/praca-do-ferreira/).
//
// Majestic Palace
//   FATO   inaugurado em 14/7/1917, quatro andares, na praça; arrendado por Severiano Ribeiro [DN-Excelsior-predios]
//   FATO   (postais de 1925) bloco de quatro pavimentos, fachada escura, janelas em arco no 3º andar, cimalha com
//          balaustrada e pináculos, torreão com cúpula e esfera
//   HIP    o lado da praça: o canto sudoeste, de frente para a praça (pegadas.js); a cor: o vermelho-tijolo do
//          cartão colorizado (indício, não prova); o torreão no meio da fachada (o brief; nos postais ele parece
//          perto de uma ponta)
// Cine Moderno
//   FATO   inaugurado em 7/9/1921, Rua Major Facundo nº 594, Empresa Luiz Severiano Ribeiro [UFC-cinemas]
//   HIP    a fachada (sem imagem livre): sobrado de dois pavimentos, portal alto em arco, frontão escalonado e
//          platibanda, ocre muito claro, na linguagem eclética da praça
//
// Os dois olham para leste (+x local), para a praça, do outro lado da Major Facundo.

import { Obra, balaustrada, chaoMinimo, PERFIL } from './obra.js'
import { janela, pinaculo, portaArco } from './pecas.js'
import { PEGADA } from './pegadas.js'
import { ocupacao } from '../ocupacao.js'
import { criarAleatorio } from '../../utils.js'

const LESTE = Math.PI / 2 // a fachada olha para +x
const NORTE = Math.PI // a lateral que dá para a rua do norte (-z)

function criarMajestic(cena, mats) {
  const pg = PEGADA.majestic
  const hx = pg.hu // fundo (x)
  const hz = pg.hv // fachada (z)
  const y = chaoMinimo([pg.x, pg.z], hx, hz) - 0.25
  const obra = new Obra('majestic-palace', [pg.x, pg.z], y)
  const rnd = criarAleatorio(1917)
  const k = { vao: 'vao', vaoAceso: 'vaoAceso', moldura: 'cal', esquadria: 'madeira', ferro: 'ferro' }
  const andares = [0.25, 5.4, 9.4, 13.4] // pisos: térreo alto (o cinema) e três andares de 4 m
  const topo = 17.4
  obra.caixa('majestic', 0, topo / 2, 0, hx * 2, topo, hz * 2)
  obra.caixa('calVelha', 0, 0.35, 0, hx * 2 + 0.1, 0.7, hz * 2 + 0.1)
  // cornijas: entre o térreo e o 1º, a do 3º, e a cimalha principal
  for (const [yy, s, h] of [[5.25, 0.3, 0.3], [9.3, 0.12, 0.14], [13.3, 0.12, 0.14], [topo - 0.15, 0.5, 0.3]]) {
    obra.caixa('cal', 0, yy + h / 2, 0, hx * 2 + s * 2, h, hz * 2 + s * 2)
  }
  // a fachada: oito vãos, o do meio é o torreão
  const nV = 9
  const passo = (hz * 2 - 2) / nV
  for (let i = 0; i < nV; i++) {
    const z = -hz + 1 + passo * (i + 0.5)
    const meio = i === 4
    if (meio || i === 3 || i === 5) portaArco(obra, { ...k, moldura: 'cal' }, LESTE, hx, 0.25, z, 2.3, 4.4)
    else janela(obra, k, LESTE, hx, 1.0, z, 1.8, 3.2, { arco: true, peitoril: false, moldura: 0.2 })
    for (let n = 1; n < 4; n++) {
      const arco = n === 3
      janela(obra, k, LESTE, hx, andares[n] + 0.4, z, 1.3, arco ? 2.7 : 2.4, { arco, aceso: rnd.chance(0.3) })
    }
    // pilastras de cal entre os vãos (a fachada escura riscada de claro dos postais)
    obra.caixa('cal', hx + 0.08, 11.3, z - passo / 2, 0.16, 11.9, 0.45)
  }
  obra.caixa('cal', hx + 0.08, 11.3, hz - 1, 0.16, 11.9, 0.45)
  // a lateral norte (dá para a rua entre ele e o Moderno): janelas, sem portas
  for (let i = 0; i < 6; i++) {
    const x = -hx + 2.5 + i * ((hx * 2 - 5) / 5)
    for (let n = 1; n < 4; n++) janela(obra, k, NORTE, x, andares[n] + 0.4, -hz, 1.2, n === 3 ? 2.5 : 2.2, { arco: n === 3, aceso: rnd.chance(0.25) })
  }
  // a platibanda com balaustrada e os pináculos sobre os pilares
  const kb = { base: 'cal', balaustre: 'balaustreFino' }
  balaustrada(obra, kb, hx + 0.2, -hz, hx + 0.2, hz, topo + 0.15)
  balaustrada(obra, kb, -hx, -hz - 0.2, hx, -hz - 0.2, topo + 0.15)
  for (let i = 0; i <= nV; i++) {
    const z = -hz + 1 + passo * i
    obra.caixa('cal', hx + 0.2, topo + 0.65, z, 0.5, 1.0, 0.5)
    pinaculo(obra, 'cal', hx + 0.2, topo + 1.15, z, 0.75)
  }
  // o torreão: um corpo quadrado sobre a platibanda, com óculos, cimalha e a cúpula com a esfera
  const tz = 0
  const tx = hx - 2.6
  obra.caixa('majestic', tx, topo + 2.2, tz, 5, 4.4, 5)
  obra.caixa('cal', tx, topo + 4.5, tz, 5.6, 0.3, 5.6)
  for (const ang of [LESTE, NORTE, 0]) {
    const [nx, nz] = [Math.sin(ang), Math.cos(ang)]
    janela(obra, k, ang, tx + nx * 2.5, topo + 1.0, tz + nz * 2.5, 1.1, 2.4, { arco: true })
  }
  obra.torno('chapa', tx, topo + 4.65, tz, [[0, 0], [2.4, 0], [2.4, 0.3], [2.2, 0.9], [1.7, 1.7], [1.0, 2.3], [0.3, 2.6], [0, 2.65]], 16)
  obra.torno('ferro', tx, topo + 7.25, tz, [[0, 0], [0.12, 0], [0.12, 0.3], [0.32, 0.55], [0.12, 0.8], [0.04, 1.3], [0, 1.35]], 10)
  // a marquise do cinema sobre as três portas do meio, com os letreiros (sem nome legível: anacronismo de marca)
  obra.caixa('ferro', hx + 1.2, 5.0, 0, 2.4, 0.2, passo * 3.2)
  for (const z of [-passo, passo]) obra.cilindro('ferro', hx + 2.2, 2.5, z * 1.4, 0.06, 0.06, 5.0, 6)
  obra.caixa('madeira', hx + 0.25, 7.6, 0, 0.12, 0.9, passo * 2.6)
  obra.colisaoCaixa(0, 0, hx, hz)
  obra.colisaoCaixa(hx + 2.2, -passo * 1.4, 0.15, 0.15)
  obra.colisaoCaixa(hx + 2.2, passo * 1.4, 0.15, 0.15)
  ocupacao.marcar(pg.x, pg.z, hx + 3, hz + 1, obra.giro)
  obra.montar(cena, mats, { solidos: ['majestic'] })
  return obra.grupo
}

function criarModerno(cena, mats) {
  const pg = PEGADA.moderno
  const hx = pg.hu
  const hz = pg.hv
  const y = chaoMinimo([pg.x, pg.z], hx, hz) - 0.25
  const obra = new Obra('cine-moderno', [pg.x, pg.z], y)
  const k = { vao: 'vao', vaoAceso: 'vaoAceso', moldura: 'moldura', esquadria: 'esquadria', ferro: 'ferro' }
  const topo = 10.6
  obra.caixa('moderno', 0, topo / 2, 0, hx * 2, topo, hz * 2)
  obra.caixa('calVelha', 0, 0.35, 0, hx * 2 + 0.1, 0.7, hz * 2 + 0.1)
  obra.caixa('moldura', 0, 5.4, 0, hx * 2 + 0.4, 0.3, hz * 2 + 0.4)
  obra.caixa('moldura', 0, topo - 0.1, 0, hx * 2 + 0.6, 0.3, hz * 2 + 0.6)
  // o portal alto do meio (a sala de espera) e as duas portas de lado
  portaArco(obra, k, LESTE, hx, 0.25, 0, 3.4, 8.2)
  for (const s of [-1, 1]) {
    portaArco(obra, k, LESTE, hx, 0.25, s * 5.2, 1.9, 4.2)
    janela(obra, k, LESTE, hx, 6.2, s * 5.2, 1.3, 2.4, { arco: true, aceso: s > 0 })
    // pilastras dos lados do portal
    obra.caixa('moldura', hx + 0.1, topo / 2, s * 2.6, 0.2, topo, 0.6)
    obra.caixa('moldura', hx + 0.1, topo / 2, s * (hz - 0.3), 0.2, topo, 0.6)
  }
  // o frontão escalonado sobre o portal, com a platibanda
  for (const [w, h, yy] of [[hz * 2, 0.9, topo + 0.45], [9, 1.0, topo + 1.4], [5, 0.9, topo + 2.35]]) obra.caixa('moderno', hx - 0.2, yy, 0, 0.5, h, w)
  for (const [w, yy] of [[hz * 2 + 0.3, topo + 0.95], [9.3, topo + 1.95], [5.3, topo + 2.85]]) obra.caixa('moldura', hx - 0.1, yy, 0, 0.7, 0.14, w)
  obra.torno('moldura', hx - 0.2, topo + 2.92, 0, PERFIL.urna, 8, 1.2)
  obra.caixa('madeira', hx + 0.2, 9.0, 0, 0.12, 0.8, 6.5) // a tábua do letreiro, sem nome legível
  obra.colisaoCaixa(0, 0, hx, hz)
  ocupacao.marcar(pg.x, pg.z, hx + 1, hz + 1, obra.giro)
  obra.montar(cena, mats, { solidos: ['moderno'] })
  return obra.grupo
}

export function criarCinemas(cena, cfg, mats) {
  void cfg
  return { grupos: [criarMajestic(cena, mats), criarModerno(cena, mats)] }
}
