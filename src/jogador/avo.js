// O avô (modelo da sessão do personagem: arte/finais/avo-mpfb.glb, MakeHuman/MPFB 2), parado perto do
// jogador para o Joabe julgar com o filtro de quadrinho. Ainda sem roupa, de propósito (a roupa entra
// com o guarda-roupa, docs/roupas-plano.md). Esqueleto Mixamo de 52 ossos, 1,50 m, coluna curvada,
// clavículas caídas e joelhos a 9° já na pose de repouso: o conversor de movimentos preserva esse desvio.
// Movimento: um parado do Mixamo convertido direto para o esqueleto dele, desenhado "em 2".

import * as THREE from 'three'
import { carregar, ossosPorNome, carregarMovimentosMixamo } from './retarget.js'
import { toon, toonVertice } from '../materiais.js'

export const ARQUIVO_AVO = '/arte/finais/avo-mpfb.glb'

const PERSONAGEM = { opacity: 0.5, blending: THREE.NoBlending, semCache: true } // alfa 0,5: traço de personagem
const COR = { cabelo: '#cfcac1', pelos: '#bdb6ab', labios: '#7d4a3c', pele: '#8a5638' }

// materiais pelo nome (combinado com a sessão do personagem, 17/10/2026): pele e barba têm cor nos
// vértices (a barba pintada na pele se desfaz na borda), os fios da barba são fitas de uma face só
function materialPara(malha) {
  const nome = (malha.material?.name || '').toLowerCase()
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
export async function carregarAvo({ movimento = 'parado' } = {}) {
  let g
  try { g = await carregar(ARQUIVO_AVO) } catch (e) { console.warn('Avô: não carregou', e); return null }
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
  const r = await carregarMovimentosMixamo({ alvo: { raiz, ossos }, pasta: '/animacoes/mixamo/', nomes: [movimento] })
  const mixer = new THREE.AnimationMixer(raiz)
  const clipe = r.clipes[movimento]
  if (clipe) mixer.clipAction(clipe).play()
  else console.info(`Avô: falta o movimento ${movimento}; fica na pose de repouso`)
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
      mixer.update(d)
    },
  }
}
