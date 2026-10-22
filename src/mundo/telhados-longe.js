// Os telhados ao longe (o vazio da cidade, docs/mapa-1932.md, v10, item e): do Centro, depois das últimas
// casas desenhadas o chão corria liso até o céu, porque as casas de longe são baixas, a névoa lava, e o
// mundo comprimido deixa a planície vazia entre um bairro e outro. As fotos do alto de 1930 a 1936
// (vistas gerais do dossiê marcos-1932.md) mostram o contrário: telhado de barro até o horizonte, com uma
// torre de igreja e um cata-vento aqui e ali.
//
// É uma faixa de silhueta (como as serras de horizonte.js): um anel de telhados recortados a uma
// distância fixa da câmera, que acompanha a câmera (nunca se chega nele) e só sobe onde, naquela direção e
// naquela distância, a planta de 1932 tem cidade (ocupacao1932.js). As casas de verdade, mais perto,
// tapam o anel. Sem luz, com a cor da névoa misturada (perspectiva atmosférica), como as serras.

import * as THREE from 'three'
import { globais } from '../globais.js'
import { luzFixa } from '../materiais.js'
import { naCidade1932 } from './ocupacao1932.js'
import { alturaTerreno } from './terreno.js'
import { criarAleatorio } from '../utils.js'

const PASSOS = 720 // meio grau por coluna

export function criarTelhadosLonge(cena, cfg) {
  const c = cfg.mundo.telhadosLonge
  if (!c?.ligado) return { atualizar() {} }
  const rnd = criarAleatorio(1930)
  // o perfil de cada coluna é fixo (sorteado uma vez): telhado de duas águas, platibanda, torre
  const perfil = []
  for (let i = 0; i < PASSOS; i++) {
    const r = rnd.entre(0, 1)
    const base = rnd.entre(c.alturaMin, c.alturaMax)
    perfil.push(r < 0.012 ? base * 2.6 : r < 0.03 ? base * 1.7 : base * (0.8 + 0.4 * Math.abs(Math.sin(i * 0.9))))
  }
  const pos = new Float32Array(PASSOS * 2 * 3 + 6)
  const idx = []
  for (let i = 0; i < PASSOS; i++) {
    const k = i * 2
    const k2 = ((i + 1) % PASSOS) * 2
    idx.push(k, k2, k + 1, k + 1, k2, k2 + 1)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setIndex(idx)
  const mat = luzFixa(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide }), 0.8)
  const malha = new THREE.Mesh(geo, mat)
  malha.name = 'telhados-longe'
  malha.frustumCulled = false
  malha.userData.semNormal = true
  malha.renderOrder = -4
  cena.add(malha)

  const ultimo = new THREE.Vector2(Infinity, Infinity)
  const tmp = new THREE.Color()
  const montar = (cx, cz) => {
    const R = c.distancia
    for (let i = 0; i < PASSOS; i++) {
      const a = (i / PASSOS) * Math.PI * 2
      const x = cx + Math.cos(a) * R
      const z = cz + Math.sin(a) * R
      // só onde a planta tem cidade, num leque de três pontos para a silhueta não piscar coluna a coluna
      let cidade = 0
      for (const d of [-0.15, 0, 0.15]) if (naCidade1932(cx + Math.cos(a) * R * (1 + d), cz + Math.sin(a) * R * (1 + d))) cidade++
      const chao = alturaTerreno(x, z)
      const h = cidade >= 2 ? perfil[i] : 0
      pos.set([x, chao - 2, z, x, chao + h, z], i * 6)
    }
    geo.attributes.position.needsUpdate = true
    geo.computeBoundingSphere()
  }
  return {
    atualizar(camera, paleta) {
      if (!camera) return
      const cx = camera.position.x
      const cz = camera.position.z
      if (Math.hypot(cx - ultimo.x, cz - ultimo.y) > c.refazer) {
        ultimo.set(cx, cz)
        montar(cx, cz)
      }
      // a cor: o barro do telhado com sombra, puxado para a névoa pela distância
      tmp.set('#8a5a46').lerp(paleta.chao, 0.25).multiplyScalar(0.6 + 0.4 * (1 - paleta.noite))
      mat.color.copy(tmp).lerp(globais.uNevoaCor.value, c.mistura)
    },
  }
}
