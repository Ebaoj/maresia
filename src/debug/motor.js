// KAN-71 T1/T2: bancada do motor guiado pela placa. 20 mil objetos de 6 tipos espalhados por 2 km, sombra do sol,
// câmera girando. modo=blocos: o jeito atual do jogo (cópias em blocos de 192 m, um InstancedMesh por tipo e bloco);
// modo=vg: three-virtual-geometry (corte e nível de detalhe na placa, um desenho por tipo).
// /bancada-motor.html?modo=blocos|vg[&n=20000][&laco=timeout][&camfixa=1][&sombra=0][&mat=std][&perto=1][&arcane=1]
// Resultado em window.__resultado; foto em window.__foto (com camfixa=1).
import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

const q = new URLSearchParams(location.search)
const modo = q.get('modo') || 'blocos'
const N = +(q.get('n') || 20000)
const comSombra = q.get('sombra') !== '0'
const info = document.getElementById('info')
// ritmo=N: um quadro a cada N ms (simula o limite de quadros da tela; ex.: 16 = 60 por segundo)
const ritmo = +(q.get('ritmo') || 0)
// comeco=N: os primeiros N quadros a 60 por segundo, depois o ritmo pedido (a vg só pega se começar devagar?)
const comeco = +(q.get('comeco') || 0)
let feitos = 0
const agendar = (f) => {
  feitos++
  if (feitos <= comeco) return setTimeout(f, 16)
  return q.get('laco') === 'timeout' || ritmo ? setTimeout(f, ritmo) : requestAnimationFrame(f)
}
const LADO = 2000, BLOCO = 192

function aleatorio(s) {
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

// formas com contagem de triângulos parecida com as do jogo (árvore e casa com algumas centenas)
function formas() {
  const junta = (...gs) => mergeGeometries(gs.map((g) => g.toNonIndexed()))
  const arvore = junta(new THREE.CylinderGeometry(0.25, 0.35, 4, 10).translate(0, 2, 0), new THREE.IcosahedronGeometry(2.2, 2).translate(0, 5, 0))
  const casa = junta(new THREE.BoxGeometry(6, 4, 8, 4, 3, 4).translate(0, 2, 0), new THREE.ConeGeometry(5.5, 3, 4, 3).rotateY(Math.PI / 4).translate(0, 5.5, 0))
  const poste = junta(new THREE.CylinderGeometry(0.12, 0.15, 6, 8).translate(0, 3, 0), new THREE.SphereGeometry(0.4, 8, 6).translate(0, 6.2, 0))
  const cerca = new THREE.BoxGeometry(4, 1.2, 0.15, 6, 2, 1).translate(0, 0.6, 0).toNonIndexed()
  const banco = junta(new THREE.BoxGeometry(2, 0.15, 0.6).translate(0, 0.5, 0), new THREE.BoxGeometry(2, 0.6, 0.12).translate(0, 0.8, -0.25))
  const pedra = new THREE.DodecahedronGeometry(1, 1).toNonIndexed()
  return [
    { nome: 'arvore', geo: arvore, cor: '#5f8f4e', parte: 0.35, escala: [0.8, 1.4] },
    { nome: 'casa', geo: casa, cor: '#d8c7a4', parte: 0.15, escala: [0.9, 1.2] },
    { nome: 'poste', geo: poste, cor: '#4a4a4a', parte: 0.12, escala: [1, 1] },
    { nome: 'cerca', geo: cerca, cor: '#9b7b55', parte: 0.15, escala: [1, 1] },
    { nome: 'banco', geo: banco, cor: '#7a5a3a', parte: 0.1, escala: [1, 1] },
    { nome: 'pedra', geo: pedra, cor: '#8d8a84', parte: 0.13, escala: [0.5, 2] },
  ]
}

async function iniciar() {
  const canvas = document.getElementById('tela')
  // arcane=1: o renderizador e o material do jogo (pintar() vira MaterialPintado), como no jogo, sem a segunda saída
  // de luz (gLuz): a bancada desenha direto na tela
  const arcane = q.get('arcane') === '1'
  let renderer, jogo = null
  if (arcane) {
    const [rz, mats, tsl, glThree] = await Promise.all([import('/src/render/renderizador.js'), import('/src/materiais.js'), import('/src/render/arcane-tsl.js'), import('three')])
    renderer = (await rz.criarRenderizador({ desempenho: { renderizador: 'webgpu' } }, canvas)).renderer
    jogo = { rz, mats, tsl, glThree }
  } else {
    renderer = new THREE.WebGPURenderer({ canvas, antialias: false })
    await renderer.init()
  }
  renderer.setPixelRatio(1)
  renderer.setSize(innerWidth, innerHeight, false)
  renderer.shadowMap.enabled = comSombra
  renderer.shadowMap.type = THREE.PCFShadowMap

  const cena = new THREE.Scene()
  cena.background = new THREE.Color('#cfe3ee')
  cena.fog = new THREE.Fog('#cfe3ee', 600, 1800)
  const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 2000)
  cena.add(new THREE.HemisphereLight('#ffffff', '#b59a70', 1.2))
  const sol = new THREE.DirectionalLight('#fff3dd', 2.2)
  sol.castShadow = comSombra
  sol.shadow.mapSize.set(2048, 2048)
  Object.assign(sol.shadow.camera, { left: -300, right: 300, top: 300, bottom: -300, near: 10, far: 1500 })
  sol.shadow.camera.updateProjectionMatrix()
  cena.add(sol, sol.target)

  const chao = new THREE.Mesh(new THREE.PlaneGeometry(LADO, LADO).rotateX(-Math.PI / 2), new THREE.MeshToonNodeMaterial({ color: '#d9c38f' }))
  chao.receiveShadow = true
  cena.add(chao)

  // posições: as mesmas nos dois modos (semente fixa)
  const rnd = aleatorio(71)
  const tipos = formas()
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3(), eixo = new THREE.Vector3(0, 1, 0)
  for (const t of tipos) {
    const k = Math.round(N * t.parte)
    t.matrizes = new Float32Array(16 * k)
    t.k = k
    for (let i = 0; i < k; i++) {
      p.set((rnd() - 0.5) * LADO, 0, (rnd() - 0.5) * LADO)
      r.setFromAxisAngle(eixo, rnd() * Math.PI * 2)
      const e = t.escala[0] + rnd() * (t.escala[1] - t.escala[0])
      s.set(e, e, e)
      m.compose(p, r, s).toArray(t.matrizes, i * 16)
    }
    if (jogo) {
      t.matJogo = jogo.mats.pintar(new jogo.glThree.MeshToonMaterial({ color: t.cor }), 'motor-' + t.nome)
      // na vg o material já entra convertido (ela põe o positionNode nele); nos blocos o jogo converte no desenho
      t.mat = modo === 'vg' ? jogo.tsl.materialArcane(t.matJogo) : t.matJogo
      if (modo === 'vg') t.mat.mrtNode = null
    } else t.mat = q.get('mat') === 'std' ? new THREE.MeshStandardNodeMaterial({ color: t.cor }) : new THREE.MeshToonNodeMaterial({ color: t.cor })
  }

  const t0 = performance.now()
  let objetos = 0
  let vg = null
  if (modo === 'vg') {
    const { VirtualGeometry, buildVirtualMeshCached, fromBufferGeometry } = await import('three-virtual-geometry')
    vg = new VirtualGeometry()
    window.__vg = vg // para depurar pelo console
    // diagnóstico na g4dn (nada visível): oclusao=0 desliga o corte por oclusão; px=N muda o tamanho mínimo
    if (q.get('oclusao') === '0') { vg.occlusion.enabled = false; if ('auto' in vg.occlusion) vg.occlusion.auto = false }
    if (q.has('px')) vg.minPixelRadius.value = +q.get('px')
    for (const t of tipos) {
      const dados = await buildVirtualMeshCached(fromBufferGeometry(t.geo))
      const malha = vg.createMesh(dados, t.mat, { matrices: t.matrizes })
      malha.castShadow = true
      malha.receiveShadow = true
      cena.add(malha)
      objetos++
    }
  } else {
    // blocos de 192 m como instanciarEmBlocos do jogo
    for (const t of tipos) {
      const porBloco = new Map()
      for (let i = 0; i < t.k; i++) {
        const x = t.matrizes[i * 16 + 12], z = t.matrizes[i * 16 + 14]
        const ch = Math.floor(x / BLOCO) + ',' + Math.floor(z / BLOCO)
        if (!porBloco.has(ch)) porBloco.set(ch, [])
        porBloco.get(ch).push(i)
      }
      for (const lista of porBloco.values()) {
        const im = new THREE.InstancedMesh(t.geo, t.mat, lista.length)
        lista.forEach((i, j) => { m.fromArray(t.matrizes, i * 16); im.setMatrixAt(j, m) })
        im.computeBoundingSphere()
        im.castShadow = true
        im.receiveShadow = true
        cena.add(im)
        objetos++
      }
    }
  }
  // a vg monta os programas de compute em segundo plano (2 a 4 s na g4dn) e só desenha depois; sem esperar, a medição
  // a 500 quadros por segundo acabava antes e media a tela vazia. A própria vg recomenda isto na tela de carregamento
  if (vg) await vg.compileAsync(renderer, cena, cam)
  const montarMs = Math.round(performance.now() - t0)

  const tempos = []
  let quadros = 0
  const AQUECER = 90, MEDIR = 400
  const inicio = performance.now()
  let primeiroMs = null
  await new Promise((fim) => {
    const passo = () => {
      const t = q.get('camfixa') === '1' ? 7 : performance.now() / 1000
      if (q.get('perto') === '1') {
        // perto do chão, para ver sombra de verdade
        cam.position.set(Math.cos(t * 0.15) * 260, 6, Math.sin(t * 0.15) * 260)
        cam.lookAt(Math.cos(t * 0.15 + 0.08) * 250, 1, Math.sin(t * 0.15 + 0.08) * 250)
      } else {
        cam.position.set(Math.cos(t * 0.15) * 260, 40, Math.sin(t * 0.15) * 260)
        cam.lookAt(Math.cos(t * 0.15 + 0.6) * 120, 0, Math.sin(t * 0.15 + 0.6) * 120)
      }
      sol.position.copy(cam.position).add(new THREE.Vector3(250, 300, 120))
      sol.target.position.copy(cam.position)
      sol.target.updateMatrixWorld()
      if (jogo && modo !== 'vg') {
        jogo.rz.prepararCenaWebgpu(cena)
        if (!jogo.semLuz) { cena.traverse((o) => { if (o.material?.mrtNode) o.material.mrtNode = null }); jogo.semLuz = true }
      }
      const a = performance.now()
      renderer.render(cena, cam)
      const dt = performance.now() - a
      if (primeiroMs === null) primeiroMs = Math.round(performance.now() - inicio)
      quadros++
      if (quadros > AQUECER) tempos.push(dt)
      if (quadros === AQUECER) window.__inicioMedida = performance.now()
      if (quadros % 30 === 0) info.textContent = `${modo}: quadro ${quadros}`
      if (tempos.length >= MEDIR) return fim()
      agendar(passo)
    }
    agendar(passo)
  })
  const fps = MEDIR / ((performance.now() - window.__inicioMedida) / 1000)
  const ord = [...tempos].sort((x, y) => x - y)
  const inf = renderer.info.render || {}
  const resultado = {
    modo, n: N, arcane, sombra: comSombra, objetos, montarMs, primeiroMs,
    msCpuRender: +(tempos.reduce((x, y) => x + y, 0) / tempos.length).toFixed(2),
    msCpuMediana: +ord[ord.length >> 1].toFixed(2),
    msCpuP95: +ord[Math.floor(ord.length * 0.95)].toFixed(2),
    fps: +fps.toFixed(1),
    chamadas: inf.drawCalls ?? inf.calls ?? null,
    triangulos: inf.triangles ?? null,
  }
  if (vg) { try { resultado.vg = await vg.readStats(renderer) } catch (e) { resultado.vgErro = e.message } }
  // prova pela imagem de que desenhou (o contador da vg às vezes volta zerado): fração de pixels de copa de árvore
  // (verde: g acima de r e de b) no último quadro, lido do próprio canvas
  {
    renderer.render(cena, cam)
    const img = new Image(); img.src = canvas.toDataURL('image/png'); await img.decode()
    const c2 = document.createElement('canvas'); c2.width = 320; c2.height = Math.round(320 * img.height / img.width)
    const g2 = c2.getContext('2d'); g2.drawImage(img, 0, 0, c2.width, c2.height)
    const d = g2.getImageData(0, 0, c2.width, c2.height).data
    let verdes = 0
    for (let i = 0; i < d.length; i += 4) if (d[i + 1] > d[i] + 15 && d[i + 1] > d[i + 2] + 15) verdes++
    resultado.pixelsArvore = +(verdes / (d.length / 4)).toFixed(4)
  }
  window.__resultado = resultado // só no fim: quem mede espera a prova pela imagem também
  info.textContent = JSON.stringify(resultado, null, 1)
  if (q.get('camfixa') === '1') { renderer.render(cena, cam); window.__foto = canvas.toDataURL('image/png') }
}

iniciar().catch((e) => { info.textContent = 'erro: ' + e.message; window.__resultado = { erro: e.message, pilha: String(e.stack).slice(0, 600) } })
