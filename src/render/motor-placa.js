// Motor guiado pela placa (KAN-72, fase 2 da F2.6): no modo WebGPU, com cfg.desempenho.motorPlaca ligado, as
// cópias que pedem (instanciarEmBlocos com placa: true) vão para a three-virtual-geometry (vg) em vez de blocos de
// chão. A vg guarda todas as cópias na placa, corta o que não aparece e escolhe o detalhe num passo de compute, e
// desenha cada forma numa chamada só: o custo por objeto do WebGPU no three (10 a 30 us por objeto, KAN-70) deixa
// de crescer com o mapa. Na bancada (KAN-71): 500 FPS contra 94 a 141 dos blocos, com 20 a 60 mil cópias.
//
// A vg é assíncrona (monta a geometria dela e os programas de compute em segundo plano): instanciarEmBlocos devolve
// um grupo vazio na hora e a malha entra nele quando fica pronta; prepararMotorPlaca espera tudo, na abertura.

import * as THREE from 'three'
import { materialArcane } from './arcane-tsl.js'

let ligado = false
let vg = null
let modulo = null
const pendentes = []
const LADO_SOMBRA = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide }

export function ligarMotorPlaca(sim) { ligado = !!sim }
export function motorPlacaLigado() { return ligado }

// Só o material pintado do jogo, sem shader próprio nem código de vértice que ainda não tem versão para a vg
export function materialServeNaPlaca(m) {
  if (!m || Array.isArray(m) || !m.isMeshToonMaterial || !m.userData.luzMRT || m.userData.luzFixa) return false
  const tsl = m.userData.tsl
  if (tsl?.material || tsl?.posicao || m.userData.tslEsqueleto?.length) return false
  return true
}

// Versão do material para a vg: uma por malha, nunca a mesma dos blocos. A vg grava no material o positionNode
// (que o passe de sombra do three copia para a sombra de quem usa o material), o colorNode (com a máscara da folha
// e a cor por vértice) e tira o map e o alphaMap; com a versão de sempre (que segue o original, seguirOriginal)
// isso apagaria a máscara no material do WebGL e quebraria a sombra dos blocos.
function materialParaVg(m) {
  const nm = materialArcane(m)
  nm.vertexColors = false // a cor por vértice vai com a geometria da vg e entra pela cor dela (tint)
  if (m.shadowSide === null || m.shadowSide === undefined) nm.shadowSide = LADO_SOMBRA[m.side] // sombra pelo lado de trás, como o WebGL
  return nm
}

export function enviarAoMotor(cena, geo, material, matrizes, cores, opcoes) {
  const { nome = '', sombra = true, recebe = true, peso, semNormal = false } = opcoes
  const grupo = new THREE.Group()
  grupo.name = nome + '-placa'
  cena.add(grupo)
  pendentes.push((async () => {
    modulo ??= await import('three-virtual-geometry')
    vg ??= new modulo.VirtualGeometry()
    // normais da forma como estão (a vg alisaria por padrão e as formas facetadas do jogo mudariam de luz)
    const fonte = modulo.fromBufferGeometry(geo, { colors: material.vertexColors === true, normals: 'keep' })
    const dados = await modulo.buildVirtualMeshCached(fonte)
    const mz = new Float32Array(16 * matrizes.length)
    matrizes.forEach((m, i) => m.toArray(mz, i * 16))
    let cs
    if (cores) {
      cs = new Float32Array(4 * matrizes.length).fill(1)
      const c = new THREE.Color()
      matrizes.forEach((_, i) => { if (cores[i]) { c.set(cores[i]); cs[i * 4] = c.r; cs[i * 4 + 1] = c.g; cs[i * 4 + 2] = c.b } })
    }
    const malha = vg.createMesh(dados, materialParaVg(material), cs ? { matrices: mz, colors: cs } : { matrices: mz })
    malha.name = nome
    malha.castShadow = sombra
    malha.receiveShadow = recebe
    if (peso !== undefined) malha.userData.peso = peso
    if (semNormal) malha.userData.semNormal = true
    grupo.add(malha)
  })())
  return []
}

// Na abertura (tela de carregamento): espera as malhas e os programas da vg. Sem isso a vg leva de 2 a 4 s para
// desenhar (KAN-71) e as árvores apareceriam depois do resto
export async function prepararMotorPlaca(renderer, cena, camera) {
  if (!pendentes.length) return
  await Promise.all(pendentes)
  if (vg) await vg.compileAsync(renderer, cena, camera)
}

export function motorPlaca() { return vg }
