// Movimento do jogador: andar, correr, pular, entrar no mar e nadar.
// A física é contínua (60 quadros por segundo); só a pose desenhada anda "em 2".

import * as THREE from 'three'
import { criarPersonagem, aplicarPose } from './personagem.js'
import { alturaChao, resolverColisoes } from '../mundo/colisao.js'
import { linhaCosta, LIMITES, distCosta, larguraPraia } from '../mundo/mapa.js'
import { lerpAngulo, clamp } from '../utils.js'
import { prenderNaFatia } from '../mundo/fatia.js'
import { trajetoriaPedida } from './motion-matching.js'

const PROFUNDIDADE_NADO = 1.15
const ALTURA_BOIANDO = -1.05

export class Jogador {
  constructor(cena, cfg, inicio, yaw = 0) {
    this.cfg = cfg
    this.p = criarPersonagem()
    cena.add(this.p.raiz)
    this.pos = inicio.clone()
    this.vel = new THREE.Vector3()
    this.noChao = true
    this.nadando = false
    this.molhado = false
    this.fase = 0
    this.acPose = 1
    this.yawAlvo = yaw
    this.yawVisual = yaw
    this.escala = 1
    this.escalaVel = 0
    this.tempo = 0
    this.velHoriz = 0
    this.velDesejada = new THREE.Vector3()
    this.sentado = null // banco onde está sentado
    this.carregando = null // objeto que está segurando
    this.afundado = 0
    this.naAreiaSeca = false
    this.pediuPulo = false
    this.esperaTchibum = 0
    this.eventos = []
    this.p.raiz.position.copy(this.pos)
    this.p.raiz.rotation.y = yaw
  }

  // troca o boneco antigo pelo corpo novo (esqueleto padrão + movimentos do Mixamo) quando ele carrega
  trocarCorpo(c) {
    const antigo = this.p.raiz
    c.raiz.position.copy(antigo.position)
    c.raiz.rotation.copy(antigo.rotation)
    antigo.parent.add(c.raiz)
    antigo.parent.remove(antigo)
    this.p = { raiz: c.raiz, corpo: c.corpo }
    this.animador = c.animador
  }

  // estado que o animador lê a cada quadro
  animar(dt, cfg) {
    const a = this.animador
    Object.assign(a.opcoes, { fps: cfg.fpsPose, em2: true, ik: cfg.peNoChao, inclinar: cfg.inclinar, mm: cfg.motionMatching && !!a.banco })
    const y = this.pos.y
    a.atualizar(dt, {
      vel: this.velHoriz,
      velY: this.vel.y,
      noAr: !this.noChao && !this.nadando,
      sentado: !!this.sentado,
      nadando: this.nadando,
      carregando: !!this.carregando,
      yaw: this.yawVisual,
      chao: (x, z) => alturaChao(x, z, y + 0.4),
      // trajetória que o controle vai fazer no próximo segundo (motion matching)
      traj: trajetoriaPedida({
        vel: this.vel,
        velDesejada: this.velDesejada,
        yaw: this.yawVisual,
        yawDesejado: this.velDesejada.lengthSq() > 0.09 ? Math.atan2(this.velDesejada.x, this.velDesejada.z) : this.yawVisual,
      }),
    })
    // pisadas do pé de verdade (o boneco antigo usava a fase do passo)
    for (const ev of a.eventos) this.eventos.push(ev)
    a.eventos.length = 0
  }

  pular() {
    if (this.sentado) return this.levantar()
    this.pediuPulo = true
  }

  sentar(banco) {
    this.sentado = banco
    this.pos.set(banco.x, banco.y, banco.z)
    this.vel.set(0, 0, 0)
    this.yawAlvo = banco.yaw
    this.yawVisual = banco.yaw
  }

  levantar() {
    const b = this.sentado
    if (!b) return
    this.sentado = null
    // um passo para a frente, para sair do banco
    this.pos.x += Math.sin(b.yaw) * 0.7
    this.pos.z += Math.cos(b.yaw) * 0.7
  }

  update(dt, teclas, yawCamera) {
    const cfg = this.cfg.personagem
    this.tempo += dt
    this.esperaTchibum -= dt

    if (this.sentado) {
      if (teclas.frente || teclas.tras || teclas.esquerda || teclas.direita) this.levantar()
      else return this.atualizarSentado(dt, cfg)
    }

    // direção relativa à câmera
    let ix = 0
    let iz = 0
    if (teclas.frente) iz += 1
    if (teclas.tras) iz -= 1
    if (teclas.esquerda) ix -= 1
    if (teclas.direita) ix += 1
    const fx = -Math.sin(yawCamera)
    const fz = -Math.cos(yawCamera)
    let dx = fx * iz - fz * ix
    let dz = fz * iz + fx * ix
    const n = Math.hypot(dx, dz)
    if (n > 0) { dx /= n; dz /= n }

    const profAqui = -alturaChao(this.pos.x, this.pos.z, this.pos.y)
    let alvoVel = this.animador
      ? (teclas.correr ? cfg.corridaNova : cfg.velocidadeNova)
      : (teclas.correr ? cfg.corrida : cfg.velocidade)
    // areia seca é fofa: o pé afunda e o passo rende menos
    const sc = distCosta(this.pos.x, this.pos.z)
    this.naAreiaSeca = this.noChao && sc > 0 && sc < larguraPraia(this.pos.x) - 0.5 && this.pos.y > 0.25
    if (this.naAreiaSeca) alvoVel *= 0.86
    if (this.nadando) alvoVel = teclas.correr ? 4 : 2.6
    else if (profAqui > 0.35 && this.pos.y < 0.2) alvoVel *= 0.6 // água pela canela

    const acel = this.noChao || this.nadando ? 10 : 3
    this.velDesejada.set(dx * alvoVel, 0, dz * alvoVel) // o motion matching lê para prever a trajetória
    this.vel.x += (dx * alvoVel - this.vel.x) * Math.min(1, dt * acel)
    this.vel.z += (dz * alvoVel - this.vel.z) * Math.min(1, dt * acel)

    if (this.pediuPulo && this.noChao && !this.nadando) {
      this.vel.y = cfg.pulo
      this.noChao = false
      this.escalaVel = 4 // estica ao sair do chão
    }
    this.pediuPulo = false

    if (!this.nadando) this.vel.y -= cfg.gravidade * dt

    const nova = this.pos.clone().addScaledVector(this.vel, dt)
    nova.x = clamp(nova.x, LIMITES.x0 + 15, LIMITES.x1 - 15)
    nova.z = clamp(nova.z, linhaCosta(nova.x) - 150, LIMITES.z1 - 40)
    resolverColisoes(nova, 0.35)
    // fatia vertical: enquanto ela é trabalhada, o jogador não sai dela (mundo/fatia.js)
    if (this.cfg.fatia?.travar) prenderNaFatia(nova)

    const chao = alturaChao(nova.x, nova.z, this.pos.y)
    const prof = -chao
    if (prof > PROFUNDIDADE_NADO && nova.y < 0.5) {
      // água funda: boia e nada
      if (!this.nadando && this.esperaTchibum <= 0) {
        this.eventos.push({ tipo: 'tchibum', pos: nova.clone() })
        this.esperaTchibum = 2
      }
      this.nadando = true
      this.noChao = false
      this.vel.y = 0
      nova.y += (ALTURA_BOIANDO + Math.sin(this.tempo * 2) * 0.06 - nova.y) * Math.min(1, dt * 6)
    } else {
      this.nadando = false
      if (nova.y <= chao) {
        if (!this.noChao) {
          const impacto = -this.vel.y
          this.escalaVel = -impacto * 0.32 // amassa ao cair
          if (impacto > 14) this.eventos.push({ tipo: 'pouso', pos: nova.clone() })
        }
        nova.y = chao
        this.vel.y = 0
        this.noChao = true
      } else if (this.noChao && nova.y - chao < 0.45 && this.vel.y <= 0) {
        nova.y = chao // desce a ladeira grudado no chão
        this.vel.y = 0
      } else {
        this.noChao = false
      }
    }

    // pé na água rasa
    const molhado = chao < -0.25 && !this.nadando
    if (molhado && !this.molhado && this.velHoriz > 3 && this.esperaTchibum <= 0) {
      this.eventos.push({ tipo: 'chuá', pos: nova.clone() })
      this.esperaTchibum = 2
    }
    this.molhado = molhado

    this.pos.copy(nova)
    this.velHoriz = Math.hypot(this.vel.x, this.vel.z)
    // um passo (meio ciclo da fase) a cada ~75 cm andando e ~1,3 m correndo
    const corridaF = clamp((this.velHoriz - 4.5) / 4.5, 0, 1)
    const passoM = 0.75 + 0.55 * corridaF
    this.fase += this.velHoriz * dt * (Math.PI / passoM)
    // passada: o pé toca o chão quando o seno da fase troca de sinal
    const ladoAtual = Math.sign(Math.sin(this.fase))
    if (!this.animador && this.noChao && !this.nadando && this.velHoriz > 0.6 && this.ultimoLado !== undefined && ladoAtual !== this.ultimoLado) {
      const lado = ladoAtual > 0 ? 1 : -1
      const rx = -Math.cos(this.yawVisual)
      const rz = Math.sin(this.yawVisual)
      this.eventos.push({ tipo: 'pisada', pos: new THREE.Vector3(this.pos.x + rx * 0.12 * lado, this.pos.y, this.pos.z + rz * 0.12 * lado), yaw: this.yawVisual, lado })
    }
    this.ultimoLado = ladoAtual
    if (this.velHoriz > 0.4) this.yawAlvo = Math.atan2(this.vel.x, this.vel.z)

    // mola do estica e amassa
    const k = 220
    const c = 15
    this.escalaVel += (-k * (this.escala - 1) - c * this.escalaVel) * dt
    this.escala = clamp(this.escala + this.escalaVel * dt, 0.62, 1.4)

    // pose "em 2"
    this.acPose += dt
    const passo = 1 / Math.max(1, cfg.fpsPose)
    if (this.acPose >= passo) {
      this.acPose %= passo
      this.yawVisual = lerpAngulo(this.yawVisual, this.yawAlvo, 1 - Math.exp(-passo * 14))
      if (!this.animador) {
        aplicarPose(this.p, {
          fase: this.fase,
          velocidade: this.velHoriz,
          noAr: !this.noChao && !this.nadando,
          tempo: this.tempo,
          nadando: this.nadando,
          carregando: !!this.carregando,
        })
      }
      const e = this.escala
      this.p.corpo.scale.set(1 / Math.sqrt(e), e, 1 / Math.sqrt(e))
      this.p.raiz.rotation.y = this.yawVisual
      if (cfg.posicaoEm2) {
        this.p.raiz.position.copy(this.pos)
        this.p.raiz.position.y -= this.afundado
      }
    }
    if (!cfg.posicaoEm2) this.p.raiz.position.copy(this.pos)
    // afundar uns centímetros na areia fofa (só no desenho)
    this.afundado += ((this.naAreiaSeca ? 0.045 : 0) - this.afundado) * Math.min(1, dt * 8)
    if (!cfg.posicaoEm2) this.p.raiz.position.y -= this.afundado
    // o corpo novo faz o "em 2" dele mesmo, depois da raiz no lugar (o pé no chão precisa dela)
    if (this.animador) this.animar(dt, cfg)
  }

  // sentado: posição fixa no banco, pose "em 2" como sempre
  atualizarSentado(dt, cfg) {
    this.velHoriz = 0
    this.noChao = true
    this.acPose += dt
    const passo = 1 / Math.max(1, cfg.fpsPose)
    if (this.acPose >= passo) {
      this.acPose %= passo
      if (!this.animador) aplicarPose(this.p, { fase: this.fase, velocidade: 0, noAr: false, tempo: this.tempo, nadando: false, sentado: true, carregando: !!this.carregando })
      this.p.corpo.scale.set(1, 1, 1)
      this.p.raiz.rotation.y = this.yawVisual
    }
    this.p.raiz.position.copy(this.pos)
    if (this.animador) this.animar(dt, cfg)
  }
}
