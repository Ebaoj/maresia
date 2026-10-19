// KAN-71 R3: a sombra sai certa? Uma casa no meio, sol de lado (+x), câmera de cima. Mede o brilho do chão do lado
// da sombra (-x) e do lado do sol (+x). /bancada-sombra.html?modo=blocos (InstancedMesh) ou vg
// (three-virtual-geometry). A vg leva alguns quadros para montar a seleção: 120 desenhos (6 s) antes de ler.
import * as THREE from 'three/webgpu'
const q = new URLSearchParams(location.search)
const modo = q.get('modo') || 'blocos'
async function iniciar() {
  const canvas = document.getElementById('tela')
  // rz=1: o renderizador do jogo com material simples; arcane=1: o renderizador e o material Arcane do jogo
  const rz = q.get('rz') === '1' || q.get('arcane') === '1', arcane = q.get('arcane') === '1'
  let renderer, jogo = null
  if (rz) {
    const [mrz, mats, tsl, glThree] = await Promise.all([import('/src/render/renderizador.js'), import('/src/materiais.js'), import('/src/render/arcane-tsl.js'), import('three')])
    renderer = (await mrz.criarRenderizador({ desempenho: { renderizador: 'webgpu' } }, canvas)).renderer
    jogo = { rz: mrz, mats, tsl, glThree }
  } else {
    renderer = new THREE.WebGPURenderer({ canvas, antialias: false })
    await renderer.init()
  }
  renderer.setSize(256, 256, false)
  renderer.shadowMap.enabled = true
  const cena = new THREE.Scene()
  cena.background = new THREE.Color('#000000')
  cena.add(new THREE.HemisphereLight('#ffffff', '#ffffff', 0.6))
  const sol = new THREE.DirectionalLight('#ffffff', 2.5)
  // grande=1: a luz da bancada do motor (600 m de área de sombra, longe e alta); sol de lado nos dois casos
  const grande = q.get('grande') === '1'
  sol.position.set(...(grande ? [300, 200, 0] : [30, 20, 0]))
  sol.castShadow = true
  sol.shadow.mapSize.set(grande ? 2048 : 1024, grande ? 2048 : 1024)
  const lado = grande ? 300 : 40
  Object.assign(sol.shadow.camera, { left: -lado, right: lado, top: lado, bottom: -lado, near: grande ? 10 : 1, far: grande ? 1500 : 100 })
  sol.shadow.camera.updateProjectionMatrix()
  cena.add(sol, sol.target)
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), new THREE.MeshToonNodeMaterial({ color: '#ffffff' }))
  chao.receiveShadow = true
  cena.add(chao)
  const geo = new THREE.BoxGeometry(6, 10, 6).translate(0, 5, 0)
  let mat = new THREE.MeshToonNodeMaterial({ color: '#ff2020' })
  if (arcane) {
    const m0 = jogo.mats.pintar(new jogo.glThree.MeshToonMaterial({ color: '#ff2020' }), 'motor-sombra')
    mat = modo === 'vg' ? jogo.tsl.materialArcane(m0) : m0
    if (modo === 'vg') mat.mrtNode = null
  }
  const matrizes = new Float32Array(16)
  new THREE.Matrix4().toArray(matrizes, 0)
  // folha toda transparente (alphaMap zerado, alphaTest, dois lados) acima do chão do lado do sol (x = +12): o recorte
  // tem de valer na sombra também, como no cenário sombrasCopias do jogo
  // folhaOpaca=1: controle do teste (a máscara cheia tem de fazer sombra nesse ponto)
  const zero = new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(q.get('folhaOpaca') === '1' ? 255 : 0), 4, 4)
  zero.needsUpdate = true
  const geoFolha = new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2).translate(0, 6, 0)
  let matFolha = new THREE.MeshToonNodeMaterial({ color: '#20ff20', alphaMap: zero, alphaTest: 0.5, side: THREE.DoubleSide })
  if (arcane) {
    const f0 = jogo.mats.pintar(new jogo.glThree.MeshToonMaterial({ color: '#20ff20', alphaMap: zero, alphaTest: 0.5, side: THREE.DoubleSide }), 'motor-folha')
    matFolha = modo === 'vg' ? jogo.tsl.materialArcane(f0) : f0
    if (modo === 'vg') matFolha.mrtNode = null
  }
  const matrizFolha = new Float32Array(16)
  new THREE.Matrix4().makeTranslation(12, 0, 0).toArray(matrizFolha, 0)
  let casa = null
  if (modo === 'vg') {
    const { VirtualGeometry, buildVirtualMeshCached, fromBufferGeometry } = await import('three-virtual-geometry')
    const vg = new VirtualGeometry()
    for (const [g, mt, mz] of [[geo, mat, matrizes], [geoFolha, matFolha, matrizFolha]]) {
      const m = vg.createMesh(await buildVirtualMeshCached(fromBufferGeometry(g)), mt, { matrices: mz })
      m.castShadow = true; m.receiveShadow = true
      cena.add(m)
      if (g === geo) casa = m
    }
  } else {
    for (const [g, mt, mz] of [[geo, mat, matrizes], [geoFolha, matFolha, matrizFolha]]) {
      const im = new THREE.InstancedMesh(g, mt, 1)
      im.setMatrixAt(0, new THREE.Matrix4().fromArray(mz))
      im.castShadow = true; im.receiveShadow = true
      cena.add(im)
      if (g === geo) casa = im
    }
  }
  const cam = new THREE.PerspectiveCamera(40, 1, 1, 300)
  cam.position.set(0, 90, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld()
  const rt = new THREE.RenderTarget(256, 256)
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 50))
    if (arcane && modo !== 'vg') { jogo.rz.prepararCenaWebgpu(cena); cena.traverse((o) => { if (o.material?.mrtNode) o.material.mrtNode = null }) }
    renderer.setRenderTarget(null); renderer.render(cena, cam); renderer.setRenderTarget(rt); renderer.render(cena, cam)
  }
  // mover=1 (KAN-71 T4, cópia que muda em jogo, como bolas e cocos): depois de tudo desenhando, a casa vai para
  // x = +20; ela tem de aparecer lá e sumir do meio
  const mover = q.get('mover') === '1'
  if (mover) {
    casa.setMatrixAt(0, new THREE.Matrix4().makeTranslation(20, 0, 0))
    if (casa.isVirtualMesh) casa.commitInstances(); else casa.instanceMatrix.needsUpdate = true
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 50))
      if (arcane && modo !== 'vg') jogo.rz.prepararCenaWebgpu(cena)
      renderer.setRenderTarget(null); renderer.render(cena, cam); renderer.setRenderTarget(rt); renderer.render(cena, cam)
    }
  }
  const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 256, 256)
  renderer.setRenderTarget(null); renderer.render(cena, cam)
  // x do mundo -> coluna: -30..30 em 256; linha do meio (z = 0)
  const brilho = (x) => { const meia = 90 * Math.tan(Math.PI / 9), c = Math.round((x + meia) / (2 * meia) * 256), l = 128, i = (l * 256 + c) * 4; return px[i] + px[i + 1] + px[i + 2] }
  // onde a folha faria sombra (folha a 6 m de altura em x = +12, sol inclinado 2 para 3: a sombra cairia em x = 3 ± 4)
  window.__resultado = { modo, rz, arcane, grande, ladoDoSol: brilho(20), ladoDaSombra: brilho(-12), naCasa: brilho(0), soboFolha: brilho(5), mover, emX20: brilho(20) }
  document.getElementById('info').textContent = JSON.stringify(window.__resultado)
}
iniciar().catch((e) => { window.__resultado = { erro: e.message }; document.getElementById('info').textContent = e.message })
