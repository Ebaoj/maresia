// Laboratório do corpo (http://localhost:5195/laboratorio.html): o boneco no esqueleto padrão, os
// movimentos do Mixamo convertidos para ele e a camada do jogo por cima. Chão com rampa e degraus
// para ver o pé pisar. WASD anda, Shift corre, Espaço pula, F senta/levanta, G carrega, R nada.
// Gravar vídeo: await lab.gravar({ nome: 'corpo-x', segundos: 6, roteiro: 'circulo' })

import * as THREE from 'three'
import GUI from 'lil-gui'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { criarBoneco } from './jogador/esqueleto.js'
import { carregarMovimentosMixamo } from './jogador/retarget.js'
import { Animador } from './jogador/animador.js'

const MOVIMENTOS = [
  'parado', 'olhando', 'andar', 'correr', 'disparada', 'pulo-subida', 'pulo-queda', 'pulo-pouso', 'sentar',
  'sentado', 'levantar', 'carregar-andando', 'carregar-parado', 'boiar', 'nadar', 'nadar-peito', 'empurrar',
  'velho-andar', 'velho-parado',
]
const PASTA = '/animacoes/mixamo/'

const tela = document.getElementById('tela')
const info = document.getElementById('info')
const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(Math.min(2, devicePixelRatio))
renderer.shadowMap.enabled = true
const cena = new THREE.Scene()
cena.background = new THREE.Color('#e9dfcb')
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200)
camera.position.set(3.2, 2.0, 4.2)
const orbita = new OrbitControls(camera, tela)
orbita.target.set(0, 0.9, 0)
cena.add(new THREE.HemisphereLight('#fff6e6', '#8a7a62', 1.6))
const sol = new THREE.DirectionalLight('#fff1d6', 2.4)
sol.position.set(4, 8, 3)
sol.castShadow = true
sol.shadow.mapSize.set(2048, 2048)
Object.assign(sol.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 })
cena.add(sol, sol.target)

// chão: plano, uma rampa a leste e uma escada ao norte
function chao(x, z) {
  let h = 0
  if (x > 3 && x < 9 && Math.abs(z) < 3) h = Math.min(1.0, (x - 3) * 0.25) // rampa de 14°
  if (x >= 9 && x < 12 && Math.abs(z) < 3) h = 1.0
  if (z < -3 && z > -9 && Math.abs(x) < 3) h = Math.min(5, Math.floor((-3 - z) / 0.6)) * 0.17 // degraus de 17 cm
  return h
}
{
  const g = new THREE.PlaneGeometry(40, 40, 400, 400).rotateX(-Math.PI / 2)
  const p = g.attributes.position
  const cores = []
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    p.setY(i, chao(x, z))
    const xadrez = (Math.floor(x) + Math.floor(z)) & 1
    const c = new THREE.Color(xadrez ? '#d8c7a3' : '#cbb791')
    cores.push(c.r, c.g, c.b)
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }))
  m.receiveShadow = true
  cena.add(m)
}

const boneco = criarBoneco()
cena.add(boneco.raiz)
const esqueletoVisivel = new THREE.SkeletonHelper(boneco.raiz)
esqueletoVisivel.visible = false
cena.add(esqueletoVisivel)

const cfg = {
  andar: 1.6, correr: 4.2, ik: true, inclinar: true, em2: true, fps: 12, esqueleto: false,
  original: true, piloto: false, raioPiloto: 3, sentado: false, carregando: false, nadando: false,
}
const estado = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), velY: 0, noAr: false, yaw: 0, tempo: 0 }
const teclas = {}
addEventListener('keydown', (e) => {
  teclas[e.code] = true
  if (e.code === 'Space' && !estado.noAr) { estado.velY = 4.2; estado.noAr = true }
  if (e.code === 'KeyF') cfg.sentado = !cfg.sentado
  if (e.code === 'KeyG') cfg.carregando = !cfg.carregando
  if (e.code === 'KeyR') cfg.nadando = !cfg.nadando
})
addEventListener('keyup', (e) => { teclas[e.code] = false })

let animador = null
let original = null // o Y Bot tocando o movimento cru, para comparar
let mixerOriginal = null
const clipesCrus = {}

async function iniciar() {
  const linhas = []
  const r = await carregarMovimentosMixamo({ alvo: { ossos: boneco.ossos, raiz: boneco.raiz }, pasta: PASTA, nomes: MOVIMENTOS })
  if (r.ybot) {
    original = r.ybot
    original.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = new THREE.MeshLambertMaterial({ color: '#9aa7b8' }) } })
    // o FBX do Mixamo vem em centímetros: só o boneco de comparação é escalado para 1,68 m
    const caixa = new THREE.Box3().setFromObject(original)
    original.scale.multiplyScalar(1.68 / (caixa.max.y - caixa.min.y))
    original.position.set(-1.4, 0, 0)
    cena.add(original)
    mixerOriginal = new THREE.AnimationMixer(original)
    linhas.push('Y Bot: ok (repouso em T da fonte)')
  } else linhas.push('Y Bot: faltando (uso a pose inicial de cada arquivo como repouso)')
  Object.assign(clipesCrus, r.crus)
  const { clipes, passadas, faltando } = r
  linhas.push(`movimentos: ${Object.keys(clipes).join(', ') || 'nenhum'}`)
  if (faltando.length) linhas.push(`faltando: ${faltando.join(', ')}`)
  linhas.push(`passada natural: andar ${passadas.andar?.toFixed(2) ?? '?'} m/s, correr ${passadas.correr?.toFixed(2) ?? '?'} m/s`)
  linhas.push('WASD anda · Shift corre · Espaço pula · F senta · G carrega · R nada · arrastar gira a câmera')
  info.textContent = linhas.join('\n')
  if (Object.keys(clipes).length) animador = new Animador({ raiz: boneco.raiz, ossos: boneco.ossos }, clipes, passadas)
  window.lab.clipes = clipes
  window.lab.passadas = passadas
  window.lab.animador = animador
  montarPainel()
}

function montarPainel() {
  const gui = new GUI({ title: 'corpo' })
  gui.add(cfg, 'andar', 0.8, 6, 0.1).name('velocidade andando (m/s)')
  gui.add(cfg, 'correr', 2, 10, 0.1).name('velocidade correndo (m/s)')
  gui.add(cfg, 'ik').name('pé no chão (IK)')
  gui.add(cfg, 'inclinar').name('inclinar na curva')
  gui.add(cfg, 'em2').name('animação em 2')
  gui.add(cfg, 'fps', 6, 30, 1).name('poses por segundo')
  gui.add(cfg, 'esqueleto').name('mostrar esqueleto')
  gui.add(cfg, 'original').name('Y Bot ao lado (cru)')
  gui.add(cfg, 'piloto').name('piloto automático (círculo)')
  gui.add(cfg, 'raioPiloto', 1, 8, 0.1).name('raio do círculo')
  gui.add(cfg, 'sentado').name('sentado (F)').listen()
  gui.add(cfg, 'carregando').name('carregando (G)').listen()
  gui.add(cfg, 'nadando').name('nadando (R)').listen()
  const lista = { original: 'andar' }
  gui.add(lista, 'original', Object.keys(clipesCrus)).name('Y Bot toca').onChange(tocarOriginal)
  tocarOriginal(lista.original)
}
function tocarOriginal(nome) {
  if (!mixerOriginal || !clipesCrus[nome]) return
  mixerOriginal.stopAllAction()
  mixerOriginal.clipAction(clipesCrus[nome]).play()
}

// controle simples, parecido com o do jogo (sem colisão)
function passo(dt, entrada = null) {
  estado.tempo += dt
  let dx = 0
  let dz = 0
  let correndo = false
  if (entrada) ({ dx, dz, correndo } = entrada)
  else if (cfg.piloto) {
    const w = (cfg.andar / cfg.raioPiloto)
    const a = estado.tempo * w
    dx = Math.cos(a)
    dz = -Math.sin(a)
  } else {
    const az = Math.atan2(camera.position.x - orbita.target.x, camera.position.z - orbita.target.z)
    const f = [-Math.sin(az), -Math.cos(az)]
    const d = [-f[1], f[0]]
    if (teclas.KeyW) { dx += f[0]; dz += f[1] }
    if (teclas.KeyS) { dx -= f[0]; dz -= f[1] }
    if (teclas.KeyA) { dx -= d[0]; dz -= d[1] }
    if (teclas.KeyD) { dx += d[0]; dz += d[1] }
    correndo = teclas.ShiftLeft || teclas.ShiftRight
  }
  const n = Math.hypot(dx, dz)
  if (n > 0) { dx /= n; dz /= n }
  const alvoV = cfg.sentado ? 0 : (correndo ? cfg.correr : cfg.andar) * (n > 0 ? 1 : 0)
  const k = 1 - Math.exp(-dt * (estado.noAr ? 1.5 : 6))
  estado.vel.x += (dx * alvoV - estado.vel.x) * k
  estado.vel.z += (dz * alvoV - estado.vel.z) * k
  estado.pos.addScaledVector(estado.vel, dt)
  const vel = Math.hypot(estado.vel.x, estado.vel.z)
  if (vel > 0.2) {
    const alvoYaw = Math.atan2(estado.vel.x, estado.vel.z)
    let d = alvoYaw - estado.yaw
    d = Math.atan2(Math.sin(d), Math.cos(d))
    estado.yaw += d * (1 - Math.exp(-dt * 10))
  }
  const h = chao(estado.pos.x, estado.pos.z)
  if (estado.noAr) {
    estado.velY -= 12 * dt
    estado.pos.y += estado.velY * dt
    if (estado.pos.y <= h && estado.velY < 0) { estado.pos.y = h; estado.noAr = false; estado.velY = 0 }
  } else {
    // sobe degrau sem pulo e desce com suavidade (o corpo; o pé quem resolve é o IK)
    estado.pos.y += (h - estado.pos.y) * (1 - Math.exp(-dt * 14))
  }
  boneco.raiz.position.copy(estado.pos)
  boneco.raiz.rotation.y = estado.yaw
  if (animador) {
    Object.assign(animador.opcoes, { ik: cfg.ik, inclinar: cfg.inclinar, em2: cfg.em2, fps: cfg.fps })
    animador.passadas.andar ??= 1.4
    animador.atualizar(dt, {
      vel, velY: estado.velY, noAr: estado.noAr, sentado: cfg.sentado, nadando: cfg.nadando,
      carregando: cfg.carregando, yaw: estado.yaw, chao,
    })
  }
  if (mixerOriginal) mixerOriginal.update(dt)
  if (original) original.visible = cfg.original
  esqueletoVisivel.visible = cfg.esqueleto
  // câmera acompanha
  const alvoCam = new THREE.Vector3(estado.pos.x, estado.pos.y + 0.9, estado.pos.z)
  camera.position.add(alvoCam.clone().sub(orbita.target))
  orbita.target.copy(alvoCam)
  sol.position.copy(alvoCam).add(new THREE.Vector3(4, 8, 3))
  sol.target.position.copy(alvoCam)
}

function redimensionar() {
  const w = innerWidth
  const h = innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}
addEventListener('resize', redimensionar)
redimensionar()

let ultimo = performance.now()
let gravando = false
function laco(t) {
  requestAnimationFrame(laco)
  if (gravando) return
  const dt = Math.min(0.05, (t - ultimo) / 1000)
  ultimo = t
  passo(dt)
  orbita.update()
  renderer.render(cena, camera)
}
requestAnimationFrame(laco)

// gravação com passo fixo (quadros salvos em docs/capturas/video/<nome>/)
// roteiros: 'circulo' anda em círculo; 'reta' anda, corre e para; 'escada' sobe e desce os degraus
async function gravar({ nome = 'corpo', segundos = 6, fps = 30, roteiro = 'reta', camera: cam = [3.2, 1.2, 0] } = {}) {
  gravando = true
  estado.pos.set(0, chao(0, 0), 0)
  estado.vel.set(0, 0, 0)
  estado.tempo = 0
  orbita.target.set(0, 0.9, 0)
  camera.position.set(cam[0], 0.9 + cam[1], cam[2])
  const envios = []
  try {
    const total = Math.round(segundos * fps)
    for (let i = 0; i < total; i++) {
      const t = i / fps
      let entrada = { dx: 0, dz: 0, correndo: false }
      if (roteiro === 'circulo') { const a = t * 0.6; entrada = { dx: Math.cos(a), dz: -Math.sin(a), correndo: false } }
      if (roteiro === 'reta') entrada = t < 2.5 ? { dx: 1, dz: 0, correndo: false } : t < 4.5 ? { dx: 1, dz: 0, correndo: true } : { dx: 0, dz: 0 }
      if (roteiro === 'escada') entrada = t < segundos / 2 ? { dx: 0, dz: -1 } : { dx: 0, dz: 1 }
      passo(1 / fps, entrada)
      orbita.update()
      renderer.render(cena, camera)
      const dados = tela.toDataURL('image/jpeg', 0.88)
      envios.push(fetch(`/__quadro?nome=${encodeURIComponent(nome)}&n=${i}`, { method: 'POST', body: dados }))
      if (envios.length > 8) await envios.shift()
    }
    await Promise.all(envios)
  } finally {
    gravando = false
    ultimo = performance.now()
  }
  return { nome, quadros: Math.round(segundos * fps) }
}

window.lab = { cena, boneco, estado, cfg, chao, gravar, passo, camera, orbita }
iniciar().catch((e) => { info.textContent = 'erro: ' + e.message; console.error(e) })
