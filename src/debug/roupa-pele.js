// Mede se a roupa do corpo do jogador atravessa a pele.
//
// No corpo novo (o v6, de 19/10/2026) a roupa é uma superfície em cima da pele, presa aos mesmos
// ossos (decisão D3 do plano: a roupa segue o esqueleto). Se o peso da peça for ruim, num movimento
// o vértice da roupa entra dentro do corpo e a pele aparece por cima da peça.
//
// A medida: para cada vértice da roupa, a distância COM SINAL até o vértice da pele mais perto.
// Distância positiva = a roupa está fora da pele (folga). Negativa = a roupa entrou no corpo.
//
// A comparação é por região do corpo (torso, pernas, braços): a mão balança do lado do quadril e
// às vezes está mais perto de um vértice de roupa do que a própria pele da perna; compara com a
// região errada, o sinal sai sem sentido.
//
// uso (no console, com o jogo rodando): maresia.checarRoupaPele()
// devolve { rotulo, penetracaoCm, minimo, dentro, total, folgaMediana, pior }

import * as THREE from 'three'

// peça de roupa: pelo nome do material (o v6 chama de camisa-frente/calca-frente) ou pelo nome da malha
// (o vestido chama de neto-camisa/neto-calca com material "tripo_material_...")
const ROUPA = /camisa|calca|short|saia|roupa|pano/i

const _v = new THREE.Vector3()
const _vn = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _v4 = new THREE.Vector4()
const _m4 = new THREE.Matrix4()
const _m3 = new THREE.Matrix3()

function ehRoupa(malha) {
  return ROUPA.test(malha.material?.name || '') || ROUPA.test(malha.name || '')
}

// a região do corpo a que o osso pertence
function regiaoDe(osso) {
  if (/UpLeg|Leg|Foot|Toe/.test(osso)) return 'pernas'
  if (/Shoulder|Arm|Hand/.test(osso)) return 'bracos'
  return 'torso'
}

// o osso que manda no vértice (o de maior peso): diz que parte do corpo é
function ossoPrincipal(malha, i) {
  const s = malha.skeleton
  const geo = malha.geometry
  const peso = geo.attributes.skinWeight
  const iPos = geo.attributes.skinIndex
  let melhor = -1, pesoMelhor = 0
  for (let k = 0; k < 4; k++) {
    const w = k === 0 ? peso.getX(i) : k === 1 ? peso.getY(i) : k === 2 ? peso.getZ(i) : peso.getW(i)
    if (w > pesoMelhor) {
      pesoMelhor = w
      melhor = k === 0 ? iPos.getX(i) : k === 1 ? iPos.getY(i) : k === 2 ? iPos.getZ(i) : iPos.getW(i)
    }
  }
  const osso = s.bones[melhor]
  return osso ? (osso.name || '').replace(/^mixamorig\d*[:_]?/i, '') : ''
}

// vértice da pele já deformado pelo esqueleto, em posição e normal do mundo (o mesmo cálculo do
// shader de pele do three: a normal passa pela mesma matriz de pele da posição)
function normalPele(malha, i, saida) {
  const s = malha.skeleton
  const geo = malha.geometry
  const nor = geo.attributes.normal
  const peso = geo.attributes.skinWeight
  const iPos = geo.attributes.skinIndex
  const v = _vn.fromBufferAttribute(nor, i)
  // bindMatrix * normal
  _v4.set(v.x, v.y, v.z, 0).applyMatrix4(malha.bindMatrix)
  const soma = new THREE.Vector4()
  for (let k = 0; k < 4; k++) {
    const w = k === 0 ? peso.getX(i) : k === 1 ? peso.getY(i) : k === 2 ? peso.getZ(i) : peso.getW(i)
    if (w === 0) continue
    const b = k === 0 ? iPos.getX(i) : k === 1 ? iPos.getY(i) : k === 2 ? iPos.getZ(i) : iPos.getW(i)
    if (b === undefined || b < 0) continue
    const osso = s.bones[b]
    if (!osso) continue
    _m4.multiplyMatrices(osso.matrixWorld, s.boneInverses[b])
    _v2.set(_v4.x, _v4.y, _v4.z).applyMatrix4(_m4)
    soma.x += _v2.x * w; soma.y += _v2.y * w; soma.z += _v2.z * w
  }
  // bindMatrixInverse * soma
  _v4.copy(soma).applyMatrix4(malha.bindMatrixInverse)
  // normal do mundo: matriz normal de mesh.matrixWorld
  _m3.getNormalMatrix(malha.matrixWorld)
  saida.set(_v4.x, _v4.y, _v4.z).applyMatrix3(_m3).normalize()
  return saida
}

// pontos da pele no mundo, com a normal, numa grade (de 5 cm) para achar o vizinho mais perto rápido.
// Uma grade por região do corpo (torso, pernas, braços).
function gradePele(malhas, passo) {
  const grades = { torso: new Map(), pernas: new Map(), bracos: new Map() }
  const CEL = 0.05
  const chave = (x, y, z) => `${Math.floor(x / CEL)},${Math.floor(y / CEL)},${Math.floor(z / CEL)}`
  const n = new THREE.Vector3()
  let total = 0
  for (const malha of malhas) {
    const pos = malha.geometry.attributes.position
    for (let i = 0; i < pos.count; i += passo) {
      malha.getVertexPosition(i, _v)
      _v.applyMatrix4(malha.matrixWorld)
      const p = _v.clone() // a posicao antes da normal (a normal usa o mesmo rascunho)
      normalPele(malha, i, n)
      const osso = ossoPrincipal(malha, i)
      const regiao = regiaoDe(osso)
      const k = chave(p.x, p.y, p.z)
      if (!grades[regiao].has(k)) grades[regiao].set(k, [])
      grades[regiao].get(k).push({ p, n: n.clone(), osso })
      total++
    }
  }
  return { grades, total, CEL }
}

// distância com sinal de um ponto até a pele mais perto: negativo = dentro do corpo
function distanciaComSinal(grade, p, cel) {
  const cx = Math.floor(p.x / cel), cy = Math.floor(p.y / cel), cz = Math.floor(p.z / cel)
  let melhor = null, d = Infinity
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
    for (const q of grade.get(`${cx + a},${cy + b},${cz + c}`) || []) {
      const dd = q.p.distanceToSquared(p)
      if (dd < d) { d = dd; melhor = q }
    }
  }
  if (!melhor) return null
  const dist = Math.sqrt(d)
  const sinal = _v2.copy(p).sub(melhor.p).dot(melhor.n)
  return { dist, sinal, osso: melhor.osso }
}

export function checar(m, { rotulo = 'medida', passoPele = 2, passoRoupa = 5 } = {}) {
  const animador = m.jogador?.animador
  const raiz = animador?.corpo?.raiz
  if (!raiz) return { erro: 'o corpo do jogador ainda não carregou' }
  raiz.updateMatrixWorld(true)
  const malhas = []
  raiz.traverse((o) => { if (o.isSkinnedMesh) malhas.push(o) })
  for (const x of malhas) x.skeleton?.update()
  const pele = malhas.filter((x) => !ehRoupa(x))
  const roupa = malhas.filter((x) => ehRoupa(x))
  if (!pele.length || !roupa.length) {
    return { erro: `sem peças para comparar (pele: ${pele.length}, roupa: ${roupa.length})` }
  }
  const g = gradePele(pele, passoPele)
  let minimo = Infinity
  let dentro = 0
  let total = 0
  let soma = 0
  let medidos = 0
  let semVizinho = 0
  const pior = { p: null, sinal: 0, osso: '', peca: '', regiao: '' }
  for (const malha of roupa) {
    const pos = malha.geometry.attributes.position
    for (let i = 0; i < pos.count; i += passoRoupa) {
      malha.getVertexPosition(i, _v)
      _v.applyMatrix4(malha.matrixWorld)
      // a região do corpo da peça (o osso que manda no vértice da roupa)
      const ossoRoupa = ossoPrincipal(malha, i)
      const regiao = regiaoDe(ossoRoupa)
      let d = distanciaComSinal(g.grades[regiao], _v, g.CEL)
      if (!d) { // a região não tem pele perto: procura nas outras
        for (const outra of ['torso', 'pernas', 'bracos']) {
          if (outra === regiao) continue
          d = distanciaComSinal(g.grades[outra], _v, g.CEL)
          if (d) break
        }
      }
      if (!d) { semVizinho++; continue }
      total++
      soma += d.dist
      medidos++
      if (d.sinal < 0) dentro++
      if (d.sinal < minimo) {
        minimo = d.sinal
        pior.p = _v.clone()
        pior.sinal = d.sinal
        pior.osso = d.osso
        pior.peca = malha.name
        pior.regiao = regiao
      }
    }
  }
  return {
    rotulo,
    minimo: +minimo.toFixed(4), // menor distância com sinal (negativo = roupa dentro da pele)
    penetracaoCm: +(Math.max(0, -minimo) * 100).toFixed(1), // quanto a roupa entrou na pele, em cm
    dentro, // vértices de roupa dentro do corpo
    total, // vértices de roupa medidos
    folgaMediana: medidos ? +(soma / medidos).toFixed(4) : 0,
    peleAmostrada: g.total,
    semVizinho,
    pior: {
      sinal: +pior.sinal.toFixed(4),
      regiao: pior.regiao, // torso, pernas ou bracos
      osso: pior.osso, // a parte do corpo onde a roupa mais entrou
      peca: pior.peca, // a peça de roupa
      pos: pior.p ? [+pior.p.x.toFixed(3), +pior.p.y.toFixed(3), +pior.p.z.toFixed(3)] : null,
    },
  }
}

export function instalar(m) {
  m.checarRoupaPele = (opts = {}) => checar(m, opts)
  m.checarRoupaPeleEm = (rotulo, opts = {}) => checar(m, { ...opts, rotulo })
}
