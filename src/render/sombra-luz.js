// Contas da câmera de sombra do sol, puras (sem GPU), usadas pelo mapa de longe (ceu.js) e pelo de perto
// (sombra-perto.js) e testadas em testes/unidade/sombra-luz.test.js.
import * as THREE from 'three'

const _frente = new THREE.Vector3()
const _direita = new THREE.Vector3()
const _cima = new THREE.Vector3()
const _X = new THREE.Vector3(1, 0, 0)
const _Y = new THREE.Vector3(0, 1, 0)

// Centro da janela de sombra preso à grade de texels do mapa, medida no plano da luz (a mesma base da câmera
// de sombra do three: lookAt com o "cima" (0, 1, 0)). Com o centro andando em passos de um texel, a borda das
// sombras não "ferve" quando o jogador anda ou gira a câmera.
export function alinharAoTexel(centro, dirLuz, texel, saida = new THREE.Vector3()) {
  _frente.copy(dirLuz).negate()
  _direita.crossVectors(_frente, Math.abs(_frente.y) > 0.99 ? _X : _Y).normalize()
  _cima.crossVectors(_direita, _frente).normalize()
  const r = centro.dot(_direita)
  const u = centro.dot(_cima)
  return saida.copy(centro)
    .addScaledVector(_direita, Math.round(r / texel) * texel - r)
    .addScaledVector(_cima, Math.round(u / texel) * texel - u)
}

// O bias do three é em profundidade normalizada (0 a 1 entre near e far). Aqui ele vem em metros: o -0,0006 de
// antes, com o far de 1.441 m, eram 0,86 m, e a perna de quem estava em pé não fazia sombra (a sombra
// descolava do pé, e ao meio-dia quase sumia).
export function viesNormalizado(viesM, near, far) {
  return -Math.max(0, viesM) / Math.max(1e-6, far - near)
}

// Tamanho de um texel do mapa no plano da luz, em metros.
export const texelM = (largura, resolucao) => largura / resolucao

// Quanto o texel se estica no chão na direção do sol (sol baixo = texel comprido): 1 / seno da altura.
export const esticaNoChao = (dirLuz) => 1 / Math.max(0.05, Math.abs(dirLuz.y) / (Math.hypot(dirLuz.x, dirLuz.y, dirLuz.z) || 1))
