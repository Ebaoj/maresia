// Bancada do KAN-70: custo de processador por objeto no WebGLRenderer, no WebGPURenderer e no WebGPURenderer com
// gravação de desenho (BundleGroup, os render bundles do WebGPU: a ideia do snapshot rendering do Babylon e do
// cache de comandos de desenho do Unreal). Cena parada com milhares de objetos, sombra do sol e a câmera girando.
// Abrir /bancada.html?modo=webgl|webgpu|pacote|rapido[&mrt=1][&todos=1][&objetos=3000][&blocos=600]
// O resultado fica em window.__resultado (ms de processador dentro do render e FPS).

import * as THREE from 'three'

const q = new URLSearchParams(location.search)
const modo = q.get('modo') || 'webgpu'
const comMrt = q.get('mrt') === '1'
const N_OBJETOS = +(q.get('objetos') || 3000)
const N_BLOCOS = +(q.get('blocos') || 600)
const info = document.getElementById('info')
// laco=timeout: quadro por temporizador (navegador escondido não dispara requestAnimationFrame); só o tempo de
// processador vale nesse caso, o FPS não
const agendar = q.get('laco') === 'timeout' ? (f) => setTimeout(f, 0) : (f) => requestAnimationFrame(f)

function aleatorio(s) {
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

async function iniciar() {
  const webgpu = modo !== 'webgl'
  const L = webgpu ? { ...(await import('three/tsl')), ...(await import('three/webgpu')) } : THREE
  const canvas = document.getElementById('tela')
  let renderer
  if (webgpu) {
    renderer = new L.WebGPURenderer({ canvas, antialias: false })
    await renderer.init()
  } else {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false })
  }
  renderer.setPixelRatio(1)
  renderer.setSize(innerWidth, innerHeight, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = L.PCFShadowMap

  const cena = new L.Scene()
  cena.background = new L.Color('#cfe3ee')
  const cam = new L.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 2000)
  cena.add(new L.AmbientLight('#ffffff', 0.6))
  const sol = new L.DirectionalLight('#fff3dd', 2.2)
  sol.position.set(200, 300, 120)
  sol.castShadow = true
  sol.shadow.mapSize.set(2048, 2048)
  Object.assign(sol.shadow.camera, { left: -400, right: 400, top: 400, bottom: -400, near: 10, far: 1200 })
  sol.shadow.camera.updateProjectionMatrix()
  cena.add(sol, sol.target)

  // o que vai para a gravação: chão, objetos soltos e blocos de cópias, todos parados
  // pacote: gravação do three como vem; rapido: com o remendo do modo rápido (patches/three) e tudo gravado, sem
  // corte de tela (a gravação não recorta; objeto fora da tela na hora de gravar sumiria)
  const gravar = webgpu && (modo === 'pacote' || modo === 'rapido')
  const parados = gravar ? new L.BundleGroup() : new L.Group()
  if (modo === 'rapido') parados.rapido = true
  const semCorte = modo === 'rapido' || q.get('todos') === '1'
  cena.add(parados)
  const chao = new L.Mesh(new L.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new L.MeshToonMaterial({ color: '#d9c38f' }))
  chao.receiveShadow = true
  parados.add(chao)

  const rnd = aleatorio(70)
  const formas = Array.from({ length: 100 }, (_, i) => (i % 2
    ? new L.BoxGeometry(1 + rnd() * 3, 1 + rnd() * 6, 1 + rnd() * 3)
    : new L.CylinderGeometry(0.5 + rnd(), 0.8 + rnd(), 2 + rnd() * 8, 8)))
  const cores = ['#c9a27e', '#8fa66b', '#d8d0c0', '#b56a4a', '#6f8fa8']
  const materiais = cores.map((c) => new L.MeshToonMaterial({ color: c }))
  for (let i = 0; i < N_OBJETOS; i++) {
    const m = new L.Mesh(formas[i % formas.length], materiais[i % materiais.length])
    m.position.set((rnd() - 0.5) * 800, 0, (rnd() - 0.5) * 800)
    m.rotation.y = rnd() * 6.28
    m.castShadow = true
    m.receiveShadow = true
    m.matrixAutoUpdate = false
    m.updateMatrix()
    if (semCorte) m.frustumCulled = false
    parados.add(m)
  }
  const mt = new L.Matrix4()
  for (let b = 0; b < N_BLOCOS; b++) {
    const im = new L.InstancedMesh(formas[b % formas.length], materiais[b % materiais.length], 3)
    const cx = (rnd() - 0.5) * 800, cz = (rnd() - 0.5) * 800
    for (let k = 0; k < 3; k++) im.setMatrixAt(k, mt.makeTranslation(cx + rnd() * 12, 0, cz + rnd() * 12))
    im.castShadow = true
    im.receiveShadow = true
    if (semCorte) im.frustumCulled = false
    parados.add(im)
  }

  let alvo = null
  if (webgpu && comMrt) {
    alvo = new L.RenderTarget(innerWidth, innerHeight, { count: 2 })
    alvo.textures[0].name = 'output'
    alvo.textures[1].name = 'gLuz'
    renderer.setMRT(L.mrt({ output: L.output, gLuz: L.vec4(0, 0, 0, 1) }))
  }

  const tempos = []
  let quadros = 0
  const t0 = performance.now()
  const AQUECER = 60, MEDIR = 400
  await new Promise((fim) => {
    const passo = () => {
      try { passo2() } catch (e) { info.textContent = 'erro no quadro ' + quadros + ': ' + e.message; window.__resultado = { erro: e.message }; fim() }
    }
    const passo2 = () => {
      if (quadros % 30 === 0) info.textContent = `${modo}: quadro ${quadros}`
      const t = q.get('camfixa') === '1' ? 7 : performance.now() / 1000 // camfixa: mesma câmera em todo modo, para comparar a imagem
      cam.position.set(Math.cos(t * 0.2) * 260, 90, Math.sin(t * 0.2) * 260)
      cam.lookAt(0, 0, 0)
      const a = performance.now()
      if (alvo) renderer.setRenderTarget(alvo)
      renderer.render(cena, cam)
      const dt = performance.now() - a
      quadros++
      if (quadros > AQUECER) tempos.push(dt)
      if (quadros === AQUECER) window.__inicioMedida = performance.now()
      if (tempos.length >= MEDIR) return fim()
      agendar(passo)
    }
    agendar(passo)
  })
  const fps = MEDIR / ((performance.now() - window.__inicioMedida) / 1000)
  const ord = [...tempos].sort((x, y) => x - y)
  const info2 = renderer.info?.render || {}
  window.__resultado = {
    modo, mrt: comMrt, objetos: N_OBJETOS, blocos: N_BLOCOS,
    msCpuRender: +(tempos.reduce((s, x) => s + x, 0) / tempos.length).toFixed(2),
    msCpuMediana: +ord[Math.floor(ord.length / 2)].toFixed(2),
    msCpuP95: +ord[Math.floor(ord.length * 0.95)].toFixed(2),
    fps: +fps.toFixed(1),
    primeirosMs: Math.round(window.__inicioMedida - t0),
    chamadas: info2.calls ?? info2.drawCalls ?? null,
    backend: webgpu ? (renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2-reserva') : 'webgl',
  }
  info.textContent = JSON.stringify(window.__resultado, null, 1)
  // foto do último quadro para comparar a imagem entre os modos (com camfixa=1)
  if (q.get('camfixa') === '1') {
    if (alvo) renderer.setRenderTarget(null)
    renderer.setMRT?.(null)
    renderer.render(cena, cam)
    window.__foto = canvas.toDataURL('image/png')
  }
}

iniciar().catch((e) => { info.textContent = 'erro: ' + e.message; window.__resultado = { erro: e.message } })
