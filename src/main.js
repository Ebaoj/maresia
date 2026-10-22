// Maresia: protótipo de cosy game numa cidade misturada de Fortaleza, Recife e Rio,
// com estética de quadrinho (3D desenhado como 2D).
// Este arquivo só liga as peças; cada sistema mora no seu módulo.

import * as THREE from 'three'
import { carregarConfig } from './config.js'
import { globais } from './globais.js'
import { linhaCosta, larguraPraia, distCosta } from './mundo/mapa.js'
import { criarTerreno } from './mundo/terreno.js'
import { congelar } from './mundo/congelar.js'
import { criarContadorFps } from './ui/contador-fps.js'
import { criarRenderizador, prepararCenaWebgpu, preaquecerWebgpu, modulo as moduloWebgpu } from './render/renderizador.js'
import { ligarMotorPlaca, prepararMotorPlaca } from './render/motor-placa.js'
import { definirTamBloco } from './mundo/blocos.js'
import { alturaChao } from './mundo/colisao.js'
import { criarCeu } from './mundo/ceu.js'
import { CacheSombra } from './render/cache-sombra.js'
import { CacheSombraGpu } from './render/cache-sombra-gpu.js'
import { SombraPerto } from './render/sombra-perto.js'
import { criarMar } from './mundo/mar.js'
import { criarFaixas } from './mundo/faixas.js'
import { criarCidade, RECUSA } from './mundo/cidade.js'
import { criarMarcosCentro } from './mundo/marcos1932/index.js'
import { criarMarcosNorte } from './mundo/marcos-norte.js'
import * as ocup1932 from './mundo/ocupacao1932.js'
import { calcularChao1932 } from './mundo/chao1932.js'
import { criarFachadas } from './mundo/fachadas.js'
import { criarRua } from './mundo/rua.js'
import { criarPraca } from './mundo/praca.js'
import { criarBondes } from './mundo/bondes-malha.js'
import { criarArvores } from './mundo/arvores.js'
import { criarPessoas } from './mundo/pessoas.js'
import { criarAtores } from './mundo/atores.js'
import { criarHorizonte } from './mundo/horizonte.js'
import { criarTelhadosLonge } from './mundo/telhados-longe.js'
import { criarMarcos } from './mundo/marcos.js'
import { criarPraia } from './mundo/praia.js'
import { criarCoqueiros } from './mundo/vegetacao.js'
import { criarQuintal1932 } from './mundo/quintal1932.js'
import { criarVida1932 } from './mundo/vida1932.js'
import { criarGrama } from './mundo/grama.js'
import { criarCenografia } from './mundo/cenografia.js'
import { criarUrubu1932 } from './mundo/urubu1932.js'
import { criarVilas } from './mundo/vilas.js'
import { criarObjetosFatia, FOGAREIROS } from './mundo/fatia-objetos.js'
import { criarParticulas } from './mundo/particulas.js'
import { criarAleatorio } from './utils.js'
import { criarMapa } from './ui/mapa.js'
import { trechosJogo } from './mundo/fortaleza1932.js'
import { criarToque } from './mundo/toque.js'
import { criarAreia } from './mundo/areia.js'
import { criarChaoSolto } from './mundo/chao-solto.js'
import { criarFisica } from './mundo/fisica.js'
import { distCosta as distCostaAreia, larguraPraia as larguraPraiaAreia } from './mundo/mapa.js'
import { Jogador } from './jogador/controle.js'
import { carregarCorpo } from './jogador/corpo.js'
import { definirTonsLuz } from './materiais.js'
import { CameraTerceiraPessoa } from './jogador/camera.js'
import { criarInteracoes } from './jogador/interacoes.js'
import { carregarAvo } from './jogador/avo.js'
import { Aranhaverso } from './pos/aranhaverso.js'
import { AranhaversoGpu } from './pos/aranhaverso-gpu.js'
import { ResolucaoDinamica } from './render/resolucao-dinamica.js'
import { criarHud } from './ui/hud.js'
import { criarPainel } from './ui/painel.js'
import { criarSom } from './audio.js'

const cfg = carregarConfig()
definirTonsLuz(cfg.estilo.visual === 'arcane' ? 'liso' : cfg.estilo.tonsLuz) // antes de qualquer material ser criado (Arcane: as faixas são do pintor de luz)
const canvas = document.getElementById('tela')
// WebGL de sempre ou WebGPU (cfg.desempenho.renderizador, motor F1, KAN-67): criado no começo de iniciar(),
// porque o WebGPU espera a placa responder
let renderer
let webgpu = false
let preaquecido = false

// a cena nunca se move; congelada, ela para de obrigar todos os filhos a refazer a matriz do mundo
const cena = congelar(new THREE.Scene())
// O jogo atualiza as matrizes uma vez por quadro, em passo(). No WebGPU o three chamaria cena.updateMatrixWorld()
// em todo render() (passe principal + passe de sombra aninhado): 1,2 ms + 0,9 ms por quadro na T4, porque 1.232
// objetos ainda têm matrixAutoUpdate (747 ossos de 25 esqueletos etc.)
cena.matrixWorldAutoUpdate = false
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
  ;({ renderer, webgpu } = await criarRenderizador(cfg, canvas))
  ligarMotorPlaca(webgpu && cfg.desempenho.motorPlaca) // antes de criar o mundo: instanciarEmBlocos consulta

  const tempos = {}
  let tMarca = performance.now()
  const marcar = (nome) => { const t = performance.now(); tempos[nome] = Math.round(t - tMarca); tMarca = t }
  definirTamBloco(cfg.desempenho.tamBloco, cfg.desempenho.copiasMinBloco, cfg.desempenho.tamBlocoMax)
  await ocup1932.carregarOcupacao1932() // a planta de 1932: onde havia lote, onde era rua (o terreno pergunta isso)
  marcar('ocupacao')
  calcularChao1932() // o chão da cidade: rua, quintal e o rodeiro da carroça (depende da planta)
  marcar('chao')
  const terreno = criarTerreno(cena, cfg)
  marcar('terreno')
  const { mapaAltura } = terreno
  const ceu = criarCeu(cena, cfg)
  // sombra de perto (21/10/2026): mapa pequeno e denso em volta do jogador, misturado ao do sol (render/sombra-perto.js)
  const sombraPerto = new SombraPerto({ cena, sol: ceu.sol, cfg, W: webgpu ? moduloWebgpu() : null })
  const toque = criarToque(renderer, mapaAltura, cfg)
  const mar = criarMar(cena, mapaAltura, cfg, toque.publico)
  // calçadão e avenida saíram em 1932 (criarFaixas fica no código para referência)
  void criarFaixas
  const { predios, casas, grade, quadras, frente } = criarCidade(cena, cfg)
  // os marcos do centro (Coluna da Hora, cinemas, Excelsior, Leões, Mercado de Ferro): src/mundo/marcos1932/
  const marcos1932 = criarMarcosCentro(cena, cfg)
  const marcosNorte = criarMarcosNorte(cena, cfg) // a velha Sé, a Estação Central e o Passeio Público de 1932
  const urubu = criarUrubu1932(cena, cfg) // o Campo do Urubu: galpões, tarefas, cozinha e o portão
  marcar('cidade')
  criarFachadas(cena, predios)
  marcar('fachadas')
  const cenografia = criarCenografia(cena, predios.filter((p) => p.tipo === 'casario'), marcos1932.lampioes)
  const marcos = criarMarcos(cena)
  const praia = criarPraia(cena)
  const casasPalha = criarVilas(cena)
  const nObjetosFatia = criarObjetosFatia(cena, casasPalha) // fatia vertical: densidade na altura do personagem
  void nObjetosFatia
  // A praça vem antes da rua: assim os canteiros, o coreto e os lampiões já estão
  // reservados na grade de ocupação, e nenhum poste da rua cai em cima
  criarPraca(cena, cfg) // a Praça do Ferreira de 1932 com o coreto (só quando a reforma está desligada)
  const lugares = criarRua(cena, predios, grade)
  lugares.bancos.push(...marcos1932.bancos) // os bancos de ferro das praças dos marcos: dá para sentar
  marcar('rua')
  criarBondes(cena) // os trilhos das linhas de bonde da Light sobre a rede viária de 1932
  const vida1932 = criarVida1932(cena, cfg, predios) // carroças, jumentos, carga, potes, varais e o fio do bonde
  marcar('vida')
  criarArvores(cena, predios, grade)
  marcar('arvores')
  const { coqueiros, pecas } = criarCoqueiros(cena, cfg)
  marcar('coqueiros')
  criarQuintal1932(cena, cfg, pecas) // as árvores dos quintais de 1932, atrás das casas
  marcar('quintal')
  const pessoas = criarPessoas(cena, grade, cfg)
  const horizonte = criarHorizonte(cena)
  const telhadosLonge = criarTelhadosLonge(cena, cfg) // a silhueta dos telhados de 1932 até o horizonte
  const grama = criarGrama(cena, mapaAltura, cfg, toque.publico)
  marcar('grama')
  const areia = criarAreia(cena, renderer, mapaAltura, cfg)
  marcar('areia')
  const chaoSolto = criarChaoSolto(cena, cfg) // pedrisco, conchas, torrões e touceiras secas perto da câmera
  marcar('chaoSolto')
  const fisica = await criarFisica(cena, cfg, { coqueiros, toque, areia })
  marcar('fisica')

  // começa na Praia de Iracema, entre as jangadas, olhando para o oeste: o porto
  const x0 = (trechosJogo.praiaIracema[0] + trechosJogo.praiaIracema[1]) / 2
  const z0 = linhaCosta(x0) + larguraPraia(x0) + 3.5
  const inicio = new THREE.Vector3(x0, alturaChao(x0, z0), z0)
  const jogador = new Jogador(cena, cfg, inicio, -Math.PI / 2)
  let atores = null
  const carregamentos = [] // modelos em segundo plano (a foto justa espera todos)
  // corpo novo (esqueleto padrão + mocap do Mixamo): carrega em segundo plano e substitui o boneco antigo
  if (cfg.personagem.corpoNovo) {
    carregamentos.push(carregarCorpo({ modelo: cfg.personagem.modeloJogador, chapeu: cfg.personagem.chapeu, rostoDesenhado: cfg.personagem.rostoNeto, estiloRosto: cfg.personagem.estiloRostoNeto, ombros: cfg.personagem.ombros, folgaCamisa: cfg.personagem.folgaCamisa, roupaJolt: cfg.personagem.roupaJolt, fisicaRoupa: cfg.personagem }).then((c) => {
      if (!c) return
      jogador.trocarCorpo(c)
      // a gente mais próxima vira ator animado, com os mesmos movimentos (mundo/atores.js)
      atores = criarAtores(cena, pessoas, c.clipes, { passadaAndar: c.passadas.andar || 1.4, vat: webgpu && cfg.desempenho.atoresVat, quantos: cfg.personagem.quantosAtores })
    }).catch((e) => console.error('Corpo novo:', e)))
  }
  // o avô parado perto de onde o jogo começa, de frente para o neto (para julgar o modelo com o filtro)
  let avo = null
  if (cfg.personagem.avo) {
    carregamentos.push(carregarAvo({ movimento: cfg.personagem.avoMovimento, rostoDesenhado: cfg.personagem.rostoAvo, estiloRosto: cfg.personagem.estiloRostoNeto }).then((a) => {
      if (!a) return
      const x = inicio.x - 2.6, z = inicio.z + 0.9
      a.raiz.position.set(x, alturaChao(x, z), z)
      a.raiz.rotation.y = Math.PI / 2 // olha para +x, para onde o neto começa
      cena.add(a.raiz)
      avo = a
      if (window.maresia) window.maresia.avo = a
    }).catch((e) => console.error('Avô:', e)))
  }
  // segundo avô para comparar (o do Tripo), 1,2 m ao lado do primeiro
  let avo2 = null
  if (cfg.personagem.avoTripo) {
    // o do Tripo vem de coluna reta (17/10/2026): a postura de velho vem só do movimento
    carregamentos.push(carregarAvo({ movimento: cfg.personagem.avoTripoMovimento, arquivo: '/arte/finais/avo-tripo.glb' }).then((a) => {
      if (!a) return
      const x = inicio.x - 2.6, z = inicio.z + 2.1
      a.raiz.position.set(x, alturaChao(x, z), z)
      a.raiz.rotation.y = Math.PI / 2
      cena.add(a.raiz)
      avo2 = a
      if (window.maresia) window.maresia.avo2 = a
    }).catch((e) => console.error('Avô do Tripo:', e)))
  }
  const cam = new CameraTerceiraPessoa(camera, canvas, cfg, Math.PI / 2)
  const interacoes = criarInteracoes({ jogador, fisica, lugares, camera })
  // partículas (visual Arcane): fumaça dos fogareiros, poeira, borrifo da arrebentação, pó no ar
  const particulas = criarParticulas(cena, renderer, camera)
  const rndFx = criarAleatorio(41)
  let esperaBorrifo = 0
  const ondaFila = [] // jatos de uma onda quebrando, um atrás do outro
  const VENTO_FX = new THREE.Vector3(-1, 0, -0.35).normalize()
  // filtro de quadrinho: o mesmo nos dois renderizadores (no webgpu, as passadas em TSL)
  const pos = webgpu
    ? new AranhaversoGpu(renderer, cena, camera, cfg, globais)
    : new Aranhaverso(renderer, cena, camera, cfg, globais)
  pos.coletarExcecoes()
  // F4 (KAN-74): sombra dos objetos parados em cache, no WebGL e no WebGPU; liga em cfg.mundo.cacheSombra e vale ao vivo
  const cacheSombra = webgpu ? new CacheSombraGpu(renderer, cena, camera, ceu.sol, cfg, moduloWebgpu()) : new CacheSombra(renderer, cena, camera, ceu.sol, cfg)
  ceu.usarCache(cacheSombra)
  sombraPerto.luz.userData.cacheSombraVizinho = cacheSombra // WebGPU: o mapa de perto desenha os parados também
  if (import.meta.env.DEV && !webgpu) {
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
  const mapa = criarMapa({ casasPalha })
  const som = criarSom(cfg)
  const painel = criarPainel(cfg)

  // R1: resolução dinâmica guiada pelo tempo de quadro (cfg.desempenho.resolucaoDinamica, desligada por padrão).
  // O teto é a resolução do painel; a escala viva fica em dinamica.escala
  const dinamica = new ResolucaoDinamica({
    alvo: cfg.desempenho.resolucao,
    minimo: cfg.desempenho.resolucaoMin,
    orcamentoMs: cfg.desempenho.orcamentoQuadroMs,
  })
  let resolucaoDoPainel = cfg.desempenho.resolucao // para notar quando o usuário mexe nela
  let dinamicaLigada = false
  let tamanhoTravado = false // a foto justa fixa o tamanho (tamanhoFixo): a resolução dinâmica não roda nesse tempo
  const escalaAtual = () => (cfg.desempenho.resolucaoDinamica ? dinamica.escala : cfg.desempenho.resolucao)

  let resolucao = 0
  function redimensionar() {
    resolucao = Math.min(escalaAtual(), devicePixelRatio || 1)
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
  const centroPerto = new THREE.Vector3()
  let esperaGota = 0
  const frenteCam = new THREE.Vector3()
  let t = 0

  const estatistica = { msQuadro: 16 }
  // o gravador pausa o laço e chama passo() com tempo fixo. Com ?foto na URL o jogo já abre pausado: a foto
  // justa (debug/foto-justa.js) roda a mesma sequência de passos fixos nos dois renderizadores, então o mundo
  // (partículas, ondas, animação) fica no mesmo estado nas duas fotos
  const controle = { pausado: new URLSearchParams(location.search).has('foto') }

  // Um passo da simulação + desenho. dt em segundos. desenhar = false: só simula (a foto justa avança o mundo
  // sem gastar desenho)
  function passo(dt, desenhar = true) {
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
    centroPerto.copy(jogador.pos).addScaledVector(frenteCam, cfg.mundo.sombraPertoAFrente ?? 8)
    sombraPerto.atualizar(ceu.dirContinua, centroPerto)
    horizonte.atualizar(paleta)
    telhadosLonge.atualizar(camera, paleta)
    pessoas.atualizar(dt, t, cfg.tempo.hora)
    atores?.atualizar(dt, jogador.pos)
    const fpsAvo = cfg.estilo.visual === 'arcane' ? cfg.personagem.fpsAcao : cfg.personagem.fpsPose // Arcane: 24 poses
    avo?.atualizar(dt, fpsAvo)
    avo2?.atualizar(dt, fpsAvo)
    mar.atualizar(jogador.pos)
    grama.atualizar(jogador.pos, camera)
    terreno.atualizar(camera)
    chaoSolto.atualizar(camera)
    praia.atualizar(t)
    cenografia.atualizar()
    marcosNorte.atualizar(camera)
    casas.atualizar(camera)
    marcos1932.atualizar(camera)
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
        if (correndo && jogador.naAreiaSeca) {
          if (cfg.estilo.visual === 'arcane') particulas.poeira(new THREE.Vector3(ev.pos.x, pj.y, ev.pos.z), 1, jogador.vel)
          else areia.poeira(ev.pos.x, pj.y, ev.pos.z, 3)
        }
      }
      if (ev.tipo === 'pouso' && jogador.naAreiaSeca && cfg.estilo.visual === 'arcane') {
        particulas.poeira(ev.pos, 2.5)
      }
      if (ev.tipo === 'tchibum' || ev.tipo === 'chuá') toque.gota(ev.pos.x, ev.pos.z, 0.9, ev.tipo === 'tchibum' ? 0.9 : 0.6)
      if (TEXTO[ev.tipo]) hud.onomatopeia(TEXTO[ev.tipo], ev.pos)
    }
    jogador.eventos.length = 0
    // fumaça dos fogareiros perto (sobe devagar e vai com o vento) e borrifo na arrebentação
    for (const f of FOGAREIROS) if (f.distanceToSquared(pj) < 45 * 45) particulas.fumaca(f, dt, VENTO_FX)
    // arrebentação: de tempos em tempos uma onda quebra num trecho de 3 a 5 m perto do jogador e solta
    // jatos em sequência ao longo dele
    esperaBorrifo -= dt
    if (esperaBorrifo <= 0) {
      esperaBorrifo = rndFx.entre(0.8, 1.6)
      const x0 = pj.x + rndFx.entre(-7, 7)
      const zC = linhaCosta(x0)
      if (Math.abs(zC - pj.z) < 30) {
        const dz = rndFx.entre(0.8, 2.2)
        for (let k = 0; k < 5; k++) {
          const x = x0 + (k - 2) * rndFx.entre(0.7, 1.0)
          ondaFila.push({ t: k * 0.07, pos: new THREE.Vector3(x, 0.4, linhaCosta(x) - dz) })
        }
      }
    }
    for (let i = ondaFila.length - 1; i >= 0; i--) {
      const o = ondaFila[i]
      o.t -= dt
      if (o.t > 0) continue
      particulas.borrifo(o.pos)
      ondaFila.splice(i, 1)
    }
    if (cfg.estilo.visual === 'arcane') particulas.poNoAr(pj, dt)
    particulas.atualizar(dt, { vento: VENTO_FX, forcaVento: cfg.interacao.ventoCoqueiros })
    globais.uVentoPalm.value = cfg.interacao.ventoCoqueiros
    interacoes.atualizar()
    fisica.atualizar(dt, jogador)
    toque.atualizar(dt, pj)
    areia.atualizar(dt, pj)
    hud.atualizar(dt, jogador)
    mapa.atualizar(jogador)
    som.atualizar(distCosta(jogador.pos.x, jogador.pos.z), jogador.pos.y)

    if (!desenhar) return
    cena.updateMatrixWorld() // a única do quadro; só ao desenhar, onde o three a fazia (a foto justa não muda)
    if (webgpu) {
      prepararCenaWebgpu(cena) // material novo já sai com a versão do WebGPU no primeiro desenho
      // primeiro desenho: tudo montado de uma vez (KAN-70 T1), não bloco a bloco andando
      if (!preaquecido) { preaquecido = true; preaquecerWebgpu(cena, () => pos.desenhar()) }
    }
    pos.render(t, jogador.velHoriz)
  }

  // motor guiado pela placa (KAN-72): ainda na capa de carregamento, as malhas da vg e os programas dela ficam
  // prontos (sem isso as árvores apareciam de 2 a 4 s depois do resto); materiais já na versão do WebGPU antes
  // (o compileAsync da vg monta listas de desenho e precisa das matrizes do mundo já calculadas)
  if (webgpu) { prepararCenaWebgpu(cena); cena.updateMatrixWorld(); await prepararMotorPlaca(renderer, cena, camera) }

  const contadorFps = criarContadorFps(cfg)
  function quadro() {
    requestAnimationFrame(quadro)
    contadorFps.quadro()
    const real = relogio.getDelta()
    estatistica.msQuadro += (real * 1000 - estatistica.msQuadro) * 0.05
    if (controle.pausado) return
    // R1: o usuário mexeu na resolução do painel (ou ligou a chave agora): recomeça do teto. Senão, a escala segue o tempo
    // de quadro; ao mudar, o teste logo abaixo refaz o tamanho do desenho
    if (cfg.desempenho.resolucao !== resolucaoDoPainel || cfg.desempenho.resolucaoDinamica !== dinamicaLigada) {
      resolucaoDoPainel = cfg.desempenho.resolucao
      dinamicaLigada = cfg.desempenho.resolucaoDinamica
      dinamica.redefinir(resolucaoDoPainel)
    }
    if (dinamicaLigada && !tamanhoTravado) {
      dinamica.minimo = cfg.desempenho.resolucaoMin
      dinamica.orcamentoMs = cfg.desempenho.orcamentoQuadroMs
      dinamica.quadro(real * 1000)
    }
    if (Math.min(escalaAtual(), devicePixelRatio || 1) !== resolucao) redimensionar()
    passo(Math.min(real, 1 / 20))
    // tempo até o primeiro quadro desenhado de verdade (com os shaders montados), para comparar renderizadores
    if (window.__primeiroQuadroMs === undefined) window.__primeiroQuadroMs = Math.round(performance.now())
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
  // tamanho fixo do desenho (foto justa): mesma resolução nos dois renderizadores, sem depender da janela
  const tamanhoFixo = (w, h) => {
    tamanhoTravado = !!w
    if (!w) { redimensionar(); return }
    renderer.setPixelRatio(1)
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    pos.tamanho(w, h, 1)
  }
  window.maresia = { cfg, jogador, cena, renderer, cam, estatistica, pos, cacheSombra, sombraPerto, irPara, teclas, passo, controle, canvas, toque, areia, fisica, interacoes, grama, lugares, particulas, fogareiros: FOGAREIROS, tamanhoFixo, resolucaoDinamica: dinamica, webgpu, atores: () => atores, pronto: Promise.allSettled(carregamentos), predios, quadras, recusa: RECUSA, frente, vida1932, ocupacao1932: ocup1932, urubu, marcos1932,
    // para os testes: o módulo three/webgpu e a troca de materiais que o jogo usa (a mesma instância do módulo)
    gpu: webgpu ? { W: moduloWebgpu(), preparar: prepararCenaWebgpu } : null }
  if (import.meta.env.DEV) import('./debug/gravador.js').then((g) => g.instalar(window.maresia))
  if (import.meta.env.DEV) import('./debug/medidor.js').then((g) => g.instalar(window.maresia))
  if (import.meta.env.DEV) import('./debug/foto-justa.js').then((g) => g.instalar(window.maresia))
}

iniciar()
