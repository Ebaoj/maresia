// Pisca (Joabe, 22/10/2026: "as casas e várias coisas ficam piscando"). Com a câmera parada e o tempo correndo, quase
// toda a cintilação medida era a borda das sombras do mapa de perto (docs/pisca-22-10.md): a grade de texels era presa
// à origem do mundo, e o sol girando 0,008° por quadro (1 h de jogo por minuto, 30 quadros por segundo) deslocava a
// grade ~0,5 m no Centro (3,5 km da origem), uma fração de texel diferente a cada quadro. Correção: a grade passa
// pelo centro alinhado do quadro anterior (sombra-luz.js, sombra-perto.js, ceu.js). Visto falhando em 4195ad2.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { PADRAO } from '../../src/config.js'
import { SombraPerto } from '../../src/render/sombra-perto.js'
import { criarCeu } from '../../src/mundo/ceu.js'

const cfgPadrao = () => JSON.parse(JSON.stringify(PADRAO))

// posição do ponto no mapa de sombra, em texels
function texelDe(luz, p, res) {
  luz.updateMatrixWorld(); luz.target.updateMatrixWorld()
  luz.shadow.camera.updateProjectionMatrix()
  luz.shadow.updateMatrices(luz)
  const v = p.clone().applyMatrix4(luz.shadow.matrix)
  return new THREE.Vector2(v.x * res, v.y * res)
}
// quanto o ponto andou na grade, sem contar passos inteiros de texel (a janela andar um texel inteiro não muda nada)
function fracao(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y
  return Math.hypot(dx - Math.round(dx), dy - Math.round(dy))
}

describe('mapa de sombra de perto com o sol andando', () => {
  it('um ponto perto do jogador no Centro anda menos de 0,2 texel por quadro na grade (antes: fração qualquer)', () => {
    const cena = new THREE.Scene()
    const sol = new THREE.DirectionalLight()
    cena.add(sol)
    const cfg = cfgPadrao()
    const res = cfg.mundo.sombraPertoResolucao
    const sp = new SombraPerto({ cena, sol, cfg })
    const centro = new THREE.Vector3(3158, 2, 1467) // a rua do Centro do vídeo
    const ponto = new THREE.Vector3(3150, 6, 1480) // uma cornija a ~15 m
    const dir = new THREE.Vector3(0.45, 0.55, -0.7).normalize()
    const eixo = new THREE.Vector3(0.2, 0.9, 0.4).normalize()
    const passo = (15 / 60 / 30) * Math.PI / 180 // 15°/h, 1 h por minuto, 30 quadros por segundo
    sp.atualizar(dir, centro)
    let antes = texelDe(sp.luz, ponto, res)
    let maior = 0
    for (let i = 0; i < 60; i++) {
      dir.applyAxisAngle(eixo, passo)
      sp.atualizar(dir, centro)
      const agora = texelDe(sp.luz, ponto, res)
      maior = Math.max(maior, fracao(agora, antes))
      antes = agora
    }
    expect(maior).toBeLessThan(0.2)
  })

  it('andando com o sol parado, a grade continua presa ao mundo (passos inteiros de texel)', () => {
    const cena = new THREE.Scene()
    const sol = new THREE.DirectionalLight()
    cena.add(sol)
    const cfg = cfgPadrao()
    const res = cfg.mundo.sombraPertoResolucao
    const sp = new SombraPerto({ cena, sol, cfg })
    const dir = new THREE.Vector3(0.45, 0.55, -0.7).normalize()
    const ponto = new THREE.Vector3(3150, 6, 1480)
    const centro = new THREE.Vector3(3158, 2, 1467)
    sp.atualizar(dir, centro)
    const t0 = texelDe(sp.luz, ponto, res)
    for (let i = 0; i < 40; i++) {
      centro.x += 0.0537; centro.z -= 0.031 // ~1,9 m/s a 30 quadros
      sp.atualizar(dir, centro)
      const t = texelDe(sp.luz, ponto, res)
      const fx = t.x - t0.x, fy = t.y - t0.y
      expect(Math.abs(fx - Math.round(fx))).toBeLessThan(1e-3)
      expect(Math.abs(fy - Math.round(fy))).toBeLessThan(1e-3)
    }
  })
})

describe('mapa de sombra de longe refeito porque o sol andou', () => {
  it('a grade nova fica a menos de 0,1 texel da anterior perto do jogador (não um salto qualquer)', () => {
    const ceu = criarCeu(new THREE.Scene())
    const cfg = cfgPadrao()
    const sol = ceu.sol
    const centro = new THREE.Vector3(3158, 0, 1497)
    const ponto = new THREE.Vector3(3150, 6, 1480)
    let hora = 15
    ceu.atualizar(hora, centro, 1 / 60, cfg)
    ceu.atualizar(hora, centro, 1 / 60, cfg) // o primeiro acerta o tamanho do mapa
    const res = sol.shadow.mapSize.x
    let antes = texelDe(sol, ponto, res)
    let maior = 0
    for (let i = 0; i < 90; i++) {
      hora += 1 / 60 / 30 // sem cache aqui: a pose segue o sol todo quadro, o pior caso
      ceu.atualizar(hora, centro, 1 / 30, cfg)
      const agora = texelDe(sol, ponto, res)
      maior = Math.max(maior, fracao(agora, antes))
      antes = agora
    }
    expect(maior).toBeLessThan(0.1)
  })
})
