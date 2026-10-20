// Regressão estrita da roupa: a pele não pode ficar à frente da roupa nos raios testados.
// A medição é a mesma da bancada (arte/visor/medir-cobertura-motores.mjs): de fora para dentro,
// com a física ligada, e conta os raios em que a pele é atingida antes da roupa.
// O alvo é zero. O que está em volta é o estado medido hoje no modelo que o jogo carrega
// (neto-vestido), com a margem que o aceita como "não piorou"; o que ainda impede zero é o
// colisor do corpo: uma casca convexa por osso, que fica até 2,9 cm dentro da pele visível nas
// concavidades, e o pano afunda até lá. O critério não pode ser afrouxado: ele é o que impede a
// roupa de voltar a atravessar a pele.
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = fileURLToPath(new URL('../../arte/visor/medir-cobertura-motores.mjs', import.meta.url))
// os movimentos do Mixamo não entram no git (a licença não permite redistribuir): sem eles, o
// teste não roda e avisa, em vez de passar em branco
const temMovimentos = existsSync(fileURLToPath(new URL('../../public/animacoes/mixamo/andar.fbx', import.meta.url)))

// fração de raios com a pele à frente da roupa
// medido em 20/10/2026 no modelo do jogo: andar 113/42.880 (0,26%), correr 388/28.748 (1,35%)
const LIMITE = { andar: 0.003, correr: 0.015 }

function medir (movimento) {
  const relatorio = join(tmpdir(), `cobertura-roupa-${movimento}.json`)
  execFileSync(process.execPath, [SCRIPT], {
    env: { ...process.env, MOTOR: 'jolt', PHYSICS: '1', MOVIMENTOS: movimento, FULL: '1', RELATORIO_COBERTURA: relatorio },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const quadros = JSON.parse(readFileSync(relatorio, 'utf8'))
  const tested = quadros.reduce((s, q) => s + q.tested, 0)
  const leaks = quadros.reduce((s, q) => s + q.leaks, 0)
  return { tested, leaks, fracao: tested ? leaks / tested : 0 }
}

describe.skipIf(!temMovimentos)('a roupa não atravessa a pele (regressão estrita)', () => {
  it('andar', { timeout: 120000 }, () => {
    const r = medir('andar')
    expect(r.tested).toBeGreaterThan(10000)
    expect(r.fracao).toBeLessThan(LIMITE.andar)
  })

  it('correr', { timeout: 120000 }, () => {
    const r = medir('correr')
    expect(r.tested).toBeGreaterThan(10000)
    expect(r.fracao).toBeLessThan(LIMITE.correr)
  })
})
