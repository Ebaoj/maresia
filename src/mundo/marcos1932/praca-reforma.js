// A Praça do Ferreira depois da reforma do prefeito Raimundo Girão (1932-1933), inaugurada em 31/12/1933.
//
//   FATO   Girão demoliu o coreto, remodelou os canteiros e pôs faixas de mosaico no piso [DN-Ferreira-reforma]
//   FATO   bancos de ferro fundido com assento de madeira na reforma de 1933 [Vermelho-Ferreira]
//   FATO   postes de 1 e de 3 lanternas; fícus de copa redonda e palmeiras nos cantos [fotos de 1925]
//   HIP    o desenho: um eixo largo no comprido da praça e uma travessa, ambos com faixas de pedra portuguesa
//          preta em onda sobre a branca, a roda em volta da coluna, oito canteiros baixos e chatos (sem grade:
//          a grade baixa de ferro é da praça de 1920) e as árvores nas pontas. Medidas em metros: a praça está
//          em 1:1 (escala1932.js)
//
// O que não entra: o coreto (demolido em 1932) e os quiosques de café (1920). O contorno é o da planta de
// 1932 (praca1932.json), o mesmo da praça antiga.

import * as THREE from 'three'
import { CENTRO, dentroDaPraca, CONTORNO } from '../praca1932.js'
import { alturaTerreno } from '../terreno.js'
import { ocupacao } from '../ocupacao.js'
import { texturaCanvas, toon, texturizar } from '../../materiais.js'
import { instanciarEmBlocos } from '../blocos.js'
import { criarAleatorio } from '../../utils.js'
import { oiti } from '../especies.js'
import { pecasDoCoqueiro } from '../vegetacao.js'
import { toonVertice } from '../../materiais.js'
import { adicionarCirculo } from '../colisao.js'
import { Obra, naGrade, paraGrade, EX, EZ } from './obra.js'
import { criarColunaHora } from './coluna-hora.js'

// os limites da praça no referencial da grade (u, v a partir do centro), tirados do contorno
const UV = CONTORNO.map(([x, z]) => paraGrade(CENTRO, x, z))
const U0 = Math.min(...UV.map((p) => p[0])) - 1
const U1 = Math.max(...UV.map((p) => p[0])) + 1
const V0 = Math.min(...UV.map((p) => p[1])) - 1
const V1 = Math.max(...UV.map((p) => p[1])) + 1

const RODA = 9 // raio da roda de pedra em volta da coluna
const EIXO = 7 // meia largura do eixo comprido
const dentro = (u, v, folga = 0) => {
  for (const [a, b] of [[0, 0], [folga, 0], [-folga, 0], [0, folga], [0, -folga]]) {
    const [x, z] = naGrade(CENTRO, u + a, v + b)
    if (!dentroDaPraca(x, z)) return false
  }
  return true
}

// O plano da praça (dado puro: os testes leem): canteiros, lampiões, bancos e árvores em (u, v)
export function planoDaPraca() {
  const canteiros = []
  for (const v of [-52, -27, 27, 52]) {
    for (const s of [-1, 1]) {
      const c = { u: s * 13.5, v, hu: 4, hv: 8 }
      const ok = [[-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => dentro(c.u + a * c.hu, c.v + b * c.hv, 1.5))
      if (ok) canteiros.push(c)
    }
  }
  const lamp3 = [[-8, -8], [8, -8], [-8, 8], [8, 8]].filter(([u, v]) => dentro(u, v))
  const lamp1 = []
  for (const v of [-40, -16, 16, 40, 63, -63]) for (const s of [-1, 1]) if (dentro(s * (EIXO + 0.6), v, 1)) lamp1.push([s * (EIXO + 0.6), v])
  const bancos = []
  // na roda da coluna, virados para ela
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8
    bancos.push({ u: Math.cos(a) * (RODA + 1.2), v: Math.sin(a) * (RODA + 1.2), olha: [-Math.cos(a), -Math.sin(a)] })
  }
  // ao longo do eixo, de costas para os canteiros
  for (const c of canteiros) {
    const s = Math.sign(c.u)
    for (const dv of [-4, 4]) bancos.push({ u: c.u - s * (c.hu + 1.0), v: c.v + dv, olha: [-s, 0] })
  }
  const arvores = []
  for (const [u, v, tipo] of [[-19, -58, 'ficus'], [19, -58, 'ficus'], [-12, 64, 'ficus'], [17, 64, 'ficus'],
    [-21, -12, 'palmeira'], [21, -12, 'palmeira'], [-19, 14, 'palmeira'], [20, 14, 'palmeira'], [0, -66, 'palmeira'], [3, 70, 'palmeira']]) {
    if (dentro(u, v, 2)) arvores.push({ u, v, tipo })
  }
  return { canteiros, lamp3, lamp1, bancos, arvores }
}

// o desenho do mosaico, no referencial da grade (1 px = 1/PX m)
const PX = 14
function desenharMosaico(cfg, plano) {
  const W = Math.ceil((U1 - U0) * PX)
  const H = Math.ceil((V1 - V0) * PX)
  const claro = cfg.marcos.corMosaicoClaro
  const escuro = cfg.marcos.corMosaicoEscuro
  return texturaCanvas(W, H, (ctx) => {
    const px = (u) => (u - U0) * PX
    const pz = (v) => (v - V0) * PX
    ctx.fillStyle = claro
    ctx.fillRect(0, 0, W, H)
    const rnd = criarAleatorio(1933)
    // a pedra miúda: manchas de tom (a pedra portuguesa não é branca lisa)
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${rnd.chance(0.5) ? '120,105,90' : '255,250,240'},${rnd.entre(0.03, 0.09)})`
      ctx.fillRect(rnd.entre(0, W), rnd.entre(0, H), rnd.entre(2, 9), rnd.entre(2, 9))
    }
    ctx.fillStyle = escuro
    ctx.strokeStyle = escuro
    // as faixas de borda do eixo e da travessa (1,6 m): dois fios pretos e, entre eles, uma fiada de losangos
    // pretos (o desenho geométrico combina com o déco da coluna; a onda "mar largo" de Copacabana é de 1970)
    const faixa = (eixoU, c, a0, a1) => {
      // eixoU: a faixa corre em v (borda do eixo comprido) no u = c; senão corre em u no v = c
      const R = (u0, v0, du, dv) => ctx.fillRect(px(u0), pz(v0), du * PX, dv * PX)
      const linha = (off) => (eixoU ? R(c + off - 0.15, a0, 0.3, a1 - a0) : R(a0, c + off - 0.15, a1 - a0, 0.3))
      linha(-0.75)
      linha(0.75)
      for (let t = a0 + 0.8; t < a1 - 0.8; t += 1.6) {
        ctx.beginPath()
        const pt = (al, tr) => (eixoU ? [px(c + tr), pz(al)] : [px(al), pz(c + tr)])
        ctx.moveTo(...pt(t - 0.6, 0)); ctx.lineTo(...pt(t, 0.42)); ctx.lineTo(...pt(t + 0.6, 0)); ctx.lineTo(...pt(t, -0.42))
        ctx.fill()
      }
    }
    for (const s of [-1, 1]) {
      faixa(true, s * (EIXO - 0.8), V0, -RODA - 1)
      faixa(true, s * (EIXO - 0.8), RODA + 1, V1)
      faixa(false, s * 3.7, U0, -RODA - 1)
      faixa(false, s * 3.7, RODA + 1, U1)
    }
    // a roda da coluna: claro por dentro, aro preto e raios de estrela
    ctx.fillStyle = claro
    ctx.beginPath()
    ctx.arc(px(0), pz(0), RODA * PX, 0, Math.PI * 2)
    ctx.fill()
    ctx.lineWidth = 0.8 * PX
    ctx.beginPath()
    ctx.arc(px(0), pz(0), (RODA - 0.4) * PX, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = escuro
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(px(Math.cos(a) * 3), pz(Math.sin(a) * 3))
      ctx.lineTo(px(Math.cos(a + 0.12) * (RODA - 1)), pz(Math.sin(a + 0.12) * (RODA - 1)))
      ctx.lineTo(px(Math.cos(a) * (RODA - 0.8)), pz(Math.sin(a) * (RODA - 0.8)))
      ctx.lineTo(px(Math.cos(a - 0.12) * (RODA - 1)), pz(Math.sin(a - 0.12) * (RODA - 1)))
      ctx.fill()
    }
    // o friso preto em volta de cada canteiro
    ctx.lineWidth = 0.5 * PX
    for (const c of plano.canteiros) ctx.strokeRect(px(c.u - c.hu - 0.7), pz(c.v - c.hv - 0.7), (c.hu + 0.7) * 2 * PX, (c.hv + 0.7) * 2 * PX)
  })
}

// o piso: uma malha rente ao terreno, só dentro do contorno, com o mosaico preso à grade
function pisoMosaico(cena, cfg, plano, mats) {
  const tex = desenharMosaico(cfg, plano)
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
  // material próprio (o mosaico é o mapa): toon pintado com a pedra miúda por cima
  const mat = texturizar(toon('#ffffff', { semCache: true }), { topo: 'pedra', lado: 'pedra', tam: 0.6, contraste: 0.8 })
  mat.map = tex
  void mats
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -2
  mat.polygonOffsetUnits = -2
  const P = 0.5 // meio metro: a borda do piso segue o contorno sem degrau visível
  const pos = []
  const uv = []
  const ponto = (u, v) => {
    const [x, z] = naGrade(CENTRO, u, v)
    pos.push(x - CENTRO[0], alturaTerreno(x, z) + 0.035, z - CENTRO[1])
    uv.push((u - U0) / (U1 - U0), 1 - (v - V0) / (V1 - V0))
  }
  for (let u = U0; u < U1; u += P) {
    for (let v = V0; v < V1; v += P) {
      const cx = u + P / 2
      const cv = v + P / 2
      const [x, z] = naGrade(CENTRO, cx, cv)
      if (!dentroDaPraca(x, z)) continue
      ponto(u, v); ponto(u, v + P); ponto(u + P, v)
      ponto(u + P, v); ponto(u, v + P); ponto(u + P, v + P)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat)
  m.position.set(CENTRO[0], 0, CENTRO[1])
  m.receiveShadow = true
  m.castShadow = false
  m.name = 'praca-mosaico'
  cena.add(m)
  return m
}

// um canteiro baixo e chato: meio-fio de pedra, terra, maciços de folhagem e flor
function canteiro(obra, c, rnd) {
  const { hu, hv } = c
  // o meio-fio de pedra (quatro lados) e a terra um pouco abaixo dele
  for (const s of [-1, 1]) {
    obra.caixa('pedra', c.u, 0.11, c.v + s * (hv + 0.12), hu * 2 + 0.48, 0.22, 0.24)
    obra.caixa('pedra', c.u + s * (hu + 0.12), 0.11, c.v, 0.24, 0.22, hv * 2)
  }
  obra.caixa('terra', c.u, 0.08, c.v, hu * 2, 0.16, hv * 2)
  const folha = new THREE.IcosahedronGeometry(0.5, 1)
  // maciço baixo e cheio: uma grade de touceiras com sorteio de posição e tamanho (a terra quase não aparece)
  for (let i = 0; i < 70; i++) {
    const u = c.u + (((i % 5) + 0.5) / 5 - 0.5) * (hu * 2 - 0.6) + rnd.entre(-0.35, 0.35)
    const v = c.v + ((Math.floor(i / 5) + 0.5) / 14 - 0.5) * (hv * 2 - 0.6) + rnd.entre(-0.3, 0.3)
    const e = rnd.entre(0.7, 1.05)
    const g = folha.clone().scale(e * 1.3, e * 0.55, e * 1.3).translate(u, 0.2 + e * 0.15, v)
    obra.add('folha', g)
    if (rnd.chance(0.55)) obra.add('flor', new THREE.IcosahedronGeometry(0.16, 0).translate(u + rnd.entre(-0.3, 0.3), 0.45 + e * 0.2, v + rnd.entre(-0.3, 0.3)))
  }
  obra.detalhe.add('flor')
}

export function criarPracaReforma(cena, cfg, mats, mobilia) {
  const plano = planoDaPraca()
  const y0 = alturaTerreno(CENTRO[0], CENTRO[1])
  const rnd = criarAleatorio(1933)
  const piso = pisoMosaico(cena, cfg, plano, mats)

  // a coluna no centro
  const coluna = criarColunaHora(cena, mats, CENTRO, y0, cfg)
  ocupacao.marcar(CENTRO[0], CENTRO[1], RODA, RODA)

  // canteiros: uma obra só (o chão da praça é quase plano; cada canteiro assenta no seu ponto)
  const obra = new Obra('praca-canteiros', CENTRO, y0)
  for (const c of plano.canteiros) {
    const [x, z] = naGrade(CENTRO, c.u, c.v)
    const dy = alturaTerreno(x, z) - y0
    const sub = new Obra('_', CENTRO, y0)
    canteiro(sub, c, rnd)
    for (const [k, geos] of sub.pecas) for (const g of geos) obra.add(k, g.translate(0, dy, 0))
    for (const k of sub.detalhe) obra.detalhe.add(k)
    ocupacao.marcar(x, z, c.hu + 0.8, c.hv + 0.8, obra.giro)
  }
  obra.montar(cena, mats)

  // mobiliário: lampiões e bancos (o mapa de luz e o sentar vêm da Mobilia)
  const giro = obra.giro
  for (const [u, v] of plano.lamp3) { const [x, z] = naGrade(CENTRO, u, v); mobilia.lampiao('lamp3', x, alturaTerreno(x, z), z, giro + Math.PI / 4); ocupacao.marcar(x, z, 0.5, 0.5) }
  for (const [u, v] of plano.lamp1) { const [x, z] = naGrade(CENTRO, u, v); mobilia.lampiao('lamp1', x, alturaTerreno(x, z), z, giro); ocupacao.marcar(x, z, 0.4, 0.4) }
  for (const b of plano.bancos) {
    const [x, z] = naGrade(CENTRO, b.u, b.v)
    const d = [b.olha[0] * EX[0] + b.olha[1] * EZ[0], b.olha[0] * EX[1] + b.olha[1] * EZ[1]]
    mobilia.banco(x, alturaTerreno(x, z), z, Math.atan2(d[0], d[1]))
    ocupacao.marcar(x, z, 1.0, 1.0)
  }

  // as árvores: fícus (a copa redonda do oiti, maior) e palmeiras (o coqueiro do jogo, mais baixo)
  const fic = []
  const pal = []
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  for (const a of plano.arvores) {
    const [x, z] = naGrade(CENTRO, a.u, a.v)
    const e = a.tipo === 'ficus' ? cfg.marcos.ficusEscala * rnd.entre(0.9, 1.1) : cfg.marcos.palmeiraEscala * rnd.entre(0.9, 1.05)
    q.setFromAxisAngle(Y, rnd.entre(0, Math.PI * 2))
    ;(a.tipo === 'ficus' ? fic : pal).push(new THREE.Matrix4().compose(new THREE.Vector3(x, alturaTerreno(x, z) - 0.1, z), q, new THREE.Vector3(e, e, e)))
    adicionarCirculo(x, z, a.tipo === 'ficus' ? 0.45 * e : 0.3 * e)
    ocupacao.marcar(x, z, 2.5, 2.5)
  }
  if (fic.length) instanciarEmBlocos(cena, oiti(criarAleatorio(77)), toonVertice(), fic, null, { nome: 'praca-ficus', placa: true })
  if (pal.length) {
    const { geoTronco, geoCopa, matTronco, matCopa } = pecasDoCoqueiro(cfg)
    instanciarEmBlocos(cena, geoTronco, matTronco, pal, null, { nome: 'praca-palmeiras', placa: true })
    instanciarEmBlocos(cena, geoCopa, matCopa, pal, null, { nome: 'praca-palmeiras-copa', semNormal: true, placa: true })
  }
  return {
    plano,
    grupos: [coluna.obra.grupo, obra.grupo, piso],
    atualizar: coluna.atualizar,
  }
}
