// Divide um monte de cópias (InstancedMesh) em blocos de chão.
// Assim o three consegue pular o bloco inteiro quando ele está fora da câmera
// ou fora da área da sombra; com uma malha só cobrindo o mapa, nada era pulado.

import * as THREE from 'three'
import { congelar } from './congelar.js'
import { solidosCamera } from './solidos.js'
import { motorPlacaLigado, materialServeNaPlaca, enviarAoMotor } from '../render/motor-placa.js'
import { registrarEstatico } from '../render/sombra-estatica.js'

const p = new THREE.Vector3()

// Tamanho padrão do bloco (cfg.desempenho.tamBloco). Bloco maior = menos chamadas de desenho (o gargalo é
// o processador) e mais cópias desenhadas fora da tela (a placa recorta de graça os pixels; sobra o vértice).
// Quem troca detalhe por bloco (casas da cidade e do quarteirão, LOD de 96 m) passa tam: TAM_LOD fixo.
export const TAM_LOD = 96
let tamPadrao = 96
let copiasMin = 0
let tamMax = 96
export function definirTamBloco(t, min = 0, max = t) { tamPadrao = t; copiasMin = min; tamMax = Math.max(t, max) }

// Agrupa as cópias em células de chão. Com junção (KAN-70): célula com menos de `copiasMin` cópias sobe para a
// célula 2x maior que a contém, junto com as vizinhas também ralas, até `tamMax`. Árvores espalhadas davam 1177
// blocos de 2 ou 3 cópias; cada bloco é um objeto, e no WebGPU do three cada objeto custa CPU por quadro (three.js
// #30560). Onde é denso nada muda; onde é ralo o bloco cresce (mais vértice fora da tela, que a placa recorta).
function agrupar(matrizes, tam, juntar) {
  const pos = matrizes.map((m) => { p.setFromMatrixPosition(m); return [p.x, p.z] })
  const chave = (i, t) => `${t}:${Math.floor(pos[i][0] / t)},${Math.floor(pos[i][1] / t)}`
  const prontos = []
  let soltos = matrizes.map((_, i) => i)
  for (let t = tam; soltos.length; t *= 2) {
    const grupos = new Map()
    for (const i of soltos) {
      const k = chave(i, t)
      if (!grupos.has(k)) grupos.set(k, [])
      grupos.get(k).push(i)
    }
    soltos = []
    const ultimo = !juntar || t * 2 > tamMax
    for (const g of grupos.values()) {
      if (ultimo || g.length >= copiasMin) prontos.push(g)
      else soltos.push(...g)
    }
  }
  return prontos
}

export function instanciarEmBlocos(cena, geo, material, matrizes, cores = null, opcoes = {}) {
  const { tam = tamPadrao, nome = '', sombra = true, recebe = true, peso, solido = false, semNormal = false } = opcoes
  // placa: true (árvores e plantas, KAN-72): no WebGPU com o motor ligado, uma malha da vg no lugar dos blocos.
  // Fica nos blocos quem troca detalhe por bloco (tam fixo), quem é sólido para a câmera e material sem versão na vg
  if (opcoes.placa && motorPlacaLigado() && opcoes.tam === undefined && !solido && materialServeNaPlaca(material)) {
    return enviarAoMotor(cena, geo, material, matrizes, cores, opcoes)
  }
  // junção só no tamanho padrão: quem passa tam (casas com LOD de 96 m) depende da grade fixa
  const grupos = agrupar(matrizes, tam, opcoes.tam === undefined && copiasMin > 0)
  const malhas = []
  const c = new THREE.Color()
  for (const indices of grupos) {
    const im = new THREE.InstancedMesh(geo, material, indices.length)
    indices.forEach((i, j) => {
      im.setMatrixAt(j, matrizes[i])
      if (cores && cores[i]) im.setColorAt(j, c.set(cores[i]))
    })
    im.computeBoundingSphere()
    im.castShadow = sombra
    im.receiveShadow = recebe
    registrarEstatico(im) // matriz congelada: a sombra vai para o mapa em cache (F4)
    im.name = nome
    if (peso !== undefined) im.userData.peso = peso
    if (semNormal) im.userData.semNormal = true
    if (solido) solidosCamera.push(im)
    cena.add(congelar(im))
    malhas.push(im)
  }
  return malhas
}
