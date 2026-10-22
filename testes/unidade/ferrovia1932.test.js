// A via férrea de 1932 (src/mundo/ferrovia1932.js, traçado da Planta de 1931-1932).
//
// Pega o bug que o Joabe viu em a764f60: "a linha do trem não faz sentido: começa no meio das casas e passa por
// dentro de outras". O dado era um esquema de retas (mapa1932-dados.json, "trilhos"): o ramal do porto saía da
// Estação para SUDESTE, atravessava o Centro e acabava no meio das quadras, a 1 km da Ponte Metálica; e o jogo
// desenhava dois trilhos de 200 m em reta da Estação para oeste, por cima das casas. Correção: commit "Via férrea
// de 1932 no traçado da planta, com o leito livre de casas".
import { describe, it, expect, beforeAll } from 'vitest'
import { TRILHOS } from '../../src/mundo/mapa1932.js'
import { ll } from '../../src/mundo/fortaleza1932.js'
import { FACHADAS } from '../../src/mundo/casario1932.js'

const M_LON = 111320 * Math.cos((-3.72 * Math.PI) / 180)
const M_LAT = 110574
const metros = (a, b) => Math.hypot((a[0] - b[0]) * M_LON, (a[1] - b[1]) * M_LAT)

// o ponto (do jogo) está dentro do retângulo de uma casa da planta? (grade de 40 un para ir depressa)
const CEL = 40
const grade = new Map()
for (const f of FACHADAS) {
  const k = `${Math.floor(f.x / CEL)},${Math.floor(f.z / CEL)}`
  if (!grade.has(k)) grade.set(k, [])
  grade.get(k).push(f)
}
function dentroDeCasa(x, z, folga = 0, casas = null) {
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      for (const f of grade.get(`${Math.floor(x / CEL) + i},${Math.floor(z / CEL) + j}`) || []) {
        if (casas && !casas.has(f)) continue
        const c = Math.cos(f.rot)
        const s = Math.sin(f.rot)
        const dx = x - f.x
        const dz = z - f.z
        const lx = dx * c - dz * s
        const lz = dx * s + dz * c
        if (Math.abs(lx) < f.w / 2 + folga && Math.abs(lz) < f.d / 2 + folga) return true
      }
    }
  }
  return false
}
// a fração do comprimento de uma linha (lon/lat) que passa por dentro das casas da planta de 1932
function fracaoEmCasas(traco) {
  let dentro = 0
  let total = 0
  for (let i = 0; i < traco.length - 1; i++) {
    const n = Math.max(1, Math.ceil(Math.hypot(traco[i + 1][0] - traco[i][0], traco[i + 1][1] - traco[i][1]) / 2))
    for (let k = 0; k < n; k++) {
      const x = traco[i][0] + ((traco[i + 1][0] - traco[i][0]) * (k + 0.5)) / n
      const z = traco[i][1] + ((traco[i + 1][1] - traco[i][1]) * (k + 0.5)) / n
      total++
      if (dentroDeCasa(x, z)) dentro++
    }
  }
  return dentro / total
}

describe('a via férrea de 1932', () => {
  it('o ramal do porto vai da Estação pela praia até a Ponte Metálica, e não pelo meio do Centro', () => {
    const porto = TRILHOS.find((t) => /^(Ramal do Porto \(|Ligação da EFB ao trapiche)/.test(t.nome))
    expect(porto).toBeTruthy()
    const [ex, ez] = ll(-38.5302, -3.7219) // a Estação
    const [px, pz] = ll(-38.5200, -3.7166) // a raiz da Ponte Metálica (a Ponte Velha)
    const ini = porto.traco[0]
    expect(Math.hypot(ini[0] - ex, ini[1] - ez), 'o ramal sai da Estação').toBeLessThan(250)
    // o ramo da ponte sai do fim do ramal e vai até o meio do viaduto, mar adentro
    const ponte = TRILHOS.find((t) => /ramo da Ponte Met/i.test(t.nome))
    expect(ponte).toBeTruthy()
    const fimRamal = porto.traco[porto.traco.length - 1]
    expect(Math.hypot(ponte.traco[0][0] - fimRamal[0], ponte.traco[0][1] - fimRamal[1]), 'o ramo da ponte sai do ramal').toBeLessThan(5)
    const fim = ponte.traco[ponte.traco.length - 1]
    expect(Math.hypot(fim[0] - px, fim[1] - pz), 'o ramal chega à Ponte Metálica').toBeLessThan(100)
    // e não atravessa as quadras do Centro: menos de 10% do comprimento por dentro das casas da planta
    expect(fracaoEmCasas(porto.traco), 'o ramal do porto por dentro das casas').toBeLessThan(0.1)
  })

  it('as linhas de tráfego (tronco, Norte e Sul) quase não passam por dentro de casas da planta', () => {
    for (const t of TRILHOS) {
      if (!/Tronco|Linha Sul|Linha Norte|Baturit/i.test(t.nome)) continue
      // o tronco encosta nos lotes a oeste da Estação (a planta põe a fileira de lotes 40-50 m ao norte de
      // onde está a linha: erro da georreferência na costa, ferrovia1932.json, verificacao_lotes); o leito tira
      // essas casas (o teste de baixo)
      expect(fracaoEmCasas(t.traco), t.nome).toBeLessThan(0.15)
    }
  })

  describe('no jogo', () => {
    let LINHAS, desenhavel, casas, alturaTerreno
    beforeAll(async () => {
      ;({ LINHAS_FERREAS: LINHAS, desenhavel } = await import('../../src/mundo/ferrovia1932.js'))
      const { lugarRecusado } = await import('../../src/mundo/cidade.js')
      const terreno = await import('../../src/mundo/terreno.js')
      terreno.calcularAlturas()
      alturaTerreno = terreno.alturaTerreno
      casas = new Set(FACHADAS.filter((f) => !lugarRecusado(f)))
    })
    it('nenhuma casa que a cidade mantém fica em cima do trilho desenhado', () => {
      let pontos = 0
      let emCasa = 0
      for (const l of LINHAS) {
        for (const [x, z] of l.pontos) {
          if (!desenhavel(x, z, alturaTerreno)) continue
          pontos++
          // o lastro tem 2,6 m: a casa não pode chegar a menos de 1,3 m do eixo
          if (dentroDeCasa(x, z, 1.3, casas)) emCasa++
        }
      }
      expect(pontos).toBeGreaterThan(3000)
      expect(emCasa).toBe(0)
    })
    it('toda linha começa no pátio da Estação ou em cima da linha de onde sai', () => {
      const [ex, ez] = ll(-38.5302, -3.7219)
      for (const l of LINHAS) {
        const [x, z] = l.pontos[0]
        const naEstacao = Math.hypot(x - ex, z - ez) < 250
        let naMae = false
        for (const m of LINHAS) {
          if (m === l) continue
          for (const p of m.pontos) if (Math.hypot(p[0] - x, p[1] - z) < 5) { naMae = true; break }
          if (naMae) break
        }
        expect(naEstacao || naMae, l.id).toBe(true)
      }
    })
  })
})
