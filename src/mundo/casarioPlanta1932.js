// A planta de 1932 em METROS DE VERDADE.
//
// Por que este arquivo: a geometria da planta oficial (a testada, aprofundidade
// do lote, a quina onde a testada vira) e uma coisa so, e ela existe antes do
// jogo: medir em graus nao diz nada de tamanho. O motor mediava a casa em
// unidades de jogo, e uma unidade vale um metro na Praca do Ferreira e dez no
// Campo do Urubu - o mesmo numero significava casas de tamanhos diferentes
// conforme o lugar.
//
// Aqui a planta vira metro de verdade e nada mais. A compressao do mapa (a
// transformada que leva o ponto para o jogo) entra depois, em
// src/mundo/escala1932.js: e ela que distorce as direcoes, e nao a planta.
//
// A projecao e a mesma que docs/mapa-1932-lotes.py usa: 110.574 m por grau de
// latitude e 111.320*cos(latitude) por grau de longitude (111.092 m na
// latitude de Fortaleza).

import dados from './mapa1932-lotes.json'
import { PADRAO } from '../config.js'

// metros por grau (a projecao plana local serve)
export const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180)
export const M_LAT = 110574

export const emMetros = (lon, lat) => [lon * M_LON, lat * M_LAT]
export const emLonLat = (x, z) => [x / M_LON, z / M_LAT]

// A casa nasce na largura que a planta deu. Uma testada comprida demais e um
// quarteirao, nao uma casa: ela e partida em casas menores, encostadas, para
// que a testada da rua fique cheia. A largura e em metros de verdade.
// (src/config.js, painel "Casario de 1932"; mudar pede recarregar.)
export const LARGURA_ALVO = PADRAO.casario.larguraAlvo
// a fresta entre duas casas geminadas (a parede que as separa)
export const FOLGA_PAREDE = PADRAO.casario.folgaParede

// As frentes da planta, em metros: o comeco da testada, o fim, o fundo do lote,
// a normal que aponta para a rua, a largura da testada e a profundidade do lote
// em tres pontos (inicio, meio, fim) - o fundo do lote e trapezoidal, e a casa,
// que e um retangulo, precisa caber na parte mais rasa.
export const FRENTES = dados.fachadas.map((f) => {
  const a = emMetros(f[1], f[2])
  const b = emMetros(f[3], f[4])
  const fundo = emMetros(f[5], f[6])
  const larg = Math.hypot(b[0] - a[0], b[1] - a[1])
  const ux = (b[0] - a[0]) / (larg || 1)
  const uz = (b[1] - a[1]) / (larg || 1)
  // a normal aponta para a rua: a perpendicular que fica longe do fundo do lote
  let nx = uz
  let nz = -ux
  const mx = (a[0] + b[0]) / 2
  const mz = (a[1] + b[1]) / 2
  if ((mx - fundo[0]) * nx + (mz - fundo[1]) * nz < 0) { nx = -nx; nz = -nz }
  const prof = Math.abs((mx - fundo[0]) * nx + (mz - fundo[1]) * nz)
  const profs = f.length > 9 ? [f[7], f[8], f[9]] : [prof, prof, prof]
  return {
    uso: f[0],
    a,
    b,
    fundo,
    normal: [nx, nz],
    larg,
    prof,
    profs,
  }
})

// a profundidade do lote no ponto t da testada (t = 0 no comeco do caminho da
// casa). As tres medidas da planta sao interpoladas.
function profNoPonto(f, t, invertido) {
  const u = invertido ? 1 - t : t
  const [pa, pm, pb] = f.profs
  if (u <= 0.5) return pa + (pm - pa) * (u / 0.5)
  return pm + (pb - pm) * ((u - 0.5) / 0.5)
}

// A testada partida em casas. A frente que a planta oficial desenhou e longa
// demais para uma casa so (e um quarteirao comercial inteiro), e por isso ela
// e partida em casas encostadas, cada uma com a sua fatia da testada. A fatia
// nunca atravessa a quina de um lote: onde a testada vira, a casa vira com
// ela. E o resultado: a testada da rua fica cheia, sem buraco no meio.
export function fatiasDoCaminho(caminho) {
  const fatias = []
  for (const c of caminho) {
    const comp = Math.hypot(c.para[0] - c.de[0], c.para[1] - c.de[1])
    if (comp < 0.01) continue
    const ux = (c.para[0] - c.de[0]) / comp
    const uz = (c.para[1] - c.de[1]) / comp
    // a testada do lote e partida em casas de LARGURA_ALVO: cada fatia cabe
    // dentro do lote que a planta desenhou, entao a casa nao invade o vizinho
    const n = Math.max(1, Math.round(comp / LARGURA_ALVO))
    const passo = comp / n
    const invertido = c.invertido
    for (let i = 0; i < n; i++) {
      const t0 = i / n
      const t1 = (i + 1) / n
      fatias.push({
        de: [c.de[0] + ux * passo * i, c.de[1] + uz * passo * i],
        para: [c.de[0] + ux * passo * (i + 1), c.de[1] + uz * passo * (i + 1)],
        dir: [ux, uz],
        f: c.f,
        // a casa e tao funda quanto a parte mais rasa do lote que ela ocupa
        prof: Math.min(profNoPonto(c.f, t0, invertido), profNoPonto(c.f, t1, invertido)),
      })
    }
  }
  return juntaFatiaCurta(fatias)
}

// Uma fatia curta demais (o quarto de criado, o lotinho de 3 m) nao vira casa
// sozinha: ela se junta a fatia vizinha, e as duas viram uma casa so. So se
// junta quando as duas estao coladas e na mesma direcao - uma quina no meio
// da rua nao pode virar uma casa torta.
function juntaFatiaCurta(fatias) {
  const saida = []
  for (const f of fatias) {
    const comp = Math.hypot(f.para[0] - f.de[0], f.para[1] - f.de[1])
    const anterior = saida[saida.length - 1]
    if (anterior && comp < LARGURA_ALVO * 0.6) {
      const mesmaDirecao = anterior.dir[0] * f.dir[0] + anterior.dir[1] * f.dir[1] > 0.999
      const coladas = Math.hypot(f.de[0] - anterior.para[0], f.de[1] - anterior.para[1]) < 0.6
      if (mesmaDirecao && coladas) {
        anterior.para = f.para
        if (f.prof < anterior.prof) anterior.prof = f.prof // a casa e tao funda quanto o lote mais raso
        continue
      }
    }
    saida.push(f)
  }
  return saida.filter((f) => Math.hypot(f.para[0] - f.de[0], f.para[1] - f.de[1]) > 0.4)
}
