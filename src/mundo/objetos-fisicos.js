// Geometrias e propriedades dos objetos do Maresia, compartilhadas com o laboratório.
import * as THREE from 'three'

export const OBJETOS_FISICOS = {
 bola: {raio:.22,densidade:.25,restituicao:.5,atrito:.6,amortecimentoAngular:.3},
 coco: {raio:.11,densidade:1.1,restituicao:.15,atrito:.9,amortecimentoAngular:1.5},
}
export const massaObjeto = tipo => {const o=OBJETOS_FISICOS[tipo];return 4*Math.PI*o.raio**3/3*o.densidade}

export function geometriaBola() {
  // bola de couro de 1932 (a bola de praia de plástico colorido é anacronismo): gomos em dois tons
  const g = new THREE.SphereGeometry(0.22, 16, 12).toNonIndexed()
  const pos = g.attributes.position
  const cores = ['#8a5a3c', '#7a4e33', '#8a5a3c', '#7a4e33', '#8a5a3c', '#7a4e33']
  const c = new THREE.Color()
  const arr = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 3) {
    const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3
    const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
    const cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3
    const gomo = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 6) % 6
    c.set(Math.abs(cy) > 0.19 ? '#6b4430' : cores[gomo])
    for (let k = 0; k < 3; k++) { arr[(i + k) * 3] = c.r; arr[(i + k) * 3 + 1] = c.g; arr[(i + k) * 3 + 2] = c.b }
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  g.deleteAttribute('uv')
  return g
}

export function geometriaCoco() {
  const g = new THREE.SphereGeometry(0.11, 10, 8).scale(1, 1.15, 1).toNonIndexed() // coco verde: ~22 cm de largura
  const pos = g.attributes.position
  const arr = new Float32Array(pos.count * 3)
  const verde = new THREE.Color('#6f9a2a')
  const marrom = new THREE.Color('#7a5230')
  for (let i = 0; i < pos.count; i++) {
    const c = pos.getY(i) > 0.08 ? marrom : verde
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  g.deleteAttribute('uv')
  return g
}

