// Motion matching (fase 2 do corpo, docs/corpo-plano.md). Em vez de misturar três movimentos pela
// velocidade, o jogo guarda todo quadro de todo movimento de locomoção num banco e, a cada pose,
// procura o quadro cuja "descrição" mais se parece com a situação agora:
//   - onde estão e para onde vão os pés e o quadril (para a troca não dar tranco)
//   - para onde o controle quer levar o corpo no próximo segundo (posição e direção em 1/3, 2/3 e 1 s)
// Achou um melhor que o atual, troca com uma transição curta. Referências: Simon Clavet (Ubisoft,
// GDC 2016, "Motion Matching and The Road to Next-Gen Animation"); Daniel Holden, "Learned Motion
// Matching" (2020) e o blog dele (theorangeduck.com), de onde vêm as características e os pesos.
//
// Raiz: o quadril projetado no chão e a direção dele, suavizados no tempo (assim o balanço natural do
// quadril fica no movimento). O jogo anda com o controle; o movimento tocado tem a raiz tirada.

import * as THREE from 'three'

const FPS = 30
const FUTURO = [10, 20, 30] // quadros à frente: 1/3, 2/3 e 1 s
const SUAVE = 8 // meia janela (quadros) para suavizar a raiz
const PESOS = { pes: 0.75, velPes: 1.0, velQuadril: 1.0, trajPos: 1.0, trajDir: 1.5 }
const DIM = 27

const anguloDe = (x, z) => Math.atan2(x, z)
const giro = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)] // gira (x, z) por -a no plano
const difAng = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b))

// Amostra um clipe com deslocamento no alvo e devolve, por quadro, o que importa no mundo
function amostrar(clipe, alvo) {
  const mixer = new THREE.AnimationMixer(alvo.raiz)
  const acao = mixer.clipAction(clipe)
  acao.setLoop(THREE.LoopOnce, 1) // senão o último quadro volta a ser o primeiro
  acao.clampWhenFinished = true
  acao.play()
  const n = Math.max(2, Math.round(clipe.duration * FPS) + 1)
  const quadros = []
  const v = () => new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const q = new THREE.Quaternion()
  for (let f = 0; f < n; f++) {
    mixer.setTime(Math.min(clipe.duration, f / FPS))
    alvo.raiz.updateMatrixWorld(true)
    const quad = alvo.ossos.get('Hips').getWorldPosition(v())
    alvo.ossos.get('Hips').getWorldQuaternion(q)
    fwd.set(0, 0, 1).applyQuaternion(q)
    quadros.push({
      quadril: quad,
      yaw: anguloDe(fwd.x, fwd.z),
      peE: alvo.ossos.get('LeftFoot').getWorldPosition(v()),
      peD: alvo.ossos.get('RightFoot').getWorldPosition(v()),
    })
  }
  acao.stop()
  mixer.uncacheRoot(alvo.raiz)
  // yaw contínuo (sem pular de +π para -π)
  for (let f = 1; f < n; f++) quadros[f].yaw = quadros[f - 1].yaw + difAng(quadros[f].yaw, quadros[f - 1].yaw)
  return quadros
}

// raiz suavizada: média do quadril (no chão) e do yaw numa janela
function raizes(quadros, loop) {
  const n = quadros.length
  const ultimo = n - 1
  const pega = (f) => {
    if (loop) {
      const voltas = Math.floor(f / ultimo)
      const r = ((f % ultimo) + ultimo) % ultimo
      const base = quadros[r]
      const d = quadros[ultimo].quadril.clone().sub(quadros[0].quadril)
      const dy = quadros[ultimo].yaw - quadros[0].yaw
      return { x: base.quadril.x + d.x * voltas, z: base.quadril.z + d.z * voltas, yaw: base.yaw + dy * voltas }
    }
    const b = quadros[Math.min(ultimo, Math.max(0, f))]
    return { x: b.quadril.x, z: b.quadril.z, yaw: b.yaw }
  }
  const raiz = (f) => {
    let x = 0, z = 0, yaw = 0, k = 0
    for (let i = -SUAVE; i <= SUAVE; i++) { const p = pega(f + i); x += p.x; z += p.z; yaw += p.yaw; k++ }
    return { x: x / k, z: z / k, yaw: yaw / k }
  }
  return { raiz, pega }
}

export class BancoDeMovimento {
  // entradas: [{ nome, clipe (convertido COM deslocamento), loop }]; alvo: { raiz, ossos } (fora da cena)
  constructor(entradas, alvo) {
    this.entradas = []
    const linhas = []
    for (const e of entradas) {
      const quadros = amostrar(e.clipe, alvo)
      const { raiz } = raizes(quadros, e.loop)
      const n = quadros.length
      const R = Array.from({ length: n + FUTURO[2] + 2 }, (_, f) => raiz(f))
      const inicio = this.entradas.length ? linhas.length : 0
      const valido = []
      for (let f = 0; f < n; f++) {
        const r = R[f]
        const ate = (p) => giro(p.x - r.x, p.z - r.z, r.yaw)
        const ant = quadros[Math.max(0, f - 1)]
        const seg = quadros[Math.min(n - 1, f + 1)]
        const dt = (Math.min(n - 1, f + 1) - Math.max(0, f - 1)) / FPS || 1 / FPS
        const vel = (a, b) => { const d = b.clone().sub(a).divideScalar(dt); const [x, z] = giro(d.x, d.z, r.yaw); return [x, d.y, z] }
        const pe = (p) => { const [x, z] = ate(p); return [x, p.y, z] }
        const linha = [
          ...pe(quadros[f].peE), ...pe(quadros[f].peD),
          ...vel(ant.peE, seg.peE), ...vel(ant.peD, seg.peD),
          ...vel(ant.quadril, seg.quadril),
        ]
        for (const k of FUTURO) { const p = R[f + k]; linha.push(...ate(p)) }
        for (const k of FUTURO) { const a = R[f + k].yaw - r.yaw; linha.push(Math.sin(a), Math.cos(a)) }
        linhas.push(linha)
        // fim de clipe que não repete: sem futuro de verdade, não serve para começar a tocar
        valido.push(e.loop || f < n - 12)
      }
      const ritmo = /correr|disparada|trote|correndo/.test(e.nome) ? 'corrida' : /parado|virar/.test(e.nome) ? 'livre' : 'andar'
      this.entradas.push({ ...e, inicio, n, valido, quadros, R, ritmo })
    }
    // normalização por grupo: cada grupo pesa o mesmo, qualquer que seja a unidade
    this.grupos = [[0, 6, PESOS.pes], [6, 12, PESOS.velPes], [12, 15, PESOS.velQuadril], [15, 21, PESOS.trajPos], [21, 27, PESOS.trajDir]]
    this.media = new Float32Array(DIM)
    this.escala = new Float32Array(DIM)
    for (let d = 0; d < DIM; d++) this.media[d] = linhas.reduce((s, l) => s + l[d], 0) / linhas.length
    for (const [a, b, w] of this.grupos) {
      let s = 0
      for (const l of linhas) for (let d = a; d < b; d++) s += (l[d] - this.media[d]) ** 2
      const desvio = Math.sqrt(s / (linhas.length * (b - a))) || 1
      for (let d = a; d < b; d++) this.escala[d] = w / desvio
    }
    this.dados = new Float32Array(linhas.length * DIM)
    linhas.forEach((l, i) => { for (let d = 0; d < DIM; d++) this.dados[i * DIM + d] = (l[d] - this.media[d]) * this.escala[d] })
    this.total = linhas.length
    this.validos = new Uint8Array(this.total)
    for (const e of this.entradas) e.valido.forEach((ok, f) => { this.validos[e.inicio + f] = ok ? 1 : 0 })
  }

  // características do quadro (entrada, f) já normalizadas
  linha(e, f) { const i = this.entradas[e].inicio + f; return this.dados.subarray(i * DIM, i * DIM + DIM) }

  // consulta: pose do quadro tocando agora + trajetória pedida (6 posições e 6 direções, no espaço da raiz)
  // permitido(e): filtro opcional de entradas (ritmo: não pegar virada de corrida andando, e vice-versa)
  buscar(pose, traj, permitido = null) {
    const q = new Float32Array(DIM)
    for (let d = 0; d < 15; d++) q[d] = pose[d]
    for (let d = 15; d < DIM; d++) q[d] = (traj[d - 15] - this.media[d]) * this.escala[d]
    let melhor = -1
    let custo = Infinity
    const ok = permitido ? this.entradas.map((_, e) => permitido(e)) : null
    let e = 0
    for (let i = 0; i < this.total; i++) {
      while (e + 1 < this.entradas.length && i >= this.entradas[e + 1].inicio) e++
      if (!this.validos[i] || (ok && !ok[e])) continue
      let c = 0
      const o = i * DIM
      for (let d = 0; d < DIM; d++) { const x = this.dados[o + d] - q[d]; c += x * x; if (c >= custo) break }
      if (c < custo) { custo = c; melhor = i }
    }
    const em = this.entradas.findIndex((x) => melhor >= x.inicio && melhor < x.inicio + x.n)
    return { e: em, f: melhor - this.entradas[em].inicio, custo, q }
  }

  custoDe(e, f, q) {
    const l = this.linha(e, f)
    let c = 0
    for (let d = 0; d < DIM; d++) c += (l[d] - q[d]) ** 2
    return c
  }

  // clipe para tocar: o mesmo movimento com a raiz (suavizada) tirada do quadril; o resto fica
  clipeParaTocar(e) {
    const ent = this.entradas[e]
    const { clipe } = ent
    const trilhas = clipe.tracks.map((t) => {
      if (t.name.endsWith('Hips.quaternion')) {
        const v = t.values.slice()
        const tmp = new THREE.Quaternion()
        const tira = new THREE.Quaternion()
        for (let k = 0; k < t.times.length; k++) {
          const r = ent.R[Math.min(ent.n - 1, Math.round(t.times[k] * FPS))]
          tira.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -r.yaw)
          tmp.fromArray(v, k * 4).premultiply(tira).toArray(v, k * 4)
        }
        return new THREE.QuaternionKeyframeTrack(t.name, t.times, v)
      }
      if (t.name.endsWith('Hips.position')) {
        const v = t.values.slice()
        for (let k = 0; k < t.times.length; k++) {
          const r = ent.R[Math.min(ent.n - 1, Math.round(t.times[k] * FPS))]
          const [x, z] = giro(v[k * 3] - r.x, v[k * 3 + 2] - r.z, r.yaw)
          v[k * 3] = x
          v[k * 3 + 2] = z
        }
        return new THREE.VectorKeyframeTrack(t.name, t.times, v)
      }
      return t.clone()
    })
    return new THREE.AnimationClip('mm:' + ent.nome, clipe.duration, trilhas)
  }
}

// Trajetória pedida pelo controle, no espaço da raiz (frente = +Z): mola crítica para a velocidade
// (como o controle faz) e aproximação exponencial para a direção.
// 24/10/2026: o resultado vai para um array reaproveitado (o chamador usa na hora e não guarda): antes eram
// três arrays novos por quadro (a lista de posições, a de direções e a junção).
const TRAJ = new Array(FUTURO.length * 4).fill(0)
export function trajetoriaPedida({ vel, velDesejada, yaw, yawDesejado, acel = 10, giroTaxa = 8 }) {
  let i = 0
  const cos = Math.cos(yaw)
  const sen = Math.sin(yaw)
  for (const k of FUTURO) {
    const t = k / FPS
    const e = Math.exp(-acel * t)
    const px = velDesejada.x * t + (vel.x - velDesejada.x) * (1 - e) / acel
    const pz = velDesejada.z * t + (vel.z - velDesejada.z) * (1 - e) / acel
    TRAJ[i++] = px * cos - pz * sen // gira (x, z) por -yaw no plano
    TRAJ[i++] = px * sen + pz * cos
  }
  for (const k of FUTURO) {
    const t = k / FPS
    const y = yaw + difAng(yawDesejado, yaw) * (1 - Math.exp(-giroTaxa * t))
    const a = y - yaw
    TRAJ[i++] = Math.sin(a)
    TRAJ[i++] = Math.cos(a)
  }
  return TRAJ
}

// Espelha um clipe (esquerda vira direita): dobra o banco de graça, por exemplo a curva para a
// esquerda vira curva para a direita. Vale para o esqueleto padrão, que é simétrico e tem os ossos
// sem rotação no repouso: espelhar em X troca (x, y, z, w) por (x, -y, -z, w) e x da posição por -x.
export function espelhar(clipe, nome) {
  const troca = (n) => n.replace(/Left|Right/, (m) => (m === 'Left' ? 'Right' : 'Left'))
  const trilhas = clipe.tracks.map((t) => {
    const v = t.values.slice()
    if (t.name.endsWith('.quaternion')) for (let k = 0; k < v.length; k += 4) { v[k + 1] = -v[k + 1]; v[k + 2] = -v[k + 2] }
    else if (t.name.endsWith('.position')) for (let k = 0; k < v.length; k += 3) v[k] = -v[k]
    const T = t.name.endsWith('.quaternion') ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack
    return new T(troca(t.name), t.times, v)
  })
  return new THREE.AnimationClip(nome, clipe.duration, trilhas)
}
