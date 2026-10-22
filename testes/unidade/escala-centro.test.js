// A escala do centro histórico inteiro em 1:1 (decisão do Joabe, 21-22/10/2026; docs/mapa-1932.md v16).
//
// Pega o bug que o Joabe viu jogando a764f60: "a linha do trem não faz sentido, as ruas desproporcionais,
// quarteirão onde não devia". A causa era a escala SEPARÁVEL (u e v do quadro da grade, cada um com a sua
// curva): cada zona 1:1 (a Praça do Ferreira, o Campo do Urubu) virava uma faixa que cruzava o mapa inteiro,
// e dentro da faixa a mesma rua ficava até 3 vezes mais larga que fora (a anisotropia de uma fachada longe das
// zonas chegava a 9). Correção: o campo de deslocamento contínuo (docs/mapa-1932-escala.py,
// src/mundo/quadroGrade1932.js), commit "Escala: o centro histórico e o Campo do Urubu em 1:1, sem faixas".
//
// Tudo aqui é medido por diferença finita de ll(), para o teste rodar igual no código de antes (onde ele falha
// nos itens b, c e e: a764f60).
import { describe, it, expect } from 'vitest'
import { ll, llInverso, geoDe, gradeDe, LIMITES, LUGARES } from '../../src/mundo/fortaleza1932.js'
import lotes from '../../src/mundo/mapa1932-lotes.json'

const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180)
const M_LAT = 110574

// a derivada da transformada num lugar: o passo do jogo para 5 m a leste e 5 m ao norte
function jac(lon, lat, h = 5) {
  const p = ll(lon, lat)
  const e = ll(lon + h / M_LON, lat)
  const n = ll(lon, lat + h / M_LAT)
  return [[(e[0] - p[0]) / h, (n[0] - p[0]) / h], [(e[1] - p[1]) / h, (n[1] - p[1]) / h]]
}
// as duas escalas principais (valores singulares) de J
function escalas(J) {
  const [[a, b], [c, d]] = J
  const s1 = a * a + b * b + c * c + d * d
  const det = Math.abs(a * d - b * c)
  const r = Math.sqrt(Math.max(0, s1 * s1 - 4 * det * det))
  return [Math.sqrt((s1 + r) / 2), Math.sqrt(Math.max(0, (s1 - r) / 2))]
}
const det = ([[a, b], [c, d]]) => a * d - b * c

// as zonas 1:1, no quadro da grade (as mesmas de docs/mapa-1932-escala.py): o "estádio" do centro (o círculo de
// 1 km em volta da praça e a caixa do lado do mar, até a cabeça da Ponte Metálica) e o Campo do Urubu
const naZonaCentro = (u, v) => Math.hypot(u, v) <= 1000 || (u >= -1000 && u <= 1000 && v >= 0 && v <= 1650)
// O campo mudou de lugar em 22/10/2026 (decisão do orquestrador, docs/mapa-1932.md v17: o polígono caía em cima do
// recinto das Oficinas da RVC da planta de 1931-1932): a zona passou da caixa [-5420, -4230, -910, 150] para o campo
// a leste das oficinas e o recinto delas (as mesmas caixas de docs/mapa-1932-escala.py). A afirmação é a mesma
const CAIXAS_CAMPO = [[-4620, -3240, -260, 740], [-5100, -4350, -280, 120]]
const naZonaCampo = (u, v) => CAIXAS_CAMPO.some(([a, b, c, d]) => u >= a && u <= b && v >= c && v <= d)
const naZona = (lon, lat) => { const [u, v] = gradeDe(lon, lat); return naZonaCentro(u, v) || naZonaCampo(u, v) }

// os marcos que a decisão pôs em 1:1 (LUGARES, src/mundo/fortaleza1932.js) e os lugares do campo
const MARCOS = ['pracaFerreira', 'excelsior', 'pracaLeoes', 'mercadoFerro', 'se', 'estacao', 'pracaEstacao',
  'passeioPublico', 'pracaMestres', 'santaCasa', 'theatro', 'pocoDraga', 'ponteVelha', 'forte', 'mercado']
const CAMPO = ['campoUrubu', 'oficinasUrubu', 'vilaFerroviaria']

describe('a escala do centro histórico em 1:1', () => {
  it('(a) dentro de cada zona 1:1 a escala é 1,00 ± 0,05 nos dois eixos, sem giro', () => {
    let n = 0
    for (let u = -1600; u <= 1600; u += 50) {
      for (let v = -1100; v <= 1700; v += 50) {
        if (!naZonaCentro(u, v)) continue
        const [s1, s2] = escalas(jac(...geoDe(u, v)))
        expect(s1, `escala em (${u}, ${v})`).toBeLessThan(1.05)
        expect(s2, `escala em (${u}, ${v})`).toBeGreaterThan(0.95)
        n++
      }
    }
    for (let u = -5100; u <= -3240; u += 50) {
      for (let v = -280; v <= 740; v += 50) {
        if (!naZonaCampo(u, v)) continue
        const [s1, s2] = escalas(jac(...geoDe(u, v)))
        expect(s1).toBeLessThan(1.05)
        expect(s2).toBeGreaterThan(0.95)
        n++
      }
    }
    expect(n).toBeGreaterThan(2000)
    // e cada marco da decisão está dentro de uma zona, e o norte de verdade é o -z do jogo (sem giro)
    for (const k of [...MARCOS, ...CAMPO]) {
      expect(naZona(...LUGARES[k]), k).toBe(true)
      const J = jac(...LUGARES[k])
      expect(J[0][0], k).toBeCloseTo(1, 1)
      expect(J[1][1], k).toBeCloseTo(-1, 1)
      expect(Math.abs(J[0][1]) + Math.abs(J[1][0]), k).toBeLessThan(0.05)
    }
  })

  it('(b) sem faixas: longe das zonas, a escala de uma fachada não depende de ela estar alinhada com uma zona', () => {
    // a anisotropia (a escala na direção que mais estica sobre a que menos estica) em cada fachada de 1932
    // fora das zonas. Com as faixas, a fachada dentro da faixa do centro e longe dele era 1:1 numa direção e
    // comprimida ~9 vezes na outra
    const an = []
    for (const f of lotes.fachadas) {
      const lon = (f[1] + f[3]) / 2
      const lat = (f[2] + f[4]) / 2
      if (naZona(lon, lat)) continue
      const [s1, s2] = escalas(jac(lon, lat))
      an.push(s1 / s2)
    }
    an.sort((a, b) => a - b)
    expect(an.length).toBeGreaterThan(5000)
    expect(an[Math.floor(an.length * 0.99)], 'anisotropia p99 das fachadas').toBeLessThan(1.7)
    expect(an[an.length - 1], 'a pior fachada').toBeLessThan(2.5)
    // os pontos que as faixas de antes cruzavam: o sul do centro (na faixa de u da praça), Jacarecanga (na
    // faixa de v do campo), o leste do centro (na faixa de v da praça). Antes: 8,8, 4,5 e 5,0 (o primeiro é
    // areal ao sul do Benfica, onde a distorção pode ir; o teto é 3)
    for (const [u, v] of [[0, -2000], [-1500, -400], [1500, 0]]) {
      const [s1, s2] = escalas(jac(...geoDe(u, v)))
      expect(s1 / s2, `anisotropia em (${u}, ${v})`).toBeLessThan(3)
    }
  })

  it('(c) as ruas do centro ficam retas e com as larguras de verdade', () => {
    // todo par de pontos do centro: a distância no jogo é a de verdade (0,5%), então a reta continua reta e a
    // largura de uma rua é a da planta
    const pts = []
    for (let u = -1000; u <= 1000; u += 150) for (let v = -1000; v <= 1650; v += 150) if (naZonaCentro(u, v)) pts.push(geoDe(u, v))
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j += 3) {
        const a = ll(...pts[i])
        const b = ll(...pts[j])
        const jogo = Math.hypot(a[0] - b[0], a[1] - b[1])
        const real = Math.hypot((pts[i][0] - pts[j][0]) * M_LON, (pts[i][1] - pts[j][1]) * M_LAT)
        expect(Math.abs(jogo / real - 1), `par ${i}, ${j}`).toBeLessThan(0.005)
      }
    }
    // e cada testada de 1932 dentro do centro tem no jogo o comprimento da planta (1%)
    let n = 0
    for (const f of lotes.fachadas) {
      if (!naZona(f[1], f[2]) || !naZona(f[3], f[4])) continue
      const [u] = gradeDe(f[1], f[2])
      if (u < -4000) continue
      const a = ll(f[1], f[2])
      const b = ll(f[3], f[4])
      const real = Math.hypot((f[3] - f[1]) * M_LON, (f[4] - f[2]) * M_LAT)
      if (real < 3) continue
      expect(Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1]) / real - 1)).toBeLessThan(0.01)
      n++
    }
    expect(n).toBeGreaterThan(2000)
  })

  it('(d) a transição é suave: o mapa não dobra, a volta é exata e a escala não dá degrau', () => {
    // o sinal da derivada é o mesmo na caixa inteira do mapa (o z do jogo cresce para o sul: det < 0)
    let positivos = 0
    let n = 0
    for (let lon = -38.61; lon <= -38.441; lon += 0.001) {
      for (let lat = -3.769; lat <= -3.689; lat += 0.001) {
        if (det(jac(lon, lat, 2)) >= 0) positivos++
        n++
      }
    }
    expect(n).toBeGreaterThan(10000)
    expect(positivos, 'pontos com o mapa dobrado').toBe(0)
    // a volta: ll(llInverso(p)) = p no mundo da caixa do mapa (a transformada é uma bijeção)
    for (let x = 30; x < LIMITES.x1 - 30; x += 97) {
      for (let z = 30; z < LIMITES.z1 - 30; z += 89) {
        const [lon, lat] = llInverso(x, z)
        if (lon < -38.612 || lon > -38.44 || lat < -3.77 || lat > -3.688) continue
        const [x2, z2] = ll(lon, lat)
        expect(Math.hypot(x2 - x, z2 - z), `volta em (${x}, ${z})`).toBeLessThan(0.5)
      }
    }
    // a escala nunca muda mais de 5% entre dois pontos a 20 m um do outro nas fachadas (sem degrau)
    for (let k = 0; k < lotes.fachadas.length; k += 7) {
      const f = lotes.fachadas[k]
      const [s1] = escalas(jac(f[1], f[2]))
      const [s1b] = escalas(jac(f[1] + 20 / M_LON, f[2]))
      expect(Math.abs(s1b / s1 - 1), `degrau na fachada ${k}`).toBeLessThan(0.05)
    }
  })

  it('(e) a caminhada do campo ao centro continua parecida com a de antes', () => {
    // do portão do campo à borda oeste do centro histórico (u = -1000, o Theatro e Moura Brasil): 1.014 un em
    // a764f60. O centro agora é de verdade (da borda à praça são 1.000 m), mas o caminho até ele não pode
    // crescer mais que 15%. O portão mudou de lugar com o campo em 22/10/2026 (docs/mapa-1932.md v17; antes
    // -38.5657, -3.7154): é o meio do lado do portão do polígono (urubu-planta.js)
    const portao = ll(-38.556355, -3.715663)
    const borda = ll(...geoDe(-1000, -20))
    const d = Math.hypot(portao[0] - borda[0], portao[1] - borda[1])
    expect(d).toBeLessThan(1014 * 1.15)
  })
})
