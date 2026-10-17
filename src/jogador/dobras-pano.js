// Dobras desenhadas que nascem do pano simulado (fase 2 de docs/roupas-plano.md). As dobras de junta
// (dobras.js) aparecem pelo ângulo do cotovelo e do joelho; estas aparecem onde o pano do Jolt de fato se
// comprime: a barra amassando na coxa ao sentar, a cintura franzindo ao abaixar, a manga embolando.
// Mesmo traço de nanquim, mesmo jeito de cruzar: os traços ficam de través à direção em que o pano encolheu.
// Os lugares são escolhidos de novo a cada 1/6 s (como o resto, o desenho muda "em 2"), a posição segue
// o pano todo quadro.

import * as THREE from 'three'
import { luzFixa } from '../materiais.js'
import { leque } from './dobras.js'

const POR_PECA = 4
const ESPACO = 0.12 // m entre duas dobras da mesma peça
const ESCOLHER = 1 / 6

export function criarDobrasPano(raizCena, pecas) {
  const tex = leque(3)
  const grupos = pecas.map((p) => {
    // arestas do pano invisível e o comprimento delas em repouso
    const vistas = new Set()
    const arestas = []
    for (const [a, b, c] of p.proxy.faces) {
      for (const [i, j] of [[a, b], [b, c], [c, a]]) {
        const k = i < j ? i * 100000 + j : j * 100000 + i
        if (vistas.has(k)) continue
        vistas.add(k)
        arestas.push([i, j, p.proxy.pontos[i].distanceTo(p.proxy.pontos[j])])
      }
    }
    const sprites = []
    for (let n = 0; n < POR_PECA; n++) {
      const m = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.4, depthWrite: true, opacity: 0.5, blending: THREE.NoBlending })
      luzFixa(m, 0.5)
      m.customProgramCacheKey = () => 'luz-fixa-dobra-pano'
      const sp = new THREE.Sprite(m)
      sp.visible = false
      sp.renderOrder = 3
      raizCena.add(sp)
      const s = { sp, m, ponto: -1, dir: new THREE.Vector3(), k: 0 }
      const pa = new THREE.Vector3(), pb = new THREE.Vector3(), cam = new THREE.Vector3(), w = new THREE.Vector3()
      sp.onBeforeRender = (_r, _c, camera) => {
        if (s.ponto < 0) return
        // um pouco para o lado da câmera (senão fica dentro do pano) e girado para cruzar a compressão
        w.fromArray(p.sim, s.ponto * 3)
        camera.getWorldPosition(cam)
        const p2 = w.clone().addScaledVector(cam.sub(w).normalize(), 0.02)
        sp.parent.worldToLocal(p2)
        sp.position.copy(p2)
        sp.updateMatrixWorld()
        pa.copy(w).project(camera)
        pb.copy(w).add(s.dir).project(camera)
        m.rotation = Math.atan2(pb.y - pa.y, (pb.x - pa.x) * camera.aspect) - Math.PI / 2
      }
      sprites.push(s)
    }
    return { p, arestas, sprites, aperto: new Float32Array(p.P), conta: new Float32Array(p.P), direcao: new Float32Array(p.P * 3) }
  })
  let relogio = 0
  const A = new THREE.Vector3(), B = new THREE.Vector3()
  return {
    atualizar(dt, forca = 1) {
      relogio += dt
      const escolher = relogio >= ESCOLHER
      if (escolher) relogio %= ESCOLHER
      for (const g of grupos) {
        if (forca <= 0) { for (const s of g.sprites) s.sp.visible = false; continue }
        if (escolher) {
          // aperto de cada ponto: média de (como o esqueleto deixaria / como o pano está) nas arestas dele,
          // e a direção da mais apertada. Só conta o que o pano amassa a mais que a pele: a dobra da junta
          // em si já é desenhada por dobras.js
          g.aperto.fill(0); g.conta.fill(0)
          const melhorDe = new Float32Array(g.p.P)
          for (const [i, j, rep] of g.arestas) {
            A.fromArray(g.p.pele, i * 3); B.fromArray(g.p.pele, j * 3)
            const naPele = A.distanceTo(B)
            A.fromArray(g.p.sim, i * 3); B.fromArray(g.p.sim, j * 3)
            const agora = A.distanceTo(B)
            if (agora < 1e-5) continue
            // amassou de verdade: mais curto que o próprio repouso E que a pele (no sovaco a pele estica e o
            // pano não, isso não é dobra; no cotovelo os dois encurtam juntos, essa é a de dobras.js)
            const r = Math.min(rep, naPele) / agora
            g.aperto[i] += r; g.conta[i]++; g.aperto[j] += r; g.conta[j]++
            for (const q of [i, j]) {
              if (r > melhorDe[q]) { melhorDe[q] = r; B.sub(A).normalize(); g.direcao[q * 3] = B.x; g.direcao[q * 3 + 1] = B.y; g.direcao[q * 3 + 2] = B.z; B.fromArray(g.p.sim, j * 3) }
            }
          }
          const cand = []
          for (let i = 0; i < g.p.P; i++) if (g.conta[i]) { const c = g.aperto[i] / g.conta[i]; if (c > 1.04) cand.push([i, c]) }
          cand.sort((x, y) => y[1] - x[1])
          const escolhidos = []
          for (const [i, c] of cand) {
            if (escolhidos.length >= POR_PECA) break
            A.fromArray(g.p.sim, i * 3)
            if (escolhidos.some(([q]) => B.fromArray(g.p.sim, q * 3).distanceTo(A) < ESPACO)) continue
            escolhidos.push([i, c])
          }
          g.sprites.forEach((s, n) => {
            const e = escolhidos[n]
            s.ponto = e ? e[0] : -1
            s.k = e ? Math.min(1, (e[1] - 1.04) / 0.1) * forca : 0
            if (e) s.dir.fromArray(g.direcao, e[0] * 3).multiplyScalar(0.05)
          })
        }
        for (const s of g.sprites) {
          s.sp.visible = s.ponto >= 0 && s.k > 0.05
          if (!s.sp.visible) continue
          const tam = 0.05 + 0.04 * s.k
          s.sp.scale.set(tam * (0.6 + 0.4 * s.k), tam, 1)
        }
      }
    },
  }
}
