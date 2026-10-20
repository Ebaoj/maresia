// Regressão: o animador não aloca por pose (picos de coleta de lixo, 19/10/2026) e continua fazendo as MESMAS
// contas. Abaixo, o bloco "ref" é o código ANTIGO do animador (cópia literal das funções e métodos que
// alocavam vetores e quaternions a cada chamada); o teste roda o novo e o antigo em dois esqueletos gêmeos,
// 1.000 poses com ossos perturbados, e exige as mesmas matrizes de mundo (tolerância 1e-9).
import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Animador } from '../../src/jogador/animador.js'

// ---- código antigo (referência; não editar) ----
const ref = (() => {
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
  return {
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
    },
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
    },
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
    },
    sorteio() {
      this._s = ((this._s ?? 1932) * 16807) % 2147483647
      return (this._s - 1) / 2147483646
    },
    ajeitarChapeu() {
      const g = this.gesto
      const w = Math.sin(Math.PI * Math.min(1, g.t / g.dur))
      const cabeca = this.ossos.get('Head')
      const a = this.ossos.get('RightArm'), b = this.ossos.get('RightForeArm'), c = this.ossos.get('RightHand')
      if (!cabeca || !a || !b || !c) return
      const aba = this.eixos.abaChapeu.clone().applyMatrix4(cabeca.matrixWorld)
      const mao = c.getWorldPosition(v())
      ikDuas(a, b, c, mao.lerp(aba, w))
    },
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
    },
    endireitarClavicula(alvoGraus) {
      const alvo = THREE.MathUtils.degToRad(alvoGraus)
      for (const L of ['Left', 'Right']) {
        const c = this.ossos.get(L + 'Shoulder'), b = this.ossos.get(L + 'Arm')
        if (!c || !b || this.clavRep[L] == null) continue
        const sobe = this.clavRep[L] - alvo
        // só levanta ombro que nasceu caído demais (o neto MakeHuman, 28 a 33°); nunca abaixa: o neto do
        // Tripo nasce com 8° e a camada abaixava o ombro dele 10° (17/10/2026)
        if (sobe < 0.005) continue
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
    },
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
    },
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
    },
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
    },
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
    },
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
})()
// ---- fim do código antigo ----

const NOMES = ['Hips', 'Spine1', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase']

// esqueleto mínimo com os nomes canônicos, em T, joelhos e cotovelos levemente dobrados (o plano do IK não degenera)
function montarCorpo() {
  const ossos = new Map()
  const osso = (nome, pai, x, y, z) => {
    const b = new THREE.Bone()
    b.name = nome
    b.position.set(x, y, z)
    pai.add(b)
    ossos.set(nome, b)
    return b
  }
  const raiz = new THREE.Group()
  raiz.position.set(2, 0.3, -1)
  raiz.rotation.y = 0.4
  const hips = osso('Hips', raiz, 0, 1, 0)
  const col = osso('Spine1', hips, 0, 0.25, 0)
  const pescoco = osso('Neck', col, 0, 0.3, 0)
  osso('Head', pescoco, 0, 0.12, 0)
  for (const [L, s] of [['Left', 1], ['Right', -1]]) {
    const om = osso(L + 'Shoulder', col, s * 0.05, 0.25, 0)
    const br = osso(L + 'Arm', om, s * 0.15, -0.03, 0)
    const an = osso(L + 'ForeArm', br, s * 0.3, 0, 0.04)
    osso(L + 'Hand', an, s * 0.27, 0, 0)
    const cx = osso(L + 'UpLeg', hips, s * 0.1, -0.05, 0)
    const cn = osso(L + 'Leg', cx, 0, -0.42, 0.05)
    const pe = osso(L + 'Foot', cn, 0, -0.42, -0.04)
    osso(L + 'ToeBase', pe, 0, -0.06, 0.14)
  }
  raiz.updateMatrixWorld(true)
  return { raiz, ossos }
}

// gerador pseudoaleatório com semente (o teste é reproduzível)
function sorteador(semente) {
  let x = semente
  return () => { x = (x * 16807) % 2147483647; return (x - 1) / 2147483646 }
}

const chao = (x, z) => 0.05 * Math.sin(x * 3) + 0.04 * Math.cos(z * 2)

function maxDif(a, b) {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

describe('animador sem alocação por pose', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('mesmas contas do código antigo em 1.000 poses (tolerância 1e-9), sem clone() nos métodos de pose', () => {
    const cA = montarCorpo(), cB = montarCorpo()
    const novo = new Animador(cA, {}, { andar: 1.4, correr: 3.5 })
    const velho = new Animador(cB, {}, { andar: 1.4, correr: 3.5 })
    const rnd = sorteador(1932)
    const cloneV = vi.spyOn(THREE.Vector3.prototype, 'clone')
    const cloneQ = vi.spyOn(THREE.Quaternion.prototype, 'clone')
    let clonesNaPose = 0
    let pior = 0
    let gestos = 0
    let pontosMar = 0

    for (let it = 0; it < 1000; it++) {
      // a mesma perturbação nos dois esqueletos (a pose "do mixer" muda a cada quadro)
      for (const nome of NOMES) {
        const a = cA.ossos.get(nome), b = cB.ossos.get(nome)
        const ex = (rnd() - 0.5) * 0.5, ey = (rnd() - 0.5) * 0.5, ez = (rnd() - 0.5) * 0.5
        a.rotation.set(ex, ey, ez); b.rotation.set(ex, ey, ez)
      }
      const dy = (rnd() - 0.5) * 0.1
      cA.ossos.get('Hips').position.y = 1 + dy; cB.ossos.get('Hips').position.y = 1 + dy
      cA.raiz.updateMatrixWorld(true); cB.raiz.updateMatrixWorld(true)

      const parado = it % 200 < 130 // paradas longas: o gesto sorteado (mar, chapéu) acontece de verdade
      const s = {
        vel: parado ? rnd() * 0.2 : 0.5 + rnd() * 4, yaw: rnd() * 6 - 3, chao,
        olhar: it % 5 === 0 ? new THREE.Vector3(rnd() * 20 - 10, rnd() * 3, rnd() * 20 - 10) : null,
        noAr: false, nadando: false, sentado: false, carregando: false,
      }
      const DT = 1 / 12
      const seg = { x: rnd() * 4 - 1, y: 1.1 + rnd() * 0.3, z: rnd() * 4 - 1, raio: 0.2 }
      const chapeu = it % 11 === 0
      const gestoChapeu = chapeu ? { tipo: 'chapeu', t: rnd(), dur: 1.4 } : null

      cloneV.mockClear(); cloneQ.mockClear()
      novo.endireitarClavicula(10)
      novo.bracosJuntos(s, 0.6)
      novo.inclinar(DT, s)
      novo.ancorarPes(DT, s)
      novo.endireitarJoelhos(s, 8)
      novo.pesNoChao(s)
      const pontoN = novo.vidaParado(DT, s)
      novo.olhar(DT, pontoN || s.olhar)
      if (chapeu) { novo.gesto = { ...gestoChapeu }; gestos++; novo.ajeitarChapeu() }
      novo.maosEm(seg)
      clonesNaPose += cloneV.mock.calls.length + cloneQ.mock.calls.length

      ref.endireitarClavicula.call(velho, 10)
      ref.bracosJuntos.call(velho, s, 0.6)
      ref.inclinar.call(velho, DT, s)
      ref.ancorarPes.call(velho, DT, s)
      ref.endireitarJoelhos.call(velho, s, 8)
      ref.pesNoChao.call(velho, s)
      const pontoV = ref.vidaParado.call(velho, DT, s)
      ref.olhar.call(velho, DT, pontoV || s.olhar)
      if (chapeu) { velho.gesto = { ...gestoChapeu }; ref.ajeitarChapeu.call(velho) }
      if (pontoN) pontosMar++
      ref.maosEm.call(velho, seg)

      // o ponto do gesto "mar" é o mesmo
      expect((pontoN && pontoN.toArray()) || null).toEqual((pontoV && pontoV.toArray()) || null)
      for (const nome of NOMES) {
        pior = Math.max(pior, maxDif(cA.ossos.get(nome).matrixWorld.elements, cB.ossos.get(nome).matrixWorld.elements))
      }
      pior = Math.max(pior, maxDif(novo.frenteCorpo.toArray(), velho.frenteCorpo.toArray()), maxDif(novo.centroCorpo.toArray(), velho.centroCorpo.toArray()))
      if (novo.ancoraPes || velho.ancoraPes) expect(!!novo.ancoraPes).toBe(!!velho.ancoraPes)
      if (novo.ancoraPes) pior = Math.max(pior, maxDif(novo.ancoraPes.toArray(), velho.ancoraPes.toArray()))
      if (novo.olharAlvo || velho.olharAlvo) pior = Math.max(pior, maxDif(novo.olharAlvo.toArray(), velho.olharAlvo.toArray()))
      expect(Math.abs(novo.inclinacao.lado - velho.inclinacao.lado)).toBeLessThan(1e-9)
    }
    expect(gestos).toBeGreaterThan(50)
    expect(pontosMar).toBeGreaterThan(5) // o gesto "mar" (ponto devolvido por vidaParado) foi exercitado
    expect(pior).toBeLessThan(1e-9)
    // o único clone que sobra é o do primeiro olharAlvo (nasce uma vez por animador, não por pose)
    expect(clonesNaPose).toBeLessThanOrEqual(1)
  })

  it('pisadas: mesmos eventos do código antigo, e cada evento guarda o seu ponto (não um rascunho)', () => {
    const cA = montarCorpo(), cB = montarCorpo()
    const novo = new Animador(cA, {}, {}), velho = new Animador(cB, {}, {})
    const rnd = sorteador(7)
    for (let it = 0; it < 400; it++) {
      const dy = (rnd() - 0.5) * 0.4
      for (const c of [cA, cB]) {
        for (const L of ['Left', 'Right']) c.ossos.get(L + 'UpLeg').position.y = -0.05 + (L === 'Left' ? dy : -dy)
        c.raiz.position.y = it % 20 < 10 ? 0.6 : -0.2 // o corpo sobe e desce: os pés saem do chão e pisam
        c.raiz.updateMatrixWorld(true)
      }
      const s = { vel: 1, yaw: it * 0.1, chao: () => 0 }
      novo.detectarPisadas(s)
      ref.detectarPisadas.call(velho, s)
    }
    expect(novo.eventos.length).toBeGreaterThan(2)
    expect(novo.eventos.length).toBe(velho.eventos.length)
    novo.eventos.forEach((ev, i) => {
      const o = velho.eventos[i]
      expect(ev.lado).toBe(o.lado)
      expect(maxDif(ev.pos.toArray(), o.pos.toArray())).toBeLessThan(1e-9)
    })
    // pontos distintos entre si: nenhum evento aponta para o mesmo vetor de rascunho
    expect(new Set(novo.eventos.map((e) => e.pos)).size).toBe(novo.eventos.length)
  })
})
