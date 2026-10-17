// Roupa de verdade (fase 1 de docs/roupas-plano.md): cada peça é um pano simulado no Jolt, preso ao
// esqueleto. A malha desenhada tem dezenas de milhares de vértices; o Jolt simula um pano invisível
// simplificado (~1.000 pontos, os vértices agrupados numa grade de 3,5 cm) e cada vértice desenhado soma,
// no shader, o quanto os quatro pontos mais perto se afastaram do lugar deles. A malha segue com o
// esqueleto de sempre: contorno de quadrinho, luz e "em 2" não mudam.
// Mesma interface do pano de molas (pano.js): atualizar(dt, { vento, ventoDir, forca }).

import * as THREE from 'three'
import { carregarJolt, CAMADA } from './jolt.js'

const CELULA = 0.045
const _m = new THREE.Matrix4()
const _v = new THREE.Vector3()

// ---- pano invisível: agrupa os vértices em células e refaz as faces entre os grupos ----
function montarProxy(geo, celula) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight
  const N = pos.count
  const grupoDe = new Int32Array(N)
  const celulas = new Map() // "i,j,k" -> grupo
  const soma = [], conta = [], chaveDe = []
  const porCelula = new Map() // "i,j,k" -> grupos (um por osso dono)
  // osso que mais pesa em cada vértice: entra na chave do grupo (perna esquerda e direita não se juntam
  // na virilha, nem braço e tronco no sovaco; senão um lado puxava o outro e o pano rasgava na corrida)
  const dono = new Int32Array(N)
  for (let i = 0; i < N; i++) {
    let mw = -1
    for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > mw) { mw = sw.getComponent(i, c); dono[i] = si.getComponent(i, c) }
  }
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const ci = Math.floor(x / celula), cj = Math.floor(y / celula), ck = Math.floor(z / celula)
    const k = `${ci},${cj},${ck},${dono[i]}`
    let g = celulas.get(k)
    if (g === undefined) {
      g = soma.length; celulas.set(k, g); soma.push(new THREE.Vector3()); conta.push(0); chaveDe.push([ci, cj, ck])
      const kc = `${ci},${cj},${ck}`
      if (!porCelula.has(kc)) porCelula.set(kc, [])
      porCelula.get(kc).push(g)
    }
    soma[g].x += x; soma[g].y += y; soma[g].z += z; conta[g]++
    grupoDe[i] = g
  }
  const pontos = soma.map((s, g) => s.divideScalar(conta[g]))
  // pele de cada ponto: a do vértice desenhado mais perto do centro do grupo
  const melhor = new Float32Array(pontos.length).fill(Infinity)
  const pele = new Array(pontos.length)
  for (let i = 0; i < N; i++) {
    const g = grupoDe[i]
    const d = _v.fromBufferAttribute(pos, i).distanceToSquared(pontos[g])
    if (d < melhor[g]) { melhor[g] = d; pele[g] = [0, 1, 2, 3].map((c) => [si.getComponent(i, c), sw.getComponent(i, c)]) }
  }
  // faces entre grupos (sem repetir, sem degeneradas)
  const idx = geo.index ? geo.index.array : null
  const nTri = idx ? idx.length / 3 : N / 3
  const vistas = new Set()
  const faces = []
  for (let t = 0; t < nTri; t++) {
    const a = grupoDe[idx ? idx[t * 3] : t * 3], b = grupoDe[idx ? idx[t * 3 + 1] : t * 3 + 1], c = grupoDe[idx ? idx[t * 3 + 2] : t * 3 + 2]
    if (a === b || b === c || a === c) continue
    const k = [a, b, c].sort((p, q) => p - q).join(',')
    if (vistas.has(k)) continue
    vistas.add(k)
    faces.push([a, b, c])
  }
  // cada vértice desenhado segue os 4 pontos mais perto (grupos vizinhos na grade) que tenham a mesma pele
  // que ele (pesos de osso parecidos), peso pelo inverso da distância
  const indices = new Float32Array(N * 4), pesos = new Float32Array(N * 4)
  const cand = []
  const parecida = (i, g) => {
    let s = 0
    for (let c = 0; c < 4; c++) {
      const o = si.getComponent(i, c), w = sw.getComponent(i, c)
      for (const [og, wg] of pele[g]) if (og === o) s += Math.min(w, wg)
    }
    return s
  }
  for (let i = 0; i < N; i++) {
    _v.fromBufferAttribute(pos, i)
    const [ci, cj, ck] = chaveDe[grupoDe[i]]
    cand.length = 0
    cand.push([grupoDe[i], _v.distanceTo(pontos[grupoDe[i]])])
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const g of porCelula.get(`${ci + a},${cj + b},${ck + c}`) || []) {
        if (g !== grupoDe[i] && parecida(i, g) > 0.35) cand.push([g, _v.distanceTo(pontos[g])])
      }
    }
    cand.sort((p, q) => p[1] - q[1])
    let total = 0
    for (let k = 0; k < 4; k++) {
      const [g, d] = cand[Math.min(k, cand.length - 1)]
      const w = k < cand.length ? 1 / (d + 0.004) : 0
      indices[i * 4 + k] = g
      pesos[i * 4 + k] = w
      total += w
    }
    for (let k = 0; k < 4; k++) pesos[i * 4 + k] /= total
  }
  return { pontos, pele, faces, indices, pesos }
}

// ---- shader: soma o deslocamento do pano depois do esqueleto ----
function injetar(material, tex, largura) {
  const anterior = material.onBeforeCompile
  material.onBeforeCompile = (sh, r) => {
    anterior?.call(material, sh, r)
    sh.uniforms.uRoupa = { value: tex }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler2D uRoupa;
        attribute vec4 aRoupaI;
        attribute vec4 aRoupaP;
        attribute float aRoupaDentro;
        vec3 roupaDesl(float i) { int k = int(i + 0.5); return texelFetch(uRoupa, ivec2(k % ${largura}, k / ${largura}), 0).xyz; }`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>
        transformed += roupaDesl(aRoupaI.x) * aRoupaP.x + roupaDesl(aRoupaI.y) * aRoupaP.y
                     + roupaDesl(aRoupaI.z) * aRoupaP.z + roupaDesl(aRoupaI.w) * aRoupaP.w;
        transformed -= normalize(objectNormal) * aRoupaDentro;`)
  }
  const chave = material.customProgramCacheKey?.() || ''
  material.customProgramCacheKey = () => chave + '|roupa-jolt'
  material.needsUpdate = true
  // a mesma conta no modo webgpu (motor F2, KAN-68), depois do esqueleto
  ;(material.userData.tslEsqueleto ||= []).push(({ W }, pos) => {
    const { vec2, vec4, int, ivec2, float, normalize, textureLoad, attribute, normalLocal } = W
    const desl = (i) => {
      const k = int(i.add(0.5))
      return textureLoad(tex, ivec2(k.mod(int(largura)), k.div(int(largura)))).xyz
    }
    const aI = attribute('aRoupaI', 'vec4'), aP = attribute('aRoupaP', 'vec4')
    const soma = desl(aI.x).mul(aP.x).add(desl(aI.y).mul(aP.y)).add(desl(aI.z).mul(aP.z)).add(desl(aI.w).mul(aP.w))
    return pos.add(soma).sub(normalize(normalLocal).mul(attribute('aRoupaDentro', 'float')))
  })
}

const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// o quanto cada ponto pode se afastar do lugar dele (m), pela região da peça no repouso (pose em T)
function regrasCamisa(pontos) {
  const yMin = Math.min(...pontos.map((p) => p.y)), yMax = Math.max(...pontos.map((p) => p.y))
  const xMax = Math.max(...pontos.map((p) => Math.abs(p.x)))
  return (p) => {
    if (p.y > yMax - 0.1 && Math.abs(p.x) < 0.25) return 0 // gola e ombros presos
    let d = 0.006
    if (Math.abs(p.x) < 0.3) d = Math.max(d, 0.055 * (1 - suave(yMin, yMin + 0.18, p.y))) // barra solta (cai sobre a coxa sentado)
    d = Math.max(d, 0.035 * suave(xMax - 0.1, xMax, Math.abs(p.x))) // punho da manga
    return d
  }
}
function regrasCalca(pontos, { barraPorCima = Infinity } = {}) {
  const yMin = Math.min(...pontos.map((p) => p.y)), yMax = Math.max(...pontos.map((p) => p.y))
  return (p) => {
    if (p.y > Math.min(yMax - 0.08, barraPorCima - 0.02)) return 0 // cós preso; debaixo da camisa também
    return Math.max(0.004, 0.035 * (1 - suave(yMin, yMin + 0.16, p.y))) // boca da calça
  }
}

// uma peça: malha desenhada com esqueleto + regra de folga -> corpo mole no Jolt
// barraPorCima: altura (repouso) da barra da peça que vai por cima; o que esta peça tem acima dela fica
// preso e 1,5 cm para dentro, para a de cima ganhar sempre (o Jolt não bate pano com pano)
function criarPeca(jolt, malha, regra, { barraPorCima = Infinity, camada = CAMADA.PANO_SOLTO } = {}) {
  const { J } = jolt
  const geo = malha.geometry
  const proxy = montarProxy(geo, CELULA)
  const P = proxy.pontos.length
  const folga = regra(proxy.pontos, { barraPorCima })
  const bones = malha.skeleton.bones
  const nJ = bones.length

  const conf = new J.SoftBodySharedSettings()
  const vert = new J.SoftBodySharedSettingsVertex()
  const presos = new Uint8Array(P)
  const maxDist = new Float32Array(P)
  for (let i = 0; i < P; i++) {
    const p = proxy.pontos[i]
    maxDist[i] = folga(p)
    presos[i] = maxDist[i] < 0.002 ? 1 : 0
    vert.mPosition = new J.Float3(p.x, p.y, p.z)
    vert.mInvMass = presos[i] ? 0 : 1 / 0.002 // ~2 g por ponto
    conf.mVertices.push_back(vert)
  }
  J.destroy(vert)
  for (const [a, b, c] of proxy.faces) conf.AddFace(new J.SoftBodySharedSettingsFace(a, b, c, 0))
  const atr = new J.SoftBodySharedSettingsVertexAttributes()
  atr.mCompliance = 0.00001
  atr.mShearCompliance = 0.0001
  atr.mBendCompliance = 0.002
  conf.CreateConstraints(atr, 1, J.SoftBodySharedSettings_EBendType_Distance)
  J.destroy(atr)
  // juntas: inverso da ligação (osso no repouso) vezes a matriz da ligação da malha
  conf.mInvBindMatrices.resize(nJ)
  for (let j = 0; j < nJ; j++) {
    const ib = conf.mInvBindMatrices.at(j)
    ib.mJointIndex = j
    _m.multiplyMatrices(malha.skeleton.boneInverses[j], malha.bindMatrix)
    J.HEAPF32.set(_m.elements, J.getPointer(ib.get_mInvBind()) >> 2)
  }
  conf.mSkinnedConstraints.resize(P)
  for (let i = 0; i < P; i++) {
    const s = conf.mSkinnedConstraints.at(i)
    s.mVertex = i
    proxy.pele[i].forEach(([osso, peso], k) => {
      const w = s.get_mWeights(k)
      w.mInvBindIndex = osso
      w.mWeight = peso
    })
    s.mMaxDistance = maxDist[i]
    s.mBackStopDistance = 0.006
    s.mBackStopRadius = 0.4
  }
  conf.CalculateSkinnedConstraintNormals()
  conf.Optimize()
  const cs = new J.SoftBodyCreationSettings(conf, new J.RVec3(0, 0, 0), new J.Quat(0, 0, 0, 1), camada)
  cs.mUpdatePosition = false
  cs.mNumIterations = 4
  cs.mLinearDamping = 1.2
  cs.mVertexRadius = 0.004
  cs.mGravityFactor = 1
  const corpo = jolt.corpos.CreateSoftBody(cs)
  J.destroy(cs)
  jolt.corpos.AddBody(corpo.GetID(), J.EActivation_Activate)
  const mov = J.castObject(corpo.GetMotionProperties(), J.SoftBodyMotionProperties)
  const vs = mov.GetVertices()
  const base = J.getPointer(vs.at(0))
  const passo = (J.getPointer(vs.at(1)) - base) >> 2
  const offPos = (J.getPointer(vs.at(0).get_mPosition()) - base) >> 2
  const offVel = (J.getPointer(vs.at(0).get_mVelocity()) - base) >> 2
  // o Optimize do Jolt reordena as restrições, não os pontos: o ponto i do pano invisível é o i do Jolt
  const ordem = Int32Array.from({ length: P }, (_, i) => i)

  // malha desenhada: atributos e textura de deslocamento
  const largura = 64
  const altura = Math.ceil(P / largura)
  const dados = new Float32Array(largura * altura * 4)
  const tex = new THREE.DataTexture(dados, largura, altura, THREE.RGBAFormat, THREE.FloatType)
  tex.needsUpdate = true
  geo.setAttribute('aRoupaI', new THREE.BufferAttribute(proxy.indices, 4))
  geo.setAttribute('aRoupaP', new THREE.BufferAttribute(proxy.pesos, 4))
  const dentro = new Float32Array(geo.attributes.position.count)
  if (barraPorCima < Infinity) for (let i = 0; i < dentro.length; i++) dentro[i] = 0.015 * suave(barraPorCima - 0.01, barraPorCima + 0.04, geo.attributes.position.getY(i))
  geo.setAttribute('aRoupaDentro', new THREE.BufferAttribute(dentro, 1))
  injetar(malha.material, tex, largura)

  return { malha, proxy, P, mov, corpo, base, passo, offPos, offVel, ordem, tex, dados, presos, nJ, maxDist, sim: new Float32Array(P * 3), pele: new Float32Array(P * 3) }
}

// ---- cápsulas do corpo: coxa e canela, onde a camisa bate ----
// (o anteparo de cada ponto só segura o pano fora da pele do próprio lugar; a barra da camisa não sabe
// da coxa que sobe na corrida nem no sentar). Raio medido no corpo, um pouco menor que o membro, para
// não brigar com a manga e a calça que já o envolvem.
// Só as pernas: a cápsula do braço caído encostava na lateral da camisa e empurrava o pano para dentro
// do tronco (a pele aparecia); a manga já é presa ao braço.
const MEMBROS = [['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot']]
const TRECHO = [0.35, 0.9]
function criarCapsulas(jolt, corpo) {
  const { J } = jolt
  const ossos = corpo.skeleton.bones
  const acha = (n) => ossos.findIndex((b) => b.name.replace(/^mixamorig:?/, '') === n)
  corpo.updateMatrixWorld(true)
  const pos = corpo.geometry.attributes.position, si = corpo.geometry.attributes.skinIndex, sw = corpo.geometry.attributes.skinWeight
  const dono = new Int32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    let mw = -1
    for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > mw) { mw = sw.getComponent(i, c); dono[i] = si.getComponent(i, c) }
  }
  const seg = new THREE.Line3(), perto = new THREE.Vector3(), p = new THREE.Vector3()
  const capsulas = []
  for (const [a, b] of MEMBROS) {
    const ia = acha(a), ib = acha(b)
    if (ia < 0 || ib < 0) continue
    // tudo na pose da ligação (a malha no arquivo e os ossos como estavam quando foram ligados a ela)
    const naLigacao = (j) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(corpo.bindMatrix).invert().multiply(new THREE.Matrix4().copy(corpo.skeleton.boneInverses[j]).invert()))
    const A = naLigacao(ia), B = naLigacao(ib)
    seg.set(A, B)
    const d = []
    for (let i = 0; i < pos.count; i++) {
      if (dono[i] !== ia) continue
      p.fromBufferAttribute(pos, i)
      // só o meio do membro: a ponta do braço pega peito e sovaco, que também pesam no osso
      const t = seg.closestPointToPointParameter(p, false)
      if (t < 0.2 || t > 0.8) continue
      d.push(p.distanceTo(seg.at(t, perto)))
    }
    d.sort((x, y) => x - y)
    const raio = Math.min(0.08, (d.length ? d[Math.floor(d.length * 0.25)] : 0.04) * 0.75)
    // só o meio do membro (de 35% a 90% do osso): a ponta de cima ficava dentro do ombro e do quadril,
    // onde o pano é preso, e empurrava a camisa inteira para fora do lugar
    const meia = Math.max(0.01, A.distanceTo(B) * (TRECHO[1] - TRECHO[0]) / 2 - raio)
    const forma = new J.CapsuleShape(meia, raio)
    const bcs = new J.BodyCreationSettings(forma, new J.RVec3(A.x, A.y, A.z), new J.Quat(0, 0, 0, 1), J.EMotionType_Kinematic, CAMADA.CORPO)
    const corpoJ = jolt.corpos.CreateBody(bcs)
    J.destroy(bcs)
    jolt.corpos.AddBody(corpoJ.GetID(), J.EActivation_Activate)
    capsulas.push({ a: ossos[ia], b: ossos[ib], corpo: corpoJ, raio })
  }
  const rv = new J.RVec3(0, 0, 0), jq = new J.Quat(0, 0, 0, 1)
  const A = new THREE.Vector3(), B = new THREE.Vector3(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0)
  return {
    capsulas,
    mover(dt, pulou) {
      for (const c of capsulas) {
        c.a.getWorldPosition(A); c.b.getWorldPosition(B)
        q.setFromUnitVectors(Y, B.clone().sub(A).normalize())
        A.lerp(B, (TRECHO[0] + TRECHO[1]) / 2)
        rv.Set(A.x, A.y, A.z)
        jq.Set(q.x, q.y, q.z, q.w)
        if (pulou) jolt.corpos.SetPositionAndRotation(c.corpo.GetID(), rv, jq, J.EActivation_Activate)
        else jolt.corpos.MoveKinematic(c.corpo.GetID(), rv, jq, dt)
      }
    },
  }
}

export async function criarRoupa(malhas) {
  const camisa = malhas.find((m) => /camisa/i.test(m.material?.name || m.name))
  const calca = malhas.find((m) => /calca/i.test(m.material?.name || m.name))
  if (!camisa) return null
  const jolt = await carregarJolt()
  const { J } = jolt
  const pecas = []
  // a camisa vai por cima da calça: a calça sabe onde fica a barra (repouso, espaço da malha)
  const pc = camisa.geometry.attributes.position
  let barra = Infinity
  for (let i = 0; i < pc.count; i++) barra = Math.min(barra, pc.getY(i))
  const pele = malhas.find((m) => /^human|^base$|^corpo/i.test(m.name) && m.isSkinnedMesh)
  const capsulas = pele ? criarCapsulas(jolt, pele) : null
  pecas.push(criarPeca(jolt, camisa, regrasCamisa))
  if (calca) pecas.push(criarPeca(jolt, calca, regrasCalca, { barraPorCima: barra, camada: CAMADA.PANO_JUSTO }))
  const raizId = new J.RMat44().sIdentity()
  const juntas = new J.ArrayMat44()
  const maxJ = Math.max(...pecas.map((p) => p.nJ))
  juntas.resize(maxJ)
  const ptrJ = juntas.size() ? J.getPointer(juntas.at(0)) >> 2 : 0
  const passoJ = juntas.size() > 1 ? (J.getPointer(juntas.at(1)) >> 2) - ptrJ : 16
  const combinada = []
  const inv = new THREE.Matrix3()
  const sk = new THREE.Vector3(), tmp = new THREE.Vector3()
  let primeiro = true
  let ultimaRaiz = null
  let t = 0

  return {
    tipo: 'jolt',
    jolt, // para depurar pelo console (o mesmo mundo; importar jolt.js de novo no console cria outro)
    capsulas: capsulas?.capsulas,
    pontos: pecas.reduce((s, p) => s + p.P, 0),
    pecas,
    atualizar(dt, { vento = 1, ventoDir = new THREE.Vector3(1, 0, 0.3).normalize(), forca = 1 } = {}) {
      if (dt <= 0) return
      dt = Math.min(dt, 1 / 30)
      t += dt
      const H = J.HEAPF32
      // pulou longe (teleporte, sentar): o pano vai direto para o lugar
      const raizPos = pecas[0].malha.getWorldPosition(tmp)
      const pulou = !ultimaRaiz || ultimaRaiz.distanceTo(raizPos) > 1
      ultimaRaiz = (ultimaRaiz || new THREE.Vector3()).copy(raizPos)
      const rajada = (0.55 + 0.45 * Math.sin(t * 1.3) * Math.sin(t * 0.37 + 1)) * vento * forca
      // ossos com a pose deste quadro (o three só atualiza ao desenhar): sem isso o Jolt prendia o pano na
      // pose de um quadro atrás e, correndo, as cápsulas (que pegavam a pose nova) empurravam a camisa inteira
      let topo = pecas[0].malha.skeleton.bones[0]
      while (topo.parent && topo.parent.isBone) topo = topo.parent
      topo.updateWorldMatrix(true, true)
      for (const p of pecas) {
        p.malha.updateMatrixWorld()
        p.malha.skeleton.update()
        const bones = p.malha.skeleton.bones
        for (let j = 0; j < p.nJ; j++) H.set(bones[j].matrixWorld.elements, ptrJ + j * passoJ)
        p.mov.SkinVertices(raizId, juntas.data(), p.nJ, primeiro || pulou, jolt.temp)
        // vento: empurra a velocidade dos pontos soltos
        const b = p.base >> 2
        const ax = ventoDir.x * rajada * 2.2 * dt, az = ventoDir.z * rajada * 2.2 * dt
        for (let k = 0; k < p.P; k++) {
          const o = b + k * p.passo + p.offVel
          H[o] += ax; H[o + 2] += az
        }
      }
      capsulas?.mover(dt, primeiro || pulou)
      primeiro = false
      jolt.passo(dt)
      // deslocamento = pano simulado - onde o esqueleto põe o ponto (no espaço da malha, para o shader)
      for (const p of pecas) {
        const bones = p.malha.skeleton.bones, inversos = p.malha.skeleton.boneInverses
        for (let j = 0; j < p.nJ; j++) {
          combinada[j] = combinada[j] || new THREE.Matrix4()
          combinada[j].multiplyMatrices(bones[j].matrixWorld, inversos[j]).multiply(p.malha.bindMatrix)
        }
        inv.setFromMatrix4(p.malha.matrixWorld).invert()
        const b = p.base >> 2
        for (let i = 0; i < p.P; i++) {
          const k = p.ordem[i]
          const d = i * 4
          if (k < 0 || forca <= 0) { p.dados[d] = p.dados[d + 1] = p.dados[d + 2] = 0; continue }
          sk.set(0, 0, 0)
          for (const [osso, peso] of p.proxy.pele[i]) {
            if (!peso) continue
            sk.addScaledVector(tmp.copy(p.proxy.pontos[i]).applyMatrix4(combinada[osso]), peso)
          }
          const o = b + k * p.passo + p.offPos
          tmp.set(H[o] - sk.x, H[o + 1] - sk.y, H[o + 2] - sk.z)
          if (tmp.lengthSq() > 0.0225) tmp.setLength(0.15)
          // onde o ponto aparece no mundo (as dobras desenhadas leem daqui)
          p.sim[i * 3] = sk.x + tmp.x; p.sim[i * 3 + 1] = sk.y + tmp.y; p.sim[i * 3 + 2] = sk.z + tmp.z
          p.pele[i * 3] = sk.x; p.pele[i * 3 + 1] = sk.y; p.pele[i * 3 + 2] = sk.z
          tmp.applyMatrix3(inv)
          p.dados[d] = tmp.x; p.dados[d + 1] = tmp.y; p.dados[d + 2] = tmp.z
        }
        p.tex.needsUpdate = true
      }
    },
  }
}
