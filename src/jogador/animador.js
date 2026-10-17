// O corpo em movimento: movimentos gravados (mocap) misturados pelo estado do jogador, e por cima a
// camada do jogo, que nenhum movimento gravado sabe fazer sozinho:
// - passada casada com a velocidade (o pé não escorrega)
// - pé no chão de verdade: ladeira, degrau, duna (IK de duas juntas na perna; o quadril desce)
// - inclinar na curva e na arrancada
// Tudo "em 2": a pose só muda 12 vezes por segundo (cfg.personagem.fpsPose).

import * as THREE from 'three'

const v = () => new THREE.Vector3()
const _a = v(), _b = v(), _c = v(), _t = v(), _p = v()
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion()

// gira um osso em torno de um eixo do mundo, mantendo o resto da hierarquia
function girarNoMundo(osso, eixo, ang) {
  osso.parent.getWorldQuaternion(_q2)
  osso.getWorldQuaternion(_q)
  _q.premultiply(new THREE.Quaternion().setFromAxisAngle(eixo, ang))
  osso.quaternion.copy(_q2.invert().multiply(_q))
  osso.updateMatrixWorld(true)
}
// gira o osso no mundo de forma que a direção "de" vire "para"
function apontar(osso, de, para) {
  if (de.lengthSq() < 1e-8 || para.lengthSq() < 1e-8) return
  const r = new THREE.Quaternion().setFromUnitVectors(de.clone().normalize(), para.clone().normalize())
  osso.parent.getWorldQuaternion(_q2)
  osso.getWorldQuaternion(_q)
  _q.premultiply(r)
  osso.quaternion.copy(_q2.invert().multiply(_q))
  osso.updateMatrixWorld(true)
}

// IK de duas juntas: coxa, canela e pé; o tornozelo vai para "alvo", o joelho dobra para onde já dobrava
function ikPerna(coxa, canela, pe, alvo) { ikDuas(coxa, canela, pe, alvo) }

// IK de duas juntas genérico (perna: coxa/canela/pé; braço: braço/antebraço/mão). A ponta vai para
// "alvo"; a junta do meio dobra para o lado em que já dobrava; a ponta mantém a rotação do movimento
function ikDuas(coxa, canela, pe, alvo) {
  const qPe = pe.getWorldQuaternion(new THREE.Quaternion())
  const A = coxa.getWorldPosition(_a)
  const B = canela.getWorldPosition(_b)
  const C = pe.getWorldPosition(_c)
  const l1 = A.distanceTo(B)
  const l2 = B.distanceTo(C)
  const AT = _t.subVectors(alvo, A)
  const d = THREE.MathUtils.clamp(AT.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3)
  const dir = AT.clone().normalize()
  // plano da dobra: a direção do joelho atual, tirada a componente ao longo de A→alvo
  const polo = _p.subVectors(B, A)
  polo.addScaledVector(dir, -polo.dot(dir))
  if (polo.lengthSq() < 1e-6) polo.set(0, 0, 1)
  polo.normalize()
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
  const ang = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1))
  const novoB = A.clone().addScaledVector(dir, Math.cos(ang) * l1).addScaledVector(polo, Math.sin(ang) * l1)
  apontar(coxa, B.clone().sub(A), novoB.clone().sub(A))
  const B2 = canela.getWorldPosition(v())
  const C2 = pe.getWorldPosition(v())
  apontar(canela, C2.clone().sub(B2), A.clone().addScaledVector(dir, d).sub(B2))
  // o pé mantém a rotação que o movimento gravado deu
  canela.getWorldQuaternion(_q2)
  pe.quaternion.copy(_q2.invert().multiply(qPe))
  pe.updateMatrixWorld(true)
}

export class Animador {
  // corpo: { raiz, ossos (Map nome canônico -> Bone) }; clipes: { nome: AnimationClip } já convertidos;
  // passadas: { andar: m/s, correr: m/s } velocidade natural de cada ciclo
  constructor(corpo, clipes, passadas) {
    this.corpo = corpo
    this.ossos = corpo.ossos
    // eixos do repouso no espaço de cada osso (cada modelo monta os ossos de um jeito); o padrão vale
    // para o esqueleto do jogo, que tem os ossos sem rotação no repouso
    this.eixos = {
      cabecaFrente: new THREE.Vector3(0, 0, 1), quadrilEsquerda: new THREE.Vector3(1, 0, 0),
      abaChapeu: new THREE.Vector3(-0.16, 0.2, 0.06), ...(corpo.eixos || {}),
    }
    this.mixer = new THREE.AnimationMixer(corpo.raiz)
    // palma da mão no repouso (pose em T: virada para baixo), no espaço de cada mão
    corpo.raiz.updateMatrixWorld(true)
    this.palma = {}
    for (const L of ['Left', 'Right']) {
      const h = corpo.ossos.get(L + 'Hand')
      if (h) this.palma[L] = new THREE.Vector3(0, -1, 0).applyQuaternion(h.getWorldQuaternion(new THREE.Quaternion()).invert())
    }
    // inclinação da clavícula no repouso (graus para baixo): no neto ela nasce caída 28 a 33° e diferente
    // de um lado para o outro; a postura (clavicula) corrige para um valor só
    corpo.raiz.updateMatrixWorld(true)
    this.clavRep = {}
    for (const L of ['Left', 'Right']) {
      const c = corpo.ossos.get(L + 'Shoulder'), b = corpo.ossos.get(L + 'Arm')
      if (!c || !b) continue
      const d = b.getWorldPosition(new THREE.Vector3()).sub(c.getWorldPosition(new THREE.Vector3()))
      this.clavRep[L] = Math.atan2(-d.y, Math.hypot(d.x, d.z))
    }
    this.passadas = passadas
    this.acoes = {}
    for (const [nome, clipe] of Object.entries(clipes)) {
      const a = this.mixer.clipAction(clipe)
      a.enabled = true
      a.setEffectiveWeight(0)
      a.play()
      a.userData = { peso: 0, alvo: 0 }
      if (['sentar', 'levantar', 'pulo-pouso', 'pulo-subida', 'olhando'].includes(nome)) {
        a.setLoop(THREE.LoopOnce, 1)
        a.clampWhenFinished = true
      }
      this.acoes[nome] = a
    }
    this.fase = 0
    this.acumulado = 0
    this.antes = { noAr: false, sentado: false, yaw: 0, vel: 0 }
    this.inclinacao = { lado: 0, frente: 0 }
    this.umaVez = null // movimento de uma vez só tocando (pouso, sentar, levantar)
    this.opcoes = { ik: true, inclinar: true, em2: true, fps: 12 }
    this.eventos = [] // pisadas, recolhidas por quem usa o animador
  }

  tem(nome) { return !!this.acoes[nome] }

  // Motion matching (motion-matching.js): liga o banco; cada movimento ganha duas ações (A e B) para
  // poder trocar de um trecho para outro do mesmo movimento com transição
  // adaptar: converte o clipe do esqueleto padrão para o modelo que está tocando (o neto, por exemplo)
  usarBanco(banco, adaptar = (c) => c) {
    this.banco = banco
    this.mm = { e: -1, t: 0, chave: null, tocando: false, espera: 0 }
    banco.entradas.forEach((ent, e) => {
      const clipe = adaptar(banco.clipeParaTocar(e))
      for (const lado of ['A', 'B']) {
        const a = this.mixer.clipAction(lado === 'A' ? clipe : clipe.clone())
        a.setLoop(ent.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
        a.clampWhenFinished = true
        a.enabled = true
        a.setEffectiveWeight(0)
        a.play()
        a.userData = { peso: 0, e, lado }
        this.acoes[`mm:${ent.nome}:${lado}`] = a
      }
    })
    this.opcoes.mm = true
  }

  // a cada pose: procura no banco o quadro mais parecido com (pose de agora + trajetória pedida)
  casar(DT, s, alvo) {
    const mm = this.mm
    const FPSB = 30
    const atual = mm.tocando && mm.chave ? this.acoes[mm.chave] : null
    const entAtual = atual ? this.banco.entradas[atual.userData.e] : null
    let fAtual = 0
    if (atual) {
      const dur = atual.getClip().duration
      const t = entAtual.loop ? atual.time % dur : Math.min(atual.time, dur)
      fAtual = Math.min(entAtual.n - 1, Math.round(t * FPSB))
    }
    mm.espera -= DT
    const fimDoClipe = atual && !entAtual.loop && fAtual >= entAtual.n - 3
    // giro em andamento (meia-volta, virar no lugar): vai até perto do fim sem trocar
    // o pedido virou no meio do giro (frente, trás, frente...): solta a trava e procura de novo, senão
    // ele emendava uma meia-volta na outra e ficava oscilando de lado sem encarar nenhuma direção
    const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a))
    const mudouPedido = mm.trava && s.yawPedido != null && mm.trava.yawPedido != null && Math.abs(angulo(s.yawPedido - mm.trava.yawPedido)) > 1.2
    const travado = mm.trava && mm.trava.chave === mm.chave && fAtual < mm.trava.ate && !fimDoClipe && !mudouPedido
    if (!travado) mm.trava = null
    if (mudouPedido) { mm.espera = 0; mm.semGiro = 0.7 }
    // logo depois de desistir de um giro, nada de outra volta do mocap (lenta, ~1 s): o controle vira rápido
    mm.semGiro = Math.max(0, (mm.semGiro || 0) - DT)
    const faltaGiro = s.yawPedido != null ? Math.abs(angulo(s.yawPedido - s.yaw)) : Math.PI
    if (!travado && (!atual || mm.espera <= 0 || fimDoClipe)) {
      mm.espera = 0.1 // procura 10 vezes por segundo
      const pose = atual ? this.banco.linha(atual.userData.e, fAtual) : this.banco.linha(0, 0)
      // ritmo: correndo (ou pedindo corrida) não pega movimento de andar; andando não pega de corrida
      // freando de uma corrida, segue no ritmo de corrida até quase parar (usa a freada de quem corre)
      const vinhaCorrendo = entAtual && entAtual.ritmo === 'corrida'
      const correndo = (s.velPedida || 0) > 3 || (vinhaCorrendo && s.vel > 0.8 && (s.velPedida || 0) < 0.5)
      const r = this.banco.buscar(pose, s.traj, (e) => {
        const ent = this.banco.entradas[e]
        // meia-volta só quando falta girar perto de meia volta (a menos que isso o giro passava do ponto)
        if (/volta/.test(ent.nome) && faltaGiro < 2.2) return false
        if (/volta|virar/.test(ent.nome) && mm.semGiro > 0) return false
        const rit = ent.ritmo
        return rit === 'livre' || (correndo ? rit === 'corrida' : rit === 'andar')
      })
      const custoAtual = atual ? this.banco.custoDe(atual.userData.e, fAtual, r.q) : Infinity
      const mesmoLugar = atual && r.e === atual.userData.e && Math.abs(r.f - fAtual) < 8
      // só troca se o novo for claramente melhor (evita ficar pulando entre trechos parecidos)
      if (!mesmoLugar && (r.custo < custoAtual * 0.85 || fimDoClipe || !atual)) {
        const nome = this.banco.entradas[r.e].nome
        const lado = atual && atual.userData.e === r.e && atual.userData.lado === 'A' ? 'B' : 'A'
        const chave = `mm:${nome}:${lado}`
        const a = this.acoes[chave]
        a.reset()
        a.time = r.f / FPSB
        a.play()
        mm.chave = chave
        mm.tocando = true
        this.mmUltimo = { nome, f: r.f, custo: +r.custo.toFixed(2) }
        // começou um giro: trava até 85% do clipe e escala o giro da raiz para terminar na direção pedida
        const ent = this.banco.entradas[r.e]
        if (/volta|virar/.test(nome) && s.yawPedido != null) {
          const giroClipe = ent.R[ent.n - 1].yaw - ent.R[r.f].yaw
          let falta = s.yawPedido - s.yaw
          falta = Math.atan2(Math.sin(falta), Math.cos(falta))
          // mesmo sentido do clipe: se o clipe gira para o outro lado, completa a volta por ele
          if (Math.sign(falta) !== Math.sign(giroClipe) && Math.abs(falta) > 2.6) falta += Math.sign(giroClipe) * Math.PI * 2
          const escala = Math.abs(giroClipe) > 0.2 ? THREE.MathUtils.clamp(falta / giroClipe, 0.6, 1.4) : 1
          mm.trava = { chave, ate: r.f + Math.floor((ent.n - r.f) * 0.85), escala, yawPedido: s.yawPedido }
        }
      }
    }
    alvo[mm.chave] = 1
  }

  // quanto a raiz do movimento do motion matching girou neste quadro (radianos, no mesmo sentido do
  // yaw do controle). O controle soma isso ao corpo: na meia-volta o corpo gira no tempo do mocap.
  medirGiro() {
    const mm = this.mm
    if (!mm) return
    const a = mm.tocando && mm.chave && this.opcoes.mm ? this.acoes[mm.chave] : null
    this.mmAtivo = !!a && (a.userData.peso > 0.5)
    if (!a) { mm.raizAnt = null; return }
    const ent = this.banco.entradas[a.userData.e]
    const f = Math.min(ent.n - 1, Math.round(a.time * 30))
    const ant = mm.raizAnt
    if (ant && ant.chave === mm.chave) {
      // movimento que repete: ao dar a volta, compara com o quadro "depois do fim" (raiz acumulada)
      const fComp = f < ant.f && ent.loop ? Math.min(ent.R.length - 1, f + ent.n - 1) : f
      const esc = mm.trava && mm.trava.chave === mm.chave ? mm.trava.escala : 1
      this.giroAcumulado = (this.giroAcumulado || 0) + (ent.R[fComp].yaw - ent.R[ant.f].yaw) * esc
    }
    mm.raizAnt = { chave: mm.chave, f }
  }

  // durante um giro travado, o controle não corrige a direção (quem gira é a animação)
  get girando() { return !!(this.mm?.trava && this.mm.trava.chave === this.mm.chave) }
  // desistiu de um giro no meio (frente, trás, frente...): o controle vira depressa para o pedido
  get virarRapido() { return (this.mm?.semGiro || 0) > 0 }

  // o controle lê e zera o giro acumulado
  consumirGiro() {
    const g = this.giroAcumulado || 0
    this.giroAcumulado = 0
    return g
  }

  // quanto do sentar ou do levantar já aconteceu (0 a 1), pela altura do quadril no próprio movimento;
  // null se o movimento não está tocando. O controle usa isso para levar o corpo do banco para a frente
  // (e de volta) no mesmo tempo da animação, que foi convertida "no lugar"
  progressoQuadril(nome) {
    const a = this.acoes[nome]
    if (!a || this.umaVez !== nome) return null
    const c = a.getClip()
    const tr = c.tracks.find((t) => t.name.endsWith('Hips.position'))
    if (!tr) return Math.min(1, a.time / c.duration)
    const T = tr.times, V = tr.values, n = T.length
    let i = 0
    while (i < n - 1 && T[i + 1] < a.time) i++
    const j = Math.min(n - 1, i + 1)
    const f = j > i ? THREE.MathUtils.clamp((a.time - T[i]) / (T[j] - T[i]), 0, 1) : 0
    const y = V[i * 3 + 1] + (V[j * 3 + 1] - V[i * 3 + 1]) * f
    const y0 = V[1], y1 = V[(n - 1) * 3 + 1]
    return Math.abs(y1 - y0) < 1e-4 ? 1 : THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1)
  }

  disparar(nome) {
    const a = this.acoes[nome]
    if (!a) return
    a.reset()
    a.play()
    this.umaVez = nome
  }

  // s: { vel, velY, noAr, sentado, nadando, carregando, yaw, chao(x, z) -> altura }
  atualizar(dt, s) {
    this.acumulado += dt
    const passo = 1 / Math.max(1, this.opcoes.fps)
    if (this.opcoes.em2 && this.acumulado < passo) return false
    const DT = this.opcoes.em2 ? this.acumulado - (this.acumulado % passo) : this.acumulado
    this.acumulado = this.opcoes.em2 ? this.acumulado % passo : 0

    // pausa no alto do pulo: a pose segura alguns quadros no topo (Aranhaverso)
    if (this.opcoes.pausaPulo && s.noAr && Math.abs(s.velY) < 2.2 && (this.segura || 0) < 3) {
      this.segura = (this.segura || 0) + 1
      return true
    }
    if (!s.noAr || Math.abs(s.velY) >= 2.2) this.segura = 0
    // múltiplos: a pose que sai fica para trás, em retícula
    if (this.multiplos && this.opcoes.multiplos) this.multiplos.registrar()

    // eventos: pousou, sentou, levantou
    if (this.antes.noAr && !s.noAr && !s.nadando && s.vel < 2.5) this.disparar('pulo-pouso')
    if (this.molas && this.antes.noAr && !s.noAr) this.molas.empurrar(Math.sin(s.yaw) * 1.5, Math.cos(s.yaw) * 1.5, s.yaw) // pouso: o tronco cai para a frente e volta
    if (this.molas && this.antes.vel - s.vel > 1.2) this.molas.empurrar(Math.sin(s.yaw) * (this.antes.vel - s.vel), Math.cos(s.yaw) * (this.antes.vel - s.vel), s.yaw)
    if (!this.antes.noAr && s.noAr && s.velY > 0) this.disparar('pulo-subida')
    if (!this.antes.sentado && s.sentado) this.disparar('sentar')
    if (this.antes.sentado && !s.sentado) this.disparar('levantar')
    // gesto de parado (olhar em volta), pouso ou levantar não seguram o corpo quando o jogador manda
    // andar: corta na hora (sem isso ele deslizava com a animação de parado)
    if (this.umaVez && this.umaVez !== 'sentar' && !s.sentado && !s.noAr && ((s.velPedida || 0) > 0.3 || s.vel > 0.6)) {
      if (this.umaVez === 'olhando') this.gesto = null
      this.umaVez = null
    }
    if (this.umaVez) {
      const a = this.acoes[this.umaVez]
      if (!a || !a.isRunning() || a.time >= a.getClip().duration - 0.05) this.umaVez = null
    }

    // pesos alvo de cada movimento
    const alvo = {}
    const loc = (vel, andarNome) => {
      const vA = this.passadas.andar || 1.4
      const vC = this.passadas.correr || 3.5
      const tAndar = THREE.MathUtils.clamp(vel / (vA * 0.6), 0, 1)
      const tCorrer = this.tem('correr') ? THREE.MathUtils.clamp((vel - vA) / (vC - vA), 0, 1) : 0
      alvo[s.carregando && this.tem('carregar-parado') ? 'carregar-parado' : 'parado'] = 1 - tAndar
      alvo[andarNome] = tAndar * (1 - tCorrer)
      alvo.correr = tAndar * tCorrer
    }
    if (this.umaVez) alvo[this.umaVez] = 1
    else if (s.sentado) alvo.sentado = 1
    else if (s.nadando) alvo[s.vel > 0.6 && this.tem('nadar') ? 'nadar' : 'boiar'] = 1
    else if (s.noAr) alvo[s.velY > 0 && this.tem('pulo-subida') ? 'pulo-subida' : 'pulo-queda'] = 1
    // parado de vez (sem pedir movimento): o "Breathing Idle", de braços soltos. O "idle" do pacote, que
    // o motion matching escolhia, deixa os braços em posição de sentido (o Joabe estranhou, 16/10)
    else if (this.mm && this.opcoes.mm && !s.carregando && s.traj && !(s.vel < 0.25 && (s.velPedida || 0) < 0.1 && this.tem('parado'))) this.casar(DT, s, alvo)
    else loc(s.vel, s.carregando && this.tem('carregar-andando') ? 'carregar-andando' : 'andar')
    if (this.mm && !alvo[this.mm.chave]) this.mm.tocando = false

    // troca suave entre movimentos (pesos andam para o alvo) e o que não existe cai no "parado"
    let soma = 0
    const k = 1 - Math.exp(-DT * 12)
    for (const [nome, a] of Object.entries(this.acoes)) {
      const w = alvo[nome] || 0
      a.userData.peso += (w - a.userData.peso) * k
      soma += a.userData.peso
    }
    const faltou = Object.entries(alvo).reduce((t, [n, w]) => t + (this.acoes[n] ? 0 : w), 0)
    if (faltou > 0 && this.acoes.parado) this.acoes.parado.userData.peso += faltou * k
    for (const a of Object.values(this.acoes)) a.setEffectiveWeight(soma > 0 ? a.userData.peso : 0)

    // passada casada com a velocidade: uma fase só para andar e correr
    const andando = this.acoes['carregar-andando']?.userData.peso > this.acoes.andar?.userData.peso ? 'carregar-andando' : 'andar'
    const wC = this.acoes.correr?.userData.peso || 0
    const wA = this.acoes[andando]?.userData.peso || 0
    const ciclo = (nome) => (this.acoes[nome] ? this.acoes[nome].getClip().duration * (this.passadas[nome === 'correr' ? 'correr' : 'andar'] || 1.4) : 1)
    const comprimento = wA + wC > 0 ? (ciclo(andando) * wA + ciclo('correr') * wC) / (wA + wC) : ciclo(andando)
    this.fase = (this.fase + (s.vel * DT) / Math.max(0.2, comprimento)) % 1
    for (const nome of ['andar', 'correr', 'carregar-andando']) {
      const a = this.acoes[nome]
      if (a) { a.paused = true; a.time = this.fase * a.getClip().duration }
    }
    const nado = this.acoes.nadar
    if (nado) {
      const vNado = nado.getClip().userData?.velocidade || 1.2
      nado.timeScale = THREE.MathUtils.clamp(s.vel / vNado, 0.5, 2.2)
    }
    this.mixer.update(DT) // os outros movimentos correm no tempo deles
    this.medirGiro()

    // o nado do Mixamo é submerso: deitado, o corpo sobe até a linha d'água (o jogador boia com o quadril fundo)
    const wNado = nado?.userData.peso || 0
    if (wNado > 0.01 && !nado.getClip().userData?.procedural) this.ossos.get('Hips').position.y += wNado * 0.7
    this.corpo.raiz.updateMatrixWorld(true)
    if (this.opcoes.clavicula != null) this.endireitarClavicula(this.opcoes.clavicula)
    if (this.opcoes.bracosJuntos !== 0) this.bracosJuntos(s, this.opcoes.bracosJuntos ?? 0.6)
    if (this.opcoes.inclinar) this.inclinar(DT, s)
    // sentando ou levantando, o corpo é do movimento do banco: a âncora dos pés (que ficou de antes de
    // sentar) puxava o quadril de lado no começo do levantar, e o joelho reto brigava com o agachar
    const noBanco = s.sentado || this.umaVez === 'sentar' || this.umaVez === 'levantar'
    if (noBanco) this.ancoraPes = null
    if (this.opcoes.ik && !noBanco && !s.noAr && !s.nadando && s.chao) this.ancorarPes(DT, s)
    if (this.opcoes.ik && this.opcoes.joelhos != null && !noBanco && !s.noAr && !s.nadando && !s.sentado && s.chao) this.endireitarJoelhos(s, this.opcoes.joelhos)
    if (this.opcoes.ik && !s.noAr && !s.nadando && !s.sentado && s.chao) this.pesNoChao(s)
    const olharVida = this.vidaParado(DT, s)
    if (this.opcoes.olhar !== false) this.olhar(DT, olharVida || s.olhar)
    if (this.gesto?.tipo === 'chapeu') this.ajeitarChapeu()
    if (s.segurando) this.maosEm(s.segurando)
    this.molas?.atualizar(DT, s)
    this.detectarPisadas(s)
    this.rosto?.atualizar(DT, s)
    this.antes = { noAr: s.noAr, sentado: s.sentado, yaw: s.yaw, vel: s.vel }
    return true
  }

  // o pé tocou o chão neste quadro? (o calcanhar desceu a 2,5 cm depois de ter subido acima de 7 cm)
  // vira um evento com o lugar do pé de verdade, para a pegada e a poeira
  detectarPisadas(s) {
    this.pes ??= { Left: { alto: true }, Right: { alto: true } }
    if (s.noAr || s.nadando || s.sentado || !s.chao) return
    for (const L of ['Left', 'Right']) {
      const pe = this.ossos.get(L + 'Foot')
      const dedo = this.ossos.get(L + 'ToeBase')
      if (!pe || !dedo) continue
      const a = pe.getWorldPosition(v())
      const b = dedo.getWorldPosition(v())
      const meio = a.clone().lerp(b, 0.6)
      // calcanhar: o tornozelo fica ~6 cm acima do chão com o pé apoiado (medido no andar do Mixamo)
      const h = a.y - 0.06 - s.chao(meio.x, meio.z)
      const st = this.pes[L]
      if (st.alto && h < 0.025 && s.vel > 0.3) {
        this.eventos.push({ tipo: 'pisada', pos: meio, yaw: s.yaw, lado: L === 'Left' ? -1 : 1 })
        st.alto = false
      } else if (!st.alto && h > 0.07) st.alto = true
    }
  }

  // a cabeça vira para o ponto (mundo), com limite de pescoço; o pescoço leva 40% e a cabeça 60%.
  // Sem ponto, volta suave para a frente.
  olhar(DT, ponto) {
    const cabeca = this.ossos.get('Head')
    const pescoco = this.ossos.get('Neck')
    if (!cabeca || !pescoco) return
    const k = 1 - Math.exp(-DT * 6)
    // ponto atrás das costas (mais de ~110° da frente do corpo): não torce o pescoço, olha em frente
    if (ponto) {
      const q = this.ossos.get('Hips').getWorldPosition(v())
      const fr = v().set(0, 0, 1).applyQuaternion(this.ossos.get('Hips').getWorldQuaternion(new THREE.Quaternion()))
      const para = ponto.clone().sub(q)
      fr.y = 0; para.y = 0
      if (fr.angleTo(para) > 1.9) ponto = null
    }
    this.olharPeso = (this.olharPeso || 0) + ((ponto ? 1 : 0) - (this.olharPeso || 0)) * k
    if (ponto) this.olharAlvo = (this.olharAlvo || ponto.clone()).lerp(ponto, k)
    if (!this.olharAlvo || this.olharPeso < 0.02) return
    const pc = cabeca.getWorldPosition(v()).add(v().set(0, 0.1, 0))
    const desejo = this.olharAlvo.clone().sub(pc).normalize()
    const frente = this.eixos.cabecaFrente.clone().applyQuaternion(cabeca.getWorldQuaternion(new THREE.Quaternion()))
    let ang = frente.angleTo(desejo)
    if (ang < 1e-3) return
    const eixo = v().crossVectors(frente, desejo).normalize()
    ang = Math.min(ang, 1.2) * this.olharPeso // ~70° de pescoço no máximo
    girarNoMundo(pescoco, eixo, ang * 0.4)
    girarNoMundo(cabeca, eixo, ang * 0.6)
  }

  // Parado com vida (fase 6): depois de alguns segundos parado, um gesto sorteado; mexeu, acabou.
  // Devolve um ponto para olhar quando o gesto é olhar alguma coisa.
  vidaParado(DT, s) {
    const parado = s.vel < 0.2 && !s.noAr && !s.nadando && !s.sentado && !s.carregando && !this.umaVez
    if (!parado) { this.gesto = null; this.tParado = 0; this.proximoGesto = 4 + this.sorteio() * 4; return null }
    this.tParado = (this.tParado || 0) + DT
    this.proximoGesto ??= 4 + this.sorteio() * 4
    if (!this.gesto && this.tParado > this.proximoGesto) {
      const opcoes = ['mar', ...(this.ossos.get('Chapeu') ? ['chapeu'] : []), ...(this.tem('olhando') ? ['olhando'] : [])]
      const tipo = opcoes[Math.floor(this.sorteio() * opcoes.length)]
      const dur = { mar: 3.5, chapeu: 1.4, olhando: this.acoes.olhando?.getClip().duration || 3 }[tipo]
      if (tipo === 'olhando') this.disparar('olhando')
      this.gesto = { tipo, t: 0, dur }
      this.proximoGesto = this.tParado + dur + 5 + this.sorteio() * 6
    }
    if (!this.gesto) return null
    this.gesto.t += DT
    if (this.gesto.t > this.gesto.dur) { this.gesto = null; return null }
    if (this.gesto.tipo === 'mar') {
      // o mar fica ao norte (z negativo): olha o horizonte, um pouco à esquerda ou à direita
      const q = this.ossos.get('Hips').getWorldPosition(v())
      return q.add(v().set(Math.sin(this.gesto.t * 0.6) * 6, 0.6, -25))
    }
    return null
  }

  // número sorteado com semente (o jogo é reproduzível)
  sorteio() {
    this._s = ((this._s ?? 1932) * 16807) % 2147483647
    return (this._s - 1) / 2147483646
  }

  // a mão direita sobe até a aba do chapéu e volta (curva em sino ao longo do gesto)
  ajeitarChapeu() {
    const g = this.gesto
    const w = Math.sin(Math.PI * Math.min(1, g.t / g.dur))
    const cabeca = this.ossos.get('Head')
    const a = this.ossos.get('RightArm'), b = this.ossos.get('RightForeArm'), c = this.ossos.get('RightHand')
    if (!cabeca || !a || !b || !c) return
    const aba = this.eixos.abaChapeu.clone().applyMatrix4(cabeca.matrixWorld)
    const mao = c.getWorldPosition(v())
    ikDuas(a, b, c, mao.lerp(aba, w))
  }

  // segurando algo: as duas mãos vão aos lados do objeto (mundo)
  maosEm({ x, y, z, raio = 0.2 }) {
    const centro = v().set(x, y, z)
    const quadril = this.ossos.get('Hips')
    const direita = this.eixos.quadrilEsquerda.clone().applyQuaternion(quadril.getWorldQuaternion(new THREE.Quaternion()))
    direita.y = 0
    direita.normalize()
    // frente e centro do quadril: quem segura põe o objeto aqui (a pose de carregar vem com o quadril
    // girado; pela direção do controle o coco ficava de lado, com uma mão na frente e outra atrás)
    this.frenteCorpo = new THREE.Vector3().crossVectors(direita, new THREE.Vector3(0, 1, 0))
    this.centroCorpo = quadril.getWorldPosition(new THREE.Vector3())
    for (const [L, s] of [['Left', 1], ['Right', -1]]) {
      const a = this.ossos.get(L + 'Arm'), b = this.ossos.get(L + 'ForeArm'), c = this.ossos.get(L + 'Hand')
      if (!a || !b || !c) continue
      ikDuas(a, b, c, centro.clone().addScaledVector(direita, s * (raio + 0.02)))
      // palma virada para o objeto (antes ficava para baixo e só a ponta dos dedos encostava)
      if (this.palma[L]) {
        const palma = this.palma[L].clone().applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()))
        const paraCentro = centro.clone().sub(c.getWorldPosition(v())).normalize()
        apontar(c, palma, paraCentro)
      }
    }
  }

  // Ombro: sobe a clavícula de cada lado o tanto que o repouso dela passa do alvo (graus para baixo).
  // A diferença entre o repouso e o alvo é fixa; o que o movimento faz por cima (respirar, encolher) fica.
  endireitarClavicula(alvoGraus) {
    const alvo = THREE.MathUtils.degToRad(alvoGraus)
    for (const L of ['Left', 'Right']) {
      const c = this.ossos.get(L + 'Shoulder'), b = this.ossos.get(L + 'Arm')
      if (!c || !b || this.clavRep[L] == null) continue
      const sobe = this.clavRep[L] - alvo
      if (Math.abs(sobe) < 0.005) continue
      const d = b.getWorldPosition(v()).sub(c.getWorldPosition(v()))
      const h = v().set(d.x, 0, d.z)
      const L0 = d.length()
      if (h.lengthSq() < 1e-8) continue
      h.normalize()
      const atual = Math.atan2(-d.y, Math.hypot(d.x, d.z))
      const novo = atual - sobe
      const d2 = h.multiplyScalar(Math.cos(novo)).add(v().set(0, -Math.sin(novo), 0)).multiplyScalar(L0)
      apontar(c, d, d2)
    }
  }

  // Postura: os movimentos do Mixamo andam e trotam com os braços abertos para o lado (até 30° a 47°),
  // o que lê como "duro" num corpo de camisa larga. Aproxima do corpo a parte da abertura que passa
  // de 6°, sem mexer no balanço para a frente e para trás.
  bracosJuntos(s, quanto) {
    const lado = v().set(Math.cos(s.yaw), 0, -Math.sin(s.yaw)) // esquerda do corpo no mundo
    for (const [L, sinal] of [['Left', 1], ['Right', -1]]) {
      const braco = this.ossos.get(L + 'Arm')
      const ante = this.ossos.get(L + 'ForeArm')
      if (!braco || !ante) continue
      const u = ante.getWorldPosition(v()).sub(braco.getWorldPosition(v())).normalize()
      const ladoDoBraco = lado.clone().multiplyScalar(sinal)
      const abre = Math.asin(THREE.MathUtils.clamp(u.dot(ladoDoBraco), -1, 1)) // + = para fora
      const excesso = abre - 0.105 // 6°
      if (excesso <= 0) continue
      const alvo = u.clone().addScaledVector(ladoDoBraco, -Math.sin(excesso * quanto)).normalize()
      const eixo = v().crossVectors(u, alvo)
      if (eixo.lengthSq() < 1e-10) continue
      girarNoMundo(braco, eixo.normalize(), u.angleTo(alvo))
    }
  }

  // inclinar na curva (para dentro, como bicicleta) e na arrancada (para frente)
  inclinar(DT, s) {
    let dyaw = s.yaw - this.antes.yaw
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw))
    const giro = dyaw / Math.max(1e-3, DT)
    const acel = (s.vel - this.antes.vel) / Math.max(1e-3, DT)
    const alvoLado = THREE.MathUtils.clamp(giro * s.vel * 0.035, -0.3, 0.3)
    const alvoFrente = THREE.MathUtils.clamp(acel * 0.025, -0.15, 0.2)
    const k = 1 - Math.exp(-DT * 8)
    this.inclinacao.lado += (alvoLado - this.inclinacao.lado) * k
    this.inclinacao.frente += (alvoFrente - this.inclinacao.frente) * k
    const frente = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw))
    const direita = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw))
    const quadril = this.ossos.get('Hips')
    // o corpo todo tomba a partir do quadril; a coluna devolve metade para a cabeça ficar mais reta
    girarNoMundo(quadril, frente, -this.inclinacao.lado)
    girarNoMundo(quadril, direita, this.inclinacao.frente)
    const col = this.ossos.get('Spine1')
    if (col) girarNoMundo(col, frente, this.inclinacao.lado * 0.45)
  }

  // cada pé pisa no chão de verdade; o quadril desce o que o pé mais baixo precisar
  // Parado, os pés não deslizam. O mocap foi convertido "no lugar": o quadril ficou cravado e o balanço do
  // corpo virou pé patinando no chão (os dois juntos, até ~10 cm). Aqui é o contrário: o centro dos pés
  // fica onde estava quando ele parou e o quadril leva o balanço. A âncora acompanha bem devagar (~20 s) para
  // o corpo não ficar deslocado do lugar do jogador num parado longo.
  ancorarPes(DT, s) {
    const f = 1 - THREE.MathUtils.clamp((s.vel - 0.15) / 0.5, 0, 1)
    const pe = ['LeftFoot', 'RightFoot'].map((n) => this.ossos.get(n))
    const quadril = this.ossos.get('Hips')
    if (!quadril || pe.some((o) => !o)) return
    const raiz = this.corpo.raiz
    const centro = raiz.worldToLocal(pe[0].getWorldPosition(v()).add(pe[1].getWorldPosition(v())).multiplyScalar(0.5))
    if (!this.ancoraPes || f < 0.01) { this.ancoraPes = centro.clone(); return }
    this.ancoraPes.lerp(centro, 1 - Math.exp(-DT * 0.05))
    const delta = v().set(this.ancoraPes.x - centro.x, 0, this.ancoraPes.z - centro.z).multiplyScalar(f)
    if (delta.lengthSq() < 1e-8) return
    // de local da raiz para mundo (só direção) e daí para o pai do quadril
    const w = quadril.getWorldPosition(v()).add(delta.applyQuaternion(raiz.getWorldQuaternion(new THREE.Quaternion())))
    quadril.parent.worldToLocal(w)
    quadril.position.copy(w)
    quadril.updateMatrixWorld(true)
  }

  // Parado de joelho dobrado (os "parados" do Mixamo vêm com 15 a 40°) parece meio agachado: sobe o
  // quadril até o joelho mais dobrado ficar em alvoGraus e devolve cada pé, por IK, ao lugar em que estava.
  // Uma perna já esticada (o peso num pé só) limita a subida: o contrapposto fica.
  endireitarJoelhos(s, alvoGraus) {
    const f = 1 - THREE.MathUtils.clamp((s.vel - 0.3) / 0.7, 0, 1)
    if (f < 0.01) return
    const quadril = this.ossos.get('Hips')
    const pernas = ['Left', 'Right'].map((L) => ({ coxa: this.ossos.get(L + 'UpLeg'), canela: this.ossos.get(L + 'Leg'), pe: this.ossos.get(L + 'Foot') }))
    if (!quadril || pernas.some((p) => !p.coxa || !p.canela || !p.pe)) return
    const cosAlvo = Math.cos(THREE.MathUtils.degToRad(alvoGraus))
    let sobe = Infinity
    for (const p of pernas) {
      const A = p.coxa.getWorldPosition(v()), B = p.canela.getWorldPosition(v()), C = p.pe.getWorldPosition(v())
      p.C = C
      const a = A.distanceTo(B), b = B.distanceTo(C)
      const dAlvo = Math.sqrt(a * a + b * b + 2 * a * b * cosAlvo)
      const d = C.clone().sub(A)
      const horiz2 = d.x * d.x + d.z * d.z
      if (dAlvo * dAlvo <= horiz2) { sobe = 0; continue }
      sobe = Math.min(sobe, Math.sqrt(dAlvo * dAlvo - horiz2) - Math.abs(d.y))
    }
    if (!(sobe > 0.001)) return
    const w = quadril.getWorldPosition(v())
    w.y += Math.min(sobe, 0.06) * f
    quadril.parent.worldToLocal(w)
    quadril.position.copy(w)
    quadril.updateMatrixWorld(true)
    for (const p of pernas) ikPerna(p.coxa, p.canela, p.pe, p.C)
  }

  pesNoChao(s) {
    const raizY = this.corpo.raiz.getWorldPosition(v()).y
    const pernas = ['Left', 'Right'].map((L) => ({
      coxa: this.ossos.get(L + 'UpLeg'), canela: this.ossos.get(L + 'Leg'), pe: this.ossos.get(L + 'Foot'),
    })).filter((p) => p.coxa && p.canela && p.pe)
    const alvos = pernas.map((p) => {
      const P = p.pe.getWorldPosition(v())
      const dif = s.chao(P.x, P.z) - raizY // quanto o chão debaixo deste pé difere do chão do corpo
      return { p, P, dif }
    })
    const desce = Math.min(0, ...alvos.map((a) => a.dif))
    if (desce < 0) {
      const q = this.ossos.get('Hips')
      const w = q.getWorldPosition(v())
      w.y += desce
      q.parent.worldToLocal(w)
      q.position.copy(w)
      q.updateMatrixWorld(true)
    }
    for (const { p, P, dif } of alvos) ikPerna(p.coxa, p.canela, p.pe, P.add(new THREE.Vector3(0, dif, 0)))
  }
}
