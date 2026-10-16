// O neto (modelo da sessão do personagem: arte/finais/neto-mpfb.glb, MakeHuman/MPFB 2, ativos CC0)
// como corpo do jogador. Esqueleto Mixamo de 52 ossos com prefixo "mixamorig", repouso em T, 1,68 m,
// frente em +Z. Aqui: materiais no estilo do jogo (toon, peso de traço de personagem), o chapéu de
// palha como peça à parte no osso "Chapeu" (balança com as molas) e os eixos do repouso, que o
// animador usa para olhar, segurar e ajeitar o chapéu em qualquer modelo.

import * as THREE from 'three'
import { carregar, ossosPorNome } from './retarget.js'
import { toon, toonVertice } from '../materiais.js'
import { criarAleatorio } from '../utils.js'

export const ARQUIVO_NETO = '/arte/finais/neto-mpfb.glb'

// cores medidas pela sessão do personagem (docs/direcao-de-arte.md, seção 7)
const COR = { pele: '#96593a', labios: '#80493a', cabelo: '#16110f', pelos: '#120d0b', calca: '#e3d8c2', palha: '#d9b98a' }
const PERSONAGEM = { opacity: 0.5, blending: THREE.NoBlending, semCache: true } // alfa 0,5: traço de personagem

function materialPara(malha) {
  const nome = (malha.material?.name || malha.name).toLowerCase()
  if (nome.includes('camisa')) return toonVertice({ opacity: 0.5, blending: THREE.NoBlending }) // listras nos vértices
  if (nome.includes('labio')) return toon(COR.labios, PERSONAGEM)
  if (nome.includes('calca')) return toon(COR.calca, PERSONAGEM)
  if (nome.includes('cabelo') || nome.includes('short')) return toon(COR.cabelo, PERSONAGEM)
  if (nome.includes('pelos') || nome.includes('eyebrow') || nome.includes('eyelash')) return toon(COR.pelos, PERSONAGEM)
  if (malha.material?.map) return toon('#ffffff', { ...PERSONAGEM, map: malha.material.map }) // olhos
  return toon(COR.pele, PERSONAGEM)
}

// chapéu de palha de carnaúba: copa alta, aba larga e mole, levantada nas bordas e desfiada
// (docs/figurino.md e a ficha do neto). Feito em pé no mundo; o pivô compensa o giro do osso.
function chapeuDePalha() {
  const rnd = criarAleatorio(77)
  const copa = new THREE.LatheGeometry([[0.0, 0.13], [0.07, 0.13], [0.095, 0.11], [0.105, 0.04], [0.108, 0.0]].map(([x, y]) => new THREE.Vector2(x, y)), 18)
  const aba = new THREE.RingGeometry(0.1, 0.23, 28, 2).rotateX(-Math.PI / 2)
  const p = aba.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i)
    const r = Math.hypot(x, z)
    if (r > 0.2) {
      const desfia = 1 + (rnd.proximo() - 0.5) * 0.08 // borda desfiada
      p.setXYZ(i, x * desfia, (r - 0.2) * 0.6 + Math.sin(Math.atan2(z, x) * 2) * 0.01, z * desfia) // levantada na borda
    }
  }
  aba.computeVertexNormals()
  const mat = toon(COR.palha, { ...PERSONAGEM, side: THREE.DoubleSide })
  const g = new THREE.Group()
  g.add(new THREE.Mesh(copa, mat), new THREE.Mesh(aba, mat))
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true } })
  return g
}

// chapeu: false tira o chapéu (decisão do Joabe em 16/10/2026: o neto anda sem chapéu)
export async function carregarNeto({ chapeu = false } = {}) {
  let g
  try { g = await carregar(ARQUIVO_NETO) } catch (e) { console.warn('Neto: não carregou', e); return null }
  const raiz = g.raiz
  const malhas = []
  raiz.traverse((o) => {
    if (!o.isSkinnedMesh) return
    o.material = materialPara(o)
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
    malhas.push(o)
  })
  if (!malhas.length) return null
  const ossos = ossosPorNome(raiz)
  raiz.updateMatrixWorld(true)
  const cabeca = ossos.get('Head')
  const qCabeca = cabeca.getWorldQuaternion(new THREE.Quaternion())
  const inv = qCabeca.clone().invert()
  // topo da cabeça pela malha (o modelo não tem o osso HeadTop_End): o chapéu senta um pouco abaixo
  const topo = new THREE.Box3().setFromObject(raiz).max.y
  const pc = cabeca.getWorldPosition(new THREE.Vector3())
  if (chapeu) {
    const pivo = new THREE.Object3D()
    pivo.name = 'Chapeu'
    pivo.position.copy(new THREE.Vector3(0, topo - 0.075 - pc.y, 0.0).applyQuaternion(inv))
    cabeca.add(pivo)
    const peca = chapeuDePalha()
    peca.quaternion.copy(inv) // em pé no repouso
    pivo.add(peca)
    ossos.set('Chapeu', pivo)
  }
  // eixos do repouso, no espaço local de cada osso (o animador não pode supor como o modelo foi montado)
  const local = (osso, v) => v.clone().applyQuaternion(osso.getWorldQuaternion(new THREE.Quaternion()).invert())
  const eixos = {
    cabecaFrente: local(cabeca, new THREE.Vector3(0, 0, 1)),
    quadrilEsquerda: local(ossos.get('Hips'), new THREE.Vector3(1, 0, 0)),
    abaChapeu: new THREE.Vector3(-0.17, topo - 0.09 - pc.y, 0.07).applyQuaternion(inv), // aba do lado direito, um pouco à frente
  }
  return { raiz, ossos, esqueleto: malhas[0].skeleton, malhas, eixos }
}
