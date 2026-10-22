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
const VENTO = new THREE.Vector3(-1, 0, -0.35).normalize()
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
    this.trocaBanco = null // sentando ou levantando (andarNoBanco)
    this.indoSentar = null // andando até o banco antes de sentar
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
    for (const m of c.multiplos?.raizes || []) antigo.parent.add(m)
    antigo.parent.remove(antigo)
    this.multiplos = c.multiplos
    this.p = { raiz: c.raiz, corpo: c.corpo }
    this.animador = c.animador
  }

  // estado que o animador lê a cada quadro
  animar(dt, cfg) {
    const a = this.animador
    // "em 2" que muda com a ação: correndo e no ar a pose muda 24 vezes por segundo ("em 1"), andando 12
    const acao = this.velHoriz > cfg.corridaNova * 0.75 || !this.noChao
    Object.assign(a.opcoes, {
      // visual Arcane: personagem a 24 poses por segundo sempre (o "em 2" é linguagem do Aranhaverso)
      fps: acao || this.cfg.estilo.visual === 'arcane' ? cfg.fpsAcao : cfg.fpsPose, em2: true, ik: cfg.peNoChao, inclinar: cfg.inclinar,
      mm: cfg.motionMatching && !!a.banco, pausaPulo: cfg.pausaPulo, multiplos: cfg.multiplos > 0, clavicula: cfg.clavicula, joelhos: cfg.joelhos,
      giroClipeMin: cfg.giroClipeMin, ritmoGiro: cfg.ritmoGiro,
    })
    // força dos múltiplos: some andando, cresce da corrida para a disparada e aparece no pulo
    const forca = Math.max(clamp((this.velHoriz - cfg.corridaNova * 0.8) / (cfg.corridaNova * 0.3), 0, 1), this.noChao || this.nadando ? 0 : 0.5)
    // no visual Arcane não há cópias em retícula (são linguagem de quadrinho do Aranhaverso)
    this.multiplos?.atualizar(this.cfg.estilo.visual === 'arcane' ? 0 : forca * cfg.multiplos)
    const y = this.pos.y
    a.atualizar(dt, {
      vel: this.velHoriz,
      velY: this.vel.y,
      noAr: !this.noChao && !this.nadando,
      sentado: !!this.sentado,
      nadando: this.nadando,
      carregando: !!this.carregando,
      yaw: this.yawVisual,
      chao: (x, z) => alturaChao(x, z, y + 0.4) - this.afundado, // na areia fofa o pé afunda junto com o corpo
      velPedida: this.velDesejada.length(),
      yawPedido: this.velDesejada.lengthSq() > 0.09 ? Math.atan2(this.velDesejada.x, this.velDesejada.z) : null,
      // para onde olhar: o que dá para usar (interacoes.js) ou, parado, para onde a câmera aponta
      olhar: this.olharPara || (this.velHoriz < 0.3 && this.yawCamera !== undefined
        ? new THREE.Vector3(this.pos.x - Math.sin(this.yawCamera) * 10, this.pos.y + 1.4, this.pos.z - Math.cos(this.yawCamera) * 10)
        : null),
      segurando: this.carregando?.corpo ? (() => { const t = this.carregando.corpo.translation(); return { x: t.x, y: t.y, z: t.z, raio: this.carregando.tipo === 'bola' ? 0.22 : 0.11 } })() : null,
      // trajetória que o controle vai fazer no próximo segundo (motion matching)
      traj: trajetoriaPedida({
        vel: this.vel,
        velDesejada: this.velDesejada,
        yaw: this.yawVisual,
        yawDesejado: this.velDesejada.lengthSq() > 0.09 ? Math.atan2(this.velDesejada.x, this.velDesejada.z) : this.yawVisual,
      }),
    })
    // tecido solto: todo quadro (o pano não anda em 2: balança contínuo)
    if (a.pano && cfg.panoSolto > 0) {
      // vento de Fortaleza: o alísio vem do leste-sudeste e sopra para oeste-noroeste (x oeste, z norte);
      // forte na praia, metade para dentro da cidade
      const naPraia = 1 - clamp((distCosta(this.pos.x, this.pos.z) - larguraPraia(this.pos.x)) / 120, 0, 0.5)
      a.pano.atualizar(dt, { vento: this.cfg.interacao.ventoCoqueiros * naPraia * 1.6, ventoDir: VENTO, forca: cfg.panoSolto })
    }
    a.dobras?.atualizar(cfg.dobras)
    a.dobrasPano?.atualizar(dt, cfg.dobras)
    // pisadas do pé de verdade (o boneco antigo usava a fase do passo)
    for (const ev of a.eventos) this.eventos.push(ev)
    a.eventos.length = 0
  }

  pular() {
    if (this.sentado) return this.levantar()
    this.pediuPulo = true
  }

  // Sentar e levantar acompanham a animação: o movimento do Mixamo foi convertido "no lugar", então o
  // corpo é levado pelo controle no tempo da descida (e da subida) do quadril. Antes ele ia direto para o
  // banco e sentava parado, e ao levantar pulava 70 cm para a frente: parecia teleporte.
  frenteDoBanco(b, d) {
    const x = b.x + Math.sin(b.yaw) * d, z = b.z + Math.cos(b.yaw) * d
    return new THREE.Vector3(x, alturaChao(x, z, b.y + 0.4), z)
  }

  // longe da frente do banco: anda até lá primeiro (qualquer tecla desiste); perto, já senta
  sentar(banco) {
    const frente = this.frenteDoBanco(banco, 0.45)
    if (Math.hypot(frente.x - this.pos.x, frente.z - this.pos.z) > 0.35) { this.indoSentar = { banco, frente, t: 0 }; return }
    this.sentarAgora(banco)
  }

  sentarAgora(banco) {
    this.indoSentar = null
    this.sentado = banco
    this.vel.set(0, 0, 0)
    this.velDesejada.set(0, 0, 0)
    this.yawAlvo = banco.yaw
    this.trocaBanco = { tipo: 'sentar', frente: this.frenteDoBanco(banco, 0.45), banco: new THREE.Vector3(banco.x, banco.y, banco.z), yaw: banco.yaw, t: 0, visto: false }
  }

  levantar() {
    const b = this.sentado
    if (!b) return
    this.sentado = null
    this.vel.set(0, 0, 0)
    this.velDesejada.set(0, 0, 0)
    this.trocaBanco = { tipo: 'levantar', de: this.pos.clone(), frente: this.frenteDoBanco(b, 0.6), yaw: b.yaw, t: 0, visto: false }
  }

  // a transição do banco, a cada quadro (dentro de atualizarSentado)
  andarNoBanco(dt) {
    const tb = this.trocaBanco
    tb.t += dt
    const pr = this.animador ? this.animador.progressoQuadril(tb.tipo) : 1
    if (pr != null) tb.visto = true
    const fim = !this.animador || tb.t > 3.5 || (tb.visto && pr == null) || (pr != null && pr >= (tb.tipo === 'sentar' ? 0.999 : 0.92))
    if (tb.tipo === 'sentar') {
      if (!tb.visto || pr < 0.02) {
        // ainda de pé: vai para a frente do banco e vira de costas para ele
        const k = 1 - Math.exp(-dt * 8)
        this.pos.lerp(tb.frente, k)
        this.yawVisual = lerpAngulo(this.yawVisual, tb.yaw, k)
      } else {
        this.pos.lerpVectors(tb.frente, tb.banco, pr)
        this.yawVisual = tb.yaw
      }
      if (fim) { this.pos.copy(tb.banco); this.yawVisual = tb.yaw; this.trocaBanco = null }
    } else {
      this.pos.lerpVectors(tb.de, tb.frente, pr ?? 0)
      this.yawVisual = this.yawAlvo = tb.yaw
      if (fim) { this.pos.copy(tb.frente); this.trocaBanco = null }
    }
  }

  update(dt, teclas, yawCamera) {
    this.yawCamera = yawCamera
    const cfg = this.cfg.personagem
    this.tempo += dt
    this.esperaTchibum -= dt

    if (this.sentado || this.trocaBanco) {
      // levanta com qualquer tecla, mas só depois de ter sentado; no meio da transição as teclas esperam
      if (this.sentado && !this.trocaBanco && (teclas.frente || teclas.tras || teclas.esquerda || teclas.direita)) this.levantar()
      return this.atualizarSentado(dt, cfg)
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
    // indo sentar: anda sozinho até a frente do banco, mais devagar no fim
    let devagar = 1
    if (this.indoSentar) {
      const ir = this.indoSentar
      ir.t += dt
      const ex = ir.frente.x - this.pos.x, ez = ir.frente.z - this.pos.z, d = Math.hypot(ex, ez)
      if (n > 0 || ir.t > 4) this.indoSentar = null // o jogador mexeu ou não chegou (preso em algo): desiste
      else if (d < 0.3) { this.sentarAgora(ir.banco); return this.atualizarSentado(dt, cfg) }
      else { dx = ex / d; dz = ez / d; devagar = Math.min(1, 0.35 + d / 0.8) }
    }

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
    // girando (meia-volta gravada, que é no lugar): a raiz já freia e sai para o lado pedido no primeiro quadro,
    // mas só ganha velocidade conforme o corpo encara a direção (cfg.velNoGiro de costas, inteira de frente).
    // Até 22/10/2026 ficava a 30% o giro todo (~0,8 s), esperando a animação acabar
    if (this.animador?.girando && n > 0) {
      const falta = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - this.yawVisual), Math.cos(Math.atan2(dx, dz) - this.yawVisual)))
      alvoVel *= Math.max(cfg.velNoGiro, Math.cos(Math.min(falta, Math.PI / 2)))
    }
    alvoVel *= devagar

    // soltou a tecla: freia mais forte do que acelera (cfg.frenagem). Com os dois a 10/s, a raiz levava 0,3 s
    // deslizando até parar e o corpo parecia escorregar no fim do passo (22/10/2026)
    // a aproximação é exponencial no tempo (antes, dt × taxa: mudava com o FPS)
    const acel = this.noChao || this.nadando ? (n > 0 || this.indoSentar ? cfg.aceleracao : cfg.frenagem) : 3
    const ka = 1 - Math.exp(-dt * acel)
    this.velDesejada.set(dx * alvoVel, 0, dz * alvoVel) // o motion matching lê para prever a trajetória
    this.vel.x += (dx * alvoVel - this.vel.x) * ka
    this.vel.z += (dz * alvoVel - this.vel.z) * ka

    if (this.pediuPulo && this.noChao && !this.nadando) {
      this.vel.y = cfg.pulo
      this.noChao = false
      this.escalaVel = 4 // estica ao sair do chão
    }
    this.pediuPulo = false

    if (!this.nadando) this.vel.y -= cfg.gravidade * dt

    const nova = this.pos.clone().addScaledVector(this.vel, dt)
    // onda: na água rasa o vaivém empurra para a praia e puxa de volta (período de ~7 s; a praia fica
    // para +z). Mais forte quanto mais fundo, até a profundidade de nadar.
    if (!this.nadando && profAqui > 0.15) {
      const fundo = clamp((profAqui - 0.15) / (PROFUNDIDADE_NADO - 0.15), 0, 1)
      const fase = Math.sin(this.tempo * (Math.PI * 2 / 7))
      const empurra = (fase > 0 ? fase * 1.1 : fase * 0.5) * fundo
      nova.z += empurra * dt
      this.onda = empurra
    } else this.onda = 0
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
    // para onde o corpo quer olhar: a direção pedida (a tecla), não a da velocidade. A velocidade leva ~0,2 s
    // para virar, e o corpo seguindo a velocidade somava esse atraso ao dele (22/10/2026)
    if (this.velDesejada.lengthSq() > 0.09) this.yawAlvo = Math.atan2(this.velDesejada.x, this.velDesejada.z)
    else if (this.velHoriz > 0.4) this.yawAlvo = Math.atan2(this.vel.x, this.vel.z)

    // mola do estica e amassa
    const k = 220
    const c = 15
    this.escalaVel += (-k * (this.escala - 1) - c * this.escalaVel) * dt
    this.escala = clamp(this.escala + this.escalaVel * dt, 0.62, 1.4)

    // pose "em 2"
    this.acPose += dt
    this.dtGiro = (this.dtGiro || 0) + dt
    const passo = 1 / Math.max(1, cfg.fpsPose)
    // o corpo novo gira no quadro em que o animador desenha a pose (24/s no Arcane), o antigo no relógio dele
    const posa = this.animador ? this.animador.vaiPosar(dt) : this.acPose >= passo
    if (posa) {
      this.acPose %= passo
      const dg = this.dtGiro // tempo desde o último giro: as taxas valem em qualquer ritmo de pose
      this.dtGiro = 0
      if (this.animador?.mmAtivo && this.noChao && !this.nadando) {
        // motion matching: o corpo gira o que o movimento escolhido gira (meia-volta, curva, virar no
        // lugar), e o controle corrige o desvio. Andando, a correção é rápida (cfg.giroAndando): a 3/s,
        // até 22/10/2026, encarar uma curva de 45° levava 0,7 s e o controle parecia travado
        const giro = this.animador.consumirGiro()
        this.yawVisual += giro
        if (this.animador.virarRapido) {
          // desistiu do giro no meio: vira depressa, mas no máximo ~45° a cada 1/12 s (sem estalo)
          const d = Math.atan2(Math.sin(this.yawAlvo - this.yawVisual), Math.cos(this.yawAlvo - this.yawVisual))
          const lim = 9.6 * dg
          this.yawVisual += THREE.MathUtils.clamp(d * (1 - Math.exp(-dg * 8)), -lim, lim)
        } else if (!this.animador.girando) this.yawVisual = lerpAngulo(this.yawVisual, this.yawAlvo, 1 - Math.exp(-dg * cfg.giroAndando))
      } else {
        this.animador?.consumirGiro()
        // meia-volta saindo do parado: o motion matching ainda não assumiu (está entrando na mistura);
        // girar rápido aqui fazia o corpo estalar 120° em 0,1 s antes da animação de volta começar
        const d = this.yawAlvo - this.yawVisual
        const meiaVolta = this.animador?.mm && this.animador.opcoes.mm && !this.carregando && this.noChao && !this.nadando && Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) > 1.6
        this.yawVisual = lerpAngulo(this.yawVisual, this.yawAlvo, 1 - Math.exp(-dg * (meiaVolta ? 2 : 14)))
      }
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
    this.afundado += ((this.naAreiaSeca ? cfg.afundaAreia ?? 0.02 : 0) - this.afundado) * Math.min(1, dt * 8)
    if (!cfg.posicaoEm2) this.p.raiz.position.y -= this.afundado
    // o corpo novo faz o "em 2" dele mesmo, depois da raiz no lugar (o pé no chão precisa dela)
    if (this.animador) this.animar(dt, cfg)
  }

  // sentado: posição fixa no banco, pose "em 2" como sempre
  atualizarSentado(dt, cfg) {
    if (this.trocaBanco) this.andarNoBanco(dt)
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
