// As tarefas de terra cercadas de arame do Campo do Urubu (a geometria que o urubu1932.js tinha até 22/10/2026).
//
// FATO: o sobrevivente lembra "umas 20 tarefas de terra cercadas com arame". HIPÓTESE (docs/mapa-1932.md):
// as 20 tarefas desenhadas como lotes de terra revolvida no desenho v3 (src/mundo/mapa1932-dados.json). Desde
// 22/10/2026 o núcleo habitado (urubu-planta.js) ocupa ~7 ha (as "20 tarefas" lidas como área), e as tarefas
// que caem em cima dele não são desenhadas; as outras ficam como terra trabalhada, como no conceito aprovado.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { alturaTerreno } from './terreno.js'
import { colorir } from './cenografia.js'
import { CAL } from '../paleta.js'

const ARAME = '#8a8578'

// cerca de arame da tarefa: postes de estaca e três fios, com o vão da porteira
export function geometriaCercaTarefa (l, p, altura) {
  const partes = []
  const passo = 2.4
  const vao = 2.8
  const poste = (x, z) => partes.push(colorir(new THREE.BoxGeometry(0.16, altura + 0.7, 0.16).translate(x, (altura + 0.7) / 2 - 0.5, z), CAL.mangue))
  const fios = (x0, x1, z) => {
    for (const y of [0.5, 0.95, altura - 0.15]) {
      partes.push(colorir(new THREE.BoxGeometry(Math.abs(x1 - x0), 0.04, 0.04).translate((x0 + x1) / 2, y, z), ARAME))
    }
  }
  for (let x = -l / 2; x <= l / 2 + 0.01; x += passo) {
    if (Math.abs(x) > vao / 2) poste(x, p / 2)
    poste(x, -p / 2)
  }
  for (const z of [-p / 2, p / 2]) poste(l / 2, z)
  poste(-l / 2, -p / 2)
  poste(-l / 2, p / 2)
  fios(-l / 2, -vao / 2, p / 2)
  fios(vao / 2, l / 2, p / 2)
  fios(-l / 2, l / 2, -p / 2)
  for (const x of [-vao / 2, vao / 2]) poste(x, p / 2)
  partes.push(colorir(new THREE.BoxGeometry(vao, 0.12, 0.12).translate(0, altura - 0.3, p / 2), CAL.mangue))
  return mergeGeometries(partes)
}

// a terra batida da tarefa, seguindo o relevo, com os atributos que o material do chão (terreno.js) lê
export function chaoDaTarefa (x, z, l, p, ang) {
  const N = 6
  const M = 4
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const pos = []
  const idx = []
  for (let j = 0; j <= M; j++) {
    for (let i = 0; i <= N; i++) {
      const lx = (i / N - 0.5) * l
      const lz = (j / M - 0.5) * p
      const wx = x + lx * c + lz * s
      const wz = z - lx * s + lz * c
      pos.push(wx, alturaTerreno(wx, wz) + 0.09, wz)
    }
  }
  for (let j = 0; j < M; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i
      idx.push(a, a + 1, a + N + 2, a, a + N + 2, a + N + 1)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const t = colorir(g, CAL.taipa)
  const n = t.attributes.position.count
  const solo = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) solo.set([0, 0.65, 0.35, 0], i * 4)
  t.setAttribute('aSolo', new THREE.BufferAttribute(solo, 4))
  t.setAttribute('aPiso', new THREE.BufferAttribute(new Float32Array(n), 1))
  t.setAttribute('aAreia', new THREE.BufferAttribute(new Float32Array(n), 1))
  t.setAttribute('aRota', new THREE.BufferAttribute(new Float32Array(n).fill(-1), 1))
  return t
}
