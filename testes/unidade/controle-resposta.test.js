// Regressão (22/10/2026, docs/controle-22-10.md): o Joabe achou o controle "travado". Medido com passo fixo:
// andando, o corpo levava 0,7 s para encarar uma curva de 45° (seguia a velocidade, que já atrasa, a 3/s e só
// 12 vezes por segundo) e parar levava 0,3 s de raiz deslizando. Aqui o controle roda com um animador de
// mentira (motion matching ativo, sem clipe de giro), no meio da praia da fatia, em passos de 1/60 s.
import { describe, it, expect } from 'vitest'
import { Jogador } from '../../src/jogador/controle.js'
import { PADRAO } from '../../src/config.js'
import { FATIA } from '../../src/mundo/fatia.js'
import { alturaChao } from '../../src/mundo/colisao.js'
import * as THREE from 'three'

const DT = 1 / 60
const emb = (a) => Math.atan2(Math.sin(a), Math.cos(a))

function animadorFalso() {
  return {
    opcoes: { fps: 24, em2: true }, eventos: [], mm: {}, banco: {}, mmAtivo: true, girando: false, virarRapido: false,
    acumulado: 0,
    vaiPosar(dt) { return this.acumulado + dt >= 1 / this.opcoes.fps },
    atualizar(dt) { this.acumulado += dt; if (this.acumulado >= 1 / this.opcoes.fps) this.acumulado %= 1 / this.opcoes.fps },
    consumirGiro: () => 0,
  }
}

function montar() {
  const cfg = JSON.parse(JSON.stringify(PADRAO))
  const [x, z] = FATIA.centro
  const cena = new THREE.Scene()
  // câmera com yaw π/2: "frente" anda para -x, ao longo da praia
  const j = new Jogador(cena, cfg, new THREE.Vector3(x, alturaChao(x, z), z), -Math.PI / 2)
  j.animador = animadorFalso()
  const teclas = {}
  const rodar = (seg) => { for (let i = 0; i < Math.round(seg / DT); i++) j.update(DT, teclas, Math.PI / 2) }
  return { j, teclas, rodar, cfg }
}

describe('controle: resposta à tecla', () => {
  it('andando, o corpo encara uma curva de 90° em até 0,3 s', () => {
    const { j, teclas, rodar } = montar()
    teclas.frente = true
    rodar(2)
    const antes = j.yawVisual
    teclas.frente = false
    teclas.esquerda = true
    rodar(0.3)
    const pedido = Math.atan2(j.velDesejada.x, j.velDesejada.z)
    expect(Math.abs(emb(pedido - antes))).toBeGreaterThan(1.4) // virou mesmo 90°
    expect(Math.abs(emb(pedido - j.yawVisual))).toBeLessThan(0.26) // a menos de 15°
  })

  it('a raiz muda de direção já no primeiro quadro da tecla', () => {
    const { j, teclas, rodar } = montar()
    teclas.frente = true
    rodar(2)
    const d0 = Math.atan2(j.vel.x, j.vel.z)
    teclas.frente = false
    teclas.esquerda = true
    rodar(DT)
    expect(Math.abs(emb(Math.atan2(j.vel.x, j.vel.z) - d0))).toBeGreaterThan(0.05)
  })

  it('soltar a tecla para a raiz em até 0,2 s', () => {
    const { j, teclas, rodar } = montar()
    teclas.frente = true
    rodar(2)
    expect(j.velHoriz).toBeGreaterThan(1)
    teclas.frente = false
    rodar(0.2)
    expect(j.velHoriz).toBeLessThan(0.1)
  })
})
