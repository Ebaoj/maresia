// Física leve no corpo (fase 7): molas amortecidas em vez de um motor de física. O chapéu fica preso
// na cabeça por uma mola: quando a cabeça acelera, ele atrasa e balança; o vento o empurra de leve.
// O tronco ganha um tranco quando o corpo para de repente, pousa ou bate em algo, e volta sozinho.
// (O pano de verdade, camisa e calça, entra com o Jolt quando o modelo do neto tiver roupa.)

import * as THREE from 'three'

const v = () => new THREE.Vector3()

export function criarMolas(ossos) {
  const cabeca = ossos.get('Head')
  const chapeu = ossos.get('Chapeu')
  const tronco = ossos.get('Spine1')
  const st = {
    ant: null, velAnt: v(),
    ang: new THREE.Vector2(), vang: new THREE.Vector2(), // inclinação do chapéu (para frente, para o lado)
    tranco: new THREE.Vector2(), vtranco: new THREE.Vector2(),
    t: 0,
  }
  const q = new THREE.Quaternion()
  return {
    // impulso no tronco (m/s em espaço do mundo): batida, pouso, freada
    empurrar(dx, dz, yaw) {
      const f = Math.cos(yaw) * dz + Math.sin(yaw) * dx // para frente
      const l = Math.cos(yaw) * dx - Math.sin(yaw) * dz // para o lado
      st.vtranco.x += f * 0.5 // freada de 3 m/s: o tronco vai ~10° para a frente e volta
      st.vtranco.y += l * 0.5
    },
    atualizar(DT, s) {
      if (!cabeca || DT <= 0) return
      st.t += DT
      const p = cabeca.getWorldPosition(v())
      if (!st.ant) { st.ant = p.clone(); return }
      const vel = p.clone().sub(st.ant).divideScalar(DT)
      const acel = vel.clone().sub(st.velAnt).divideScalar(DT)
      st.ant.copy(p)
      st.velAnt.copy(vel)
      // aceleração no espaço do corpo (frente e lado)
      const yaw = s.yaw
      const af = Math.sin(yaw) * acel.x + Math.cos(yaw) * acel.z
      const al = Math.cos(yaw) * acel.x - Math.sin(yaw) * acel.z
      // chapéu: mola (k) e amortecimento (c); a inércia empurra contra a aceleração; vento de rajadas
      const vento = 5 * Math.sin(st.t * 1.7) * Math.sin(st.t * 0.43 + 1) // ~3° de balanço
      const k = 90, c = 9
      // ganho 2: freada de corrida (~10 m/s²) inclina o chapéu ~13°
      st.vang.x += (-k * st.ang.x - c * st.vang.x - af * 2) * DT
      st.vang.y += (-k * st.ang.y - c * st.vang.y + al * 2 + vento) * DT
      st.ang.addScaledVector(st.vang, DT)
      st.ang.clampScalar(-0.35, 0.35)
      if (chapeu) {
        chapeu.quaternion.setFromEuler(new THREE.Euler(st.ang.x, 0, st.ang.y))
        chapeu.updateMatrixWorld(true)
      }
      // tronco: mola mais dura, aplicada por cima da pose
      const kt = 60, ct = 10
      st.vtranco.x += (-kt * st.tranco.x - ct * st.vtranco.x) * DT
      st.vtranco.y += (-kt * st.tranco.y - ct * st.vtranco.y) * DT
      st.tranco.addScaledVector(st.vtranco, DT)
      if (tronco && (Math.abs(st.tranco.x) + Math.abs(st.tranco.y)) > 1e-3) {
        const pai = tronco.parent.getWorldQuaternion(new THREE.Quaternion())
        const frente = v().set(Math.sin(yaw), 0, Math.cos(yaw))
        const lado = v().set(Math.cos(yaw), 0, -Math.sin(yaw))
        tronco.getWorldQuaternion(q)
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(lado, st.tranco.x))
        q.premultiply(new THREE.Quaternion().setFromAxisAngle(frente, -st.tranco.y))
        tronco.quaternion.copy(pai.invert().multiply(q))
        tronco.updateMatrixWorld(true)
      }
    },
  }
}
