// KAN-73 T2: a mesma rua de casas de 1932 montada de dois jeitos, para comparar a imagem. Em z = 0, o gerador de hoje
// (quarteirao.js: cada bloco de 96 m vira uma malha juntada); em z = DZ, o kit de peças (kit1932.js) na
// three-virtual-geometry. Mesmos lotes, mesmas sementes, mesmos materiais, renderizador do jogo (WebGPU).
// /bancada-kit.html  ->  window.__fotos = { vista: { antes, depois } } (dataURL), window.__resultado
import * as THREE from 'three'
import { criarRenderizador, prepararCenaWebgpu } from '/src/render/renderizador.js'
import { criarCasas, materiaisDasCasas } from '/src/mundo/quarteirao.js'
import { pecasDaCasa, formaDaPeca, agruparPecas } from '/src/mundo/kit1932.js'
import { materialArcane } from '/src/render/arcane-tsl.js'
import { criarAleatorio } from '/src/utils.js'
import { CAL } from '/src/paleta.js'

const DZ = 400
const info = document.getElementById('info')
const CORES = [CAL.cal || '#efe6d2', '#e8c9a0', '#cfe0d8', '#f2ebdc', '#e7b9a4', '#d9b8c4', '#efe6d2', '#c9d6c2']

// duas fileiras de casas frente a frente (uma rua de 8 m), 10 casas cada
function lotes() {
  const l = []
  const rnd = criarAleatorio(7)
  let x = -60
  while (x < 60) {
    const w = rnd.entre(6, 10)
    l.push({ x: x + w / 2, z: -9, w, d: 10, frente: [0, 1], rot: 0, cor: rnd.escolha(CORES), chao: 0, y: 0, h: 5 })
    x += w
  }
  x = -60
  while (x < 60) {
    const w = rnd.entre(6, 10)
    l.push({ x: x + w / 2, z: 9, w, d: 10, frente: [0, -1], rot: 0, cor: rnd.escolha(CORES), chao: 0, y: 0, h: 5 })
    x += w
  }
  return l
}

async function iniciar() {
  const canvas = document.getElementById('tela')
  const { renderer } = await criarRenderizador({ desempenho: { renderizador: 'webgpu' } }, canvas)
  renderer.setPixelRatio(1)
  renderer.setSize(1280, 720, false)
  renderer.shadowMap.enabled = true
  const cena = new THREE.Scene()
  cena.background = new THREE.Color('#cfe3ee')
  cena.add(new THREE.HemisphereLight('#ffffff', '#b59a70', 1.1))
  const sol = new THREE.DirectionalLight('#fff3dd', 2.4)
  sol.castShadow = true
  sol.shadow.mapSize.set(2048, 2048)
  Object.assign(sol.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 400 })
  sol.shadow.camera.updateProjectionMatrix()
  cena.add(sol, sol.target)
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(400, 1200).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: '#d9c38f' }))
  chao.receiveShadow = true
  chao.position.z = DZ / 2
  cena.add(chao)

  // ANTES: o gerador de hoje (monta os blocos perto da câmera)
  const antes = lotes()
  const casas = criarCasas(cena, antes, [])
  const camMonta = new THREE.PerspectiveCamera()
  for (let i = 0; i < 20; i++) { camMonta.position.set(0, 2, 0); casas.atualizar(camMonta) }

  // DEPOIS: o kit na vg, com as mesmas sementes de criarCasas (1932 + i * 7919, na ordem dos lotes)
  const depois = lotes().map((it) => ({ ...it, z: it.z + DZ }))
  const listas = depois.map((it, i) => pecasDaCasa(it, criarAleatorio(1932 + i * 7919), false))
  const grupos = agruparPecas(listas)
  const mats = materiaisDasCasas()
  const matDe = { reboco: mats.reboco, pecas: mats.pecas, interior: mats.pecas, aceso: mats.pecas, telhas: mats.telhas }
  const vgm = await import('three-virtual-geometry')
  const vg = new vgm.VirtualGeometry()
  const c = new THREE.Color()
  for (const g of grupos) {
    const fonte = vgm.fromBufferGeometry(formaDaPeca(g.peca), { colors: true, normals: 'keep' })
    const dados = await vgm.buildVirtualMeshCached(fonte)
    const mz = new Float32Array(16 * g.matrizes.length)
    g.matrizes.forEach((m, i) => m.toArray(mz, i * 16))
    const cs = new Float32Array(4 * g.cores.length)
    g.cores.forEach((h, i) => { c.set(h); cs[i * 4] = c.r; cs[i * 4 + 1] = c.g; cs[i * 4 + 2] = c.b; cs[i * 4 + 3] = 1 })
    const nm = materialArcane(matDe[g.material])
    nm.vertexColors = false
    nm.mrtNode = null
    nm.shadowSide = THREE.BackSide
    const malha = vg.createMesh(dados, nm, { matrices: mz, colors: cs })
    malha.castShadow = g.material !== 'interior' && g.material !== 'aceso'
    malha.receiveShadow = true
    cena.add(malha)
  }

  // materiais do jogo na versão do WebGPU, sem a segunda saída de luz (a bancada desenha direto na tela)
  prepararCenaWebgpu(cena)
  cena.traverse((o) => { if (o.material?.mrtNode && !o.isVirtualMesh) o.material.mrtNode = null })

  const cam = new THREE.PerspectiveCamera(50, 1280 / 720, 0.3, 2000)
  await vg.compileAsync(renderer, cena, cam)
  const VISTAS = {
    rua: { pos: [-14, 1.7, 0], alvo: [6, 3.2, -8] },
    diagonal: { pos: [-30, 9, 16], alvo: [0, 3, -6] },
    cima: { pos: [0, 45, 30], alvo: [0, 0, 0] },
  }
  const fotos = {}
  const quadro = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))
  for (const [nome, v] of Object.entries(VISTAS)) {
    fotos[nome] = {}
    for (const [lado, dz] of [['antes', 0], ['depois', DZ]]) {
      cam.position.set(v.pos[0], v.pos[1], v.pos[2] + dz)
      cam.lookAt(v.alvo[0], v.alvo[1], v.alvo[2] + dz)
      sol.position.set(cam.position.x + 40, 60, cam.position.z + 30)
      sol.target.position.set(cam.position.x, 0, cam.position.z - 10)
      sol.target.updateMatrixWorld()
      for (let i = 0; i < 40; i++) { renderer.render(cena, cam); await quadro() } // a vg e a sombra assentam
      fotos[nome][lado] = canvas.toDataURL('image/png')
    }
  }
  window.__fotos = fotos
  window.__resultado = { modelos: grupos.length, copias: grupos.reduce((a, g) => a + g.matrizes.length, 0), casas: depois.length }
  info.textContent = JSON.stringify(window.__resultado)
}

iniciar().catch((e) => { info.textContent = 'erro: ' + e.message; window.__resultado = { erro: e.message, pilha: String(e.stack).slice(0, 800) } })
