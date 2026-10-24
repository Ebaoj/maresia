// Camada 3 da interação: ações de jogo com a tecla E.
// Não é física: é "o que está perto e na frente do personagem, e o que dá para fazer com isso".
//   - bola ou coco no chão: pegar (vira objeto cinemático preso às mãos)
//   - segurando algo: arremessar (volta a ser físico, com velocidade para a frente)
//   - banco do calçadão: sentar (WASD ou Espaço levantam)
//   - carrinho de água de coco: pedir um coco (já entrega na mão)
// Um balão de quadrinho mostra "E · ação" em cima do alvo.
//
// 24/10/2026: nada aqui aloca por quadro. A escolha do alvo (que roda em todo quadro, sobre todas as bolas, os
// bancos e os carrinhos) usava um objeto e um Vector3 novos para cada candidato; agora o melhor é guardado em
// campos e o objeto de resposta é reaproveitado.

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

  // a resposta da escolha: o mesmo objeto, reescrito a cada quadro (ninguém guarda o anterior)
  const alvo = { tipo: '', prop: null, banco: null, carrinho: null, texto: '', pos: new THREE.Vector3() }
  let temAlvo = false
  const v = new THREE.Vector3()
  // a frente do corpo, sem array novo a cada quadro
  let frenteX = 0
  let frenteZ = 0
  // as mãos: o mesmo objeto, reescrito a cada quadro
  const maos = { x: 0, y: 0, z: 0 }
  // o melhor candidato (antes de virar o objeto de resposta)
  const melhor = { tipo: '', prop: null, banco: null, carrinho: null, texto: '', x: 0, y: 0, z: 0, nota: Infinity }

  function calcularFrente() {
    frenteX = Math.sin(jogador.yawVisual)
    frenteZ = Math.cos(jogador.yawVisual)
  }

  function escolher() {
    const jp = jogador.pos
    if (jogador.sentado || jogador.carregando) {
      // sentado ou segurando: a ação é do próprio jogador (o alvo fica em cima dele)
      melhor.tipo = jogador.sentado ? 'levantar' : 'arremessar'
      melhor.texto = melhor.tipo
      melhor.prop = null
      melhor.banco = null
      melhor.carrinho = null
      melhor.x = jp.x
      melhor.y = jp.y
      melhor.z = jp.z
      return melhor
    }
    calcularFrente()
    let nota = Infinity
    let achou = false
    const considerar = (tipo, x, z, alcance, texto, prop = null, banco = null, carrinho = null, py = null) => {
      const dx = x - jp.x
      const dz = z - jp.z
      const d = Math.hypot(dx, dz)
      if (d > alcance) return
      // perto e na frente ganha
      const n = d - 0.6 * ((dx * frenteX + dz * frenteZ) / Math.max(d, 1e-3))
      if (n < nota) {
        nota = n
        achou = true
        melhor.tipo = tipo
        melhor.prop = prop
        melhor.banco = banco
        melhor.carrinho = carrinho
        melhor.texto = texto
        melhor.x = x
        melhor.y = py ?? 0
        melhor.z = z
      }
    }
    for (const p of fisica.props) {
      if (p.carregado || !p.corpo.isEnabled()) continue
      const t = p.corpo.translation()
      if (Math.abs(t.y - jp.y) > 1.6) continue
      considerar('pegar', t.x, t.z, ALCANCE.pegar, p.tipo === 'bola' ? 'pegar a bola' : 'pegar o coco', p, null, null, t.y)
    }
    for (const b of lugares.bancos) considerar('sentar', b.x, b.z, ALCANCE.sentar, 'sentar', null, b, null, b.y + 0.6)
    for (const c of lugares.carrinhos) {
      if (!c.coco) continue
      considerar('coco', c.x, c.z, ALCANCE.coco, 'pedir água de coco', null, null, c, c.y + 1.4)
    }
    if (!achou) return null
    return melhor
  }

  function segurar(p) {
    p.carregado = true
    p.corpo.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
    jogador.carregando = p
  }

  // junto da barriga, de cotovelo dobrado (antes ficava a 45 cm, na altura do peito: braço de bandeja)
  function posicaoDasMaos() {
    calcularFrente()
    let fx = frenteX
    let fz = frenteZ
    const jp = jogador.pos
    let cx = jp.x, cz = jp.z
    // segurando: na frente do quadril de verdade (o animador mede depois de montar a pose)
    const an = jogador.animador
    if (jogador.carregando && an?.frenteCorpo) {
      fx = an.frenteCorpo.x; fz = an.frenteCorpo.z
      cx = an.centroCorpo.x; cz = an.centroCorpo.z
    }
    const bola = jogador.carregando?.tipo === 'bola'
    const longe = bola ? 0.3 : 0.22
    maos.x = cx + fx * longe
    maos.y = jp.y + (bola ? 1.02 : 0.98) - jogador.afundado
    maos.z = cz + fz * longe
    return maos
  }

  return {
    acao() {
      if (!temAlvo) return
      if (alvo.tipo === 'pegar') segurar(alvo.prop)
      else if (alvo.tipo === 'sentar') jogador.sentar(alvo.banco)
      else if (alvo.tipo === 'levantar') jogador.levantar()
      else if (alvo.tipo === 'coco') {
        const m = posicaoDasMaos()
        segurar(fisica.criarProp('coco', m.x, m.y, m.z))
      } else if (alvo.tipo === 'arremessar') {
        const p = jogador.carregando
        calcularFrente()
        const fx = frenteX
        const fz = frenteZ
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
      const escolhido = escolher()
      temAlvo = !!escolhido
      if (escolhido) {
        alvo.tipo = escolhido.tipo
        alvo.prop = escolhido.prop
        alvo.banco = escolhido.banco
        alvo.carrinho = escolhido.carrinho
        alvo.texto = escolhido.texto
        alvo.pos.set(escolhido.x, escolhido.y, escolhido.z)
      }
      // o corpo olha para o que dá para usar (bola, coco, banco, carrinho)
      jogador.olharPara = temAlvo && alvo.tipo !== 'arremessar' && alvo.tipo !== 'levantar' ? alvo.pos : null
      if (!temAlvo) {
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
