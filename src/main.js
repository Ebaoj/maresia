// Maresia: protótipo de cosy game numa cidade misturada de Fortaleza, Recife e Rio,
// com estética de quadrinho (3D desenhado como 2D).
// Este arquivo só liga as peças; cada sistema mora no seu módulo.

import * as THREE from 'three'
import { carregarConfig } from './config.js'
import { globais } from './globais.js'
import { linhaCosta, larguraPraia, distCosta } from './mundo/mapa.js'
import { criarTerreno } from './mundo/terreno.js'
import { alturaChao } from './mundo/colisao.js'
import { criarCeu } from './mundo/ceu.js'
import { criarMar } from './mundo/mar.js'
import { criarFaixas } from './mundo/faixas.js'
import { criarCidade } from './mundo/cidade.js'
import { criarFachadas } from './mundo/fachadas.js'
import { criarRua } from './mundo/rua.js'
import { criarArvores } from './mundo/arvores.js'
import { criarPessoas } from './mundo/pessoas.js'
import { criarAtores } from './mundo/atores.js'
import { criarHorizonte } from './mundo/horizonte.js'
import { criarMarcos } from './mundo/marcos.js'
import { criarPraia } from './mundo/praia.js'
import { criarCoqueiros } from './mundo/vegetacao.js'
import { criarGrama } from './mundo/grama.js'
import { criarCenografia } from './mundo/cenografia.js'
import { criarVilas } from './mundo/vilas.js'
import { criarObjetosFatia } from './mundo/fatia-objetos.js'
import { criarMapa } from './ui/mapa.js'
import { trechosJogo } from './mundo/fortaleza1932.js'
import { criarToque } from './mundo/toque.js'
import { criarAreia } from './mundo/areia.js'
import { criarFisica } from './mundo/fisica.js'
import { distCosta as distCostaAreia, larguraPraia as larguraPraiaAreia } from './mundo/mapa.js'
import { Jogador } from './jogador/controle.js'
import { carregarCorpo } from './jogador/corpo.js'
import { definirTonsLuz } from './materiais.js'
import { CameraTerceiraPessoa } from './jogador/camera.js'
import { criarInteracoes } from './jogador/interacoes.js'
import { Aranhaverso } from './pos/aranhaverso.js'
import { criarHud } from './ui/hud.js'
import { criarPainel } from './ui/painel.js'
import { criarSom } from './audio.js'

const cfg = carregarConfig()
definirTonsLuz(cfg.estilo.tonsLuz) // antes de qualquer material ser criado
const canvas = document.getElementById('tela')
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap // borda nítida, combina com o toon
renderer.shadowMap.autoUpdate = false

const cena = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(cfg.camera.fov, innerWidth / innerHeight, 0.3, 6000)

const teclas = { frente: false, tras: false, esquerda: false, direita: false, correr: false, girarEsq: false, girarDir: false }
const MAPA_TECLAS = {
  KeyW: 'frente', ArrowUp: 'frente',
  KeyS: 'tras', ArrowDown: 'tras',
  KeyA: 'esquerda', ArrowLeft: 'esquerda',
  KeyD: 'direita', ArrowRight: 'direita',
  ShiftLeft: 'correr', ShiftRight: 'correr',
  KeyZ: 'girarEsq', KeyC: 'girarDir',
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

async function iniciar() {
  await esperar(50) // deixa a capa de carregamento aparecer antes do trabalho pesado

  const tempos = {}
  let tMarca = performance.now()
  const marcar = (nome) => { const t = performance.now(); tempos[nome] = Math.round(t - tMarca); tMarca = t }
  const terreno = criarTerreno(cena)
  marcar('terreno')
  const { mapaAltura } = terreno
  const ceu = criarCeu(cena)
  const toque = criarToque(renderer, mapaAltura, cfg)
  const mar = criarMar(cena, mapaAltura, cfg, toque.publico)
  // calçadão e avenida saíram em 1932 (criarFaixas fica no código para referência)
  void criarFaixas
  const { predios, casas, grade, quadras } = criarCidade(cena)
  marcar('cidade')
  criarFachadas(cena, predios)
  marcar('fachadas')
  const cenografia = criarCenografia(cena, predios.filter((p) => p.tipo === 'casario'))
  const marcos = criarMarcos(cena)
  const praia = criarPraia(cena)
  const casasPalha = criarVilas(cena)
  const nObjetosFatia = criarObjetosFatia(cena, casasPalha) // fatia vertical: densidade na altura do personagem
  void nObjetosFatia
  const lugares = criarRua(cena, predios, grade)
  marcar('rua')
  criarArvores(cena, predios, grade)
  marcar('arvores')
  const { coqueiros } = criarCoqueiros(cena, cfg)
  marcar('coqueiros')
  const pessoas = criarPessoas(cena, grade)
  const horizonte = criarHorizonte(cena)
  const grama = criarGrama(cena, mapaAltura, cfg, toque.publico)
  marcar('grama')
  const areia = criarAreia(cena, renderer, mapaAltura, cfg)
  marcar('areia')
  const fisica = await criarFisica(cena, cfg, { coqueiros, toque, areia })
  marcar('fisica')

  // começa na Praia do Peixe (Praia de Iracema), entre as jangadas, olhando para o oeste: o porto
  const x0 = (trechosJogo.praiaDoPeixe[0] + trechosJogo.praiaDoPeixe[1]) / 2
  const z0 = linhaCosta(x0) + larguraPraia(x0) + 3.5
  const inicio = new THREE.Vector3(x0, alturaChao(x0, z0), z0)
  const jogador = new Jogador(cena, cfg, inicio, -Math.PI / 2)
  let atores = null
  // corpo novo (esqueleto padrão + mocap do Mixamo): carrega em segundo plano e substitui o boneco antigo
  if (cfg.personagem.corpoNovo) {
    carregarCorpo({ modelo: cfg.personagem.modelo }).then((c) => {
      if (!c) return
      jogador.trocarCorpo(c)
      // a gente mais próxima vira ator animado, com os mesmos movimentos (mundo/atores.js)
      atores = criarAtores(cena, pessoas, c.clipes, { passadaAndar: c.passadas.andar || 1.4 })
    }).catch((e) => console.error('Corpo novo:', e))
  }
  const cam = new CameraTerceiraPessoa(camera, canvas, cfg, Math.PI / 2)
  const interacoes = criarInteracoes({ jogador, fisica, lugares, camera })
  const pos = new Aranhaverso(renderer, cena, camera, cfg, globais)
  pos.coletarExcecoes()
  if (import.meta.env.DEV) {
    // todo material da cena precisa escrever a saída de luz (gLuz); avisa se algum esqueceu
    const faltando = new Set()
    cena.traverse((o) => {
      if (!o.material) return
      for (const mt of [].concat(o.material)) {
        const ok = mt.userData.luzMRT || (mt.fragmentShader && mt.fragmentShader.includes('gLuz'))
        if (!ok) faltando.add(`${mt.type} em ${o.name || o.type}`)
      }
    })
    if (faltando.size) console.warn('Materiais sem saída de luz:', [...faltando])
    window.__materiaisSemLuz = [...faltando]
    // shader que não compila some da tela sem aviso visível: depois dos primeiros quadros, lista os quebrados
    setTimeout(() => {
      const quebrados = renderer.info.programs
        .filter((pr) => pr.diagnostics && !pr.diagnostics.runnable)
        .map((pr) => `${(pr.cacheKey || '').split(',').pop()}: ${(pr.diagnostics.fragmentShader.log || pr.diagnostics.vertexShader.log || '').split('\n')[0]}`)
      if (quebrados.length) console.error('Shaders que não compilaram:', quebrados)
      window.__shadersQuebrados = quebrados
    }, 4000)
  }
  const hud = criarHud(camera)
  const mapa = criarMapa({ quadras, grade, casasPalha })
  const som = criarSom(cfg)
  const painel = criarPainel(cfg)

  let resolucao = 0
  function redimensionar() {
    resolucao = Math.min(cfg.desempenho.resolucao, devicePixelRatio || 1)
    renderer.setPixelRatio(resolucao)
    renderer.setSize(innerWidth, innerHeight, false)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    pos.tamanho(innerWidth, innerHeight, resolucao)
  }
  redimensionar()
  addEventListener('resize', redimensionar)

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (MAPA_TECLAS[e.code]) teclas[MAPA_TECLAS[e.code]] = true
    if (e.code === 'Space') { e.preventDefault(); jogador.pular() }
    if (e.code === 'KeyE' && !e.repeat) interacoes.acao()
    if (e.code === 'KeyH') painel.alternar()
    if (e.code === 'KeyN') som.alternar()
    if (e.code === 'KeyM') mapa.alternar()
    if (e.code === 'KeyT') cfg.tempo.hora = (cfg.tempo.hora + 1) % 24
  })
  addEventListener('keyup', (e) => {
    if (MAPA_TECLAS[e.code]) teclas[MAPA_TECLAS[e.code]] = false
  })
  addEventListener('blur', () => { for (const k in teclas) teclas[k] = false })

  const TEXTO = { tchibum: 'TCHIBUM!', 'chuá': 'CHUÁ!', pouso: 'PLOFT!' }
  const relogio = new THREE.Clock()
  const centroSombra = new THREE.Vector3()
  let esperaGota = 0
  const frenteCam = new THREE.Vector3()
  let t = 0

  const estatistica = { msQuadro: 16 }
  const controle = { pausado: false } // o gravador pausa o laço e chama passo() com tempo fixo

  // Um passo da simulação + desenho. dt em segundos.
  function passo(dt) {
    t += dt
    globais.uTempo.value = t
    if (!cfg.tempo.pausado) cfg.tempo.hora = (cfg.tempo.hora + (dt * cfg.tempo.velocidade) / 60) % 24

    jogador.update(dt, teclas, cam.yaw)
    cam.update(dt, jogador.pos, jogador.velHoriz, teclas)

    // a área de sombra fica à frente da câmera, onde se olha (o alinhamento fino é em ceu.js)
    camera.getWorldDirection(frenteCam)
    frenteCam.y = 0
    frenteCam.normalize()
    centroSombra.copy(jogador.pos).addScaledVector(frenteCam, 30)
    const paleta = ceu.atualizar(cfg.tempo.hora, centroSombra, dt, cfg)
    horizonte.atualizar(paleta)
    pessoas.atualizar(dt, t)
    atores?.atualizar(dt, jogador.pos)
    mar.atualizar(jogador.pos)
    grama.atualizar(jogador.pos, camera)
    terreno.atualizar(camera)
    praia.atualizar(t)
    cenografia.atualizar()
    casas.atualizar(camera)
    marcos.atualizar(t)

    // camada 1: quem toca o mundo
    const pj = jogador.pos
    if (!jogador.nadando) toque.tocar(pj.x, pj.z, 0.9, jogador.noChao ? 1 : 0.25, jogador.vel.x, jogador.vel.z)
    esperaGota -= dt
    if ((jogador.molhado || jogador.nadando) && jogador.velHoriz > 0.4 && esperaGota <= 0) {
      toque.gota(pj.x, pj.z, jogador.nadando ? 0.7 : 0.5, jogador.nadando ? 0.6 : 0.45)
      esperaGota = jogador.nadando ? 0.22 : 0.14
    }
    for (const ev of jogador.eventos) {
      if (ev.tipo === 'pisada' && jogador.molhado) {
        // água rasa: o passo abre um anel na água, sem pegada
        toque.gota(ev.pos.x, ev.pos.z, jogador.velHoriz > 3 ? 0.3 : 0.22, jogador.velHoriz > 3 ? 0.5 : 0.3)
        continue
      }
      if (ev.tipo === 'pisada') {
        const correndo = jogador.velHoriz > (jogador.animador ? cfg.personagem.corridaNova * 0.75 : 6)
        areia.pisar(ev.pos.x, ev.pos.z, ev.yaw, ev.lado, correndo ? 1.25 : 1)
        if (correndo && jogador.naAreiaSeca) areia.poeira(ev.pos.x, pj.y, ev.pos.z, 3)
      }
      if (ev.tipo === 'tchibum' || ev.tipo === 'chuá') toque.gota(ev.pos.x, ev.pos.z, 0.9, ev.tipo === 'tchibum' ? 0.9 : 0.6)
      if (TEXTO[ev.tipo]) hud.onomatopeia(TEXTO[ev.tipo], ev.pos)
    }
    jogador.eventos.length = 0
    globais.uVentoPalm.value = cfg.interacao.ventoCoqueiros
    interacoes.atualizar()
    fisica.atualizar(dt, jogador)
    toque.atualizar(dt, pj)
    areia.atualizar(dt, pj)
    hud.atualizar(dt, jogador)
    mapa.atualizar(jogador)
    som.atualizar(distCosta(jogador.pos.x, jogador.pos.z), jogador.pos.y)

    pos.render(t, jogador.velHoriz)
  }

  function quadro() {
    requestAnimationFrame(quadro)
    const real = relogio.getDelta()
    estatistica.msQuadro += (real * 1000 - estatistica.msQuadro) * 0.05
    if (controle.pausado) return
    if (Math.min(cfg.desempenho.resolucao, devicePixelRatio || 1) !== resolucao) redimensionar()
    passo(Math.min(real, 1 / 20))
  }
  quadro()

  document.getElementById('carregando').classList.add('sumir')
  // para inspecionar pelo console do navegador
  // irPara(x, z, yawCamera, hora): teletransporte para depurar
  const irPara = (x, z, yaw = cam.yaw, hora = cfg.tempo.hora) => {
    jogador.pos.set(x, alturaChao(x, z) + 0.05, z)
    jogador.vel.set(0, 0, 0)
    cam.yaw = yaw
    cam.iniciado = false
    cfg.tempo.hora = hora
  }
  window.__tempos = tempos
  window.maresia = { cfg, jogador, cena, renderer, cam, estatistica, pos, irPara, teclas, passo, controle, canvas, toque, areia, fisica, interacoes, grama }
  if (import.meta.env.DEV) import('./debug/gravador.js').then((g) => g.instalar(window.maresia))
  if (import.meta.env.DEV) import('./debug/medidor.js').then((g) => g.instalar(window.maresia))
}

iniciar()
