// Tecido solto (fase 7 do corpo): a barra da camisa, os punhos das mangas e a boca da calça atrasam,
// balançam e assentam, em vez de seguirem o osso como casca dura.
// Como funciona, barato o bastante para o navegador:
// - poucos pontos de controle (~36) na borda do pano, cada um uma partícula presa por mola ao lugar
//   onde a borda estaria se fosse dura (o vértice da borda deformado pelo esqueleto). Quando o corpo
//   acelera, a partícula atrasa; ao parar, passa um pouco e volta. Vento e um pouco de peso por cima.
// - colisão: o pano não entra no corpo. Cada borda é um anel; o deslocamento não pode apontar para
//   dentro do anel (o corpo está lá dentro).
// - cada vértice solto do pano segue os dois pontos de controle mais perto dele, com força que cresce da
//   costura (0) para a borda (1). O deslocamento é somado no shader, depois do esqueleto, então o
//   contorno do quadrinho acompanha.

import * as THREE from 'three'

const MAX_PONTOS = 48

// escolhe n vértices de uma borda, espalhados pelo ângulo em volta do centro do anel
function amostrarAnel(ids, pos, centro, eixo, n) {
  const a = new THREE.Vector3(), b = new THREE.Vector3(), base = new THREE.Vector3()
  const u = Math.abs(eixo.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
  const e1 = u.clone().sub(eixo.clone().multiplyScalar(u.dot(eixo))).normalize()
  const e2 = new THREE.Vector3().crossVectors(eixo, e1)
  const comAng = ids.map((i) => {
    a.copy(pos[i]).sub(centro)
    return [i, Math.atan2(a.dot(e2), a.dot(e1))]
  }).sort((p, q) => p[1] - q[1])
  const saida = []
  for (let k = 0; k < n; k++) {
    const alvo = -Math.PI + ((k + 0.5) / n) * Math.PI * 2
    let melhor = comAng[0]
    for (const c of comAng) if (Math.abs(c[1] - alvo) < Math.abs(melhor[1] - alvo)) melhor = c
    if (!saida.includes(melhor[0])) saida.push(melhor[0])
  }
  void b; void base
  return saida
}

// posições de repouso (mundo) de todos os vértices de uma malha com esqueleto
function repouso(m) {
  m.updateMatrixWorld(true)
  m.skeleton.update()
  const v = new THREE.Vector3()
  const p = m.geometry.attributes.position
  const out = new Array(p.count)
  for (let i = 0; i < p.count; i++) out[i] = m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).clone()
  return out
}

// Prepara uma malha: anéis (grupos de pontos de controle), atributos de peso por vértice e o shader.
// regioes: [{ nome, filtroBorda(p) -> bool, eixo, n, alcance, solto(p) -> 0..1 }]
function prepararMalha(malha, regioes, pontos) {
  const pos = repouso(malha)
  const N = pos.length
  const idx = new Float32Array(N * 2)
  const pes = new Float32Array(N * 2)
  for (const r of regioes) {
    const borda = []
    for (let i = 0; i < N; i++) if (r.filtroBorda(pos[i])) borda.push(i)
    if (borda.length < 4) continue
    const centro = borda.reduce((s, i) => s.add(pos[i]), new THREE.Vector3()).divideScalar(borda.length)
    const escolhidos = amostrarAnel(borda, pos, centro, r.eixo, r.n)
    const anel = { pontos: [], malha }
    const ini = pontos.length
    for (const i of escolhidos) {
      if (pontos.length >= MAX_PONTOS) break
      const ponto = { vert: i, malha, rep: pos[i].clone(), P: null, V: new THREE.Vector3(), T: new THREE.Vector3(), anel, rigidez: r.rigidez ?? 60, amortece: r.amortece ?? 7, max: r.max ?? 0.06 }
      pontos.push(ponto)
      anel.pontos.push(ponto)
    }
    const meus = pontos.slice(ini)
    // cada vértice solto da região: os dois pontos mais perto e a força pela distância da costura
    for (let i = 0; i < N; i++) {
      const s = r.solto(pos[i])
      if (s <= 0) continue
      let a = -1, b = -1, da = Infinity, db = Infinity
      meus.forEach((p, k) => {
        const d = p.rep.distanceToSquared(pos[i])
        if (d < da) { db = da; b = a; da = d; a = k } else if (d < db) { db = d; b = k }
      })
      if (a < 0) continue
      if (b < 0) b = a
      const wa = 1 / (Math.sqrt(da) + 1e-3), wb = 1 / (Math.sqrt(db) + 1e-3)
      idx[i * 2] = ini + a
      idx[i * 2 + 1] = ini + b
      pes[i * 2] = (s * wa) / (wa + wb)
      pes[i * 2 + 1] = (s * wb) / (wa + wb)
    }
  }
  malha.geometry.setAttribute('aPanoI', new THREE.BufferAttribute(idx, 2))
  malha.geometry.setAttribute('aPanoW', new THREE.BufferAttribute(pes, 2))
}

// o deslocamento entra no shader logo depois do esqueleto
function injetar(material, uniforme) {
  const anterior = material.onBeforeCompile
  material.onBeforeCompile = (sh, r) => {
    anterior?.call(material, sh, r)
    sh.uniforms.uPano = uniforme
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uPano[${MAX_PONTOS}];\nattribute vec2 aPanoI;\nattribute vec2 aPanoW;`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        transformed += uPano[int(aPanoI.x)] * aPanoW.x + uPano[int(aPanoI.y)] * aPanoW.y;`)
  }
  const chave = material.customProgramCacheKey?.() || ''
  material.customProgramCacheKey = () => chave + '|pano'
  material.needsUpdate = true
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// malhas do neto; devolve o simulador ou null se não achar camisa/calça
export function criarPano(malhas) {
  const camisa = malhas.find((m) => /camisa/i.test(m.material?.name || m.name))
  const calca = malhas.find((m) => /calca/i.test(m.material?.name || m.name))
  if (!camisa) return null
  const pontos = []
  // medidas da camisa no repouso (pose em T): barra embaixo, mangas na horizontal
  const pc = repouso(camisa)
  const yBarra = Math.min(...pc.map((p) => p.y))
  const xManga = Math.max(...pc.map((p) => Math.abs(p.x)))
  const regioesCamisa = [
    { // barra: o pano de baixo do tronco solta a partir de ~14 cm acima da borda
      filtroBorda: (p) => p.y < yBarra + 0.015 && Math.abs(p.x) < 0.3, eixo: new THREE.Vector3(0, 1, 0), n: 14,
      solto: (p) => (Math.abs(p.x) < 0.3 ? 1 - smooth(yBarra, yBarra + 0.14, p.y) : 0), rigidez: 55, amortece: 6, max: 0.07,
    },
  ]
  for (const s of [1, -1]) {
    regioesCamisa.push({ // punho da manga: solta nos últimos ~9 cm
      filtroBorda: (p) => p.x * s > xManga - 0.012, eixo: new THREE.Vector3(1, 0, 0), n: 6,
      solto: (p) => (p.x * s > 0.25 ? smooth(xManga - 0.09, xManga, p.x * s) : 0), rigidez: 70, amortece: 7, max: 0.04,
    })
  }
  prepararMalha(camisa, regioesCamisa, pontos)
  if (calca) {
    const pk = repouso(calca)
    const yBoca = Math.min(...pk.map((p) => p.y))
    const regioesCalca = [1, -1].map((s) => ({ // boca da calça arregaçada: solta nos últimos ~12 cm
      filtroBorda: (p) => p.y < yBoca + 0.015 && p.x * s > 0, eixo: new THREE.Vector3(0, 1, 0), n: 6,
      solto: (p) => (p.x * s > 0 ? 1 - smooth(yBoca, yBoca + 0.12, p.y) : 0), rigidez: 80, amortece: 8, max: 0.035,
    }))
    prepararMalha(calca, regioesCalca, pontos)
  }
  const uniforme = { value: Array.from({ length: MAX_PONTOS }, () => new THREE.Vector3()) }
  for (const m of [camisa, calca]) if (m) injetar(m.material, uniforme)

  const v = new THREE.Vector3()
  const centro = new THREE.Vector3()
  const fora = new THREE.Vector3()
  const inv = new THREE.Matrix3()
  let t = 0
  return {
    pontos: pontos.length,
    deslocamentos: uniforme.value, // para depurar: deslocamento de cada ponto, no espaço da malha
    // dt em segundos; vento 0..1 (o mesmo dos coqueiros); ventoDir no mundo
    atualizar(dt, { vento = 1, ventoDir = new THREE.Vector3(1, 0, 0.3).normalize(), forca = 1 } = {}) {
      if (dt <= 0) return
      dt = Math.min(dt, 1 / 30)
      t += dt
      for (const m of [camisa, calca]) if (m) { m.updateMatrixWorld(); m.skeleton.update() }
      // onde a borda estaria se o pano fosse duro
      for (const p of pontos) {
        p.malha.getVertexPosition(p.vert, p.T).applyMatrix4(p.malha.matrixWorld)
        if (!p.P) p.P = p.T.clone()
      }
      const rajada = (0.55 + 0.45 * Math.sin(t * 1.3) * Math.sin(t * 0.37 + 1)) * vento
      const aneis = new Set(pontos.map((p) => p.anel))
      for (const anel of aneis) {
        centro.set(0, 0, 0)
        for (const p of anel.pontos) centro.add(p.T)
        centro.divideScalar(anel.pontos.length)
        for (const p of anel.pontos) {
          // mola até a borda dura, amortecimento, vento (mais forte para fora) e um pouco de peso
          v.subVectors(p.T, p.P).multiplyScalar(p.rigidez)
          v.addScaledVector(p.V, -p.amortece)
          fora.subVectors(p.T, centro); fora.y = 0
          const lado = fora.lengthSq() > 1e-8 ? Math.max(0, fora.normalize().dot(ventoDir)) : 0
          v.addScaledVector(ventoDir, rajada * (1.2 + 2.0 * lado) * forca)
          v.y -= 0.6
          p.V.addScaledVector(v, dt)
          p.P.addScaledVector(p.V, dt)
          // não passa do máximo, nem entra no corpo (para dentro do anel)
          const d = v.subVectors(p.P, p.T)
          if (d.length() > p.max) { d.setLength(p.max); p.P.copy(p.T).add(d) }
          fora.subVectors(p.T, centro).normalize()
          const dentro = -d.dot(fora)
          if (dentro > 0.004) { p.P.addScaledVector(fora, dentro - 0.004); p.V.addScaledVector(fora, Math.max(0, -p.V.dot(fora))) }
        }
      }
      // deslocamento no espaço da malha (o shader soma depois do esqueleto)
      pontos.forEach((p, k) => {
        inv.setFromMatrix4(p.malha.matrixWorld).invert()
        uniforme.value[k].subVectors(p.P, p.T).applyMatrix3(inv).multiplyScalar(forca > 0 ? 1 : 0)
      })
    },
  }
}
