// Os marcos do centro de 1932 (src/mundo/marcos1932/): o chão de cada marco fica livre de casa e o plano da
// Praça do Ferreira reformada cabe dentro do contorno da praça de 1932.
// Pega: casa do casario nascendo dentro do Excelsior, dos cinemas, da Praça dos Leões ou do Mercado de Ferro
// (a cidade só pulava os círculos de LUGARES_RESERVADOS, e a plataforma dos Leões é maior que o círculo dela).
import { describe, it, expect } from 'vitest'
import { PEGADAS, dentroDeMarco, casaNoMarco } from '../../src/mundo/marcos1932/pegadas.js'
import { paraGrade } from '../../src/mundo/marcos1932/grade.js'
import { FACHADAS } from '../../src/mundo/casario1932.js'
import { planoDaPraca } from '../../src/mundo/marcos1932/praca-reforma.js'
import { CENTRO, dentroDaPraca } from '../../src/mundo/praca1932.js'
import { naGrade } from '../../src/mundo/marcos1932/grade.js'
import { VISTAS } from '../../src/mundo/marcos1932/vistas.js'

// conferência independente: amostra a casa em pontos e pergunta a cada pegada se o ponto está dentro
function casaToca(f, p) {
  if (Math.hypot(f.x - p.x, f.z - p.z) > Math.hypot(f.w, f.d) / 2 + Math.hypot(p.hu, p.hv)) return false
  const c = Math.cos(f.rot)
  const s = Math.sin(f.rot)
  for (let a = -1; a <= 1; a += 0.1) {
    for (let b = -1; b <= 1; b += 0.1) {
      const lx = (a * f.w) / 2
      const lz = (b * f.d) / 2
      const [u, v] = paraGrade([p.x, p.z], f.x + lx * c + lz * s, f.z - lx * s + lz * c)
      if (Math.abs(u) <= p.hu && Math.abs(v) <= p.hv) return true
    }
  }
  return false
}

describe('marcos de 1932: o chão de cada marco', () => {
  it('o centro de cada pegada está dentro dela, e longe dela não', () => {
    for (const p of PEGADAS) expect([p.chave, !!dentroDeMarco(p.x, p.z)]).toEqual([p.chave, true])
    expect(dentroDeMarco(-900, -300)).toBe(null)
  })

  it('nenhuma casa que a cidade aceita encosta no chão de um marco', () => {
    let pulam = 0
    for (const f of FACHADAS) {
      if (casaNoMarco(f.x, f.z, f.w, f.d, f.rot)) { pulam++; continue }
      for (const p of PEGADAS) expect([p.chave, casaToca(f, p)]).toEqual([p.chave, false])
    }
    // a planta de 1932 tem casas nos lotes dos Leões e da Praça Carolina: o teste não pode passar vazio
    expect(pulam).toBeGreaterThan(0)
  })

  it('o Excelsior tem o tamanho do OSM (49 x 16 m), não o do conceito "palaciano"', () => {
    const e = PEGADAS.find((p) => p.chave === 'excelsior')
    expect([e.hu * 2, e.hv * 2]).toEqual([49, 16])
  })
})

describe('Praça do Ferreira reformada: o plano cabe na praça de 1932', () => {
  const plano = planoDaPraca()
  const na = (u, v) => dentroDaPraca(...naGrade(CENTRO, u, v))
  it('canteiros, lampiões, bancos e árvores dentro do contorno', () => {
    expect(plano.canteiros.length).toBeGreaterThanOrEqual(6)
    for (const c of plano.canteiros) for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) expect(na(c.u + a * c.hu, c.v + b * c.hv)).toBe(true)
    for (const [u, v] of [...plano.lamp1, ...plano.lamp3]) expect(na(u, v)).toBe(true)
    for (const b of plano.bancos) expect(na(b.u, b.v)).toBe(true)
    for (const a of plano.arvores) expect(na(a.u, a.v)).toBe(true)
  })
  it('nada em cima da roda da coluna nem do eixo', () => {
    for (const c of plano.canteiros) expect(Math.abs(c.u) - c.hu).toBeGreaterThan(7)
    for (const a of plano.arvores) expect(Math.hypot(a.u, a.v)).toBeGreaterThan(10)
  })
  it('as vistas do Ir para olham para o marco', () => {
    for (const [k, v] of Object.entries(VISTAS)) {
      // a câmera fica em (sin yaw, cos yaw) atrás do jogador; o olhar vai para o lado contrário, em direção ao alvo
      const olhar = [-Math.sin(v.yaw), -Math.cos(v.yaw)]
      const ate = [v.alvo[0] - v.x, v.alvo[1] - v.z]
      const n = Math.hypot(...ate)
      expect([k, +((olhar[0] * ate[0] + olhar[1] * ate[1]) / n).toFixed(3)]).toEqual([k, 1])
    }
  })
})

describe('a cidade pula o chão dos marcos', () => {
  it('nenhuma fachada que a cidade aceita (cidade.js, lugarRecusado) encosta num marco', async () => {
    const { lugarRecusado } = await import('../../src/mundo/cidade.js')
    const invasoras = []
    for (const f of FACHADAS) {
      if (lugarRecusado(f)) continue
      for (const p of PEGADAS) if (casaToca(f, p)) invasoras.push(p.chave)
    }
    expect(invasoras).toEqual([])
  }, 30000)
})
