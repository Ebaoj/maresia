// Esqueleto padrão do jogo: a hierarquia humanoide do Mixamo (sem o prefixo "mixamorig:").
// Todo movimento é feito ou convertido para ele; cada modelo novo só precisa dizer qual osso dele
// é qual osso daqui (nomeCanonico). Pose de repouso em T, frente em +Z, esquerda do personagem em +X,
// 1 unidade = 1 m, 1,68 m de altura (direção de arte).

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { toon } from '../materiais.js'

// nome, pai, posição do osso no repouso (relativa ao pai, em metros)
const BASE = [
  ['Hips', null, [0, 0.93, 0]],
  ['Spine', 'Hips', [0, 0.08, 0.005]],
  ['Spine1', 'Spine', [0, 0.11, 0]],
  ['Spine2', 'Spine1', [0, 0.12, -0.01]],
  ['Neck', 'Spine2', [0, 0.18, 0.01]],
  ['Head', 'Neck', [0, 0.09, 0.02]],
  ['HeadTop_End', 'Head', [0, 0.2, 0]],
  // fora do Mixamo: osso do chapéu, movido só pelas molas (molas.js), nunca pelos movimentos gravados
  ['Chapeu', 'Head', [0, 0.19, 0.0]],
]
const LADO = [
  ['Shoulder', 'Spine2', [0.03, 0.13, 0.0]],
  ['Arm', 'Shoulder', [0.13, 0.0, -0.01]],
  ['ForeArm', 'Arm', [0.27, 0, 0]],
  ['Hand', 'ForeArm', [0.25, 0, 0]],
  ['HandEnd', 'Hand', [0.17, 0, 0]],
  ['UpLeg', 'Hips', [0.09, -0.05, 0]],
  ['Leg', 'UpLeg', [0, -0.41, 0.005]],
  ['Foot', 'Leg', [0, -0.41, -0.025]],
  ['ToeBase', 'Foot', [0, -0.06, 0.12]],
  ['Toe_End', 'ToeBase', [0, 0, 0.07]],
]

export const OSSOS = [...BASE]
for (const [lado, s] of [['Left', 1], ['Right', -1]]) {
  for (const [n, pai, [x, y, z]] of LADO) {
    OSSOS.push([lado + n, pai.startsWith('Spine') || pai === 'Hips' ? pai : lado + pai, [x * s, y, z]])
  }
}
export const NOMES = OSSOS.map((o) => o[0])

// nomes de outros esqueletos para o padrão: Mixamo (com ou sem prefixo) e VRM
const VRM = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine1', upperChest: 'Spine2', neck: 'Neck', head: 'Head',
  leftShoulder: 'LeftShoulder', leftUpperArm: 'LeftArm', leftLowerArm: 'LeftForeArm', leftHand: 'LeftHand',
  rightShoulder: 'RightShoulder', rightUpperArm: 'RightArm', rightLowerArm: 'RightForeArm', rightHand: 'RightHand',
  leftUpperLeg: 'LeftUpLeg', leftLowerLeg: 'LeftLeg', leftFoot: 'LeftFoot', leftToes: 'LeftToeBase',
  rightUpperLeg: 'RightUpLeg', rightLowerLeg: 'RightLeg', rightFoot: 'RightFoot', rightToes: 'RightToeBase',
}
export function nomeCanonico(nome) {
  const n = nome.replace(/^mixamorig\d*[:_]?/i, '').replace(/^.*[:|]/, '')
  if (VRM[n]) return VRM[n]
  return n
}

export function criarEsqueleto() {
  const ossos = new Map()
  for (const [nome, pai, p] of OSSOS) {
    const b = new THREE.Bone()
    b.name = nome
    b.position.fromArray(p)
    ossos.set(nome, b)
    if (pai) ossos.get(pai).add(b)
  }
  const lista = NOMES.map((n) => ossos.get(n))
  return { raizOsso: ossos.get('Hips'), ossos, esqueleto: new THREE.Skeleton(lista) }
}

// Boneco de teste: uma cápsula por osso, presa 100% nele (pele rígida). Serve para ver o movimento
// enquanto o modelo do neto não chega; o neto usa o mesmo esqueleto.
const COR = { pele: '#8a5235', camisa: '#e9dfcb', listra: '#4f7c9a', calca: '#d9cbb0', chapeu: '#c8a86a', cabelo: '#1d1411' }

export function criarBoneco() {
  const { raizOsso, ossos, esqueleto } = criarEsqueleto()
  const raiz = new THREE.Group()
  raiz.add(raizOsso)
  raiz.updateMatrixWorld(true)
  esqueleto.calculateInverses() // o Skeleton nasceu antes dos ossos terem posição no mundo
  const indice = new Map(NOMES.map((n, i) => [n, i]))
  const pecas = new Map() // cor -> geometrias
  const mundo = (n) => ossos.get(n).getWorldPosition(new THREE.Vector3())
  const peca = (osso, geo, cor) => {
    const g = geo.index ? geo.toNonIndexed() : geo
    if (g.attributes.uv) g.deleteAttribute('uv')
    const n = g.attributes.position.count
    const si = new Uint16Array(n * 4)
    const sw = new Float32Array(n * 4)
    for (let i = 0; i < n; i++) { si[i * 4] = indice.get(osso); sw[i * 4] = 1 }
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
    if (!pecas.has(cor)) pecas.set(cor, [])
    pecas.get(cor).push(g)
  }
  // cápsula de a até b (posições de repouso no mundo), raio r
  // achatar: espessura no eixo Z do mundo; achatarX: no eixo que, depois do giro, fica perpendicular
  // ao osso no plano vertical (para a mão, é o que deixa a palma virada para baixo na pose em T)
  const membro = (osso, a, b, r, cor, achatar = 1, achatarX = 1) => {
    const A = a instanceof THREE.Vector3 ? a : mundo(a)
    const B = b instanceof THREE.Vector3 ? b : mundo(b)
    const d = new THREE.Vector3().subVectors(B, A)
    const L = d.length()
    const g = new THREE.CapsuleGeometry(r, Math.max(0.01, L - r), 4, 10).scale(achatarX, 1, achatar)
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()))
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2)
    peca(osso, g, cor)
  }
  const bola = (osso, c, r, cor, sx = 1, sy = 1, sz = 1) => peca(osso, new THREE.SphereGeometry(r, 14, 10).scale(sx, sy, sz).translate(c.x, c.y, c.z), cor)
  const em = (n, dx = 0, dy = 0, dz = 0) => mundo(n).add(new THREE.Vector3(dx, dy, dz))

  // tronco em três gomos (a coluna dobra) e bacia
  bola('Hips', em('Hips', 0, -0.02, 0), 0.17, COR.calca, 1.15, 0.8, 0.85)
  membro('Spine', 'Spine', 'Spine1', 0.15, COR.camisa, 0.78)
  membro('Spine1', 'Spine1', 'Spine2', 0.16, COR.listra, 0.78)
  membro('Spine2', 'Spine2', em('Neck', 0, -0.03, 0), 0.165, COR.camisa, 0.75)
  membro('Neck', 'Neck', 'Head', 0.055, COR.pele)
  bola('Head', em('Head', 0, 0.1, 0.01), 0.115, COR.pele, 0.95, 1.1, 1.05)
  bola('Head', em('Head', 0, 0.13, -0.035), 0.1, COR.cabelo, 1, 0.95, 1)
  peca('Chapeu', new THREE.CylinderGeometry(0.2, 0.21, 0.02, 18).translate(...em('Head', 0, 0.2, 0).toArray()), COR.chapeu)
  peca('Chapeu', new THREE.CylinderGeometry(0.1, 0.12, 0.09, 14).translate(...em('Head', 0, 0.245, 0).toArray()), COR.chapeu)
  bola('Head', em('Head', 0, 0.09, 0.115), 0.022, COR.pele) // nariz: mostra para onde a cabeça olha
  for (const L of ['Left', 'Right']) {
    membro(L + 'Shoulder', L + 'Shoulder', L + 'Arm', 0.06, COR.camisa)
    membro(L + 'Arm', L + 'Arm', L + 'ForeArm', 0.058, COR.camisa)
    membro(L + 'ForeArm', L + 'ForeArm', L + 'Hand', 0.045, COR.pele)
    // mão espalmada: larga e fina, palma para baixo na pose em T (como a de verdade), e o polegar
    // saindo para a frente; é a palma que empurra a água no nado e que se vê no gesto
    const s = L === 'Left' ? 1 : -1
    membro(L + 'Hand', L + 'Hand', L + 'HandEnd', 0.048, COR.pele, 1, 0.42)
    membro(L + 'Hand', em(L + 'Hand', s * 0.015, -0.01, 0.035), em(L + 'Hand', s * 0.075, -0.02, 0.075), 0.018, COR.pele)
    membro(L + 'UpLeg', L + 'UpLeg', L + 'Leg', 0.085, COR.calca)
    membro(L + 'Leg', L + 'Leg', em(L + 'Foot', 0, 0.12, 0), 0.06, COR.calca)
    membro(L + 'Leg', em(L + 'Foot', 0, 0.12, 0), L + 'Foot', 0.045, COR.pele)
    membro(L + 'Foot', em(L + 'Foot', 0, -0.035, -0.04), em(L + 'ToeBase', 0, -0.0, 0), 0.04, COR.pele, 1)
    membro(L + 'ToeBase', L + 'ToeBase', L + 'Toe_End', 0.032, COR.pele)
  }
  const malhas = []
  for (const [cor, geos] of pecas) {
    // alfa 0,5 sem transparência: o filtro lê isso como "personagem" e reforça o traço
    const m = new THREE.SkinnedMesh(mergeGeometries(geos), toon(cor, { semCache: true, opacity: 0.5, blending: THREE.NoBlending }))
    m.castShadow = true
    m.receiveShadow = true
    m.frustumCulled = false
    raiz.add(m)
    m.bind(esqueleto, m.matrixWorld)
    malhas.push(m)
  }
  raiz.userData.peso = 1
  return { raiz, ossos, esqueleto, malhas }
}
