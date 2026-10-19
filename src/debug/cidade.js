// KAN-73 T3: cidade de estresse do tamanho da Fortaleza final (Barra do Ceará até a Praia de Iracema, uns 10 x 4 km),
// com conteúdo de verdade: casas do kit de 1932 (kit1932.js), árvores das espécies do jogo e coqueiros, tudo na
// three-virtual-geometry com o material Arcane e o renderizador WebGPU do jogo. A cidade inteira carregada de uma vez
// (o pior caso). Passeio de câmera em trechos (rua do centro, costa olhando para oeste, dunas do fundo, do alto) com FPS por trecho.
// /bancada-cidade.html[?casas=5000][&arvores=60000][&coqueiros=8000][&segundos=8][&simples=0.5][&preparado=1][&res=0.5][&sombra=0][&terreno=b]
// Resultado em window.__resultado; fotos dos trechos em window.__fotos.
import * as THREE from 'three'
import { criarRenderizador } from '/src/render/renderizador.js'
import { materiaisDasCasas } from '/src/mundo/quarteirao.js'
import { pecasDaCasa, formaDaPeca, agruparPecas } from '/src/mundo/kit1932.js'
import { materialArcane } from '/src/render/arcane-tsl.js'
import { toonVertice } from '/src/materiais.js'
import { cajueiro, carnauba, mangueVermelho, murici, guajiru, oiti } from '/src/mundo/especies.js'
import { pecasDoCoqueiro } from '/src/mundo/vegetacao.js'
import { geometriaPoste, geometriaBanco } from '/src/mundo/rua.js'
import { pintar } from '/src/materiais.js'
import { criarAleatorio } from '/src/utils.js'
// x de -5000 (Barra do Ceará, oeste) a +5000 (Praia de Iracema, leste); a praia em z = 0, a cidade para z > 0
import { gerarCidade, X0, X1, Z1, QUARTEIRAO, RUA, altura, geometriaTerreno } from '/src/debug/cidade-gerar.js'

const q = new URLSearchParams(location.search)
const N_CASAS = +(q.get('casas') || 5000)
const N_ARVORES = +(q.get('arvores') || 60000)
const N_COQUEIROS = +(q.get('coqueiros') || 8000)
const SEGUNDOS = +(q.get('segundos') || 8)
// simples=f: fração das casas no kit simples (taipa, morro); sem o parâmetro, decide a densidade da região
const FRAC_SIMPLES = q.has('simples') ? +q.get('simples') : null
// preparado=1: geometria da vg pronta em public/vg (scripts/preparar-geometria.mjs), sem montar nada na abertura
const PREPARADO = q.get('preparado') === '1'
// para separar placa de processador: res=0.5 desenha com metade da resolução; sombra=0 tira o mapa de sombra
const RES = +(q.get('res') || 1)
const COM_SOMBRA = q.get('sombra') !== '0'
// Capacidade por pool, não a quantidade total de triângulos da cidade. O padrão da biblioteca reserva
// 168 MB só nos índices de câmera e sombra por pool; terreno e cópias podem abrir vários pools.
const MAX_TRIANGULOS = +(q.get('triangulos') || 4000000)
// terreno=b: relevo preparado numa malha única, com detalhe e corte por cluster (T5); sem o parâmetro, chão plano. O outro caminho
// (um pedaço repetido com a altura feita na placa, pelo gancho deform da vg) não serve: a vg corta e escolhe o
// detalhe pela forma sem o desvio e pede desvio bem abaixo de 1 m; as dunas sobem até 17 m
const TERRENO = q.get('terreno') || ''
const info = document.getElementById('info')
async function iniciar() {
  const t0 = performance.now()
  const etapa = (nome) => { window.__etapaCidade = nome; info.textContent = nome }
  etapa('gerando a cidade')
  const canvas = document.getElementById('tela')
  const { renderer } = await criarRenderizador({ desempenho: { renderizador: 'webgpu' } }, canvas)
  renderer.setPixelRatio(RES)
  renderer.setSize(innerWidth, innerHeight, false)
  renderer.shadowMap.enabled = COM_SOMBRA
  const cena = new THREE.Scene()
  cena.background = new THREE.Color('#cfe3ee')
  cena.fog = new THREE.Fog('#cfe3ee', 300, 2500)
  cena.add(new THREE.HemisphereLight('#ffffff', '#b59a70', 1.1))
  const sol = new THREE.DirectionalLight('#fff3dd', 2.4)
  sol.castShadow = COM_SOMBRA
  sol.shadow.mapSize.set(2048, 2048)
  Object.assign(sol.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 800 })
  sol.shadow.camera.updateProjectionMatrix()
  cena.add(sol, sol.target)
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 2000, Z1 + 2000).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: '#d9c38f' }))
  chao.position.set(0, -0.01, Z1 / 2)
  chao.receiveShadow = true
  if (!TERRENO) cena.add(chao)
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0 + 2000, 3000).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: '#2f86a8' }))
  mar.position.set(0, 0.02, -1500)
  cena.add(mar)

  const { lotes, arvores, coqueiros, postes, bancos } = gerarCidade({ N_CASAS, N_ARVORES, N_COQUEIROS, FRAC_SIMPLES })
  const tGerou = performance.now()

  // modelos e cópias
  const listas = lotes.map((l, i) => pecasDaCasa(l.it, criarAleatorio(1932 + i * 7919), l.simples))
  const grupos = agruparPecas(listas)
  const mats = materiaisDasCasas()
  const matDe = { reboco: mats.reboco, pecas: mats.pecas, interior: mats.pecas, aceso: mats.pecas, telhas: mats.telhas }
  const matPlanta = toonVertice()
  const rndE = criarAleatorio(1932)
  const NOMES_ESP = ['oiti', 'cajueiro', 'carnauba', 'mangue', 'murici', 'guajiru']
  const especies = [oiti, cajueiro, carnauba, mangueVermelho, murici, guajiru].flatMap((fn) => [fn(rndE), fn(rndE), fn(rndE)])
  const m = new THREE.Matrix4(), qq = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0)
  const porEspecie = especies.map(() => [])
  for (const [x, z, e, r] of arvores) porEspecie[Math.floor(r * especies.length)].push(m.compose(p.set(x, altura(x, z), z), qq.setFromAxisAngle(Y, r * 40), s.setScalar(e)).clone())
  const coq = pecasDoCoqueiro({})
  const mCoq = coqueiros.map(([x, z, e], i) => m.compose(p.set(x, altura(x, z) - 0.2, z), qq.setFromAxisAngle(Y, i * 2.4), s.setScalar(e)).clone())
  const tudo = [
    ...grupos.map((g) => ({ chave: 'kit:' + g.peca, geo: formaDaPeca(g.peca), mat: matDe[g.material], matrizes: g.matrizes, cores: g.cores, sombra: g.material !== 'interior' && g.material !== 'aceso' })),
    ...especies.map((geo, i) => ({ chave: `especie:${NOMES_ESP[Math.floor(i / 3)]}:${i % 3}`, geo, mat: matPlanta, matrizes: porEspecie[i], cores: null, sombra: true })).filter((x) => x.matrizes.length),
    { chave: 'coqueiro:tronco', geo: coq.geoTronco, mat: coq.matTronco, matrizes: mCoq, cores: null, sombra: true },
    { chave: 'coqueiro:copa', geo: coq.geoCopa, mat: coq.matCopa, matrizes: mCoq, cores: null, sombra: true },
    { chave: 'rua:poste', geo: geometriaPoste(), mat: matPlanta, matrizes: postes.map(([x, z], i) => m.compose(p.set(x, altura(x, z) - 0.3, z), qq.setFromAxisAngle(Y, (i % 7) * 0.03), s.setScalar(1)).clone()), cores: null, sombra: true },
    { chave: 'rua:banco', geo: geometriaBanco(), mat: matPlanta, matrizes: bancos.map(([x, z, r]) => m.compose(p.set(x, altura(x, z), z), qq.setFromAxisAngle(Y, r), s.setScalar(1)).clone()), cores: null, sombra: true },
  ]
  // terreno (T5)
  const manifesto = PREPARADO ? (await (await fetch('/vg/manifesto.json')).json()).pecas : null
  const matChao = pintar(new THREE.MeshToonMaterial({ color: '#d9c38f' }), 'chao-estresse')
  if (TERRENO === 'b') {
    const chave = 'terreno:estresse'
    tudo.push({ chave, geo: manifesto?.[chave] ? null : geometriaTerreno(THREE), mat: matChao, matrizes: [new THREE.Matrix4()], cores: null, sombra: false })
  }

  const vgm = await import('three-virtual-geometry')
  const vg = new vgm.VirtualGeometry({ maxTriangles: MAX_TRIANGULOS, maxShadowTriangles: Math.floor(MAX_TRIANGULOS * 0.4) })
  const c = new THREE.Color()
  let copias = 0
  let preparados = 0
  const dadosDe = async (t) => {
    if (manifesto?.[t.chave]) { preparados++; return vgm.loadVirtualMesh('/vg/' + manifesto[t.chave]) }
    return vgm.buildVirtualMeshCached(vgm.fromBufferGeometry(t.geo, { colors: true, normals: 'keep' }))
  }
  const todosDados = await Promise.all(tudo.map(dadosDe))
  etapa('montando as cópias')
  for (const [k, t] of tudo.entries()) {
    const dados = todosDados[k]
    const mz = new Float32Array(16 * t.matrizes.length)
    t.matrizes.forEach((mm, i) => mm.toArray(mz, i * 16))
    let cs
    if (t.cores) {
      cs = new Float32Array(4 * t.cores.length)
      t.cores.forEach((h, i) => { c.set(h); cs[i * 4] = c.r; cs[i * 4 + 1] = c.g; cs[i * 4 + 2] = c.b; cs[i * 4 + 3] = 1 })
    }
    const nm = materialArcane(t.mat)
    nm.vertexColors = false
    nm.mrtNode = null
    if (t.mat.side !== THREE.DoubleSide) nm.shadowSide = THREE.BackSide
    const malha = vg.createMesh(dados, nm, cs ? { matrices: mz, colors: cs } : { matrices: mz })
    malha.castShadow = t.sombra
    malha.receiveShadow = true
    cena.add(malha)
    copias += t.matrizes.length
  }
  const tMontou = performance.now()
  etapa('compilando os programas da placa')
  // material do chão e do mar na versão do WebGPU (os da vg já estão)
  const rz = await import('/src/render/renderizador.js')
  rz.prepararCenaWebgpu(cena)
  cena.traverse((o) => { if (o.material?.mrtNode && !o.isVirtualMesh) o.material.mrtNode = null })

  const cam = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.3, 6000)
  cam.position.set(2600, 1.7, 300)
  cam.lookAt(2700, 1.7, 300)
  await vg.compileAsync(renderer, cena, cam)
  const tCompilou = performance.now()

  // trechos do passeio: rua do centro andando, costa olhando para oeste (a vista mais longa), rua nas dunas do fundo
  // (o chão com relevo, terreno=b), do alto
  const TRECHOS = {
    ruaCentro: (t) => { cam.position.set(2400 + t * 4, 1.7, 80 + (QUARTEIRAO + RUA) * 2 - RUA / 2); cam.lookAt(cam.position.x + 30, 2.5, cam.position.z + Math.sin(t) * 6) },
    costaOeste: (t) => { cam.position.set(3800 - t * 6, 2.2, 20); cam.lookAt(cam.position.x - 100, 3, 30 + Math.sin(t * 0.3) * 20) },
    dunas: (t) => { const x = 2300 + t * 4, z = 80 + (QUARTEIRAO + RUA) * 30 - RUA / 2; cam.position.set(x, altura(x, z) + 1.7, z); cam.lookAt(x + 30, altura(x + 30, z) + 2.5, z + Math.sin(t * 0.5) * 8) },
    alto: (t) => { cam.position.set(2600 + Math.cos(t * 0.1) * 600, 180, 1200 + Math.sin(t * 0.1) * 600); cam.lookAt(2600, 0, 1200) },
  }
  const quadros = {}
  const fotos = {}
  let primeiroQuadro = null
  for (const [nome, mover] of Object.entries(TRECHOS)) {
    etapa('medindo ' + nome)
    const tempos = []
    let n = 0
    const ini = performance.now()
    await new Promise((fim) => {
      const passo = (agora) => {
        const t = (agora - ini) / 1000
        mover(t)
        sol.position.set(cam.position.x + 120, 260, cam.position.z + 80)
        sol.target.position.set(cam.position.x, 0, cam.position.z)
        sol.target.updateMatrixWorld()
        const a = performance.now()
        renderer.render(cena, cam)
        if (primeiroQuadro === null) primeiroQuadro = Math.round(performance.now() - t0)
        if (n++ > 30) tempos.push(performance.now() - a)
        if (t > SEGUNDOS) return fim()
        requestAnimationFrame(passo)
      }
      requestAnimationFrame(passo)
    })
    const dur = (performance.now() - ini) / 1000
    const ord = [...tempos].sort((x, y) => x - y)
    // sem quadros suficientes (aba escondida: o navegador não dispara requestAnimationFrame), a medida fica nula
    quadros[nome] = tempos.length ? { fps: +(n / dur).toFixed(1), msCpu: +(tempos.reduce((x, y) => x + y, 0) / tempos.length).toFixed(2), msCpuP95: +(ord[Math.min(ord.length - 1, Math.floor(ord.length * 0.95))] ?? NaN).toFixed(2) } : { fps: +(n / dur).toFixed(1), msCpu: null, quadros: n }
    fotos[nome] = canvas.toDataURL('image/jpeg', 0.85)
    // A vg já lê os contadores a cada dez quadros. Usa essa amostra do trecho, sem interromper o
    // passeio para abrir uma segunda leitura assíncrona dos mesmos buffers.
    const medida = vg.lastStats
    quadros[nome].geometria = medida ? { capacidade: medida.capacityUse, estourou: medida.overflow, escalaLod: medida.thresholdScale } : { erro: 'sem amostra' }
  }
  let stats = null
  try { stats = await vg.readStats(renderer) } catch (e) { stats = { erro: e.message } }
  window.__fotos = fotos
  window.__resultado = {
    preparado: PREPARADO, preparados, res: RES, sombra: COM_SOMBRA, triangulosPorPool: MAX_TRIANGULOS, terreno: TERRENO || 'plano', postes: postes.length, bancos: bancos.length, casas: lotes.length, arvores: arvores.length, coqueiros: coqueiros.length, modelos: tudo.length, copias,
    msGerar: Math.round(tGerou - t0), msMontar: Math.round(tMontou - tGerou), msCompilar: Math.round(tCompilou - tMontou), msPrimeiroQuadro: primeiroQuadro,
    trechos: quadros,
    vg: stats && { triangulosDesenhados: stats.drawnTriangles, visiveis: stats.visibleInstances, sombra: stats.shadowTriangles, capacidade: stats.capacityUse, estourou: stats.overflow },
  }
  info.textContent = JSON.stringify(window.__resultado, null, 1)
}

iniciar().catch((e) => { info.textContent = 'erro: ' + e.message; window.__resultado = { erro: e.message, pilha: String(e.stack).slice(0, 800) } })
