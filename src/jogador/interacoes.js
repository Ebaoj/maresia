// Camada 3 da interação: ações de jogo com a tecla E.
// Não é física: é "o que está perto e na frente do personagem, e o que dá para fazer com isso".
//   - bola ou coco no chão: pegar (vira objeto cinemático preso às mãos)
//   - segurando algo: arremessar (volta a ser físico, com velocidade para a frente)
//   - banco do calçadão: sentar (WASD ou Espaço levantam)
//   - carrinho de água de coco: pedir um coco (já entrega na mão)
// Um balão de quadrinho mostra "E · ação" em cima do alvo.

import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

const ALCANCE = { pegar: 1.5, sentar: 1.7, coco: 2.3 }

export function criarInteracoes({ jogador, fisica, lugares, camera }) {
  const balao = document.createElement('div')
  balao.className = 'balao-acao'
  const tecla = document.createElement('kbd')
  tecla.textContent = 'E'
  const texto = document.createElement('span')
  balao.append(tecla, texto)
  document.getElementById('hud').appendChild(balao)

  let alvo = null
  const v = new THREE.Vector3()

  function frente() {
    return [Math.sin(jogador.yawVisual), Math.cos(jogador.yawVisual)]
  }

  function escolher() {
    const jp = jogador.pos
    if (jogador.sentado) return { tipo: 'levantar', texto: 'levantar', pos: jp }
    if (jogador.carregando) return { tipo: 'arremessar', texto: 'arremessar', pos: jp }
    const [fx, fz] = frente()
    let melhor = null
    let nota = Infinity
    const considerar = (cand, x, z, alcance) => {
      const dx = x - jp.x
      const dz = z - jp.z
      const d = Math.hypot(dx, dz)
      if (d > alcance) return
      // perto e na frente ganha
      const n = d - 0.6 * ((dx * fx + dz * fz) / Math.max(d, 1e-3))
      if (n < nota) { nota = n; melhor = cand }
    }
    for (const p of fisica.props) {
      if (p.carregado || !p.corpo.isEnabled()) continue
      const t = p.corpo.translation()
      if (Math.abs(t.y - jp.y) > 1.6) continue
      considerar({ tipo: 'pegar', prop: p, texto: p.tipo === 'bola' ? 'pegar a bola' : 'pegar o coco', pos: new THREE.Vector3(t.x, t.y, t.z) }, t.x, t.z, ALCANCE.pegar)
    }
    for (const b of lugares.bancos) considerar({ tipo: 'sentar', banco: b, texto: 'sentar', pos: new THREE.Vector3(b.x, b.y + 0.6, b.z) }, b.x, b.z, ALCANCE.sentar)
    for (const c of lugares.carrinhos) {
      if (!c.coco) continue
      considerar({ tipo: 'coco', carrinho: c, texto: 'pedir água de coco', pos: new THREE.Vector3(c.x, c.y + 1.4, c.z) }, c.x, c.z, ALCANCE.coco)
    }
    return melhor
  }

  function segurar(p) {
    p.carregado = true
    p.corpo.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
    jogador.carregando = p
  }

  function posicaoDasMaos() {
    const [fx, fz] = frente()
    const jp = jogador.pos
    return { x: jp.x + fx * 0.45, y: jp.y + 1.15 - jogador.afundado, z: jp.z + fz * 0.45 }
  }

  return {
    acao() {
      if (!alvo) return
      if (alvo.tipo === 'pegar') segurar(alvo.prop)
      else if (alvo.tipo === 'sentar') jogador.sentar(alvo.banco)
      else if (alvo.tipo === 'levantar') jogador.levantar()
      else if (alvo.tipo === 'coco') {
        const m = posicaoDasMaos()
        segurar(fisica.criarProp('coco', m.x, m.y, m.z))
      } else if (alvo.tipo === 'arremessar') {
        const p = jogador.carregando
        const [fx, fz] = frente()
        p.corpo.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
        const forca = p.tipo === 'bola' ? 9 : 7
        p.corpo.setLinvel({ x: fx * forca + jogador.vel.x * 0.5, y: 4.5, z: fz * forca + jogador.vel.z * 0.5 }, true)
        p.corpo.setAngvel({ x: fz * 6, y: 0, z: -fx * 6 }, true)
        p.carregado = false
        jogador.carregando = null
      }
    },
    atualizar() {
      // o que está segurando acompanha as mãos
      if (jogador.carregando) {
        const m = posicaoDasMaos()
        jogador.carregando.corpo.setNextKinematicTranslation(m)
      }
      alvo = escolher()
      // o corpo olha para o que dá para usar (bola, coco, banco, carrinho)
      jogador.olharPara = alvo && alvo.tipo !== 'arremessar' && alvo.tipo !== 'levantar' ? alvo.pos : null
      if (!alvo) {
        balao.classList.remove('mostrar')
        return
      }
      texto.textContent = alvo.texto
      v.copy(alvo.tipo === 'arremessar' || alvo.tipo === 'levantar' ? jogador.pos : alvo.pos)
      v.y += alvo.tipo === 'arremessar' || alvo.tipo === 'levantar' ? 2.1 : 0.5
      v.project(camera)
      if (v.z > 1) {
        balao.classList.remove('mostrar')
        return
      }
      balao.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`
      balao.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`
      balao.classList.add('mostrar')
    },
  }
}
