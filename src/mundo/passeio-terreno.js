// Os três planos do Passeio Público no chão do jogo (detalhe-4-marcos.md, seção 4).
//
// FATO: o 1º plano fica a 17 m sobre o mar, o 2º "uns seis metros mais baixo", o 3º "um pouco acima
// do nível do mar"; áreas de 9.920 m² (1º), 4.500 m² (2º) e 9.000 m² (3º); o 1º mede no OSM cerca de
// 141 x 73 m (o "400 palmos" do dossiê antigo era do Passeio de Lisboa).
// HIPÓTESE (medidas da planta Herbster de 1888): 2º plano de ~100 x 45 m, 3º de ~110 x 90 m.
//
// O que o jogo muda, e por quê: o tabuleiro do jogo é baixo (o 1º plano cai a ~7 m, não a 17 m: o
// relevo do mapa é comprimido na altura) e a costa comprimida deixa ~180 m do Passeio até o mar.
// Então: o muro do 1º para o 2º tem 3,6 m (não 6: em 7 m de tabuleiro não cabem os 6 m e o 3º plano
// acima da praia; 3,6 m ainda dá a escala da escadaria das esfinges), o 2º para o 3º tem o resto
// (~1,7 m, a mureta branca com a escada), o 3º fica no nível da rua da praia (1,8 m) e tem 60 m de
// fundo (não 90). As larguras são as do dossiê.
//
// Este arquivo é só o chão: o mapa (mapa.js) pergunta a altura aqui e o terreno nasce com os
// patamares; o Passeio (passeio1932.js) lê os mesmos números para assentar muros, escadas e pisos.

import { PEGADAS, localDaPegada } from './lotes-marcos.js'

// os planos em coordenada local do Passeio (x leste da malha, z sul da malha; origem no meio do 1º)
export const PLANOS = {
  p1: { x0: -70.5, x1: 70.5, z0: -36.5, z1: 36.5 },
  p2: { x0: -52, x1: 52, z0: -81.5, z1: -36.5 },
  p3: { x0: -56, x1: 56, z0: -141.5, z1: -81.5 },
}
export const MURO_1_2 = 3.6 // m, do 1º para o 2º plano (HIPÓTESE, ver o cabeçalho)
export const NIVEL_3 = 1.8 // m sobre o mar: o 3º plano no nível da rua da praia
const FAIXA = 3.2 // a rampa do chão fica escondida debaixo da laje do plano de cima
const BORDA = 18 // m em que o chão de fora volta ao relevo natural

let niveis = null
// os níveis dos três planos: o 1º é o chão natural na Rua Dr. João Moreira (a frente do Passeio)
export function niveisPasseio(natural) {
  if (!niveis) {
    const p = PEGADAS.passeio
    const c = Math.cos(p.rot)
    const s = Math.sin(p.rot)
    const lx = 0
    const lz = PLANOS.p1.z1 - 4
    const h1 = natural(p.x + lx * c + lz * s, p.z - lx * s + lz * c)
    const h2 = Math.max(NIVEL_3 + 1.2, h1 - MURO_1_2)
    niveis = { h1, h2, h3: NIVEL_3 }
  }
  return niveis
}

function distRet(r, lx, lz) {
  const dx = Math.max(r.x0 - lx, 0, lx - r.x1)
  const dz = Math.max(r.z0 - lz, 0, lz - r.z1)
  return Math.hypot(dx, dz)
}

const dentro = (r, lx, lz) => lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1
const suave = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u) }

// a altura do chão no ponto, com os patamares do Passeio; natural(x, z) é o relevo de sempre
export function alturaComPasseio(x, z, natural) {
  const p = PEGADAS.passeio
  const dx = x - p.x
  const dz = z - p.z
  if (dx * dx + dz * dz > 200 * 200) return natural(x, z)
  const [lx, lz] = localDaPegada(p, x, z)
  const { p1, p2, p3 } = PLANOS
  if (distRet(p1, lx, lz) > BORDA && distRet(p2, lx, lz) > BORDA && distRet(p3, lx, lz) > BORDA) return natural(x, z)
  const { h1, h2, h3 } = niveisPasseio(natural)
  if (dentro(p1, lx, lz)) {
    // a faixa junto do muro norte desce até o 2º plano (debaixo da laje do belvedere)
    const t = suave(p1.z0, p1.z0 + FAIXA, lz)
    return h2 + (h1 - h2) * t
  }
  if (dentro(p2, lx, lz)) {
    const t = suave(p2.z0, p2.z0 + FAIXA, lz)
    return h3 + (h2 - h3) * t
  }
  if (dentro(p3, lx, lz)) return h3
  // fora: volta ao natural, partindo do nível do plano mais perto
  const ds = [[distRet(p1, lx, lz), h1], [distRet(p2, lx, lz), h2], [distRet(p3, lx, lz), h3]].sort((a, b) => a[0] - b[0])
  const [d, h] = ds[0]
  const w = 1 - suave(0, BORDA, d)
  return h * w + natural(x, z) * (1 - w)
}
