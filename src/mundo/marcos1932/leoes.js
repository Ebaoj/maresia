// A Praça General Tibúrcio (Praça dos Leões) em 1932, 18 anos depois da reforma de Ildefonso Albano (1914).
// Fonte: detalhe-4-marcos.md, seção 2 (planta, elementos, entorno) e marcos-1932.md, seções 6 a 8.
//
//   FATO   plataforma sobre muro de arrimo no alinhamento da Rua Sena Madureira (a "Rua de Baixo") [Castro2009]
//   FATO   1914: balaustrada artística com combustores e jarros bronzeados no lugar do gradil; os leões; o coreto;
//          49 combustores; ajardinamento "romântico, à inglesa", caminhos sinuosos e canteiros [FN-Leões; FEF-Leões]
//   FATO   escadaria dupla em ferradura no lado da Sena Madureira, com o leão atacado pela serpente no pedestal do
//          meio, "no alto da escadaria" [WP-Tibúrcio]; os outros dois felinos "adornam as entradas" [OP-Leões]
//   FATO   a estátua do General (bronze, ~2 m) sobre pedestal de 2,50 m [FEF-Leões]; canteiro circular no meio
//          (aérea de 1936); Igreja do Rosário e Palácio da Luz no lado sul
//   HIP    muro de 3,5 m (cerca de 20 degraus na foto; cfg.marcos.leoesMuro); 79 x 73 m (OSM); as posições
//          internas (General, coreto, felinos), que em 1932 não têm fonte; caminhos de saibro
//   DESVIO o chão do jogo é plano aqui (o terreno não desce para a Sena Madureira): o topo fica a leoesMuro acima
//          da rua de leste, e do lado oeste (General Bezerril), que na cidade real é quase no nível da praça,
//          entra uma escada reta para o jogador poder subir dos dois lados.
//
// As esculturas são peças à parte (esculturas.js), cada uma numa malha própria, para serem trocadas.

import * as THREE from 'three'
import { alturaTerreno } from '../terreno.js'
import { ocupacao } from '../ocupacao.js'
import { texturaCanvas, toon, texturizar } from '../../materiais.js'
import { instanciarEmBlocos } from '../blocos.js'
import { criarAleatorio } from '../../utils.js'
import { oiti } from '../especies.js'
import { pecasDoCoqueiro } from '../vegetacao.js'
import { toonVertice } from '../../materiais.js'
import { Obra, balaustrada, chaoMinimo, PERFIL } from './obra.js'
import { PEGADA } from './pegadas.js'
import { criarEsculturas } from './esculturas.js'
import { criarEntornoLeoes } from './leoes-entorno.js'

const HX = 39.5
const HZ = 36.5
const ESC = { z: 5, piso: 0.32, faixa: [1.3, 3.9], base: 6.2 } // escadaria de leste: eixo em z = 5
const OESTE = { z: 0, meia: 2.2 }
const RODA = { x: -6, z: -4, r: 8.5 } // canteiro circular
export const LUGARES_LEOES = {
  general: [15, -1],
  coreto: [20, -21],
  leao: [HX + 0.1, ESC.z - ESC.base - 1.6], // o leão de pé, na ponta norte da escadaria
  tigre: [HX + 0.1, ESC.z + ESC.base + 1.6], // o tigre, na ponta sul
}

// balaustrada inclinada (corrimão de escada): base e corrimão inclinados, balaústres de pé
function balaustradaInclinada(obra, k, x0, y0, z0, x1, y1, z1, { passo = 0.3, alt = 0.95 } = {}) {
  const dx = x1 - x0
  const dy = y1 - y0
  const dz = z1 - z0
  const Lh = Math.hypot(dx, dz)
  const L = Math.hypot(Lh, dy)
  const ang = Math.atan2(-dz, dx)
  const incl = Math.atan2(dy, Lh)
  for (const [yy, h, w] of [[0.08, 0.16, 0.3], [alt - 0.06, 0.12, 0.36]]) {
    const g = new THREE.BoxGeometry(L, h, w).rotateZ(incl).rotateY(ang)
    obra.add(k.base, g.translate((x0 + x1) / 2, (y0 + y1) / 2 + yy, (z0 + z1) / 2))
  }
  const n = Math.max(1, Math.floor(L / passo))
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n
    obra.torno(k.balaustre, x0 + dx * t, y0 + dy * t + 0.16, z0 + dz * t, PERFIL.balaustre, 6, (alt - 0.28) / 0.66)
  }
  obra.detalhe.add(k.balaustre)
}

// o jardim visto de cima: gramado, caminhos sinuosos de saibro com meio-fio, as praças do General e do coreto
function desenharJardim(PX) {
  const W = HX * 2 * PX
  const H = HZ * 2 * PX
  return texturaCanvas(W, H, (ctx) => {
    const px = (x) => (x + HX) * PX
    const pz = (z) => (z + HZ) * PX
    ctx.fillStyle = '#6b7f48'
    ctx.fillRect(0, 0, W, H)
    const rnd = criarAleatorio(1914)
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(${rnd.chance(0.5) ? '60,80,40' : '150,150,90'},${rnd.entre(0.05, 0.14)})`
      ctx.fillRect(rnd.entre(0, W), rnd.entre(0, H), rnd.entre(3, 14), rnd.entre(3, 14))
    }
    const caminho = (pts, larg) => {
      for (const [cor, w] of [['#8f7a58', larg + 0.5], ['#cdb48c', larg]]) {
        ctx.strokeStyle = cor
        ctx.lineWidth = w * PX
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(px(pts[0][0]), pz(pts[0][1]))
        for (let i = 1; i < pts.length - 1; i += 2) ctx.quadraticCurveTo(px(pts[i][0]), pz(pts[i][1]), px(pts[i + 1][0]), pz(pts[i + 1][1]))
        ctx.stroke()
      }
    }
    // a volta de passeio junto da balaustrada
    ctx.strokeStyle = '#cdb48c'
    ctx.lineWidth = 9 * PX
    ctx.strokeRect(0, 0, W, H)
    // os caminhos: da escadaria ao General e à roda, da escada de oeste à roda, e as curvas norte e sul
    caminho([[HX - 3, ESC.z], [28, 6], [LUGARES_LEOES.general[0], LUGARES_LEOES.general[1]], [6, -2], [RODA.x + RODA.r + 1, RODA.z]], 4)
    caminho([[-HX + 3, OESTE.z], [-26, 4], [RODA.x - RODA.r - 1, RODA.z]], 3.5)
    caminho([[RODA.x, RODA.z - RODA.r - 1], [-2, -24], [LUGARES_LEOES.coreto[0] - 6, LUGARES_LEOES.coreto[1]], [30, -28], [HX - 4, -HZ + 4]], 3.2)
    caminho([[RODA.x, RODA.z + RODA.r + 1], [-14, 20], [-6, 31], [8, 28], [20, 18], [30, 24], [HX - 4, HZ - 4]], 3.2)
    caminho([[-HX + 4, -HZ + 4], [-24, -18], [RODA.x - 4, RODA.z - RODA.r]], 3)
    // a roda em volta do canteiro e as pracinhas do General e do coreto
    ctx.fillStyle = '#cdb48c'
    for (const [x, z, r] of [[RODA.x, RODA.z, RODA.r + 3], [...LUGARES_LEOES.general, 5], [...LUGARES_LEOES.coreto, 7.5]]) {
      ctx.beginPath()
      ctx.arc(px(x), pz(z), r * PX, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#8f7a58'
    ctx.lineWidth = 0.4 * PX
    ctx.beginPath()
    ctx.arc(px(RODA.x), pz(RODA.z), (RODA.r + 0.3) * PX, 0, Math.PI * 2)
    ctx.stroke()
  })
}

export function criarLeoes(cena, cfg, mats, mobilia) {
  const pg = PEGADA.leoes
  const H = cfg.marcos.leoesMuro
  const rnd = criarAleatorio(1888)
  // a obra fica na altura da rua de leste (a Sena Madureira), ao pé da escadaria
  const tmp = new Obra('_', [pg.x, pg.z], 0)
  const pe = (lx, lz) => alturaTerreno(...tmp.mundo(lx, lz))
  const y = pe(HX + 5, ESC.z)
  const fundo = chaoMinimo([pg.x, pg.z], HX + 8, HZ) - y - 0.6
  const obra = new Obra('praca-dos-leoes', [pg.x, pg.z], y)

  // a plataforma: o muro de cantaria em volta (a caixa inteira) e a cornija no alto
  // caiado, como o conceito e a balaustrada clara da foto de 1930 (os blocos se leem pelos sulcos)
  obra.caixa('cal', 0, (H + fundo) / 2, 0, HX * 2, H - fundo, HZ * 2)
  obra.caixa('moldura', 0, H - 0.15, 0, HX * 2 + 0.3, 0.3, HZ * 2 + 0.3)
  // fiadas da cantaria (os blocos aparelhados da foto de 1930): sulcos a cada 0,6 m
  for (let t = fundo + 0.6; t < H - 0.4; t += 0.6) obra.caixa('calVelha', 0, t, 0, HX * 2 + 0.03, 0.05, HZ * 2 + 0.03)
  // o jardim por cima (um plano com o desenho do gramado e dos caminhos)
  const PX = 8
  const tex = desenharJardim(PX)
  const matJardim = texturizar(toon('#ffffff', { semCache: true }), { topo: 'areia', lado: 'areia', tam: 1.4, contraste: 0.9 })
  matJardim.map = tex
  matJardim.polygonOffset = true
  matJardim.polygonOffsetFactor = -2
  matJardim.polygonOffsetUnits = -2
  const jardim = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, HZ * 2).rotateX(-Math.PI / 2), matJardim)
  jardim.position.set(pg.x, y + H + 0.02, pg.z)
  jardim.rotation.y = obra.giro
  jardim.receiveShadow = true
  jardim.name = 'praca-dos-leoes-jardim'
  cena.add(jardim)

  // a balaustrada de 1914 com pilares; nos pilares, combustores e jarros alternados
  const kb = { base: 'balaustre', balaustre: 'balaustre' }
  const vaosLeste = [[ESC.z - ESC.faixa[1] - 0.2, ESC.z + ESC.faixa[1] + 0.2]]
  const vaosOeste = [[OESTE.z - OESTE.meia, OESTE.z + OESTE.meia]]
  const vaosSul = [[-9.5, -2.5]] // a frente da igreja (o adro, no nível da praça)
  const lado = (a, b, fixo, eixoX, vaos) => {
    // corta o lado nos vãos e põe pilar a cada ~6 m
    const pts = [a]
    for (const [v0, v1] of vaos) pts.push(v0, v1)
    pts.push(b)
    for (let i = 0; i < pts.length; i += 2) {
      const [s0, s1] = [pts[i], pts[i + 1]]
      if (s1 - s0 < 0.5) continue
      const n = Math.max(1, Math.round((s1 - s0) / 6))
      for (let j = 0; j < n; j++) {
        const t0 = s0 + ((s1 - s0) * j) / n
        const t1 = s0 + ((s1 - s0) * (j + 1)) / n
        if (eixoX) balaustrada(obra, kb, t0, fixo, t1, fixo, H)
        else balaustrada(obra, kb, fixo, t0, fixo, t1, H)
        for (const t of j === 0 ? [t0, t1] : [t1]) {
          const [px, pz] = eixoX ? [t, fixo] : [fixo, t]
          obra.caixa('balaustre', px, H + 0.55, pz, 0.5, 1.1, 0.5)
          obra.caixa('moldura', px, H + 1.13, pz, 0.62, 0.08, 0.62)
          const [wx, wz] = obra.mundo(px, pz)
          if (rnd.chance(0.5)) mobilia.lampiao('lamp1', wx, y + H + 1.17, wz, obra.giro)
          else mobilia.urna(wx, y + H + 1.17, wz, 0.9)
        }
        // colisão do lado (o personagem não cai de cima nem entra por baixo)
        const meio = (t0 + t1) / 2
        const L = (t1 - t0) / 2
        if (eixoX) obra.colisaoCaixa(meio, fixo, L, 0.25)
        else obra.colisaoCaixa(fixo, meio, 0.25, L)
      }
    }
  }
  lado(-HZ, HZ, HX - 0.15, false, vaosLeste)
  lado(-HZ, HZ, -HX + 0.15, false, vaosOeste)
  lado(-HX, HX, -HZ + 0.15, true, [])
  lado(-HX, HX, HZ - 0.15, true, vaosSul)
  obra.deck(0, 0, HX, HZ, H)

  // a escadaria dupla em ferradura (leste): o pedestal do leão no meio, dois lanços que sobem para oeste
  // dos dois lados dele e os três primeiros degraus largos, abrindo em curva na rua
  const n = Math.max(8, Math.round(H / 0.175))
  const r = H / n
  const t = ESC.piso
  for (let i = 1; i <= n; i++) {
    const x0 = HX + (n - i) * t
    const largo = i <= 3
    const meia = largo ? ESC.base - (i - 1) * 0.5 : ESC.faixa[1]
    if (largo) {
      obra.caixa('cal', x0 + t / 2, (i * r + fundo) / 2, ESC.z, t + 0.02, i * r - fundo, meia * 2)
      obra.deck(x0 + t / 2, ESC.z, t / 2, meia, i * r)
    } else {
      for (const s of [-1, 1]) {
        const zc = ESC.z + s * (ESC.faixa[0] + ESC.faixa[1]) / 2
        const w = ESC.faixa[1] - ESC.faixa[0]
        obra.caixa('cal', x0 + t / 2, (i * r + fundo) / 2, zc, t + 0.02, i * r - fundo, w)
        obra.deck(x0 + t / 2, zc, t / 2, w / 2, i * r)
        // o muro de fora do lanço, em degraus (a balaustrada inclinada assenta nele)
        obra.caixa('cal', x0 + t / 2, (i * r + fundo) / 2, ESC.z + s * (ESC.faixa[1] + 0.15), t + 0.02, i * r - fundo, 0.3)
      }
    }
  }
  // as balaustradas de fora dos lanços (inclinadas), abrindo em curva até a rua
  const xTopo = HX
  const xBase = HX + (n - 3) * t
  for (const s of [-1, 1]) {
    const z = ESC.z + s * (ESC.faixa[1] + 0.15)
    balaustradaInclinada(obra, kb, xTopo, H, z, xBase, 3 * r, z)
    // o cotovelo da curva: três trechos abrindo para a rua
    let [ax, ay, az] = [xBase, 3 * r, z]
    for (let k = 1; k <= 3; k++) {
      const a = (k / 3) * (Math.PI / 2)
      const bx = xBase + Math.sin(a) * 1.0
      const bz = z + s * (1 - Math.cos(a)) * (ESC.base - ESC.faixa[1] - 0.2)
      const by = 3 * r - (k / 3) * 2 * r
      balaustradaInclinada(obra, kb, ax, ay, az, bx, by, bz)
      ;[ax, ay, az] = [bx, by, bz]
    }
    obra.caixa('balaustre', ax, ay + 0.5, az, 0.45, 1.0, 0.45)
    // a colisão do muro de fora do lanço
    const zf = ESC.z + s * (ESC.faixa[1] + 0.15)
    obra.colisaoCaixa((xTopo + xBase) / 2 + 0.4, zf, (xBase - xTopo) / 2 + 0.4, 0.2)
  }
  // o pedestal alto do meio, onde fica o leão atacado pela serpente, com o medalhão na frente
  const pedAlt = H + 1.6
  obra.caixa('cal', HX + 1.5, (pedAlt + fundo) / 2, ESC.z, 3.0, pedAlt - fundo, ESC.faixa[0] * 2)
  obra.caixa('moldura', HX + 1.5, pedAlt - 0.1, ESC.z, 3.3, 0.2, ESC.faixa[0] * 2 + 0.3)
  obra.caixa('moldura', HX + 1.5, pedAlt + 0.15, ESC.z, 2.6, 0.3, ESC.faixa[0] * 2 - 0.1)
  obra.add('moldura', new THREE.TorusGeometry(0.42, 0.08, 6, 18).rotateY(Math.PI / 2).translate(HX + 3.02, H - 0.9, ESC.z))
  obra.colisaoCaixa(HX + 1.5, ESC.z, 1.5, ESC.faixa[0])
  // os pedestais dos dois felinos de Jacquemart nas pontas
  for (const k of ['leao', 'tigre']) {
    const [lx, lz] = LUGARES_LEOES[k]
    obra.caixa('cal', lx + 1.0, (H + 1.3 + fundo) / 2, lz, 2.4, H + 1.3 - fundo, 1.4)
    obra.caixa('moldura', lx + 1.0, H + 1.25, lz, 2.6, 0.12, 1.6)
    obra.colisaoCaixa(lx + 1.0, lz, 1.2, 0.7)
  }

  // a escada reta de oeste (DESVIO, ver o cabeçalho), da General Bezerril para o topo
  const yOeste = pe(-HX - 6, OESTE.z) - y
  const nO = Math.max(6, Math.round((H - yOeste) / 0.175))
  const rO = (H - yOeste) / nO
  for (let i = 1; i <= nO; i++) {
    const x0 = -HX - (nO - i + 1) * t
    obra.caixa('cal', x0 + t / 2, (yOeste + i * rO + fundo) / 2, OESTE.z, t + 0.02, yOeste + i * rO - fundo, OESTE.meia * 2)
    obra.deck(x0 + t / 2, OESTE.z, t / 2, OESTE.meia, yOeste + i * rO)
  }
  for (const s of [-1, 1]) {
    const z = OESTE.z + s * (OESTE.meia + 0.15)
    balaustradaInclinada(obra, kb, -HX, H, z, -HX - nO * t, yOeste, z)
    obra.colisaoCaixa(-HX - (nO * t) / 2, z, (nO * t) / 2, 0.2)
  }

  // o canteiro circular do meio: meio-fio, terra e um maciço de flores
  obra.add('pedra', new THREE.CylinderGeometry(RODA.r, RODA.r, 0.25, 40).translate(RODA.x, H + 0.12, RODA.z))
  obra.add('terra', new THREE.CylinderGeometry(RODA.r - 0.3, RODA.r - 0.3, 0.06, 40).translate(RODA.x, H + 0.26, RODA.z))
  const tufo = new THREE.IcosahedronGeometry(0.55, 1)
  for (let i = 0; i < 140; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    const rr = Math.sqrt(rnd.entre(0, 1)) * (RODA.r - 0.9)
    const e = rnd.entre(0.7, 1.1)
    obra.add('folha', tufo.clone().scale(e * 1.3, e * 0.6, e * 1.3).translate(RODA.x + Math.cos(a) * rr, H + 0.4, RODA.z + Math.sin(a) * rr))
    if (rnd.chance(0.6)) obra.add('flor', new THREE.IcosahedronGeometry(0.17, 0).translate(RODA.x + Math.cos(a) * rr, H + 0.75, RODA.z + Math.sin(a) * rr))
  }
  obra.detalhe.add('flor')
  obra.colisaoCirculo(RODA.x, RODA.z, RODA.r)

  // árvores: palmeiras num canto e copas redondas (jacarandá, oitizeiro) espalhadas no gramado
  const pal = []
  const cop = []
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  for (const [lx, lz, tipo] of [[-30, -28, 'p'], [-25, -30, 'p'], [-32, -22, 'p'], [30, 30, 'p'], [-28, 26, 'c'], [-18, 28, 'c'], [27, 17, 'c'],
    [-30, 10, 'c'], [6, -28, 'c'], [30, -10, 'c'], [-4, 18, 'c'], [-10, 30, 'c'], [12, 24, 'p'], [-20, -10, 'c']]) {
    const [wx, wz] = obra.mundo(lx, lz)
    const e = tipo === 'p' ? cfg.marcos.palmeiraEscala * rnd.entre(0.95, 1.15) : cfg.marcos.ficusEscala * rnd.entre(0.75, 0.95)
    q.setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2))
    ;(tipo === 'p' ? pal : cop).push(new THREE.Matrix4().compose(new THREE.Vector3(wx, y + H, wz), q, new THREE.Vector3(e, e, e)))
    obra.colisaoCirculo(lx, lz, 0.4)
  }
  instanciarEmBlocos(cena, oiti(criarAleatorio(1913)), toonVertice(), cop, null, { nome: 'leoes-copas', placa: true })
  const { geoTronco, geoCopa, matTronco, matCopa } = pecasDoCoqueiro(cfg)
  instanciarEmBlocos(cena, geoTronco, matTronco, pal, null, { nome: 'leoes-palmeiras', placa: true })
  instanciarEmBlocos(cena, geoCopa, matCopa, pal, null, { nome: 'leoes-palmeiras-copa', semNormal: true, placa: true })

  // bancos virados para a roda e combustores nos caminhos
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.3
    const lx = RODA.x + Math.cos(a) * (RODA.r + 2.2)
    const lz = RODA.z + Math.sin(a) * (RODA.r + 2.2)
    const [wx, wz] = obra.mundo(lx, lz)
    const d = obra.mundo(lx - Math.cos(a), lz - Math.sin(a))
    mobilia.banco(wx, y + H, wz, Math.atan2(d[0] - wx, d[1] - wz))
  }
  for (const [lx, lz] of [[24, 4], [8, -5], [-20, 4], [-2, -22], [12, -26], [-12, 22], [14, 22]]) {
    const [wx, wz] = obra.mundo(lx, lz)
    mobilia.lampiao('lamp1', wx, y + H, wz, obra.giro)
  }

  for (const p of [pg, PEGADA.leoesEscada, PEGADA.leoesOeste]) ocupacao.marcar(p.x, p.z, p.hu + 1, p.hv + 1, obra.giro)
  obra.montar(cena, mats)
  const esculturas = criarEsculturas(cena, cfg, mats, obra, {
    leaoSerpente: [HX + 1.5, pedAlt + 0.3, ESC.z, Math.PI / 2],
    // os dois de Jacquemart de perfil para quem vem pela rua, olhando para fora da escadaria: o leão para o norte,
    // o tigre para o sul com a cabeça virada para a rua (como no modelo)
    leao: [LUGARES_LEOES.leao[0] + 1.0, H + 1.31, LUGARES_LEOES.leao[1], Math.PI],
    tigre: [LUGARES_LEOES.tigre[0] + 1.0, H + 1.31, LUGARES_LEOES.tigre[1], 0],
    // o General olha para a escadaria (leste)
    general: [LUGARES_LEOES.general[0], H, LUGARES_LEOES.general[1], Math.PI / 2],
  })
  const entorno = criarEntornoLeoes(cena, cfg, mats, mobilia, obra, { H, fundo, coreto: LUGARES_LEOES.coreto })
  return { grupos: [obra.grupo, jardim, ...esculturas.grupos, ...entorno.grupos] }
}
