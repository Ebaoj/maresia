// O entorno da Praça dos Leões em 1932: a Igreja do Rosário, o Palácio da Luz e o coreto de 1914.
//
// Igreja do Rosário (marcos-1932.md, seção 8)
//   FATO   templo mais antigo da cidade (1730 ou 1753), Rua do Rosário, ao lado do Palácio; OSM 30 x 13 m
//   HIP.F  uma torre só (aérea de 1936 e fotos atuais), frontão curvo, nave única, telha cerâmica, caiada
// Palácio da Luz (marcos-1932.md, seção 7)
//   FATO   sede do governo em 1932 (a Interventoria); OSM 48 x 26 m; fachada para a Sena Madureira
//   FATO   (foto de 8/10/1930) sobrado de dois pavimentos, fachada lisa caiada, cimalha simples, janelas retas com
//          sacadas de gradil de ferro trabalhado no andar de cima, terraço sobre muro de blocos com balaustrada
// Coreto
//   FATO   posto na reforma de 1914, depois demolido e trocado [FN-Leões]
//   HIP    a forma (sem fonte): octogonal, base de alvenaria, colunas de ferro e cobertura de zinco
//
// Os dois prédios ficam no nível da praça (sobre o muro de blocos, como na foto do Palácio): o adro da igreja é
// um vão da balaustrada do lado sul.

import * as THREE from 'three'
import { Obra, balaustrada } from './obra.js'
import { janela, sacada, portaArco } from './pecas.js'
import { PEGADA } from './pegadas.js'
import { ocupacao } from '../ocupacao.js'
import { criarAleatorio } from '../../utils.js'

const NORTE = Math.PI // parede que olha para -z (para a praça)
const LESTE = Math.PI / 2

// a Igreja do Rosário: nave de 13 x 30 m, a torre no canto nordeste da fachada
function rosario(cena, mats, praca, H, fundo) {
  const pg = PEGADA.rosario
  const obra = new Obra('igreja-do-rosario', [pg.x, pg.z], praca.y + H)
  const k = { vao: 'vao', vaoAceso: 'vaoAceso', moldura: 'pedra', esquadria: 'madeira', ferro: 'ferro' }
  const W = pg.hu * 2
  const L = pg.hv * 2
  const z0 = -L / 2 // a fachada
  const alt = 9
  obra.caixa('pedra', 0, (fundo - H) / 2 - 0.05, 0, W + 1, H - fundo + 0.1, L + 1) // o muro de blocos sob a igreja
  obra.caixa('rosario', 0, alt / 2, 0, W, alt, L)
  // os cunhais de cantaria e a cimalha
  for (const [x, z] of [[-W / 2, z0], [W / 2, z0], [-W / 2, L / 2], [W / 2, L / 2]]) obra.caixa('pedra', x, alt / 2, z, 0.6, alt, 0.6)
  obra.caixa('pedra', 0, alt + 0.15, 0, W + 0.4, 0.3, L + 0.4)
  // o telhado de duas águas no comprido da nave
  for (const s of [-1, 1]) {
    const g = new THREE.BoxGeometry(W / 2 + 0.8, 0.22, L + 0.8).rotateZ(-s * 0.5).translate(s * (W / 4 + 0.1), alt + 1.75, 0)
    obra.add('telha', g)
  }
  obra.add('rosario', empena(W, 3.5).translate(0, alt + 0.3, L / 2 - 0.3))
  // a fachada: porta em arco, janela do coro, dois óculos e o frontão curvo com a cruz
  portaArco(obra, { ...k, moldura: 'pedra' }, NORTE, 0, 0, z0, 2.0, 4.2)
  janela(obra, k, NORTE, 0, 5.6, z0, 1.4, 2.2, { arco: true })
  for (const s of [-1, 1]) janela(obra, k, NORTE, s * 3.4, 5.8, z0, 1.0, 1.8)
  const frontao = new THREE.Shape()
  frontao.moveTo(-W / 2 + 0.6, 0)
  frontao.lineTo(W / 2 - 0.6, 0)
  frontao.bezierCurveTo(W / 2 - 0.6, 2.2, 2.2, 2.0, 1.4, 3.6)
  frontao.quadraticCurveTo(0, 4.6, -1.4, 3.6)
  frontao.bezierCurveTo(-2.2, 2.0, -W / 2 + 0.6, 2.2, -W / 2 + 0.6, 0)
  obra.add('rosario', new THREE.ExtrudeGeometry(frontao, { depth: 0.5, bevelEnabled: false, curveSegments: 10 }).translate(0, alt + 0.3, z0 - 0.25))
  const borda = new THREE.ExtrudeGeometry(frontao, { depth: 0.12, bevelEnabled: false, curveSegments: 10 }).scale(1.04, 1.04, 1)
  obra.add('pedra', borda.translate(0, alt + 0.22, z0 - 0.32))
  obra.add('vao', new THREE.CircleGeometry(0.5, 14).rotateY(Math.PI).translate(0, alt + 2.0, z0 - 0.3))
  obra.caixa('pedra', 0, alt + 5.3, z0 - 0.05, 0.14, 1.4, 0.14)
  obra.caixa('pedra', 0, alt + 5.5, z0 - 0.05, 0.7, 0.14, 0.14)
  // a torre: corpo, sineira com arcos, cimalha e o coruchéu com a cruz
  const tx = W / 2 - 1.9
  const tz = z0 + 1.9
  obra.caixa('rosario', tx, (alt + 6) / 2, tz, 3.8, alt + 6, 3.8)
  obra.caixa('pedra', tx, alt + 6.1, tz, 4.2, 0.25, 4.2)
  for (const [ang, nx, nz] of [[NORTE, 0, -1], [LESTE, 1, 0], [0, 0, 1], [-LESTE, -1, 0]]) {
    janela(obra, { ...k, vao: 'vao' }, ang, tx + nx * 1.9, alt + 2.2, tz + nz * 1.9, 1.3, 2.6, { arco: true, peitoril: false })
  }
  obra.torno('rosario', tx, alt + 6.2, tz, [[0, 0], [1.6, 0], [1.6, 0.4], [1.2, 1.0], [0.7, 2.1], [0.25, 3.0], [0, 3.2]], 8)
  obra.caixa('ferro', tx, alt + 9.9, tz, 0.08, 1.2, 0.08)
  obra.caixa('ferro', tx, alt + 10.1, tz, 0.6, 0.08, 0.08)
  obra.colisaoCaixa(0, 0, W / 2 + 0.5, L / 2 + 0.5)
  ocupacao.marcar(pg.x, pg.z, pg.hu + 1, pg.hv + 1, obra.giro)
  obra.montar(cena, mats, { solidos: ['rosario'] })
  return obra.grupo
}

// a empena dos fundos (triângulo do telhado)
function empena(W, h) {
  const s = new THREE.Shape()
  s.moveTo(-W / 2, 0)
  s.lineTo(W / 2, 0)
  s.lineTo(0, h)
  s.lineTo(-W / 2, 0)
  return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false })
}

// o Palácio da Luz: dois pavimentos, comprido na Sena Madureira, a ponta norte para a praça
function palacio(cena, mats, praca, H, fundo) {
  const pg = PEGADA.palacioLuz
  const obra = new Obra('palacio-da-luz', [pg.x, pg.z], praca.y + H)
  const rnd = criarAleatorio(1814)
  const k = { vao: 'vao', vaoAceso: 'vaoAceso', moldura: 'moldura', esquadria: 'esquadria', ferro: 'ferro' }
  const W = pg.hu * 2
  const L = pg.hv * 2
  const alt = 10
  obra.caixa('pedra', 0, (fundo - H) / 2 - 0.05, 0, W + 1.2, H - fundo + 0.1, L + 1.2)
  for (let t = fundo - H + 0.6; t < -0.3; t += 0.6) obra.caixa('calVelha', 0, t, 0, W + 1.23, 0.05, L + 1.23)
  obra.caixa('palacio', 0, alt / 2, 0, W, alt, L)
  obra.caixa('calVelha', 0, 0.4, 0, W + 0.08, 0.8, L + 0.08)
  obra.caixa('moldura', 0, 5.0, 0, W + 0.2, 0.18, L + 0.2)
  obra.caixa('moldura', 0, alt - 0.1, 0, W + 0.5, 0.35, L + 0.5)
  // o telhado de quatro águas (telha capa e canal), baixo
  const telhado = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1).rotateY(Math.PI / 4).scale((W + 1.6) * 0.707, 3.2, (L + 1.6) * 0.707)
  obra.add('telha', telhado.translate(0, alt + 1.6, 0))
  // as janelas: térreo de vergas retas, andar nobre com sacadas de ferro trabalhado
  const faces = [[LESTE, W / 2, 0, L, 'z'], [NORTE, 0, -L / 2, W, 'x']]
  for (const [ang, fx, fz, comp, eixo] of faces) {
    const nV = Math.round(comp / 3.4)
    for (let i = 0; i < nV; i++) {
      const t = -comp / 2 + (i + 0.5) * (comp / nV)
      const [x, z] = eixo === 'z' ? [fx, t] : [t, fz]
      if (eixo === 'z' && i === Math.floor(nV / 2)) portaArco(obra, k, ang, x, 0.1, z, 2.2, 4.0)
      else janela(obra, k, ang, x, 1.1, z, 1.1, 2.2, { aceso: rnd.chance(0.3) })
      janela(obra, k, ang, x, 5.4, z, 1.15, 2.6, { peitoril: false, aceso: rnd.chance(0.4) })
      sacada(obra, k, ang, x, 5.4, z, 1.15, { fundo: 0.5 })
    }
  }
  // a balaustrada do terraço sobre o muro de blocos (frente leste e norte)
  const kb = { base: 'balaustre', balaustre: 'balaustreFino' }
  balaustrada(obra, kb, W / 2 + 0.5, -L / 2 - 0.5, W / 2 + 0.5, L / 2 + 0.5, 0)
  obra.colisaoCaixa(0, 0, W / 2 + 0.6, L / 2 + 0.6)
  ocupacao.marcar(pg.x, pg.z, pg.hu + 1, pg.hv + 1, obra.giro)
  obra.montar(cena, mats, { solidos: ['palacio'] })
  return obra.grupo
}

// o coreto: base octogonal de alvenaria, oito colunas de ferro, friso rendado e cobertura de zinco côncava
function coreto(cena, mats, praca, H, [lx, lz]) {
  const obra = new Obra('coreto-leoes', praca.mundo(lx, lz), praca.y + H)
  const r = 3.6
  obra.add('cal', new THREE.CylinderGeometry(r, r + 0.15, 1.0, 8).translate(0, 0.5, 0))
  obra.add('moldura', new THREE.CylinderGeometry(r + 0.2, r + 0.2, 0.15, 8).translate(0, 1.05, 0))
  for (let i = 0; i < 3; i++) obra.caixa('pedra', 0, 0.17 + i * 0.33, -r - 0.9 + i * 0.3, 2.2, 0.34 + i * 0.66, 0.6)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8
    const [x, z] = [Math.cos(a) * (r - 0.3), Math.sin(a) * (r - 0.3)]
    obra.cilindro('ferro', x, 1.1 + 1.6, z, 0.07, 0.09, 3.2, 8)
    obra.torno('ferro', x, 4.2, z, [[0, 0], [0.09, 0], [0.2, 0.15], [0.22, 0.22], [0, 0.22]], 6)
  }
  // o gradil baixo entre as colunas e o friso de cima
  obra.add('ferro', new THREE.TorusGeometry(r - 0.3, 0.035, 4, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8).translate(0, 2.0, 0))
  obra.add('ferro', new THREE.TorusGeometry(r - 0.3, 0.05, 4, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8).translate(0, 4.35, 0))
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2
    obra.add('ferroFino', new THREE.TorusGeometry(0.16, 0.02, 4, 8).rotateY(-a + Math.PI / 2).translate(Math.cos(a) * (r - 0.3), 4.15, Math.sin(a) * (r - 0.3)))
  }
  obra.detalhe.add('ferroFino')
  obra.torno('chapa', 0, 4.4, 0, [[0, 0], [r + 0.5, 0], [r + 0.35, 0.15], [2.4, 0.6], [1.2, 1.5], [0.4, 2.4], [0, 2.6]], 16)
  obra.torno('ferro', 0, 6.95, 0, [[0, 0], [0.1, 0], [0.18, 0.2], [0.05, 0.6], [0, 0.65]], 8)
  for (let i = 0; i < 3; i++) obra.deck(0, -r - 0.9 + i * 0.3, 1.1, 0.3, 0.34 + i * 0.33)
  obra.deck(0, 0, r * 0.85, r * 0.85, 1.12)
  obra.colisaoCirculo(0, 0, 0.1)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8
    obra.colisaoCirculo(Math.cos(a) * (r - 0.3), Math.sin(a) * (r - 0.3), 0.15)
  }
  obra.montar(cena, mats)
  return obra.grupo
}

export function criarEntornoLeoes(cena, cfg, mats, mobilia, praca, { H, fundo, coreto: lugarCoreto }) {
  void cfg
  void mobilia
  return { grupos: [rosario(cena, mats, praca, H, fundo), palacio(cena, mats, praca, H, fundo), coreto(cena, mats, praca, H, lugarCoreto)] }
}
