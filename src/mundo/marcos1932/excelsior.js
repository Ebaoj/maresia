// O Hotel Excelsior (1928-1931), na esquina da Rua Guilherme Rocha com a Major Facundo, de frente para a
// ponta noroeste da Praça do Ferreira. Fonte: detalhe-4-marcos.md, seção 1 (a tabela andar por andar).
//
//   FATO   térreo + 7 andares e terraço ("sete andares e um terraço"), cerca de 30 m [DN-Arquitetura]
//   FATO   eclético, "o último representante da arquitetura eclética" (não é art déco) [DN-Excelsior]
//   FATO   portaria no nº 172 da Guilherme Rocha, em arco, portão de ferro com o monograma EH (hoje)
//   HIP.F  49 x 16 m pelo polígono OSM; fachada longa ao sul (Guilherme Rocha), curta a leste (Major Facundo),
//          esquina curva no sudeste; varandas corridas com balaústres no 1º e no 6º; bossagem em faixas entre
//          os vãos do 2º ao 5º, com sacadas individuais de ferro; arcos plenos no 7º; cornija, platibanda e
//          mastros com bandeiras (postal da inauguração); no terraço, a casa de máquinas e o American Bar
//   HIP    cor creme muito claro (as fotos de época são em preto e branco); ferro escuro; vãos de 3,6 m
//
// O conceito aprovado saiu "mais largo e palaciano": aqui o volume é o do OSM (49 x 16), não o do conceito.

import * as THREE from 'three'
import { Obra, balaustrada, chaoMinimo } from './obra.js'
import { janela, sacada, pilastra, portaArco, bandeira } from './pecas.js'
import { PEGADA } from './pegadas.js'
import { ocupacao } from '../ocupacao.js'
import { criarAleatorio } from '../../utils.js'

const L = 49 // fachada longa (x local), ao sul (+z)
const P = 16 // fachada curta (z local), a leste (+x)
const R = 4 // raio da esquina curva do sudeste
const VAO = 3.6

// a planta: retângulo com o canto sudeste arredondado (x, -z no plano da forma)
function planta(folga = 0) {
  const hx = L / 2 + folga
  const hz = P / 2 + folga
  const r = R + folga
  const s = new THREE.Shape()
  s.moveTo(-hx, -hz) // canto sudoeste (z = +hz vira y = -hz)
  s.lineTo(hx - r, -hz)
  s.absarc(hx - r, -hz + r, r, -Math.PI / 2, 0, false)
  s.lineTo(hx, hz)
  s.lineTo(-hx, hz)
  s.lineTo(-hx, -hz)
  return s
}
function prisma(folga, y0, h) {
  const g = new THREE.ExtrudeGeometry(planta(folga), { depth: h, bevelEnabled: false, curveSegments: 10 })
  return g.rotateX(-Math.PI / 2).translate(0, y0, 0)
}

// os pontos da fachada nobre (sul + curva + leste), cada um com a direção da parede: [x, z, ang]
function vaosDaFrente() {
  const v = []
  const nSul = 12
  for (let i = 0; i < nSul; i++) v.push([-L / 2 + 2.6 + i * VAO, P / 2, 0, 'sul', i])
  v.push([L / 2 - R + Math.sin(Math.PI / 4) * R, P / 2 - R + Math.cos(Math.PI / 4) * R, Math.PI / 4, 'curva', 0])
  for (let i = 0; i < 3; i++) v.push([L / 2, P / 2 - R - 1.9 - i * VAO, Math.PI / 2, 'leste', i])
  return v
}

// a balaustrada corrida seguindo a frente (sul, curva e leste), saindo `sai` da parede
function varandaCorrida(obra, k, y, sai) {
  const hx = L / 2 + sai
  const hz = P / 2 + sai
  const r = R + sai
  obra.add(k.moldura, prismaFaixa(sai, y - 0.2, 0.22))
  // a faixa de sombra sob a laje (o tom mais escuro marca a varanda corrida de longe)
  obra.add(k.sulco, prismaFaixa(sai * 0.55, y - 0.62, 0.42))
  balaustrada(obra, { base: k.balaustre, balaustre: k.balaustreFino }, -L / 2, hz - 0.15, hx - r, hz - 0.15, y)
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * (Math.PI / 2)
    const a1 = ((i + 1) / 6) * (Math.PI / 2)
    const p = (a) => [L / 2 - R + Math.sin(a) * (r - 0.15), P / 2 - R + Math.cos(a) * (r - 0.15)]
    balaustrada(obra, { base: k.balaustre, balaustre: k.balaustreFino }, ...p(a0), ...p(a1), y)
  }
  balaustrada(obra, { base: k.balaustre, balaustre: k.balaustreFino }, hx - 0.15, P / 2 - R, hx - 0.15, -P / 2, y)
}
// a laje da varanda: o contorno da frente engordado (só sul e leste: o fundo fica rente)
function prismaFaixa(sai, y0, h) {
  const g = prisma(sai, y0, h)
  // empurra o lado norte e o oeste de volta para a parede (a varanda só dá a volta na frente)
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    if (p.getZ(i) < -P / 2) p.setZ(i, -P / 2 + 0.01)
    if (p.getX(i) < -L / 2) p.setX(i, -L / 2 + 0.01)
  }
  g.computeVertexNormals()
  return g
}

export function criarExcelsior(cena, cfg, mats, mobilia) {
  void mobilia
  const pg = PEGADA.excelsior
  const y = chaoMinimo([pg.x, pg.z], L / 2, P / 2) - 0.25
  const obra = new Obra('hotel-excelsior', [pg.x, pg.z], y)
  const rnd = criarAleatorio(1931)
  const k = { vao: 'vao', vaoAceso: 'vaoAceso', moldura: 'moldura', esquadria: 'esquadria', ferro: 'ferro', parede: 'excelsior', sulco: 'calVelha', balaustre: 'balaustreClaro', balaustreFino: 'balaustreClaroFino', ferroFino: 'ferroFino', bandeira: 'bandeira', bandeiraOuro: 'bandeiraOuro' }
  // as alturas dos andares (térreo 4,8; 1º ao 7º 3,5; coroamento): a altura do cfg estica todos igual
  const esc = cfg.marcos.excelsiorAltura / 30.3
  const T = 4.8 * esc
  const A = 3.5 * esc
  const nivel = (n) => (n === 0 ? 0.25 : 0.25 + T + (n - 1) * A) // o piso de cada andar (0 = térreo)
  const topo = nivel(8)

  // o corpo: base com embasamento mais escuro e o prisma inteiro
  obra.add('excelsior', prisma(0, 0, topo))
  obra.add('calVelha', prisma(0.06, 0, 0.6))
  // as cornijas: entre o térreo e o 1º (sustenta a varanda), no 6º, e a principal no alto
  obra.add('moldura', prisma(0.35, nivel(1) - 0.35, 0.35))
  obra.add('moldura', prisma(0.18, nivel(2) - 0.12, 0.12))
  obra.add('moldura', prisma(0.18, nivel(7) - 0.12, 0.12))
  obra.add('moldura', prisma(0.25, topo - 0.1, 0.2))
  obra.add('moldura', prisma(0.55, topo + 0.1, 0.3))
  obra.add('excelsior', prisma(0.1, topo + 0.4, 1.0)) // platibanda
  obra.add('moldura', prisma(0.2, topo + 1.4, 0.14))
  // as faixas da rusticação do térreo (sulcos horizontais a cada 0,5 m)
  for (let t = 0.9; t < T - 0.3; t += 0.5) obra.add('calVelha', prismaFaixa(0.015, t, 0.06))

  // a frente: térreo, 1º a 7º
  for (const [x, z, ang, face, i] of vaosDaFrente()) {
    const portaria = face === 'sul' && i === 6
    if (portaria) portaArco(obra, k, ang, x, nivel(0), z, 2.4, 4.2 * esc)
    else janela(obra, k, ang, x, nivel(0) + 0.15, z, 1.7, 3.3 * esc, { arco: true, peitoril: false, aceso: rnd.chance(0.5) })
    for (let n = 1; n <= 7; n++) {
      const yy = nivel(n) + 0.05
      const aceso = rnd.chance(0.35)
      if (n === 7) janela(obra, k, ang, x, yy + 0.4, z, 1.25, 2.5 * esc, { arco: true, aceso })
      else janela(obra, k, ang, x, yy, z, 1.2, 2.45 * esc, { peitoril: false, aceso })
      // as sacadas de ferro do 2º ao 5º (em todos os vãos da Guilherme Rocha, alternadas na Major Facundo)
      if (n >= 2 && n <= 5 && (face !== 'leste' || (i + n) % 2 === 0)) sacada(obra, k, ang, x, yy, z, 1.2)
    }
    // as pilastras de bossagem entre os vãos (2º ao 5º), dos dois lados de cada vão reto
    if (face !== 'curva') {
      // uma pilastra à esquerda de cada vão; a da direita só no último (senão as vizinhas se sobrepõem)
      const ultimo = (face === 'sul' && i === 11) || (face === 'leste' && i === 2)
      for (const s of ultimo ? [-1, 1] : [-1]) {
        const lx = Math.cos(ang) * s * (VAO / 2)
        const lz = -Math.sin(ang) * s * (VAO / 2)
        pilastra(obra, k, ang, x + lx, nivel(2) - 0.06, z + lz, 0.55, nivel(6) - nivel(2))
      }
    }
  }
  // as varandas corridas do 1º e do 6º andar
  varandaCorrida(obra, k, nivel(1) + 0.02, 0.95)
  varandaCorrida(obra, k, nivel(6) + 0.02, 0.8)

  // os fundos (norte e oeste): janelas simples, sem ornamento
  for (let n = 1; n <= 7; n++) {
    for (let i = 0; i < 11; i++) janela(obra, k, Math.PI, -L / 2 + 3 + i * 4.3, nivel(n) + 0.3, -P / 2, 1.0, 1.9 * esc, { aceso: rnd.chance(0.25) })
    for (let i = 0; i < 3; i++) janela(obra, k, -Math.PI / 2, -L / 2, nivel(n) + 0.3, -P / 2 + 3 + i * 5, 1.0, 1.9 * esc, { aceso: rnd.chance(0.25) })
  }

  // o terraço: a casa de máquinas e a escada (nos fundos) e o American Bar (mais à frente)
  obra.caixa('excelsior', -10, topo + 2.2, -3.5, 7, 4.4, 6)
  obra.caixa('moldura', -10, topo + 4.45, -3.5, 7.4, 0.2, 6.4)
  obra.caixa('excelsior', 8, topo + 1.6, 0, 11, 3.2, 7)
  obra.caixa('moldura', 8, topo + 3.25, 0, 11.6, 0.2, 7.6)
  for (let i = 0; i < 4; i++) janela(obra, k, 0, 3.6 + i * 2.9, topo + 0.8, 3.5, 1.4, 1.8, { arco: true, peitoril: false, aceso: true })

  // os mastros da inauguração ao longo da platibanda (cinco na Guilherme Rocha, dois na Major Facundo)
  for (let i = 0; i < 5; i++) bandeira(obra, k, -L / 2 + 4.5 + i * 10, topo + 1.5, P / 2 + 0.05, 0)
  for (let i = 0; i < 2; i++) bandeira(obra, k, L / 2 + 0.05, topo + 1.5, -P / 2 + 2.5 + i * 6, -Math.PI / 2)

  // colisão: o corpo (a esquina curva fica dentro da caixa; a calçada é larga o bastante)
  obra.colisaoCaixa(0, 0, L / 2 + 0.2, P / 2 + 0.2)
  ocupacao.marcar(pg.x, pg.z, L / 2 + 1.5, P / 2 + 1.5, obra.giro)
  obra.montar(cena, mats, { solidos: ['excelsior'] })
  return { grupos: [obra.grupo] }
}
