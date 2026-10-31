// O pré-aquecimento das texturas do mundo (26/10/2026).
//
// As texturas do mundo subem para a placa na primeira vez em que um material que as usa é
// desenhado. Quando isso acontece no meio da partida, o quadro engasga: na T4, a tarefa longa de
// 83 ms com "texturas novas: 1" (a pista do rastreador) custou um quadro de 76 ms.
//
// Aqui as texturas sobem antes de o jogo aparecer: o pré-aquecimento espera as decodificações que
// ainda estão no caminho (as texturas pintadas, src/materiais.js) e sobe cada textura usada por um
// material do mundo com renderer.initTexture, que não depende de a malha estar na tela.
//
// Fica fora de src/render de propósito: este módulo só conhece a cena, o renderizador e as
// texturas (e o three).

import { texturasPendentes, texturasPintadas } from '../materiais.js'
import { globais } from '../globais.js'

// as chaves de textura que o three usa nos materiais (a lista do three: as que importam para o
// que o jogo pinta)
const CHAVES = [
  'map', 'alphaMap', 'normalMap', 'emissiveMap', 'aoMap', 'bumpMap', 'displacementMap',
  'metalnessMap', 'roughnessMap', 'specularMap', 'envMap', 'lightMap', 'clearcoatMap',
  'clearcoatNormalMap', 'clearcoatRoughnessMap', 'iridescenceMap', 'iridescenceThicknessMap',
  'sheenColorMap', 'sheenRoughnessMap', 'specularColorMap', 'specularIntensityMap',
  'transmissionMap', 'thicknessMap', 'anisotropyMap',
]

// as texturas de um material (as do three e as pintadas do visual Arcane)
export function texturasDoMaterial(material) {
  const lista = []
  if (!material) return lista
  for (const chave of CHAVES) {
    const t = material[chave]
    if (t && t.isTexture) lista.push(t)
  }
  // a textura pintada (src/materiais.js: texturizar) não é uma chave do three: ela mora no
  // userData do material e entra no shader como uniform
  const pintada = material.userData?.texPintada
  if (pintada) {
    for (const t of [pintada.topo, pintada.lado, pintada.alt]) if (t && t.isTexture) lista.push(t)
  }
  return lista
}

// as texturas que a cena usa (a do material e as pintadas)
export function texturasDaCena(cena) {
  const vistas = new Set()
  cena?.traverse?.((o) => {
    if (!o.material) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const t of texturasDoMaterial(m)) vistas.add(t)
    }
  })
  return vistas
}

// as texturas que o mundo cria fora de um material (o mapa dos ossos dos atores, por exemplo:
// um uniform do material, não uma chave do three)
const registradas = new Set()
export function registrarTextura(textura) {
  if (textura && textura.isTexture) registradas.add(textura)
  return textura
}

// O pré-aquecimento: espera as decodificações pendentes e sobe cada textura para a placa.
// Devolve o que subiu (para o console e o resumo).
export async function preaquecerTexturas(renderer, cena, { extra = [] } = {}) {
  const esperadas = texturasPendentes()
  if (esperadas.length) await Promise.allSettled(esperadas)
  const texturas = texturasDaCena(cena)
  // as texturas pintadas que ninguém usou ainda (o material pode ter saído da cena): elas também
  // precisam estar na placa antes do jogo começar
  for (const t of texturasPintadas()) texturas.add(t)
  // o mapa da luz dos lampiões (um uniform de todos os materiais toon: ele é enorme, 16 bytes por
  // pixel, e subir ele no meio da partida é o pior dos picos)
  const lampioes = globais.tLampioes?.value
  if (lampioes && lampioes.isTexture) texturas.add(lampioes)
  // as texturas que o mundo criou fora de um material (o mapa dos ossos, por exemplo)
  for (const t of registradas) texturas.add(t)
  for (const t of extra) if (t && t.isTexture) texturas.add(t)
  let subidas = 0
  for (const t of texturas) {
    if (!t.image) continue // a que não chegou (o arquivo faltou): não há o que subir
    try {
      renderer.initTexture(t)
      subidas++
    } catch (erro) {
      console.warn('[maresia] a textura não subiu na placa:', t.name, erro)
    }
  }
  return { texturas: texturas.size, subidas }
}
