// Espécies nativas de Fortaleza (docs/direcao-de-arte.md, "Vegetação: o que a pesquisa confirmou"), como árvores
// pintadas (21/10/2026): galhos com afinamento e forquilhas à mostra, folhagem em cachos que a luz lê como uma
// massa só e cartões de folha quebrando a silhueta (a técnica está em arvore-forma.js; o vento em vento-arvores.js).
// Cada função recebe o sorteio com semente e devolve { corpo, longe, cartoes }, com a base do tronco em (0, 0, 0).
// A identidade de cada uma continua a da pesquisa: oiti de copa redonda e escura nas calçadas, fícus de copa larga
// nas praças, cajueiro de tronco baixo e torto e copa larga, carnaúba em leque, mangue nas raízes-escora.

import * as THREE from 'three'
import { V, novaEstrutura, galho, galhoPts, cacho, fecharCopa, montar, normalCopa, flex } from './arvore-forma.js'
import { QUADRANTE as Q, cantoQuadrante } from './folha-textura.js'
import { FOLHAGEM } from '../paleta.js'

// ajustes do painel que valem ao montar (cfg.arvores; recarregar): definidos uma vez, antes de criar o mundo
let F = { esfera: 0.72, oclusao: 0.88, cartaoTam: 1, cartaoDens: 1, variacao: 1 }
export function definirFormaArvores(o = {}) { F = { ...F, ...o } }
export function formaArvores() { return F }
const op = (pal, cartao, extra = {}) => ({ pal, esfera: F.esfera, oclusao: F.oclusao, cartao: { ...cartao, tam: cartao.tam * F.cartaoTam, dens: cartao.dens * F.cartaoDens }, ...extra })
const volta = (rnd, i, n, j = 0.4) => (i / n) * Math.PI * 2 + rnd.entre(-j, j)
const fase = (rnd) => rnd.entre(0, Math.PI * 2)

// OITI: árvore de rua nativa, tronco reto, quatro ou cinco pernadas subindo, copa densa e redonda, verde escuro
export function oiti(rnd) {
  const est = novaEstrutura(rnd, op(FOLHAGEM.oiti, { tam: 1.0, quadrantes: [Q.miuda], dens: 0.42 }))
  const H = rnd.entre(2.0, 2.6)
  const topo = V(rnd.entre(-0.2, 0.2), H, rnd.entre(-0.2, 0.2))
  galhoPts(est, [V(0, 0, 0), V(topo.x * 0.3, H * 0.5, topo.z * 0.3), topo], 0.26, 0.19, { raiz: true, peso1: 0 })
  const n = 4 + (rnd.chance(0.5) ? 1 : 0)
  for (let i = 0; i < n; i++) {
    const a = volta(rnd, i, n)
    const f = fase(rnd)
    // pernadas longas e abertas, cachos menores e separados: céu entre os grupos e a borda em lóbulos
    const pts = galho(est, topo, V(Math.cos(a), 0.9, Math.sin(a)), rnd.entre(2.2, 2.9), 0.15, 0.07, { sobe: 0.1, peso1: 0.7, fase: f })
    for (let j = 0; j < 2; j++) {
      const b = a + (j ? 0.8 : -0.8) + rnd.entre(-0.3, 0.3)
      const p2 = galho(est, pts[2], V(Math.cos(b), 0.8, Math.sin(b)), rnd.entre(1.1, 1.6), 0.07, 0.03, { peso0: 0.45, fase: f })
      cacho(est, p2[p2.length - 1].clone().add(V(0, 0.25, 0)), rnd.entre(0.75, 1.1), { fase: f, forca: 0.45 })
    }
    cacho(est, pts[pts.length - 1].clone().add(V(0, 0.35, 0)), rnd.entre(0.9, 1.2), { fase: f, forca: 0.45 })
  }
  for (let i = 0; i < 2; i++) {
    const a = volta(rnd, i, 2, 1)
    cacho(est, topo.clone().add(V(Math.cos(a) * 0.6, rnd.entre(2.9, 3.4), Math.sin(a) * 0.6)), rnd.entre(1.0, 1.25), { fase: fase(rnd), peso: 0.8, forca: 0.45 })
  }
  return montar(est)
}

// FÍCUS das praças (Praça do Ferreira, Passeio Público): tronco grosso e liso, cinza, com sapopemas; pernadas
// baixas que se abrem quase na horizontal; copa em guarda-chuva, mais larga que alta, de folha miúda e densa,
// com o baixo escuro e frio bem à mostra; algumas raízes aéreas caindo das pernadas
export function ficus(rnd) {
  const est = novaEstrutura(rnd, op(FOLHAGEM.ficus, { tam: 0.95, quadrantes: [Q.miuda], dens: 0.46 }, { esfera: Math.min(1, F.esfera + 0.08) }))
  const H = rnd.entre(1.3, 1.6)
  const topo = V(rnd.entre(-0.15, 0.15), H, rnd.entre(-0.15, 0.15))
  galhoPts(est, [V(0, 0, 0), V(0, H * 0.5, 0), topo], 0.4, 0.32, { raiz: true, peso1: 0 })
  const n = 5 + (rnd.chance(0.5) ? 1 : 0)
  for (let i = 0; i < n; i++) {
    const a = volta(rnd, i, n, 0.3)
    const f = fase(rnd)
    const pts = galho(est, topo, V(Math.cos(a), rnd.entre(0.55, 0.85), Math.sin(a)), rnd.entre(2.2, 2.9), 0.2, 0.08, { sobe: 0.05, cai: 0.15, torce: 0.15, peso1: 0.6, fase: f })
    for (let j = 0; j < 2; j++) {
      const b = a + (j ? 0.6 : -0.6) + rnd.entre(-0.25, 0.25)
      const p2 = galho(est, pts[2 + j], V(Math.cos(b), 0.6, Math.sin(b)), rnd.entre(1.1, 1.6), 0.08, 0.03, { peso0: 0.4, fase: f })
      cacho(est, p2[p2.length - 1].clone().add(V(0, 0.3, 0)), rnd.entre(0.8, 1.1), { fase: f, achatar: 0.7, forca: 0.45 })
    }
    cacho(est, pts[pts.length - 1].clone().add(V(0, 0.4, 0)), rnd.entre(0.95, 1.2), { fase: f, achatar: 0.7, forca: 0.45 })
    // raiz aérea: fio quase reto até o chão
    if (rnd.chance(0.45)) {
      const p = pts[2]
      galhoPts(est, [p, V(p.x * 1.02, p.y * 0.5, p.z * 1.02), V(p.x * 1.03, -0.1, p.z * 1.03)], 0.035, 0.028, { peso0: 0.3, peso1: 0.05, fase: f })
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = volta(rnd, i, 3, 0.8)
    cacho(est, topo.clone().add(V(Math.cos(a) * 1.3, rnd.entre(2.4, 2.9), Math.sin(a) * 1.3)), rnd.entre(1.05, 1.3), { fase: fase(rnd), peso: 0.8, achatar: 0.7, forca: 0.45 })
  }
  return montar(est)
}

// CAJUEIRO: tronco curto e torto que logo se abre em galhos grossos quase horizontais, caindo na ponta; copa baixa
// e larga, verde escuro brilhante, folha grande, com folha nova acobreada no topo
export function cajueiro(rnd) {
  const est = novaEstrutura(rnd, op(FOLHAGEM.cajueiro, { tam: 1.3, quadrantes: [Q.larga], dens: 0.42 }))
  const altT = rnd.entre(0.9, 1.5)
  const inc = V(rnd.entre(-0.35, 0.35), altT, rnd.entre(-0.35, 0.35))
  galhoPts(est, [V(0, 0, 0), V(inc.x * 0.4, altT * 0.55, inc.z * 0.4), inc], 0.42, 0.33, { raiz: true, peso1: 0 })
  const cobre = est.pal.acento
  const n = 4 + Math.floor(rnd.entre(0, 2.99))
  for (let i = 0; i < n; i++) {
    const a = volta(rnd, i, n)
    const f = fase(rnd)
    const L = rnd.entre(3.2, 5.2)
    const pts = galho(est, inc, V(Math.cos(a), 0.55, Math.sin(a)), L, 0.24, 0.07, { sobe: 0.15, cai: 0.55, torce: 0.3, peso1: 0.85, fase: f, n: 5 })
    const lado = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(rnd.chance(0.5) ? 1 : -1)
    const s1 = galho(est, pts[2], lado.clone().add(V(Math.cos(a) * 0.5, 0.8, Math.sin(a) * 0.5)), rnd.entre(1.1, 1.8), 0.11, 0.04, { peso0: 0.4, fase: f })
    for (const p of [pts[3], pts[5], s1[s1.length - 1]]) {
      const r = rnd.entre(0.95, 1.45)
      cacho(est, p.clone().add(V(rnd.entre(-0.3, 0.3), r * 0.4, rnd.entre(-0.3, 0.3))), r, { fase: f, topo: rnd.chance(0.4) ? cobre : null, achatar: 0.72, forca: 0.45 })
    }
  }
  for (let i = 0; i < 3; i++) {
    const a = volta(rnd, i, 3, 0.9)
    cacho(est, inc.clone().add(V(Math.cos(a) * rnd.entre(0.8, 2.0), rnd.entre(2.3, 3.0), Math.sin(a) * rnd.entre(0.8, 2.0))), rnd.entre(1.2, 1.65), { fase: fase(rnd), peso: 0.75, topo: cobre, achatar: 0.72, forca: 0.45 })
  }
  return montar(est)
}

// o leque da carnaúba no material dos cartões (sem virar para a câmera): setor de ~250 graus com pregas, a textura
// rasga as pontas em tiras (folha-textura.js, quadrante "leque"). Feito com os dois lados.
function lequeNaMalha(est, m, raio, q, pos, f, simples = false) {
  const N = simples ? 6 : 16
  const aberto = 2.2
  const [u0, v0] = cantoQuadrante(Q.leque)
  const k = { semente: f * 10, tom: est.rnd.entre(0.94, 1.06), topo: null }
  const nC = new THREE.Vector3()
  const cor = new THREE.Color()
  const ponto = (t, fr) => {
    const a = -aberto + 2 * aberto * t
    const prega = (Math.round(t * N) % 2 === 0 ? 1 : -1) * 0.07 * raio * fr
    return V(Math.cos(a) * raio * fr, prega - fr * fr * raio * 0.22, Math.sin(a) * raio * fr).applyQuaternion(q).add(pos)
  }
  const anel = []
  const aneis = simples ? [0, 1] : [0, 0.4, 1]
  for (const fr of aneis) {
    const linha = []
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const p = ponto(t, fr)
      normalCopa(est, p, nC)
      // cor do leque: o verde de cera por cima, a sombra fria embaixo e no miolo da coroa
      const ny = nC.y
      cor.copy(est.pal.sombra).lerp(est.pal.meio, THREE.MathUtils.smoothstep(ny, -0.8, 0.1)).lerp(est.pal.luz, THREE.MathUtils.smoothstep(ny, 0.0, 0.9) * (0.4 + 0.6 * fr)).multiplyScalar(k.tom * (0.8 + 0.2 * fr))
      const nn = nC.clone()
      linha.push({ p, n: nn, c: [cor.r, cor.g, cor.b], uv: [u0 + t * 0.5, v0 + fr * 0.5], w: fr })
    }
    anel.push(linha)
  }
  for (const lado of [0, 1]) {
    const ids = anel.map((linha) => linha.map((v) => m.vert({ position: [v.p.x, v.p.y, v.p.z], normal: [v.n.x, v.n.y, v.n.z], color: v.c, uv: v.uv,
      aVento: [flex(est, v.p.y), 1, f, v.w], aCentro: [v.p.x, v.p.y, v.p.z], aCanto: [0, 0, 0] })))
    for (let r = 0; r < aneis.length - 1; r++) {
      for (let i = 0; i < N; i++) {
        const a = ids[r][i], b = ids[r][i + 1], c = ids[r + 1][i], d = ids[r + 1][i + 1]
        if (lado) { m.tri(a, c, b); m.tri(b, c, d) } else { m.tri(a, b, c); m.tri(b, d, c) }
      }
    }
  }
}

// CARNAÚBA: estipe reto e fino (9 a 12 m), com os pecíolos velhos em espiral no terço de baixo; coroa globosa de
// folhas em leque verde-acinzentado (a cera); sem saia de folhas secas (ESALQ). Planta social: em grupo, na várzea
export function carnauba(rnd) {
  const est = novaEstrutura(rnd, op(FOLHAGEM.carnauba, { tam: 1, quadrantes: [Q.leque], dens: 0 }, { esfera: 0.55 }))
  const H = rnd.entre(9, 12.5)
  const cv = V(rnd.entre(-0.6, 0.6), 0, rnd.entre(-0.6, 0.6))
  const pts = [V(0, 0, 0), V(cv.x * 0.2, H * 0.35, cv.z * 0.2), V(cv.x * 0.6, H * 0.7, cv.z * 0.6), V(cv.x, H, cv.z)]
  const topo = pts[3]
  est.copa = { c: topo.clone().add(V(0, 0.4, 0)), r: V(2.4, 1.9, 2.4) }
  est.H = H + 1.5
  // as bases das folhas velhas em espiral no terço de baixo, em relevo baixo no próprio estipe (eram caixas que
  // saíam do tronco e, na sombra, liam como espetos pretos em zigue-zague)
  galhoPts(est, pts, 0.22, 0.16, { raiz: true, peso1: 0, escamas: { ate: 0.5, passo: 0.36 } })
  const folhas = []
  const nF = 22 + Math.floor(rnd.entre(0, 8))
  for (let i = 0; i < nF; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    const el = rnd.entre(-0.25, 1.3)
    const dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el))
    const L = rnd.entre(1.3, 1.9)
    const f = fase(rnd)
    const fim = topo.clone().addScaledVector(dir, L)
    galhoPts(est, [topo, topo.clone().addScaledVector(dir, L * 0.5).add(V(0, 0.08, 0)), fim], 0.04, 0.025, { peso0: 0.5, peso1: 1, fase: f, casca: '#6e7a52' })
    const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), V(dir.x, dir.y * 0.6 - 0.15, dir.z).normalize())
    folhas.push({ raio: rnd.entre(0.95, 1.25), q, fim, f })
  }
  cacho(est, topo.clone().add(V(0, 0.2, 0)), 0.55, { achatar: 1.2, peso: 0.6 })
  return montar(est, {
    extraCartoes: (m) => { for (const l of folhas) lequeNaMalha(est, m, l.raio, l.q, l.fim, l.f) },
    // longe: os leques são a copa inteira e não podem sumir; vão 2 em cada 3, maiores, com 6 gomos e sem prega
    // (de 64 para 6 triângulos por lado: a carnaúba era a espécie mais cara de longe, cidade-cheia 21/10/2026)
    extraCartoesLonge: (m) => { folhas.forEach((l, i) => { if (i % 3 !== 2) lequeNaMalha(est, m, l.raio * 1.15, l.q, l.fim, l.f, true) }) },
  })
}

// MANGUE-VERMELHO: raízes-escora em arco saindo do tronco para a lama, raízes aéreas caindo dos galhos; copa densa e
// arredondada, verde médio brilhante. Base no nível da água
export function mangueVermelho(rnd) {
  const est = novaEstrutura(rnd, op(FOLHAGEM.mangue, { tam: 0.95, quadrantes: [Q.miuda], dens: 0.5 }))
  const H = rnd.entre(1.8, 2.6)
  const topo = V(rnd.entre(-0.3, 0.3), H + rnd.entre(1.2, 2.0), rnd.entre(-0.3, 0.3))
  galhoPts(est, [V(0, H * 0.6, 0), V(0, H, 0), topo], 0.2, 0.13, { peso1: 0.1 })
  const nR = 9 + Math.floor(rnd.entre(0, 5))
  for (let i = 0; i < nR; i++) {
    const a = volta(rnd, i, nR, 0.2)
    const r = rnd.entre(1.2, 2.3)
    const sy = H * rnd.entre(0.55, 1.0)
    galhoPts(est, [V(0, sy, 0), V(Math.cos(a) * r * 0.55, sy + rnd.entre(0.2, 0.5), Math.sin(a) * r * 0.55), V(Math.cos(a) * r * 0.9, sy * 0.45, Math.sin(a) * r * 0.9), V(Math.cos(a) * r, -0.3, Math.sin(a) * r)], 0.075, 0.05, { peso1: 0 })
  }
  for (let i = 0; i < 4; i++) {
    const a = volta(rnd, i, 4)
    const f = fase(rnd)
    const pts = galho(est, topo, V(Math.cos(a), 0.6, Math.sin(a)), rnd.entre(1.4, 2.1), 0.1, 0.045, { peso0: 0.1, peso1: 0.8, fase: f })
    const p = pts[pts.length - 1]
    if (rnd.chance(0.6)) galhoPts(est, [pts[2], V(pts[2].x * 1.05, pts[2].y * 0.5, pts[2].z * 1.05), V(pts[2].x * 1.06, -0.2, pts[2].z * 1.06)], 0.03, 0.025, { peso0: 0.3, peso1: 0.05, fase: f })
    cacho(est, p.clone().add(V(0, 0.45, 0)), rnd.entre(0.95, 1.3), { fase: f, forca: 0.45 })
  }
  cacho(est, topo.clone().add(V(0, 1.3, 0)), rnd.entre(1.2, 1.5), { fase: fase(rnd), peso: 0.8, forca: 0.45 })
  return montar(est)
}

// MURICI: arbusto de restinga (1,5 a 2,5 m), poucos caules finos, cachos arredondados e espigas de flor amarela
export function murici(rnd) {
  const est = novaEstrutura(rnd, op(FOLHAGEM.murici, { tam: 0.55, quadrantes: [Q.media], dens: 0.6 }))
  const n = 4 + Math.floor(rnd.entre(0, 2.99))
  for (let i = 0; i < n; i++) {
    const a = volta(rnd, i, n)
    const f = fase(rnd)
    const t = V(Math.cos(a) * rnd.entre(0.3, 0.8), rnd.entre(1.0, 1.7), Math.sin(a) * rnd.entre(0.3, 0.8))
    galhoPts(est, [V(0, 0, 0), V(t.x * 0.6, t.y * 0.45, t.z * 0.6), t], 0.06, 0.03, { peso1: 0.7, fase: f })
    cacho(est, t.clone().add(V(0, 0.15, 0)), rnd.entre(0.55, 0.75), { fase: f, topo: est.pal.acento })
    cacho(est, V(t.x * 0.9, rnd.entre(0.45, 0.75), t.z * 0.9), rnd.entre(0.5, 0.7), { fase: f, peso: 0.6 })
  }
  return montar(est)
}

// GUAJIRU: moita baixa e densa de restinga, mais larga que alta (2 a 3 m por 1 m), folha arredondada verde-clara,
// alguns frutos arroxeados
export function guajiru(rnd) {
  const est = novaEstrutura(rnd, op(FOLHAGEM.guajiru, { tam: 0.5, quadrantes: [Q.larga], dens: 0.6 }))
  const n = 5 + Math.floor(rnd.entre(0, 3.99))
  for (let i = 0; i < n; i++) {
    const a = rnd.entre(0, Math.PI * 2)
    const d = rnd.entre(0, 1.1)
    const r = rnd.entre(0.55, 0.85)
    cacho(est, V(Math.cos(a) * d, r * 0.55, Math.sin(a) * d), r, { fase: fase(rnd), achatar: 0.7, topo: rnd.chance(0.3) ? est.pal.acento : null })
  }
  fecharCopa(est)
  return montar(est)
}
