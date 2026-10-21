// As esculturas da Praça dos Leões (detalhe-4-marcos.md, seção 2):
//   FATO   "Lion attaqué par un serpent" (autor desconhecido), no pedestal do alto da escadaria; "Lion debout
//          rugissant" e "Tigre debout rugissant" de Henri Alfred Jacquemart; ferro fundido das fundições de Val
//          d'Osne, 1914 [WP-Tibúrcio; Castro2009]
//   FATO   General Tibúrcio: bronze de ~2 m (Thiébaut Frères, Paris) sobre pedestal de 2,50 m [FEF-Leões]
//   HIP    os felinos com 1,0 a 1,3 m de altura e 1,6 a 2,0 m de comprimento; o pedestal do General branco, em
//          tronco de pirâmide sobre degraus; ferro quase preto com um verde de bronze, bronze escuro patinado
//
// Cada escultura é um grupo próprio (para ser trocada). Primeiro entra a forma procedural; o modelo esculpido
// (GLB em /arte/finais/marcos1932/, fora do git) entra no lugar dela quando carrega. Se o arquivo faltar ou
// falhar, fica a procedural (cfg.marcos.esculturasModelo = false força a procedural).

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { registrarEstatico } from '../../render/sombra-estatica.js'
import { Obra } from './obra.js'

// o modelo esculpido: arquivo, para onde ele olha (giro que leva a cabeça para +z), tamanho alvo e medida
export const MODELOS = {
  leaoSerpente: { arquivo: '/arte/finais/marcos1932/leao-serpente-jogo.glb', giro: 0, comprimento: 2.0 },
  leao: { arquivo: '/arte/finais/marcos1932/leao-pe-jogo.glb', giro: 0, altura: 1.25 },
  // o tigre do arquivo tem o corpo em x, a cabeça na ponta -x virada para +z (o "rugindo" de Jacquemart olha de lado)
  tigre: { arquivo: '/arte/finais/marcos1932/tigre-jogo.glb', giro: Math.PI / 2, altura: 1.25 },
  general: { arquivo: '/arte/finais/marcos1932/general-jogo.glb', giro: 0, altura: 2.0 },
}

const limpa = (g) => {
  const n = g.index ? g.toNonIndexed() : g
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k)
  return n
}
const V = (x, y, z) => new THREE.Vector3(x, y, z)
const bola = (r, x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, 10, 8).scale(sx, sy, sz).translate(x, y, z)
const perna = (x, z, h, r = 0.09) => new THREE.CylinderGeometry(r * 0.8, r, h, 7).translate(x, h / 2, z)
const tubo = (pts, r, seg = 40) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 7, false)

// felino de pé, rugindo (cabeça para +z); juba = leão
function felinoDePe(juba) {
  const p = []
  p.push(bola(0.42, 0, 0.78, 0, 0.8, 0.75, 1.9)) // corpo
  for (const [x, z] of [[-0.17, 0.5], [0.17, 0.5], [-0.17, -0.55], [0.17, -0.55]]) p.push(perna(x, z, 0.72))
  for (const [x, z] of [[-0.17, 0.55], [0.17, 0.55], [-0.17, -0.5], [0.17, -0.5]]) p.push(bola(0.1, x, 0.05, z, 1, 0.6, 1.5))
  if (juba) p.push(bola(0.36, 0, 1.12, 0.72, 1.05, 1.1, 0.9))
  p.push(bola(0.22, 0, 1.15, 0.92, 1, 0.95, 1.25)) // cabeça
  p.push(new THREE.BoxGeometry(0.2, 0.07, 0.24).rotateX(-0.35).translate(0, 1.12, 1.13)) // maxilar de cima
  p.push(new THREE.BoxGeometry(0.17, 0.06, 0.2).rotateX(0.45).translate(0, 0.96, 1.08)) // a boca aberta
  for (const s of [-1, 1]) p.push(bola(0.05, s * 0.12, 1.36, 0.86))
  p.push(tubo([V(0, 0.95, -0.75), V(0, 0.75, -1.0), V(0, 0.5, -1.05), V(0.05, 0.35, -0.95)], 0.035, 16)) // cauda
  return mergeGeometries(p.map(limpa))
}

// o leão atacado pela serpente: agachado, a cabeça virada para a serpente que se enrola nele e ergue a cabeça
function leaoComSerpente() {
  const p = []
  p.push(bola(0.42, 0, 0.42, -0.1, 0.9, 0.62, 1.7)) // corpo baixo
  p.push(bola(0.36, 0, 0.78, 0.48, 1.05, 1.05, 0.95)) // juba
  p.push(bola(0.21, 0.06, 0.82, 0.7, 1, 0.95, 1.2)) // cabeça
  p.push(new THREE.BoxGeometry(0.2, 0.07, 0.22).rotateX(-0.4).translate(0.06, 0.8, 0.9))
  for (const [x, z] of [[-0.25, 0.55], [0.3, 0.5], [-0.3, -0.6], [0.3, -0.62]]) p.push(bola(0.13, x, 0.1, z, 1, 0.8, 1.6))
  p.push(new THREE.CylinderGeometry(0.08, 0.1, 0.5, 7).rotateZ(-0.6).translate(0.38, 0.55, 0.55)) // a pata levantada
  // a serpente: dá duas voltas no corpo e ergue a cabeça diante da cara do leão
  const pts = []
  for (let i = 0; i <= 18; i++) {
    const t = i / 18
    const a = t * Math.PI * 4
    pts.push(V(Math.cos(a) * 0.48, 0.35 + Math.sin(a) * 0.32, -0.75 + t * 1.1))
  }
  pts.push(V(0.35, 0.75, 0.7), V(0.25, 1.05, 1.0), V(0.1, 1.15, 1.08))
  p.push(tubo(pts, 0.075, 90))
  p.push(bola(0.11, 0.08, 1.17, 1.12, 1, 0.7, 1.5)) // a cabeça da serpente
  return mergeGeometries(p.map(limpa))
}

// o General de pé, fardado, uma mão segurando o chapéu junto ao corpo (cabeça para cima, frente para +z)
function general() {
  const p = []
  for (const s of [-1, 1]) {
    p.push(new THREE.CylinderGeometry(0.09, 0.08, 0.95, 8).translate(s * 0.12, 0.5, 0)) // perna
    p.push(new THREE.BoxGeometry(0.13, 0.08, 0.28).translate(s * 0.12, 0.04, 0.05)) // bota
  }
  p.push(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10).scale(1, 1, 0.75).translate(0, 1.18, 0)) // a túnica
  p.push(new THREE.CylinderGeometry(0.2, 0.24, 0.32, 10).scale(1, 1, 0.75).translate(0, 0.92, 0)) // aba da túnica
  p.push(bola(0.11, 0, 1.6, 0.01)) // cabeça
  p.push(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8).translate(0, 1.47, 0)) // pescoço
  for (const s of [-1, 1]) p.push(bola(0.08, s * 0.24, 1.38, 0, 1.2, 0.6, 1))
  p.push(new THREE.CylinderGeometry(0.05, 0.045, 0.62, 7).translate(-0.27, 1.08, 0)) // braço caído
  p.push(new THREE.CylinderGeometry(0.05, 0.045, 0.34, 7).rotateX(-1.1).translate(0.26, 1.2, 0.12)) // braço dobrado
  p.push(new THREE.CylinderGeometry(0.11, 0.12, 0.09, 12).rotateZ(1.4).translate(0.3, 1.1, 0.2)) // o chapéu na mão
  p.push(new THREE.CylinderGeometry(0.015, 0.02, 0.7, 6).rotateZ(0.25).translate(-0.33, 0.65, 0.05)) // espada
  return mergeGeometries(p.map(limpa))
}

// o modelo esculpido como uma geometria só, no pé (y = 0), centrado, de frente para +z e no tamanho do dossiê
function prepararModelo(gltf, def) {
  gltf.scene.updateMatrixWorld(true)
  const partes = []
  gltf.scene.traverse((o) => { if (o.isMesh) partes.push(limpa(o.geometry.clone().applyMatrix4(o.matrixWorld))) })
  const g = mergeGeometries(partes)
  if (def.giro) g.rotateY(def.giro)
  g.computeBoundingBox()
  const b = g.boundingBox
  const tam = b.getSize(new THREE.Vector3())
  const esc = def.altura ? def.altura / tam.y : def.comprimento / tam.z
  g.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2)
  g.scale(esc, esc, esc)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

// lugares: { chave: [x local, y local, z local, giro] } no referencial da obra da praça
export function criarEsculturas(cena, cfg, mats, obra, lugares) {
  const formas = { leaoSerpente: leaoComSerpente(), leao: felinoDePe(true), tigre: felinoDePe(false), general: general() }
  const grupos = []
  const porChave = {}
  for (const [chave, [lx, ly, lz, giro]] of Object.entries(lugares)) {
    const [x, z] = obra.mundo(lx, lz)
    const g = new THREE.Group()
    g.name = `escultura-${chave}`
    g.position.set(x, obra.y + ly, z)
    g.rotation.y = obra.giro + giro
    const mat = chave === 'general' ? mats.general : mats.felinos
    const m = new THREE.Mesh(formas[chave], mat)
    m.name = `${g.name}-procedural`
    m.castShadow = m.receiveShadow = true
    g.add(m)
    cena.add(g)
    g.updateMatrixWorld(true)
    registrarEstatico(m)
    grupos.push(g)
    porChave[chave] = { g, procedural: m, mat }
  }
  // o pedestal do General: degraus brancos e o tronco de pirâmide de 2,50 m
  const [gx, gy, gz] = lugares.general
  const ped = new Obra('pedestal-general', obra.mundo(gx, gz), obra.y + gy)
  for (let i = 0; i < 3; i++) ped.caixa('balaustre', 0, 0.1 + i * 0.2, 0, 3.2 - i * 0.5, 0.2, 3.2 - i * 0.5)
  const tronco = new THREE.CylinderGeometry(0.62, 0.85, 1.7, 4).rotateY(Math.PI / 4).translate(0, 0.6 + 0.85, 0)
  ped.add('balaustre', tronco)
  ped.caixa('moldura', 0, 2.38, 0, 1.25, 0.24, 1.25)
  for (let k = 0; k < 4; k++) ped.add('calVelha', new THREE.BoxGeometry(0.7, 0.35, 0.02).translate(0, 1.4, 0.78).rotateY((k * Math.PI) / 2))
  ped.colisaoCaixa(0, 0, 1.6, 1.6)
  ped.montar(cena, mats)
  grupos.push(ped.grupo)
  porChave.general.g.position.y += 2.5
  porChave.general.g.updateMatrixWorld(true)

  if (cfg.marcos.esculturasModelo) {
    const loader = new GLTFLoader()
    for (const [chave, def] of Object.entries(MODELOS)) {
      const alvo = porChave[chave]
      if (!alvo) continue
      loader.load(def.arquivo, (gltf) => {
        try {
          const m = new THREE.Mesh(prepararModelo(gltf, def), alvo.mat)
          m.name = `escultura-${chave}-modelo`
          m.castShadow = m.receiveShadow = true
          alvo.g.add(m)
          alvo.g.updateMatrixWorld(true)
          alvo.procedural.visible = false
          registrarEstatico(m)
        } catch (e) {
          console.warn(`escultura ${chave}: o modelo não serviu, fica a procedural`, e)
        }
      }, undefined, () => console.warn(`escultura ${chave}: ${def.arquivo} não carregou, fica a procedural`))
    }
  }
  return { grupos }
}
