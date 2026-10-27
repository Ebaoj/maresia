// O avô (modelo da sessão do personagem: arte/finais/avo-mpfb.glb, MakeHuman/MPFB 2), parado perto do
// jogador para o Joabe julgar com o filtro de quadrinho. Ainda sem roupa, de propósito (a roupa entra
// com o guarda-roupa, docs/roupas-plano.md). Esqueleto Mixamo de 52 ossos, 1,50 m, coluna curvada,
// clavículas caídas e joelhos a 9° já na pose de repouso: o conversor de movimentos preserva esse desvio.
// Movimento: um parado do Mixamo convertido direto para o esqueleto dele, desenhado "em 2".

import * as THREE from 'three'
import { carregar, ossosPorNome, carregarMovimentosMixamo } from './retarget.js'
import { toon, toonVertice } from '../materiais.js'
import { criarRosto } from './rosto.js'
import { daBase } from '../caminho.js'

export const ARQUIVO_AVO = '/arte/finais/avo-mpfb.glb'
// rosto liso (órbitas tampadas, sem cílios), para olhos e sobrancelhas desenhados; a boca fica sob o bigode
export const ARQUIVO_AVO_SEM_ROSTO = '/arte/finais/avo-mpfb-sem-rosto.glb'

const PERSONAGEM = { opacity: 0.5, blending: THREE.NoBlending, semCache: true } // alfa 0,5: traço de personagem
const COR = { cabelo: '#cfcac1', pelos: '#bdb6ab', labios: '#7d4a3c', pele: '#8a5638' }

// materiais pelo nome (combinado com a sessão do personagem, 17/10/2026): pele e barba têm cor nos
// vértices (a barba pintada na pele se desfaz na borda), os fios da barba são fitas de uma face só
function materialPara(malha) {
  const nome = (malha.material?.name || '').toLowerCase()
  if (malha.material?.map && !malha.geometry.attributes.color && malha.geometry.attributes.position.count > 5000) {
    // modelo inteiro numa textura pintada (Tripo): a textura é a cor
    const map = malha.material.map
    map.colorSpace = THREE.SRGBColorSpace
    return toon('#ffffff', { ...PERSONAGEM, map })
  }
  const cores = !!malha.geometry.attributes.color
  // fios: traço de cenário (alfa 1, o mais leve): com o peso de personagem cada fita ganhava contorno e a
  // barba virava um emaranhado azul de nanquim (17/10/2026)
  if (nome.includes('barba-fios')) return cores ? toonVertice({ side: THREE.DoubleSide }) : toon(COR.cabelo, { side: THREE.DoubleSide, semCache: true })
  if (nome.includes('barba')) return cores ? toonVertice(PERSONAGEM) : toon(COR.cabelo, PERSONAGEM)
  if (nome.includes('labio')) return toon(COR.labios, PERSONAGEM)
  if (nome.includes('short') || nome.includes('cabelo')) return toon(COR.cabelo, PERSONAGEM)
  if (nome.includes('eyebrow') || nome.includes('eyelash')) return toon(COR.pelos, PERSONAGEM)
  if (malha.material?.map) return toon('#ffffff', { ...PERSONAGEM, map: malha.material.map }) // olhos
  if (nome.includes('pele') && cores) return toonVertice(PERSONAGEM)
  return toon(COR.pele, PERSONAGEM)
}

// movimento: 'parado' (a curvatura vem só do modelo) ou 'velho-parado' (o do Mixamo, que curva de novo
// por cima da coluna já curvada do repouso)
// arquivo: outro modelo do avô para comparar (o do Tripo, 17/10/2026: uma malha com textura pintada, sem
// cor nos vértices; vira toon com a textura como cor, sem metal nem aspereza)
export async function carregarAvo({ movimento = 'parado', rostoDesenhado = true, estiloRosto = 'minimo-brilho', arquivo = null } = {}) {
  let g
  let liso = false
  if (arquivo) {
    try { g = await carregar(arquivo) } catch (e) { console.warn('Avô: não carregou', arquivo, e); return null }
    rostoDesenhado = false
  } else if (rostoDesenhado) {
    try { g = await carregar(ARQUIVO_AVO_SEM_ROSTO); liso = true } catch { console.info('Avô: a versão de rosto liso não carregou; uso a normal') }
  }
  if (!g) {
    try { g = await carregar(ARQUIVO_AVO) } catch (e) { console.warn('Avô: não carregou', e); return null }
  }
  const raiz = g.raiz
  const malhas = []
  raiz.traverse((o) => {
    if (!o.isSkinnedMesh && !o.isMesh) return
    o.material = materialPara(o)
    o.castShadow = true
    o.receiveShadow = true
    o.frustumCulled = false
    malhas.push(o)
  })
  const ossos = ossosPorNome(raiz)
  // rosto desenhado: olhos com a sobrancelha no mesmo desenho (a sobrancelha do modelo sai, senão fica
  // dupla) e sem boca. Âncoras medidas antes de qualquer pose
  let rosto = null
  if (liso) {
    const a = await ancorasAvo(ossos.get('Head'), raiz)
    if (a) {
      for (const m of malhas) if (/eyebrow/i.test(m.name) || /eyebrow/i.test(m.material?.name || '')) m.visible = false
      rosto = criarRosto(ossos.get('Head'), a, estiloRosto)
    }
  }
  // parado e o andar de velho do Mixamo (no lugar: quem anda com ele é quem chama andar())
  const r = await carregarMovimentosMixamo({ alvo: { raiz, ossos }, pasta: '/animacoes/mixamo/', nomes: [movimento, 'velho-andar'] })
  const mixer = new THREE.AnimationMixer(raiz)
  const clipe = r.clipes[movimento]
  const aParado = clipe ? mixer.clipAction(clipe) : null
  const aAndar = r.clipes['velho-andar'] ? mixer.clipAction(r.clipes['velho-andar']) : null
  if (aParado) aParado.play()
  else console.info(`Avô: falta o movimento ${movimento}; fica na pose de repouso`)
  if (aAndar) { aAndar.play(); aAndar.setEffectiveWeight(0) }
  let andando = false
  const grupo = new THREE.Group()
  grupo.add(raiz)
  grupo.userData.peso = 1 // peso do traço
  let acumulado = 0
  return {
    raiz: grupo,
    malhas,
    altura: new THREE.Box3().setFromObject(raiz).getSize(new THREE.Vector3()).y,
    // "em 2": a pose muda 12 vezes por segundo, como o neto andando
    atualizar(dt, fps = 12) {
      acumulado += dt
      const passo = 1 / fps
      if (acumulado < passo) return
      const d = acumulado - (acumulado % passo)
      acumulado %= passo
      // troca suave entre parado e andando (~0,3 s)
      if (aAndar) {
        const w = THREE.MathUtils.clamp(aAndar.getEffectiveWeight() + (andando ? 1 : -1) * d / 0.3, 0, 1)
        aAndar.setEffectiveWeight(w)
        aParado?.setEffectiveWeight(1 - w)
      }
      mixer.update(d)
      rosto?.atualizar(d, { vel: 0, yaw: grupo.rotation.y })
    },
    // liga o andar de velho; a velocidade natural do passo (m/s) é para quem move o avô
    andar(sim = true) { andando = sim && !!aAndar },
    passada: r.passadas['velho-andar'] || 0.8,
    rosto,
  }
}

// âncoras medidas pela sessão do personagem (pontos da pele à frente dos olhos, mundo em repouso):
// arte/finais/avo-mpfb-sem-rosto-ancoras.json. Devolve no espaço do osso Head, como rosto.js pede. O olho
// do avô fica a ±2,8 cm do meio (o do neto a ±3,5): o desenho encolhe na mesma proporção
async function ancorasAvo(cabeca, raiz) {
  try {
    const r = await fetch(daBase('/arte/finais/avo-mpfb-sem-rosto-ancoras.json'))
    if (!r.ok || (r.headers.get('content-type') || '').includes('html')) return null
    const a = await r.json()
    raiz.updateMatrixWorld(true)
    const inv = cabeca.matrixWorld.clone().invert()
    const local = (p, dz) => new THREE.Vector3(...p).add(new THREE.Vector3(0, 0, dz)).applyMatrix4(inv).toArray()
    const prop = Math.abs(a.olho_esquerdo.superficie[0]) / 0.0348
    return { olho: local(a.olho_esquerdo.superficie, 0.012), boca: [0, 0, 0], tamOlho: 0.042 * prop, tamBoca: 0.05, curva: 0.3, semBoca: true }
  } catch { return null }
}
