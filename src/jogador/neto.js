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
// rosto liso (sem olhos, sobrancelhas, cílios nem lábios), para o rosto desenhado em 2D (rosto.js)
export const ARQUIVO_NETO_SEM_ROSTO = '/arte/finais/neto-mpfb-sem-rosto.glb'

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
export async function carregarNeto({ chapeu = false, semRosto = false } = {}) {
  let g
  let liso = false
  if (semRosto) {
    try { g = await carregar(ARQUIVO_NETO_SEM_ROSTO); liso = true } catch { console.info('Neto: a versão de rosto liso ainda não existe; uso a normal') }
  }
  if (!g) {
    try { g = await carregar(ARQUIVO_NETO) } catch (e) { console.warn('Neto: não carregou', e); return null }
  }
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
  relaxarMaos(ossos)
  // eixos do repouso, no espaço local de cada osso (o animador não pode supor como o modelo foi montado)
  const local = (osso, v) => v.clone().applyQuaternion(osso.getWorldQuaternion(new THREE.Quaternion()).invert())
  const eixos = {
    cabecaFrente: local(cabeca, new THREE.Vector3(0, 0, 1)),
    quadrilEsquerda: local(ossos.get('Hips'), new THREE.Vector3(1, 0, 0)),
    abaChapeu: new THREE.Vector3(-0.17, topo - 0.09 - pc.y, 0.07).applyQuaternion(inv), // aba do lado direito, um pouco à frente
  }
  let ancorasRosto = null
  if (liso) ancorasRosto = (await ancorasMedidas(cabeca)) || ancorasDoRosto(raiz, cabeca, malhas)
  return { raiz, ossos, esqueleto: malhas[0].skeleton, malhas, eixos, ancorasRosto }
}

// âncoras medidas pela sessão do personagem no próprio modelo (pontos da pele à frente dos olhos e da
// boca, mundo em repouso): arte/finais/neto-mpfb-sem-rosto-ancoras.json
async function ancorasMedidas(cabeca) {
  try {
    const r = await fetch('/arte/finais/neto-mpfb-sem-rosto-ancoras.json')
    if (!r.ok || (r.headers.get('content-type') || '').includes('html')) return null
    const a = await r.json()
    const inv = cabeca.matrixWorld.clone().invert()
    const local = (p) => new THREE.Vector3(...p).add(new THREE.Vector3(0, 0, 0.003)).applyMatrix4(inv).toArray() // 3 mm para fora
    return { olho: local(a.olho_esquerdo.superficie), boca: local(a.boca.superficie), tamOlho: 0.042, tamBoca: 0.05, curva: 0.3 }
  } catch { return null }
}

// Mão relaxada: os movimentos vêm do esqueleto padrão, que não tem dedos, e a pose em T deixa a mão
// espalmada e o polegar aberto. Curva cada falange para dentro da palma (mais no mínimo que no
// indicador, como a mão de verdade descansando) e traz o polegar para perto da mão. Fica fixo.
function relaxarMaos(ossos) {
  const curva = { Index: [0.22, 0.32, 0.22], Middle: [0.3, 0.42, 0.28], Ring: [0.38, 0.48, 0.3], Pinky: [0.45, 0.52, 0.32] }
  const giros = []
  for (const [L, s] of [['Left', 1], ['Right', -1]]) {
    // repouso: dedos no eixo X do lado da mão, palma para baixo; dobrar = girar em torno de Z do mundo
    for (const [dedo, angs] of Object.entries(curva)) {
      angs.forEach((a, i) => {
        const o = ossos.get(`${L}Hand${dedo}${i + 1}`)
        if (o) giros.push([o, new THREE.Vector3(0, 0, 1), -s * a])
      })
    }
    const p1 = ossos.get(`${L}HandThumb1`)
    if (p1) giros.push([p1, new THREE.Vector3(0, 1, 0), s * 0.35]) // polegar para junto do indicador
    const p2 = ossos.get(`${L}HandThumb2`)
    if (p2) giros.push([p2, new THREE.Vector3(0, 0, 1), -s * 0.2])
  }
  // eixos locais calculados todos antes de girar qualquer um (girar o pai muda o mundo do filho)
  const locais = giros.map(([o, eixo, a]) => [o, eixo.clone().applyQuaternion(o.getWorldQuaternion(new THREE.Quaternion()).invert()), a])
  for (const [o, eixo, a] of locais) o.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(eixo, a))
}

// Onde desenhar olhos e boca: procura a superfície do rosto (raio vindo da frente) na altura dos olhos
// e da boca, medidas a partir do topo da cabeça; devolve no espaço do osso Head, como rosto.js pede
function ancorasDoRosto(raiz, cabeca, malhas) {
  raiz.updateMatrixWorld(true)
  const topo = cabeca.children.find((o) => /HeadTop/i.test(o.name))?.getWorldPosition(new THREE.Vector3()).y
    ?? new THREE.Box3().setFromObject(raiz).max.y
  const pele = malhas.filter((m) => !/camisa|calca|short|cabelo/i.test(m.material?.name || m.name))
  const ray = new THREE.Raycaster()
  const frente = (x, y) => {
    ray.set(new THREE.Vector3(x, y, 1), new THREE.Vector3(0, 0, -1))
    const h = ray.intersectObjects(pele, false)[0]
    return h ? h.point : new THREE.Vector3(x, y, cabeca.getWorldPosition(new THREE.Vector3()).z + 0.09)
  }
  const olho = frente(0.032, topo - 0.11)
  const boca = frente(0, topo - 0.185)
  const inv = cabeca.matrixWorld.clone().invert()
  const local = (p) => p.clone().add(new THREE.Vector3(0, 0, 0.004)).applyMatrix4(inv).toArray() // 4 mm para fora da pele
  return { olho: local(olho), boca: local(boca), tamOlho: 0.05, tamBoca: 0.055, curva: 0.35 }
}
