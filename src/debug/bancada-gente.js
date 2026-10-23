// Bancada da gente (22/10/2026, docs/gente-22-10.md): as fichas da cidade e do campo lado a lado, de perto (3 m), a
// 10 m e a 40 m, na luz toon simples (sem o filtro do jogo): serve para julgar a forma e a silhueta. ?vista=3|10|40,
// ?grupo=cidade|sentadas|campo, ?lod=longe. Pronto quando window.__pronto.
import * as THREE from 'three'
import { fichasDaCidade, figuraGeo } from '../mundo/gente-figurino.js'
import { fichasDoCampo } from '../mundo/urubu-gente.js'
import { criarAleatorio } from '../utils.js'

const q = new URLSearchParams(location.search)
const vista = Number(q.get('vista') || 3)
const grupo = q.get('grupo') || 'cidade'
const detalhe = q.get('lod') || 'perto'
const tela = document.getElementById('tela')
const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true })
renderer.setPixelRatio(1)
renderer.setSize(innerWidth, innerHeight, false)
renderer.shadowMap.enabled = true
const cena = new THREE.Scene()
cena.background = new THREE.Color('#bcd3dd')
const sol = new THREE.DirectionalLight('#fff4e0', 2.6)
sol.position.set(4, 8, 6)
sol.castShadow = true
sol.shadow.mapSize.set(2048, 2048)
Object.assign(sol.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12 })
cena.add(sol, new THREE.HemisphereLight('#cfe3ee', '#b8875e', 1.1))
const chao = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshToonMaterial({ color: '#d9c29a' }))
chao.rotation.x = -Math.PI / 2
chao.receiveShadow = true
cena.add(chao)
let fichas = grupo === 'campo' ? fichasDoCampo().pe : grupo === 'camposentado' ? fichasDoCampo().sentado : fichasDaCidade(criarAleatorio(808))[grupo === 'sentadas' ? 'sentadas' : 'pe']
if (q.get('so')) fichas = q.get('so').split(',').map((k) => fichas[+k])
const sentado = grupo === 'sentadas' || grupo === 'camposentado'
const mat = new THREE.MeshToonMaterial({ vertexColors: true })
const passo = 0.95
fichas.forEach((f, i) => {
  const m = new THREE.Mesh(figuraGeo(f, { sentado, detalhe }), mat)
  m.position.set((i - (fichas.length - 1) / 2) * passo, 0, 0)
  m.rotation.y = i % 2 ? 0.35 : -0.35
  m.castShadow = true
  cena.add(m)
})
const largura = fichas.length * passo
const cam = new THREE.PerspectiveCamera(vista >= 40 ? 12 : 40, innerWidth / innerHeight, 0.1, 400)
const d = vista <= 3 ? Math.max(3, largura * 0.62) : vista
const giro = Number(q.get('giro') || 0)
cam.position.set(Math.sin(giro) * d, sentado ? 0.9 : 1.35, Math.cos(giro) * d)
cam.lookAt(0, sentado ? 0.5 : 0.95, 0)
renderer.render(cena, cam)
let tris = 0
cena.traverse((o) => { if (o.isMesh && o !== chao) tris += o.geometry.attributes.position.count / 3 })
window.__pronto = { tris: Math.round(tris / fichas.length), fichas: fichas.length }
