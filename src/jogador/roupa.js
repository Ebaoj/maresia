// Roupa de verdade (fase 1 de docs/roupas-plano.md): cada peça é um pano simulado no Jolt, preso ao
// esqueleto. A malha desenhada tem dezenas de milhares de vértices; o Jolt simula um pano invisível
// simplificado (~1.000 pontos, os vértices agrupados numa grade de 3,5 cm) e cada vértice desenhado soma,
// no shader, o quanto os quatro pontos mais perto se afastaram do lugar deles. A malha segue com o
// esqueleto de sempre: contorno de quadrinho, luz e "em 2" não mudam.
// Mesma interface do pano de molas (pano.js): atualizar(dt, { vento, ventoDir, forca }).

import * as THREE from 'three'
import { MeshBVH } from 'three-mesh-bvh'
import { criarColisores } from './roupa-colisores.js'
import { PADRAO } from '../config.js'
import { carregarJolt, CAMADA } from './jolt.js'

const CELULA = 0.045
const _m = new THREE.Matrix4()
const _v = new THREE.Vector3()

// O pano do Jolt tem limite de distância: a folga (4,5 cm) a partir do lugar onde ele nasce.
// Se o pedaço nasce dentro da pele, o solver não alcança tirar o tecido de dentro do corpo: ele
// puxa de volta e a roupa atravessa a pele. Aqui mede-se quanto cada pedaço nasce dentro da pele,
// para a folga daquele pedaço conseguir chegar lá fora. A profundidade é medida na pose de
// repouso, que é a pose em que o pano é criado: é nela que o limite vale.
//
// O dentro/fora não sai da normal da face: o winding do corpo é misto (parte das faces aponta
// para dentro), e o sinal pela normal dava profundidade de 8 cm onde o pano nascia a 0,1 mm da
// pele. Aqui o dentro/fora vem de paridade (contagem de interseções de um raio), que independe
// do winding; três raios votam para não depender de um raio raspar numa aresta.
export function criarMedidorDeProfundidade (pele) {
  if (!pele?.geometry?.index) return null
  const geo = pele.geometry
  const bvh = new MeshBVH(geo, { targetLeafSize: 8 })
  const alvo = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 }
  const raios = [
    new THREE.Vector3(0.31, 0.13, 0.94).normalize(),
    new THREE.Vector3(-0.42, 0.22, 0.88).normalize(),
    new THREE.Vector3(0.19, -0.35, -0.92).normalize(),
  ]
  const dentroDaPele = (ponto) => {
    let votos = 0
    for (const d of raios) {
      const hits = bvh.raycast(new THREE.Ray(ponto.clone().addScaledVector(d, 1e-4), d), THREE.DoubleSide)
      if (hits.length % 2 === 1) votos++
    }
    return votos >= 2
  }
  return (fonte) => {
    const atributos = fonte.attributes.position
    const profundidades = new Float32Array(atributos.count)
    for (let i = 0; i < profundidades.length; i++) {
      _v.fromBufferAttribute(atributos, i)
      bvh.closestPointToPoint(_v, alvo)
      profundidades[i] = dentroDaPele(_v) ? alvo.distance : 0
    }
    return profundidades
  }
}

// O limite de distância de um ponto do pano: a folga mais o quanto aquele pedaço nasce dentro da
// pele. Sem a profundidade, o solver segura o pano dentro do corpo e a roupa atravessa a pele.
export const limiteDoPonto = (folga, profundidade) => folga + profundidade

// Os limites de todos os pontos do pano, na mesma ordem dos pontos. É esta conta que o Jolt usa e
// que o teste do encaixe confere: se a profundidade sumir daqui, a roupa volta a atravessar a pele.
export function limitesDoPano (pontos, folgaDe, profundidades = null) {
  return pontos.map((p, i) => limiteDoPonto(folgaDe(p), profundidades ? profundidades[i] : 0))
}

export const TAMANHO_CELULA = CELULA

// ---- pano invisível: agrupa os vértices em células e refaz as faces entre os grupos ----
function montarProxy(geo, celula, geoRender = geo, profundidades = null) {
  const pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight
  const N = pos.count
  const superficieFornecida = geoRender !== geo
  const grupoDe = new Int32Array(N)
  const celulas = new Map() // "i,j,k" -> grupo
  const soma = [], conta = [], chaveDe = []
  const porCelula = new Map() // "i,j,k" -> grupos (um por osso dono)
  // osso que mais pesa em cada vértice: entra na chave do grupo (perna esquerda e direita não se juntam
  // na virilha, nem braço e tronco no sovaco; senão um lado puxava o outro e o pano rasgava na corrida)
  const dono = new Int32Array(N)
  // o quanto cada célula nasce dentro da pele: o limite de distância do ponto tem de alcançar essa
  // profundidade, senão o solver puxa o pano de volta para dentro do corpo
  const dentro = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    let mw = -1
    for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > mw) { mw = sw.getComponent(i, c); dono[i] = si.getComponent(i, c) }
  }
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const ci = Math.floor(x / celula), cj = Math.floor(y / celula), ck = Math.floor(z / celula)
    const k = superficieFornecida ? String(i) : `${ci},${cj},${ck},${dono[i]}`
    let g = celulas.get(k)
    if (g === undefined) {
      g = soma.length; celulas.set(k, g); soma.push(new THREE.Vector3()); conta.push(0); chaveDe.push([ci, cj, ck])
      const kc = `${ci},${cj},${ck}`
      if (!porCelula.has(kc)) porCelula.set(kc, [])
      porCelula.get(kc).push(g)
    }
    soma[g].x += x; soma[g].y += y; soma[g].z += z; conta[g]++
    if (profundidades && profundidades[i] > dentro[g]) dentro[g] = profundidades[i]
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
  const rp = geoRender.attributes.position, rsi = geoRender.attributes.skinIndex, rsw = geoRender.attributes.skinWeight
  const indices = new Float32Array(rp.count * 4), pesos = new Float32Array(rp.count * 4)
  const cand = []
  const parecida = (i, g) => {
    let s = 0
    for (let c = 0; c < 4; c++) {
      const o = rsi.getComponent(i, c), w = rsw.getComponent(i, c)
      for (const [og, wg] of pele[g]) if (og === o) s += Math.min(w, wg)
    }
    return s
  }
  for (let i = 0; i < rp.count; i++) {
    _v.fromBufferAttribute(rp, i)
    const proprio = geoRender === geo ? grupoDe[i] : -1
    const [ci, cj, ck] = proprio >= 0 ? chaveDe[proprio] : [Math.floor(_v.x / celula), Math.floor(_v.y / celula), Math.floor(_v.z / celula)]
    cand.length = 0
    if (proprio >= 0) cand.push([proprio, _v.distanceTo(pontos[proprio])])
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const g of porCelula.get(`${ci + a},${cj + b},${ck + c}`) || []) {
        if (g !== proprio && parecida(i, g) > 0.35) cand.push([g, _v.distanceTo(pontos[g])])
      }
    }
    // Uma parede interna pode ter outro osso dominante: ainda segue a superfície física mais perto.
    if (!cand.length) for (let g = 0; g < pontos.length; g++) cand.push([g, _v.distanceTo(pontos[g])])
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
  return { pontos, pele, faces, indices, pesos, dentro }
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
function regrasCamisa(pontos, { fisica }) {
  const yMin = Math.min(...pontos.map((p) => p.y)), yMax = Math.max(...pontos.map((p) => p.y))
  const xMax = Math.max(...pontos.map((p) => Math.abs(p.x)))
  return (p) => {
    // Só a borda superior sustenta a peça; ombros e tronco podem dobrar sobre o colisor.
    if (p.y > yMax - fisica.roupaGola && Math.abs(p.x) < 0.13) return 0
    let d = fisica.roupaFolga
    if (Math.abs(p.x) < 0.3) d = Math.max(d, fisica.roupaBarra * (1 - suave(yMin, yMin + 0.18, p.y)))
    d = Math.max(d, fisica.roupaManga * suave(xMax - 0.1, xMax, Math.abs(p.x)))
    return d
  }
}
function regrasCalca(pontos, { barraPorCima = Infinity } = {}) {
  const yMin = Math.min(...pontos.map((p) => p.y)), yMax = Math.max(...pontos.map((p) => p.y))
  return (p) => {
    if (p.y > Math.min(yMax - 0.08, barraPorCima - 0.02)) return 0 // cós preso; debaixo da camisa também
    return 0.035 * (1 - suave(yMin, yMin + 0.16, p.y)) // só a boca fica solta; quadril e pernas seguem o ajuste ao corpo
  }
}

// uma peça: malha desenhada com esqueleto + regra de folga -> corpo mole no Jolt
// barraPorCima: altura (repouso) da barra da peça que vai por cima; o que esta peça tem acima dela fica
// preso e 1,5 cm para dentro, para a de cima ganhar sempre (o Jolt não bate pano com pano)
function criarPeca(jolt, malha, regra, { barraPorCima = Infinity, camada = CAMADA.PANO_SOLTO, fisica = PADRAO.personagem, medirProfundidade = null } = {}) {
  const { J } = jolt
  const geo = malha.geometry
  const fonte = malha.userData.roupaProxy || geo
  const proxy = montarProxy(fonte, CELULA, geo, medirProfundidade ? medirProfundidade(fonte) : null)
  const P = proxy.pontos.length
  const folga = regra(proxy.pontos, { barraPorCima, fisica })
  // o limite de cada ponto: a folga mais a profundidade em que ele nasce dentro da pele
  const limites = limitesDoPano(proxy.pontos, folga, proxy.dentro)
  const bones = malha.skeleton.bones
  const nJ = bones.length

  const conf = new J.SoftBodySharedSettings()
  const vert = new J.SoftBodySharedSettingsVertex()
  const presos = new Uint8Array(P)
  const maxDist = new Float32Array(P)
  for (let i = 0; i < P; i++) {
    const p = proxy.pontos[i]
    maxDist[i] = limites[i]
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
  atr.mBendCompliance = fisica.roupaFlexao
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
    s.mBackStopDistance = camada === CAMADA.PANO_SOLTO ? fisica.roupaFolga : 0.006
    s.mBackStopRadius = 0.4
  }
  conf.CalculateSkinnedConstraintNormals()
  conf.Optimize()
  const cs = new J.SoftBodyCreationSettings(conf, new J.RVec3(0, 0, 0), new J.Quat(0, 0, 0, 1), camada)
  cs.mUpdatePosition = false
  cs.mNumIterations = fisica.roupaIteracoes
  cs.mLinearDamping = fisica.roupaAmortecimento
  cs.mVertexRadius = fisica.roupaEspessura
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

export async function criarRoupa(malhas, ajustes = PADRAO.personagem, mundo = null) {
  const fisica = { ...PADRAO.personagem, ...ajustes }
  const camisa = malhas.find((m) => /camisa/i.test(m.material?.name || m.name))
  const calca = malhas.find((m) => /calca/i.test(m.material?.name || m.name))
  if (!camisa) return null
  const jolt = mundo || await carregarJolt()
  const { J } = jolt
  const pecas = []
  // a camisa vai por cima da calça: a calça sabe onde fica a barra (repouso, espaço da malha)
  const pc = camisa.geometry.attributes.position
  let barra = Infinity
  for (let i = 0; i < pc.count; i++) barra = Math.min(barra, pc.getY(i))
  const pele = malhas.find((m) => /^human|^base$|^corpo/i.test(m.name) && m.isSkinnedMesh)
  const colisores = pele ? criarColisores(jolt, pele) : null
  // mede o quanto cada pedaço da roupa nasce dentro da pele, para o limite de distância do pano
  // alcançar esse tanto (sem isso a camisa é puxada de volta para dentro do corpo)
  const medirProfundidade = criarMedidorDeProfundidade(pele)
  pecas.push(criarPeca(jolt, camisa, regrasCamisa, { fisica, medirProfundidade }))
  if (calca) pecas.push(criarPeca(jolt, calca, regrasCalca, { barraPorCima: barra, camada: CAMADA.PANO_JUSTO, fisica, medirProfundidade }))
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
    colisores,
    capsulas: colisores?.partes,
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
        // SkinVertices atualiza alvos, mas não acorda o corpo. Em animações lentas o pano pode
        // dormir e deixar até os pontos presos para trás enquanto o esqueleto continua andando.
        jolt.corpos.ActivateBody(p.corpo.GetID())
        // vento: empurra a velocidade dos pontos soltos
        const b = p.base >> 2
        const ax = ventoDir.x * rajada * 2.2 * dt, az = ventoDir.z * rajada * 2.2 * dt
        for (let k = 0; k < p.P; k++) {
          const o = b + k * p.passo + p.offVel
          H[o] += ax; H[o + 2] += az
        }
      }
      colisores?.mover(dt, primeiro || pulou)
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

// Compartilhados pelo comparador de motores; a mesma superfície e o mesmo desenho.
export { montarProxy, injetar, regrasCamisa, regrasCalca }
