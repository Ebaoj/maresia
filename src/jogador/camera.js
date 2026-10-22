// Câmera em terceira pessoa: arrastar gira, roda do mouse aproxima.
// Correndo, a câmera inclina um pouco e abre o ângulo, como enquadramento de gibi.

import * as THREE from 'three'
import { alturaChao } from '../mundo/colisao.js'
import { prepararSolidos, solidosAoAlcance } from '../mundo/solidos.js'
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
    this.raio.firstHitOnly = true // só a batida mais perto conta (a BVH para no primeiro triângulo dela)
    this._dir = new THREE.Vector3()
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

    // se tiver prédio entre o personagem e a câmera, a câmera chega mais perto.
    // Um feixe de 5 raios (centro e 4 lados do tamanho da lente) evita a lente raspar na quina.
    prepararSolidos()
    // só os sólidos ao alcance dos raios deste quadro: os do feixe (até a distância da câmera, saindo a menos de
    // 0,5 m do alvo) e os dois do lado (1,4 m a partir da câmera)
    const solidos = solidosAoAlcance(this.alvo, cfg.distancia + 2.5, this._solidos ||= [])
    const livreEm = (pitch) => {
      const cp = Math.cos(pitch)
      const dir = this._dir.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp)
      this._lado.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).multiplyScalar(0.35)
      this._cima.crossVectors(dir, this._lado).normalize().multiplyScalar(0.25)
      let livre = cfg.distancia
      for (const [a, b] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        this._origem.copy(this.alvo).addScaledVector(this._lado, a).addScaledVector(this._cima, b)
        this.raio.set(this._origem, dir)
        this.raio.far = livre
        const bate = this.raio.intersectObjects(solidos, true)[0]
        if (bate) livre = Math.min(livre, bate.distance)
      }
      return { dir, livre }
    }
    // parede atrás da câmera (o personagem andando para ela, de costas para uma casa): em vez de colar
    // no rosto dele, sobe e olha por cima do telhado; procura o ângulo mais baixo que deixa a câmera longe
    let alvoSubida = 0
    let { dir, livre } = livreEm(Math.min(1.25, this.pitch))
    if (livre < cfg.distancia * 0.6) {
      let melhor = livre + 0.3
      for (const extra of [0.2, 0.4, 0.6, 0.8]) {
        const tentativa = livreEm(Math.min(1.25, this.pitch + extra))
        if (tentativa.livre > melhor) { melhor = tentativa.livre; alvoSubida = extra }
        if (tentativa.livre >= cfg.distancia * 0.6) break
      }
    }
    this.subida += (alvoSubida - this.subida) * (1 - Math.exp(-dt * (alvoSubida > this.subida ? 5 : 1.5)))
    ;({ dir, livre } = livreEm(Math.min(1.25, this.pitch + this.subida)))
    // aproxima na hora (não atravessa parede) e volta devagar só até onde está livre: antes voltava até
    // passar do obstáculo, batia, pulava para perto e repetia (a câmera tremia parada, ciclo de 3 quadros)
    const limite = livre < cfg.distancia ? Math.max(1.2, livre - 0.5) : cfg.distancia
    if (this.dist > limite) this.dist = limite
    else this.dist += (limite - this.dist) * (1 - Math.exp(-dt * 6))
    const p = dir.multiplyScalar(this.dist).add(this.alvo)
    // parede ao lado (não entre a câmera e o personagem): afasta para o outro lado, sem pulo
    this._lado.normalize()
    let empurra = 0
    for (const s of [1, -1]) {
      this.raio.set(p, this._origem.copy(this._lado).multiplyScalar(s))
      this.raio.far = 1.4
      const bate = this.raio.intersectObjects(solidos, true)[0]
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
