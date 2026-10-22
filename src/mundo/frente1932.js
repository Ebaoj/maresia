// A frente contínua da cidade de 1932 (item 2 do bloco "a cidade parece um deserto de areia"; nasceu no
// WIP 0fc5207 e foi revista em 21/10/2026). A planta oficial tem folgas na testada: no Centro elas viram
// casa geminada na mesma linha da fachada; nos bairros, muro caiado com portão. Saiu de cidade.js, que
// passava de 400 linhas.

import { alturaTerreno } from './terreno.js'
import { VAOS } from './casario1932.js'
import { marcoSob } from './lotes-marcos.js'
import { FACHADAS as CORES_CASARIO } from '../paleta.js'
import { criarAleatorio } from '../utils.js'
import { ESPESSURA_MURO } from './muro1932.js'
import { direcaoJogo, comprimentoJogo, metrosDoVao } from './fortaleza1932.js'
import { distRealDaPraca } from './chao1932.js'
import { dentroDaPraca } from './praca1932.js'
import { VISTAS } from './marcos1932/vistas.js'
import { VISTAS_MARCOS } from './vistas-marcos.js'
import { casaLivre, casaNaFolga, lugarRecusado } from './cidade.js'

// ---------------------------------------------------------------- item 2
// A frente contínua: a planta oficial de 1932 é esparsa (26% das frentes têm
// vizinho; a folga mediana entre duas frentes é de 22 m), e a cidade parecia
// um deserto de areia com as casas soltas. Estes trechos da testada são
// preenchidos: no Centro, casa geminada na mesma linha de fachada, com
// alturas e cores variadas da paleta cal e sal; nos bairros, muro caiado com
// portão de madeira.
//
// A semente é fixa (1932): a cidade sai sempre igual.
export const FRENTE = { vaos: 0, casas: 0, muros: 0, recusadas: 0, passagens: 0, ruas: 0 }

// Onde a frente contínua não entra (a revisão do WIP 0fc5207): a casa ou o muro novo não pode cair no
// chão de um marco (Sé, Estação, Passeio, Excelsior, cinemas, Leões, Mercado), num lugar reservado, dentro
// da Praça do Ferreira nem na frente de um ponto de vista do "Ir para" (o corredor da câmera até o marco).
// A casa da planta já passava por isso; a da folga, não (o WIP pôs uma casa no largo da Sé e um muro
// na frente da vista do Mercado).
const CORREDORES = [...Object.values(VISTAS), ...Object.values(VISTAS_MARCOS)].map((v) => {
  const dx = v.alvo[0] - v.x
  const dz = v.alvo[1] - v.z
  const c = Math.hypot(dx, dz) || 1
  // a câmera fica uns 8 m atrás do jogador
  return { ax: v.x - (dx / c) * 8, az: v.z - (dz / c) * 8, bx: v.alvo[0], bz: v.alvo[1] }
})
export function noCorredor(x, z, r) {
  for (const k of CORREDORES) {
    const dx = k.bx - k.ax
    const dz = k.bz - k.az
    const t = Math.max(0, Math.min(1, ((x - k.ax) * dx + (z - k.az) * dz) / (dx * dx + dz * dz || 1)))
    if (Math.hypot(x - (k.ax + dx * t), z - (k.az + dz * t)) < 3 + r) return true
  }
  return false
}
// o ponto está a menos de r de onde o jogador fica num ponto de vista (a câmera fica logo atrás)?
export function pertoDeVista(x, z, r) {
  for (const k of CORREDORES) {
    const dx = k.bx - k.ax
    const dz = k.bz - k.az
    const c = Math.hypot(dx, dz) || 1
    // o jogador fica 8 m à frente da câmera, na linha do corredor
    if (Math.hypot(x - (k.ax + (dx / c) * 8), z - (k.az + (dz / c) * 8)) < r) return true
  }
  return false
}
export function folgaProibida(item) {
  const r = Math.hypot(item.w, item.d) / 2
  if (lugarRecusado(item)) return true
  if (marcoSob(item.x, item.z, r)) return true
  if (noCorredor(item.x, item.z, r)) return true
  const c = Math.cos(item.rot)
  const sn = Math.sin(item.rot)
  for (const [a, b] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = (a * item.w) / 2
    const lz = (b * item.d) / 2
    if (dentroDaPraca(item.x + lx * c + lz * sn, item.z - lx * sn + lz * c)) return true
  }
  return false
}

export function preencheVaus(cas, cfg) {
  const rnd = criarAleatorio(1932)
  const muros = []
  const raio = cfg.chao.centroRaio
  for (const vao of VAOS) {
    const ax = vao.a[0]
    const az = vao.a[1]
    const bx = vao.b[0]
    const bz = vao.b[1]
    const dx = bx - ax
    const dz = bz - az
    const comp = Math.hypot(dx, dz)
    if (comp < 0.6) continue
    const ux = dx / comp
    const uz = dz / comp
    const mx = (ax + bx) / 2
    const mz = (az + bz) / 2
    // a normal do vão: a perpendicular à linha do vão, virada para a rua. A
    // perpendicular é a da linha do JOGO (a casa tem de encostar na testada
    // como ela aparece na tela); o lado da rua vem da normal de verdade, levada
    // para o quadro do jogo.
    const [ngx, ngz] = direcaoJogo(vao.normal[0], vao.normal[1], mx, mz)
    let nx = uz
    let nz = -ux
    if (nx * ngx + nz * ngz < 0) { nx = -nx; nz = -nz }
    // quantos metros de verdade o vão tem: a escala do mapa muda de um ponto
    // para outro (a praça está em 1:1, o resto é comprimido)
    const metros = metrosDoVao(dx, dz, mx, mz)
    if (metros < 7) { FRENTE.passagens++; continue } // uma passagem de pedestre, não uma casa
    // a folga é a rua transversal (casario1932.js, folgaCruzaRua): nada de casa nem muro fechando a rua
    if (vao.rua) { FRENTE.ruas++; continue }
    FRENTE.vaos++
    if (distRealDaPraca(mx, mz) < raio) {
      // Centro: a fileira de casas continua a linha da fachada. Cada casa
      // fica 0,45 un menor que o trecho que cabe: a parede entre as
      // vizinhas tem espessura, e a casa não invade o vizinho (o teste de
      // sobreposição da cidade conta a parede como sobreposição).
      const quantas = Math.max(1, Math.min(Math.round(metros / 11), Math.floor((comp - 0.45) / 5)))
      const larg = comp / quantas - 0.45
      // a profundidade do lote vem da planta em metros de verdade: aqui ela
      // vira unidade de jogo, que e o que o corpo da casa mede
      const prof = Math.min(40, Math.max(2, vao.prof * comprimentoJogo(vao.normal[0], vao.normal[1], mx, mz)))
      const rot = Math.atan2(nx, nz)
      for (let i = 0; i < quantas; i++) {
        // Onde a casa cabe: a casa da esquina é uma caixa reta e o quarteirão
        // é curvo, então ela avança sobre o vão. A casa nova procura o
        // trecho livre da linha, em vez de brigar com a esquina.
        let item = null
        for (let t = (i + 0.12) / quantas; t <= 1 && !item; t += 0.02) {
          const cx = ax + dx * t
          const cz = az + dz * t
          const teste = { x: cx - nx * (prof / 2), z: cz - nz * (prof / 2), w: larg, d: prof, rot }
          if (casaLivre(teste) && !folgaProibida(teste)) item = teste
        }
        if (!item) { FRENTE.recusadas++; continue }
        const altura = rnd.chance(0.45) ? rnd.entre(7.2, 8.6) : rnd.entre(4.8, 5.8)
        const cor = rnd.escolha(CORES_CASARIO)
        const feita = casaNaFolga(cas, item, altura, cor)
        if (feita) FRENTE.casas++
        else FRENTE.recusadas++
      }
    } else {
      // bairros: muro caiado, com portão de madeira. O muro também procura o
      // trecho livre: a casa da esquina avança sobre o vão da mesma rua.
      const rotMuro = Math.atan2(-uz, ux)
      const livre = (t) => {
        const cx = ax + dx * t
        const cz = az + dz * t
        const pedaco = { x: cx - nx * (ESPESSURA_MURO / 2), z: cz - nz * (ESPESSURA_MURO / 2), w: 1.2, d: ESPESSURA_MURO, rot: rotMuro }
        return casaLivre(pedaco) && !folgaProibida(pedaco)
      }
      let t0 = 0
      let t1 = 1
      while (t0 < 1 && !livre(t0)) t0 += 0.02
      while (t1 > t0 && !livre(t1)) t1 -= 0.02
      if (t1 - t0 < 0.05) { FRENTE.recusadas++; continue }
      // o meio do muro também: ele não atravessa um marco, a praça nem o corredor de uma vista
      let ok = true
      for (let t = t0; t <= t1 && ok; t += 0.05) ok = livre(t) || !folgaProibida({ x: ax + dx * t, z: az + dz * t, w: 1.2, d: ESPESSURA_MURO, rot: rotMuro })
      if (!ok) { FRENTE.recusadas++; continue }
      const c0x = ax + dx * t0
      const c0z = az + dz * t0
      const c1x = ax + dx * t1
      const c1z = az + dz * t1
      const yBase = Math.min(alturaTerreno(c0x, c0z), alturaTerreno(c1x, c1z))
      muros.push({
        x: (c0x + c1x) / 2 - nx * (ESPESSURA_MURO / 2),
        z: (c0z + c1z) / 2 - nz * (ESPESSURA_MURO / 2),
        y: yBase,
        comprimento: Math.hypot(c1x - c0x, c1z - c0z),
        rot: rotMuro,
        cor: rnd.escolha(['#efe6d2', '#e4d6bb', '#d9cbb0', '#e9dfc8', '#f2ebdc']),
        portao: rnd.entre(0.18, 0.82),
      })
      FRENTE.muros++
    }
  }
  return muros
}

