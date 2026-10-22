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
//
// ancora (opcional, pisca 22/10/2026): a grade passa por esse ponto em vez da origem do mundo. Sem ela, quando o sol
// gira um pouco (todo quadro, no mapa de perto), a grade gira em volta da origem do mundo, e no Centro (~3,5 km dela)
// um giro de 0,008° (um quadro a 1 h de jogo por minuto) a desloca ~0,5 m, ou ~22 texels com fração qualquer: toda
// borda de sombra pulava uma fração de texel diferente a cada quadro e piscava. Com a âncora no centro do quadro
// anterior, o giro é em volta da janela e um ponto a 30 m dela anda 0,2 texel por quadro, sempre para o mesmo lado.
// Translação (o jogador andando) continua em passos inteiros de texel, como antes.
export function alinharAoTexel(centro, dirLuz, texel, saida = new THREE.Vector3(), ancora = null) {
  _frente.copy(dirLuz).negate()
  _direita.crossVectors(_frente, Math.abs(_frente.y) > 0.99 ? _X : _Y).normalize()
  _cima.crossVectors(_direita, _frente).normalize()
  const ax = ancora ? ancora.x : 0, ay = ancora ? ancora.y : 0, az = ancora ? ancora.z : 0
  const dx = centro.x - ax, dy = centro.y - ay, dz = centro.z - az
  const r = dx * _direita.x + dy * _direita.y + dz * _direita.z
  const u = dx * _cima.x + dy * _cima.y + dz * _cima.z
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
