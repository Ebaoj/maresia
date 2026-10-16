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
function ikPerna(coxa, canela, pe, alvo) {
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
    this.mixer = new THREE.AnimationMixer(corpo.raiz)
    this.passadas = passadas
    this.acoes = {}
    for (const [nome, clipe] of Object.entries(clipes)) {
      const a = this.mixer.clipAction(clipe)
      a.enabled = true
      a.setEffectiveWeight(0)
      a.play()
      a.userData = { peso: 0, alvo: 0 }
      if (['sentar', 'levantar', 'pulo-pouso', 'pulo-subida'].includes(nome)) {
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
  usarBanco(banco) {
    this.banco = banco
    this.mm = { e: -1, t: 0, chave: null, tocando: false, espera: 0 }
    banco.entradas.forEach((ent, e) => {
      const clipe = banco.clipeParaTocar(e)
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
    if (!atual || mm.espera <= 0 || fimDoClipe) {
      mm.espera = 0.1 // procura 10 vezes por segundo
      const pose = atual ? this.banco.linha(atual.userData.e, fAtual) : this.banco.linha(0, 0)
      // ritmo: correndo (ou pedindo corrida) não pega movimento de andar; andando não pega de corrida
      // freando de uma corrida, segue no ritmo de corrida até quase parar (usa a freada de quem corre)
      const vinhaCorrendo = entAtual && entAtual.ritmo === 'corrida'
      const correndo = (s.velPedida || 0) > 3 || (vinhaCorrendo && s.vel > 0.8 && (s.velPedida || 0) < 0.5)
      const r = this.banco.buscar(pose, s.traj, (e) => {
        const rit = this.banco.entradas[e].ritmo
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
      this.giroAcumulado = (this.giroAcumulado || 0) + (ent.R[fComp].yaw - ent.R[ant.f].yaw)
    }
    mm.raizAnt = { chave: mm.chave, f }
  }

  // o controle lê e zera o giro acumulado
  consumirGiro() {
    const g = this.giroAcumulado || 0
    this.giroAcumulado = 0
    return g
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

    // eventos: pousou, sentou, levantou
    if (this.antes.noAr && !s.noAr && !s.nadando && s.vel < 2.5) this.disparar('pulo-pouso')
    if (!this.antes.noAr && s.noAr && s.velY > 0) this.disparar('pulo-subida')
    if (!this.antes.sentado && s.sentado) this.disparar('sentar')
    if (this.antes.sentado && !s.sentado) this.disparar('levantar')
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
      alvo.parado = 1 - tAndar
      alvo[andarNome] = tAndar * (1 - tCorrer)
      alvo.correr = tAndar * tCorrer
    }
    if (this.umaVez) alvo[this.umaVez] = 1
    else if (s.sentado) alvo.sentado = 1
    else if (s.nadando) alvo[s.vel > 0.6 && this.tem('nadar') ? 'nadar' : 'boiar'] = 1
    else if (s.noAr) alvo[s.velY > 0 && this.tem('pulo-subida') ? 'pulo-subida' : 'pulo-queda'] = 1
    else if (this.mm && this.opcoes.mm && !s.carregando && s.traj) this.casar(DT, s, alvo)
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
    if (this.opcoes.inclinar) this.inclinar(DT, s)
    if (this.opcoes.ik && !s.noAr && !s.nadando && !s.sentado && s.chao) this.pesNoChao(s)
    this.detectarPisadas(s)
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
