// Câmera em terceira pessoa: arrastar gira, roda do mouse aproxima.
// Correndo, a câmera inclina um pouco e abre o ângulo, como enquadramento de gibi.

import * as THREE from 'three'
import { alturaChao } from '../mundo/colisao.js'
import { solidosCamera } from '../mundo/solidos.js'
import { clamp } from '../utils.js'

export class CameraTerceiraPessoa {
  constructor(camera, dom, cfg, yaw = 0) {
    this.camera = camera
    this.cfg = cfg
    this.yaw = yaw
    this.pitch = 0.22
    this.dist = cfg.camera.distancia
    this.alvo = new THREE.Vector3()
    this.corrida = 0
    this.iniciado = false
    this.raio = new THREE.Raycaster()
    this.subida = 0 // quanto a câmera sobe quando a rua aperta
    this._lado = new THREE.Vector3()
    this._cima = new THREE.Vector3()
    this._origem = new THREE.Vector3()

    let arrastando = false
    let ux = 0
    let uy = 0
    dom.addEventListener('pointerdown', (e) => {
      arrastando = true
      ux = e.clientX
      uy = e.clientY
      dom.setPointerCapture(e.pointerId)
      dom.classList.add('arrastando')
    })
    dom.addEventListener('pointermove', (e) => {
      if (!arrastando) return
      this.yaw -= (e.clientX - ux) * 0.006
      this.pitch = clamp(this.pitch + (e.clientY - uy) * 0.004, -0.25, 1.25)
      ux = e.clientX
      uy = e.clientY
    })
    const soltar = () => {
      arrastando = false
      dom.classList.remove('arrastando')
    }
    dom.addEventListener('pointerup', soltar)
    dom.addEventListener('pointercancel', soltar)
    dom.addEventListener('wheel', (e) => {
      e.preventDefault()
      cfg.camera.distancia = clamp(cfg.camera.distancia * (1 + e.deltaY * 0.001), 2.5, 45)
    }, { passive: false })
  }

  update(dt, pos, velHoriz, teclas) {
    const cfg = this.cfg.camera
    if (teclas.girarEsq) this.yaw += dt * 1.8
    if (teclas.girarDir) this.yaw -= dt * 1.8

    const desejado = new THREE.Vector3(pos.x, pos.y + cfg.altura, pos.z)
    if (!this.iniciado) {
      this.alvo.copy(desejado)
      this.iniciado = true
    }
    this.alvo.lerp(desejado, 1 - Math.exp(-dt * 8))
    this.dist += (cfg.distancia - this.dist) * (1 - Math.exp(-dt * 6))

    const pitch = Math.min(1.25, this.pitch + this.subida)
    const cp = Math.cos(pitch)
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp)
    // se tiver prédio entre o personagem e a câmera, a câmera chega mais perto.
    // Um feixe de 5 raios (centro e 4 lados do tamanho da lente) evita a lente raspar na quina.
    this._lado.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.35)
    this._cima.crossVectors(dir, this._lado).normalize().multiplyScalar(0.25)
    let livre = this.dist
    for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      this._origem.copy(this.alvo).addScaledVector(this._lado, a).addScaledVector(this._cima, b)
      this.raio.set(this._origem, dir)
      this.raio.far = livre
      const bate = this.raio.intersectObjects(solidosCamera, true)[0]
      if (bate) livre = Math.min(livre, bate.distance)
    }
    if (livre < this.dist) this.dist = Math.max(1.2, livre - 0.5)
    // rua apertada (câmera encurtada a menos da metade): sobe e olha por cima, devagar
    const apertado = clamp(1 - this.dist / Math.max(cfg.distancia * 0.5, 1.5), 0, 1)
    this.subida += (apertado * 0.45 - this.subida) * (1 - Math.exp(-dt * 2))
    const p = dir.multiplyScalar(this.dist).add(this.alvo)
    // parede ao lado (não entre a câmera e o personagem): afasta para o outro lado, sem pulo
    this._lado.normalize()
    let empurra = 0
    for (const s of [1, -1]) {
      this.raio.set(p, this._origem.copy(this._lado).multiplyScalar(s))
      this.raio.far = 1.4
      const bate = this.raio.intersectObjects(solidosCamera, true)[0]
      if (bate) empurra -= s * (1.4 - bate.distance)
    }
    this.empurrao = (this.empurrao || 0) + (empurra - (this.empurrao || 0)) * (1 - Math.exp(-dt * 5))
    p.addScaledVector(this._lado, this.empurrao)
    p.y = Math.max(p.y, alturaChao(p.x, p.z) + 0.7, 0.6)
    this.camera.position.copy(p)
    this.camera.lookAt(this.alvo)

    const corrida = clamp((velHoriz - 5) / 4, 0, 1)
    this.corrida += (corrida - this.corrida) * (1 - Math.exp(-dt * 4))
    this.camera.rotateZ(cfg.inclinacaoCorrida * this.corrida)
    const fov = cfg.fov + this.corrida * 7
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov
      this.camera.updateProjectionMatrix()
    }
  }
}
