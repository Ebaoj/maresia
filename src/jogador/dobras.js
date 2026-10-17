// Dobras do pano desenhadas (fase 7 do corpo): como no Aranhaverso, a dobra é traço de nanquim, não
// geometria. Quando o cotovelo, o joelho ou a cintura dobram, aparecem três ou quatro traços curtos
// atravessando o membro do lado de dentro da dobra; esticou, somem. Cada dobra é um desenho preso a uma
// junta, girado na tela para cruzar o membro, com tamanho pela dobra (nada até ~20°, inteiro a ~90°).

import * as THREE from 'three'
import { luzFixa } from '../materiais.js'

const TINTA = '#1a1033'

function textura(desenhar) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.strokeStyle = TINTA
  g.lineCap = 'round'
  desenhar(g)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
// traços em leque: cruzam o membro (o membro corre na vertical do desenho), finos, de tamanhos
// diferentes e abrindo um pouco para um lado, como dobra desenhada à mão
export const leque = (n) => textura((g) => {
  const linhas = [[30, 92, 40, -6], [40, 98, 62, 0], [34, 84, 84, 7], [46, 90, 102, 12]].slice(0, n)
  for (const [x0, x1, y, abre] of linhas) {
    g.lineWidth = 6.5
    g.beginPath(); g.moveTo(x0, y + abre); g.quadraticCurveTo((x0 + x1) / 2, y - 7, x1, y - abre * 0.3); g.stroke()
  }
})

const v = () => new THREE.Vector3()

// juntas: [nome, osso de cima, osso da junta, osso de baixo, raio do membro com o pano, n traços]
const JUNTAS = [
  ['cotovelo-e', 'LeftArm', 'LeftForeArm', 'LeftHand', 0.065, 3],
  ['cotovelo-d', 'RightArm', 'RightForeArm', 'RightHand', 0.065, 3],
  ['joelho-e', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 0.11, 3], // calça larga arregaçada
  ['joelho-d', 'RightUpLeg', 'RightLeg', 'RightFoot', 0.11, 3],
  ['cintura', 'Spine2', 'Spine', 'Hips', 0.16, 4],
]

export function criarDobras(raizCena, ossos) {
  const dobras = []
  for (const [nome, a, b, c, raio, n] of JUNTAS) {
    const oa = ossos.get(a), ob = ossos.get(b), oc = ossos.get(c)
    if (!oa || !ob || !oc) continue
    const m = new THREE.SpriteMaterial({ map: leque(n), alphaTest: 0.4, depthWrite: true, opacity: 0.5, blending: THREE.NoBlending })
    luzFixa(m, 0.5)
    m.customProgramCacheKey = () => 'luz-fixa-dobra'
    const sp = new THREE.Sprite(m)
    sp.visible = false
    sp.renderOrder = 3
    raizCena.add(sp)
    const d = { nome, oa, ob, oc, raio, sp, m, A: v(), B: v(), C: v() }
    // gira o desenho na hora de desenhar: os traços cruzam o membro na tela
    const pa = v(), pb = v(), cam = v(), dir = v(), eixo = v()
    sp.onBeforeRender = (_r, _c, camera) => {
      // na face do membro virada para a câmera, na junta (do lado de dentro ficaria escondido atrás do
      // próprio membro): sobe da base na direção da câmera, sem andar ao longo do membro
      if (d.base) {
        camera.getWorldPosition(cam)
        dir.subVectors(cam, d.base)
        eixo.subVectors(d.C, d.B).normalize()
        dir.addScaledVector(eixo, -dir.dot(eixo)).normalize()
        const p = d.base.clone().addScaledVector(dir, d.raio * 1.3)
        sp.parent.worldToLocal(p)
        sp.position.copy(p)
        sp.updateMatrixWorld()
      }
      pa.copy(d.B).project(camera)
      pb.copy(d.C).project(camera)
      m.rotation = Math.atan2(pb.y - pa.y, (pb.x - pa.x) * camera.aspect) - Math.PI / 2
    }
    dobras.push(d)
  }
  return {
    atualizar(forca = 1) {
      for (const d of dobras) {
        d.oa.getWorldPosition(d.A); d.ob.getWorldPosition(d.B); d.oc.getWorldPosition(d.C)
        const u = v().subVectors(d.A, d.B).normalize() // para o osso de cima
        const w = v().subVectors(d.C, d.B).normalize() // para o osso de baixo
        const dobra = Math.PI - u.angleTo(w) // 0 = esticado
        const k = Math.min(1, Math.max(0, (dobra - 0.35) / 1.2)) * forca
        d.sp.visible = k > 0.05
        if (!d.sp.visible) continue
        // do lado de dentro da dobra: a bissetriz das duas direções aponta para lá
        const dentro = v().addVectors(u, w)
        if (dentro.lengthSq() < 1e-6) { d.sp.visible = false; continue }
        dentro.normalize()
        // a base fica no eixo do membro, puxada um pouco para o lado de dentro da dobra; a posição final
        // (para a câmera) é decidida na hora de desenhar
        d.base = d.B.clone().addScaledVector(dentro, d.raio * 0.1)
        const tam = 0.06 + 0.05 * k + d.raio * 0.35
        d.sp.scale.set(tam * (0.6 + 0.4 * k), tam, 1)
      }
    },
  }
}
