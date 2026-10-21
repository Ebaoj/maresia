// Céu, sol, lua, nuvens e o ciclo de dia e noite.
// Cada hora do dia tem uma paleta; entre elas, as cores se misturam.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { globais } from '../globais.js'
import { gradienteToon, pintar } from '../materiais.js'
import { vertCeu, fragCeu, ceuTsl } from './ceu-pintado.js'
import { criarAleatorio } from '../utils.js'

// A paleta do céu segue a direção de arte: azul no alto, quente no horizonte (o maresia de
// Fortaleza). O 1881 (memória) é a tinta de jornal, e quem resolve isso é o pós-processamento.
const QUADROS = [
  { h: 0.0, topo: '#0b1f52', hor: '#2f4f96', luz: '#a8c0ff', int: 1.1, ceu: '#7a96e0', chao: '#2f3468', amb: 1.1, noite: 1 },
  { h: 5.0, topo: '#13205a', hor: '#5a4590', luz: '#a0a8ff', int: 0.8, ceu: '#6a78c8', chao: '#2d2458', amb: 0.95, noite: 1 },
  { h: 6.0, topo: '#2e3f96', hor: '#ff9eb0', luz: '#ffb38a', int: 1.3, ceu: '#8a82c8', chao: '#5a3a50', amb: 0.75, noite: 0.4 },
  { h: 7.5, topo: '#3d86c8', hor: '#f7dfb0', luz: '#ffe6c0', int: 2.6, ceu: '#a4bad8', chao: '#d8b088', amb: 1.0, noite: 0 },
  { h: 12.0, topo: '#2b7ac2', hor: '#e3e0cf', luz: '#fff6e6', int: 2.9, ceu: '#a8c0dc', chao: '#e2c296', amb: 1.1, noite: 0 },
  { h: 16.0, topo: '#2d79bf', hor: '#f7dfad', luz: '#ffe8bc', int: 2.7, ceu: '#a4bcd6', chao: '#dcb486', amb: 1.05, noite: 0 },
  { h: 17.4, topo: '#3f4b9e', hor: '#f7a865', luz: '#ffb066', int: 2.4, ceu: '#a494c4', chao: '#c88a60', amb: 0.95, noite: 0 },
  { h: 18.3, topo: '#3a2a8a', hor: '#ff5e7a', luz: '#ff7a55', int: 1.2, ceu: '#a07ad0', chao: '#6a3050', amb: 0.75, noite: 0.35 },
  { h: 19.2, topo: '#1a2a6e', hor: '#6a4a9a', luz: '#a0acff', int: 1.0, ceu: '#7480cc', chao: '#2c2c5a', amb: 1.05, noite: 0.9 },
  { h: 24.0, topo: '#0b1f52', hor: '#2f4f96', luz: '#a8c0ff', int: 1.1, ceu: '#7a96e0', chao: '#2f3468', amb: 1.1, noite: 1 },
].map((q) => ({
  ...q,
  topo: new THREE.Color(q.topo),
  hor: new THREE.Color(q.hor),
  luz: new THREE.Color(q.luz),
  ceu: new THREE.Color(q.ceu),
  chao: new THREE.Color(q.chao),
}))

export function paletaDaHora(hora) {
  let a = QUADROS[0]
  let b = QUADROS[QUADROS.length - 1]
  for (let i = 0; i < QUADROS.length - 1; i++) {
    if (hora >= QUADROS[i].h && hora <= QUADROS[i + 1].h) {
      a = QUADROS[i]
      b = QUADROS[i + 1]
      break
    }
  }
  const t0 = (hora - a.h) / Math.max(0.0001, b.h - a.h)
  const t = t0 * t0 * (3 - 2 * t0)
  const lerp = (k) => a[k].clone().lerp(b[k], t)
  const num = (k) => a[k] + (b[k] - a[k]) * t
  return {
    topo: lerp('topo'), hor: lerp('hor'), luz: lerp('luz'), ceu: lerp('ceu'), chao: lerp('chao'),
    int: num('int'), amb: num('amb'), noite: num('noite'),
  }
}

// Sol nasce a leste (+x), se põe a oeste (-x), atrás das pedras do Rio.
export function direcaoSol(hora) {
  const a = ((hora - 6) / 12) * Math.PI
  return new THREE.Vector3(Math.cos(a), Math.sin(a), -0.35).normalize()
}


export function criarCeu(cena) {
  const uniformes = {
    uTopo: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uMeio: { value: new THREE.Color() },
    uSolDir: globais.uSolDir,
    uSolCor: globais.uSolCor,
    uNoite: globais.uNoite,
    uTempo: globais.uTempo,
    uArcane: globais.uArcane,
    uArcCeu: globais.uArcCeu,
    uArcPintado: globais.uArcPintado,
    uArcCeuPincel: globais.uArcCeuPincel,
  }
  const ceu = new THREE.Mesh(
    new THREE.SphereGeometry(1800, 48, 24),
    new THREE.ShaderMaterial({
      uniforms: uniformes,
      vertexShader: vertCeu,
      fragmentShader: fragCeu,
      side: THREE.BackSide,
      depthWrite: false,
    })
  )
  ceu.material.userData.tsl = { nome: 'ceu', material: (ctx) => ceuTsl(ctx, uniformes) }
  ceu.frustumCulled = false
  ceu.renderOrder = -10
  ceu.userData.semNormal = true
  cena.add(ceu)

  // luz do sol (de dia) ou da lua (de noite), com sombra perto do jogador
  const sol = new THREE.DirectionalLight(0xffffff, 2)
  sol.castShadow = true
  sol.shadow.mapSize.set(4096, 4096)
  // A janela de sombra cobre 120 x 120 unidades no mundo comprimido (350 m de
  // verdade no centro). Com a praca descomprimida (1:1), a mesma area real e
  // 2,88 vezes maior em unidades de jogo: o texel da sombra continua do mesmo
  // tamanho em centimetros.
  const sc = sol.shadow.camera
  sc.left = -173; sc.right = 173; sc.top = 173; sc.bottom = -173; sc.near = 1; sc.far = 1441
  sol.shadow.bias = -0.0006
  sol.shadow.normalBias = 0.06
  cena.add(sol)
  cena.add(sol.target)

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
  cena.add(hemi)

  cena.fog = new THREE.Fog(0xffffff, 140, 900)

  const nuvens = criarNuvens(cena)

  const corDourada = new THREE.Color()
  const corPetroleo = new THREE.Color()
  const corMeio = new THREE.Color()
  const corCiano = new THREE.Color()
  const corDouradaSombra = new THREE.Color()
  let cache = null // CacheSombra (F4): com ele ligado, a pose da luz fica congelada enquanto o mapa dos parados vale

  function atualizar(hora, centro, dt, cfg) {
    const p = paletaDaHora(hora)
    // 3b (alvo forte-1932-joabe): de dia o alto do céu vai para o azul petróleo fundo; só o horizonte fica quente
    if (cfg.estilo.visual === 'arcane') {
      const k = (cfg.estilo.arcCeuPetroleo ?? 0) * (1 - p.noite)
      p.topo.lerp(corPetroleo.set(cfg.estilo.arcCeuTopo || '#1c4a63'), k)
      // e o horizonte fica claro e só levemente quente (o pêssego cheio virava um véu sobre a cena)
      p.hor.lerp(corPetroleo.set('#efe6d2'), k * 0.45) // CAL.cal
    }
    const dirSol = direcaoSol(hora)
    const deDia = dirSol.y > 0
    // a luz que projeta sombra anda em passos (a cada cfg.mundo.passoSombraMin minutos de jogo, ~1°): com o
    // sol girando um pouco a cada quadro, o mapa de sombra girava junto e a borda das sombras tremia
    const passoH = Math.max(0, cfg.mundo.passoSombraMin ?? 4) / 60
    const dirSolS = passoH > 0 ? direcaoSol(Math.round(hora / passoH) * passoH) : dirSol
    // de noite a luz principal vira a lua
    const dirLuz = deDia ? dirSolS.clone() : new THREE.Vector3(-dirSolS.x, -dirSolS.y, -0.3).normalize()
    // HORA DOURADA (luz-arcane, item 3; alvo: docs/referencias/forte-1932-joabe): com o sol baixo de dia, a
    // luz principal esquenta para laranja, a sombra fica longa e azul funda e o contraste sobe. O fator nasce
    // da altura do sol, então 8h ganha um pouco, 11h nada, 16h30 quase tudo e a noite nada.
    const solBaixo = deDia ? (1 - THREE.MathUtils.smoothstep(dirSol.y, 0.22, 0.62)) * THREE.MathUtils.smoothstep(dirSol.y, 0.0, 0.1) : 0
    const dourada = solBaixo * (cfg.estilo.arcDourada ?? 0) * (cfg.estilo.visual === 'arcane' ? 1 : 0)
    globais.uDourada.value = dourada
    // truque de cenário: a luz nunca fica rasante demais, senão o chão inteiro cai na sombra. Na hora dourada o
    // limite desce (sombra longa, como no forte da referência), até cfg.estilo.arcDouradaAltura
    dirLuz.y = Math.max(dirLuz.y, THREE.MathUtils.lerp(0.42, cfg.estilo.arcDouradaAltura ?? 0.42, dourada))
    dirLuz.normalize()
    const pertoHorizonte = THREE.MathUtils.smoothstep(Math.abs(dirSol.y), 0.0, 0.08)

    uniformes.uTopo.value.copy(p.topo)
    uniformes.uHor.value.copy(p.hor)
    // a parada do meio: no visual Arcane, de dia, um azul claro esverdeado; senão o meio do caminho (o de antes)
    uniformes.uMeio.value.copy(p.hor).lerp(p.topo, 0.5)
    if (cfg.estilo.visual === 'arcane') uniformes.uMeio.value.lerp(corMeio.copy(p.topo).lerp(corCiano.set(cfg.estilo.arcCeuMeio || '#6fa8bc'), 0.85), (cfg.estilo.arcCeuPetroleo ?? 0) * (1 - p.noite))
    globais.uSolDir.value.copy(dirSol)
    globais.uSolCor.value.copy(p.luz)
    globais.uNoite.value = p.noite
    globais.uAmbiente.value.copy(p.ceu).multiplyScalar(p.amb * 0.55)

    sol.color.copy(p.luz).lerp(corDourada.set(cfg.estilo.arcDouradaLuz || '#ff9d55'), dourada * 0.3)
    sol.intensity = p.int * pertoHorizonte * (1 + 0.12 * dourada)
    globais.uSolCor.value.copy(sol.color)
    // Sombra estável: o centro da área de sombra anda em passos do tamanho de um pixel
    // do mapa de sombra, medidos no plano da luz. Assim a borda das sombras não "ferve"
    // quando o jogador anda.
    const texel = (sc.right - sc.left) / sol.shadow.mapSize.x
    const frente = dirLuz.clone().negate()
    const direita = new THREE.Vector3().crossVectors(frente, Math.abs(frente.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize()
    const cima = new THREE.Vector3().crossVectors(direita, frente).normalize()
    const r = centro.dot(direita)
    const u = centro.dot(cima)
    const alinhado = centro.clone()
      .addScaledVector(direita, Math.round(r / texel) * texel - r)
      .addScaledVector(cima, Math.round(u / texel) * texel - u)
    // F4 (KAN-74): com o cache ligado, a pose é a do mapa guardado (congelada) até a política mandar refazer
    const pose = cache ? cache.pose(alinhado, dirLuz) : null
    const centroLuz = pose ? pose.centro : alinhado
    sol.position.copy(centroLuz).addScaledVector(pose ? pose.dir : dirLuz, 250)
    sol.target.position.copy(centroLuz)
    sol.castShadow = cfg.mundo.sombras
    const res = cfg.mundo.resolucaoSombra
    if (sol.shadow.mapSize.x !== res) {
      sol.shadow.mapSize.set(res, res)
      if (sol.shadow.map) { sol.shadow.map.dispose(); sol.shadow.map = null }
    }

    hemi.color.copy(p.ceu)
    hemi.groundColor.copy(p.chao)
    // na hora dourada a luz de céu é mais fraca e mais azul: a sombra afunda e esfria (contraste de valor)
    hemi.intensity = p.amb * (1 - 0.3 * dourada)
    hemi.color.lerp(corDouradaSombra.set(cfg.estilo.arcDouradaSombra || '#36508a'), dourada * 0.45)
    // 3b: a luz que sobe do chão era areia (marrom) e sujava a sombra; no visual Arcane ela puxa para a luz de céu
    if (cfg.estilo.visual === 'arcane') hemi.groundColor.lerp(hemi.color, cfg.estilo.arcSombraFria ?? 0)
    const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
    globais.uLuzRef.value = Math.max(0.2, sol.intensity * lum(sol.color) + hemi.intensity * lum(hemi.color))

    // A cor do ar: de longe o mundo se tinge com o céu. Ao meio-dia e à tarde o azul do
    // alto entra; no fim da tarde e na madrugada o quente do horizonte manda.
    const quente = THREE.MathUtils.clamp((p.hor.r - p.hor.b) * 2.2, 0, 1)
    if (cfg.estilo.visual === 'arcane') {
      // PERSPECTIVA DE AR (item 6): de dia a distância esfria para o azul claro do meio do céu; na hora
      // dourada esquenta para o horizonte (o ar fica dourado, como no fundo da referência)
      globais.uArCor.value.copy(uniformes.uMeio.value).lerp(p.hor, THREE.MathUtils.clamp(0.2 + 0.7 * dourada + 0.4 * p.noite, 0, 1))
    } else {
      globais.uArCor.value.copy(p.hor).lerp(p.topo, 0.45 * (1 - quente))
    }
    const nevoa = p.hor.clone().lerp(p.topo, 0.25)
    cena.fog.color.copy(nevoa)
    cena.fog.near = cfg.mundo.nevoaPerto
    cena.fog.far = cfg.mundo.nevoaLonge
    globais.uNevoaCor.value.copy(nevoa)
    globais.uNevoaPerto.value = cfg.mundo.nevoaPerto
    globais.uNevoaLonge.value = cfg.mundo.nevoaLonge

    ceu.position.copy(centro)
    nuvens.atualizar(dt, p, centro, cfg)
    return p
  }

  return { atualizar, sol, usarCache: (c) => { cache = c } }
}

function criarNuvens(cena) {
  const rnd = criarAleatorio(7)
  const material = pintar(new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradienteToon(), fog: false }), 'nuvem-pintada')
  material.emissive = new THREE.Color(0x000000)
  const grupo = new THREE.Group()
  const lista = []
  // cúmulos de alísio (direção de arte): pequenos, base reta, topo fofo, em fileiras ("ruas de
  // nuvens") na direção do vento. Nada de bolhas grandes isoladas.
  const RUAS = 6
  for (let n = 0; n < 54; n++) {
    const partes = []
    const tam = rnd.entre(0.6, 1.4)
    const qtd = 6 + Math.floor(rnd.entre(0, 6))
    for (let i = 0; i < qtd; i++) {
      const r = rnd.entre(6, 13) * tam
      const g = new THREE.IcosahedronGeometry(r, 1) // de longe, 80 triângulos por bolha bastam
      // as do meio mais altas: o cúmulo cresce para cima no centro
      const x = rnd.entre(-22, 22) * tam
      g.translate(x, rnd.entre(0, 9) * tam * (1 - Math.abs(x) / (30 * tam)), rnd.entre(-9, 9) * tam)
      partes.push(g)
    }
    const geo = mergeGeometries(partes)
    // base reta: tudo que desce abaixo da base é achatado
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < 0) pos.setY(i, y * 0.12)
    }
    geo.computeVertexNormals()
    geo.scale(1, 0.75, 1)
    const m = new THREE.Mesh(geo, material)
    const rua = n % RUAS
    const z = -1000 + (rua + rnd.entre(-0.3, 0.3)) * (2000 / RUAS)
    m.position.set(rnd.entre(-1200, 1200), rnd.entre(150, 230), z)
    m.userData.vel = rnd.entre(3, 5)
    lista.push(m)
    grupo.add(m)
  }
  cena.add(grupo)
  return {
    atualizar(dt, p, centro, cfg) {
      // (item 5: no visual Arcane menos brilho próprio, para a nuvem ter barriga azulada e topo claro)
      const ke = cfg.estilo.visual === 'arcane' ? 0.45 : 1
      material.emissive.copy(p.hor).multiplyScalar(0.35 * ke).add(p.ceu.clone().multiplyScalar(0.15 * ke))
      material.color.copy(p.luz).lerp(new THREE.Color(1, 1, 1), 0.5)
      for (const m of lista) {
        m.position.x += m.userData.vel * dt
        if (m.position.x > 1200) m.position.x = -1200
      }
    },
  }
}
