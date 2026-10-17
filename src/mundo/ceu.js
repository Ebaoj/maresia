// Céu, sol, lua, nuvens e o ciclo de dia e noite.
// Cada hora do dia tem uma paleta; entre elas, as cores se misturam.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { globais } from '../globais.js'
import { gradienteToon, pintar, SAIDA_LUZ } from '../materiais.js'
import { criarAleatorio } from '../utils.js'

const QUADROS = [
  { h: 0.0, topo: '#0b1f52', hor: '#2f4f96', luz: '#a8c0ff', int: 1.1, ceu: '#7a96e0', chao: '#2f3468', amb: 1.1, noite: 1 },
  { h: 5.0, topo: '#13205a', hor: '#5a4590', luz: '#a0a8ff', int: 0.8, ceu: '#6a78c8', chao: '#2d2458', amb: 0.95, noite: 1 },
  { h: 6.0, topo: '#3a4a9e', hor: '#ff9eb0', luz: '#ffb38a', int: 1.3, ceu: '#9a8fd0', chao: '#5a3a50', amb: 0.75, noite: 0.4 },
  { h: 7.5, topo: '#5a9fd6', hor: '#f3e6cc', luz: '#ffe6c0', int: 2.6, ceu: '#b4c6e0', chao: '#d8b088', amb: 1.0, noite: 0 },
  { h: 12.0, topo: '#4f9fd8', hor: '#e9eee8', luz: '#fff6e6', int: 2.9, ceu: '#bccde0', chao: '#e2c296', amb: 1.1, noite: 0 },
  { h: 16.0, topo: '#5296d2', hor: '#f2e4c4', luz: '#ffe8bc', int: 2.7, ceu: '#b8c6dc', chao: '#dcb486', amb: 1.05, noite: 0 },
  { h: 17.4, topo: '#5a68ae', hor: '#f7a865', luz: '#ffb066', int: 2.4, ceu: '#b4a8d0', chao: '#c88a60', amb: 0.95, noite: 0 },
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

const vertCeu = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`

const fragCeu = /* glsl */ `
uniform vec3 uTopo; uniform vec3 uHor; uniform vec3 uSolDir; uniform vec3 uSolCor;
uniform float uNoite; uniform float uTempo; uniform float uArcane; uniform float uArcCeu;
varying vec3 vDir;
${SAIDA_LUZ}
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float h2(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), u.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), u.x), u.y);
}
void main() {
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  vec3 cor = mix(uHor, uTopo, pow(y, 0.55));
  if (uArcane > 0.5) {
    // CÉU PINTADO (visual Arcane): o degradê vira pinceladas longas e horizontais, como num fundo
    // pintado; um brilho largo e quente em volta do sol; nuvens de pincel baixas, com o lado do sol
    // quente e a barriga fria. Azimute e altura como "tela", deriva lenta com o tempo.
    float az = atan(d.z, d.x) + uTempo * 0.002;
    // pinceladas largas (poucas por tela) e outras finas por cima, como pincel chato e pincel de detalhe
    float yP = pow(y, 0.6);
    float largo = vn(vec2(az * 1.1, yP * 9.0));
    float fino = vn(vec2(az * 4.5, yP * 38.0) + 5.0);
    float traco = 0.7 * largo + 0.3 * fino;
    float t = clamp(pow(y, 0.55) + (traco - 0.5) * 0.42 * uArcCeu, 0.0, 1.0);
    cor = mix(uHor, uTopo, t);
    // cada pincelada puxa um pouco para o quente ou para o frio (a tinta não é uniforme)
    float tempT = (vn(vec2(az * 0.8, yP * 6.0) + 21.0) - 0.5) * 0.16 * uArcCeu;
    cor *= vec3(1.0 + tempT, 1.0, 1.0 - tempT);
    float sA = dot(d, normalize(uSolDir));
    cor = mix(cor, uSolCor * 1.05, smoothstep(0.55, 1.0, sA) * 0.38 * (1.0 - uNoite) * uArcCeu);
    // nuvens de pincel: manchas esticadas na horizontal, só na faixa baixa do céu
    float faixaN = smoothstep(0.02, 0.12, y) * (1.0 - smoothstep(0.32, 0.55, y));
    float nN = 0.65 * vn(vec2(az * 1.6, y * 9.0) + 11.0) + 0.35 * vn(vec2(az * 5.0, y * 30.0) + 3.0);
    float nuvem = smoothstep(0.58, 0.7, nN) * faixaN * uArcCeu;
    float ladoSol = 0.5 + 0.5 * dot(normalize(vec2(d.x, d.z)), normalize(vec2(uSolDir.x, uSolDir.z)));
    float topoN = smoothstep(0.55, 0.85, vn(vec2(az * 1.6, y * 9.0 + 0.6) + 11.0)); // a parte de cima pega mais luz
    vec3 corNuvemLuz = mix(uHor, uSolCor, 0.55) * 1.12;
    vec3 corNuvemSombra = mix(uTopo, uHor, 0.55) * 0.92;
    vec3 corNuvem = mix(corNuvemSombra, corNuvemLuz, clamp(ladoSol * 0.6 + topoN * 0.5, 0.0, 1.0));
    cor = mix(cor, mix(corNuvem, uTopo * 0.6, uNoite * 0.7), nuvem * 0.85);
  } else {
    // faixas de cor chapadas, como céu pintado
    float faixas = floor(pow(y, 0.55) * 7.0) / 7.0;
    cor = mix(cor, mix(uHor, uTopo, faixas), 0.35);
  }
  // sol
  float s = dot(d, normalize(uSolDir));
  float disco = smoothstep(0.9975, 0.9985, s);
  float halo = smoothstep(0.96, 0.999, s) * 0.35;
  cor += (uSolCor * 1.6) * disco * (1.0 - uNoite) + uSolCor * halo * (1.0 - uNoite);
  // lua (do lado oposto) e estrelas
  float l = dot(d, normalize(-uSolDir + vec3(0.0, 0.0, -0.3)));
  cor += vec3(0.95, 0.92, 1.0) * smoothstep(0.9985, 0.9992, l) * uNoite;
  vec3 g = floor(d * 220.0);
  float estrela = step(0.9965, hash(g)) * smoothstep(0.05, 0.3, d.y);
  float pisca = 0.6 + 0.4 * sin(uTempo * 3.0 + hash(g + 3.0) * 30.0);
  cor += vec3(1.0, 0.95, 0.85) * estrela * pisca * uNoite;
  // abaixo do horizonte: cor do horizonte (o mar cobre)
  if (d.y < 0.0) cor = uHor;
  gl_FragColor = vec4(cor, 1.0);
  gLuz = vec4(1.0, 0.0, 0.0, 1.0);
}`

export function criarCeu(cena) {
  const uniformes = {
    uTopo: { value: new THREE.Color() },
    uHor: { value: new THREE.Color() },
    uSolDir: globais.uSolDir,
    uSolCor: globais.uSolCor,
    uNoite: globais.uNoite,
    uTempo: globais.uTempo,
    uArcane: globais.uArcane,
    uArcCeu: globais.uArcCeu,
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
  ceu.frustumCulled = false
  ceu.renderOrder = -10
  ceu.userData.semNormal = true
  cena.add(ceu)

  // luz do sol (de dia) ou da lua (de noite), com sombra perto do jogador
  const sol = new THREE.DirectionalLight(0xffffff, 2)
  sol.castShadow = true
  sol.shadow.mapSize.set(4096, 4096)
  const sc = sol.shadow.camera
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 500
  sol.shadow.bias = -0.0006
  sol.shadow.normalBias = 0.06
  cena.add(sol)
  cena.add(sol.target)

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1)
  cena.add(hemi)

  cena.fog = new THREE.Fog(0xffffff, 140, 900)

  const nuvens = criarNuvens(cena)

  function atualizar(hora, centro, dt, cfg) {
    const p = paletaDaHora(hora)
    const dirSol = direcaoSol(hora)
    const deDia = dirSol.y > 0
    // de noite a luz principal vira a lua
    const dirLuz = deDia ? dirSol.clone() : new THREE.Vector3(-dirSol.x, -dirSol.y, -0.3).normalize()
    // truque de cenário: a luz nunca fica rasante demais, senão o chão inteiro cai na sombra
    dirLuz.y = Math.max(dirLuz.y, 0.42)
    dirLuz.normalize()
    const pertoHorizonte = THREE.MathUtils.smoothstep(Math.abs(dirSol.y), 0.0, 0.08)

    uniformes.uTopo.value.copy(p.topo)
    uniformes.uHor.value.copy(p.hor)
    globais.uSolDir.value.copy(dirSol)
    globais.uSolCor.value.copy(p.luz)
    globais.uNoite.value = p.noite
    globais.uAmbiente.value.copy(p.ceu).multiplyScalar(p.amb * 0.55)

    sol.color.copy(p.luz)
    sol.intensity = p.int * pertoHorizonte
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
    sol.position.copy(alinhado).addScaledVector(dirLuz, 250)
    sol.target.position.copy(alinhado)
    sol.castShadow = cfg.mundo.sombras
    const res = cfg.mundo.resolucaoSombra
    if (sol.shadow.mapSize.x !== res) {
      sol.shadow.mapSize.set(res, res)
      if (sol.shadow.map) { sol.shadow.map.dispose(); sol.shadow.map = null }
    }

    hemi.color.copy(p.ceu)
    hemi.groundColor.copy(p.chao)
    hemi.intensity = p.amb
    const lum = (c) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
    globais.uLuzRef.value = Math.max(0.2, sol.intensity * lum(sol.color) + hemi.intensity * lum(hemi.color))

    const nevoa = p.hor.clone().lerp(p.topo, 0.25)
    cena.fog.color.copy(nevoa)
    cena.fog.near = cfg.mundo.nevoaPerto
    cena.fog.far = cfg.mundo.nevoaLonge
    globais.uNevoaCor.value.copy(nevoa)
    globais.uNevoaPerto.value = cfg.mundo.nevoaPerto
    globais.uNevoaLonge.value = cfg.mundo.nevoaLonge

    ceu.position.copy(centro)
    nuvens.atualizar(dt, p, centro)
    return p
  }

  return { atualizar, sol }
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
    atualizar(dt, p) {
      material.emissive.copy(p.hor).multiplyScalar(0.35).add(p.ceu.clone().multiplyScalar(0.15))
      material.color.copy(p.luz).lerp(new THREE.Color(1, 1, 1), 0.5)
      for (const m of lista) {
        m.position.x += m.userData.vel * dt
        if (m.position.x > 1200) m.position.x = -1200
      }
    },
  }
}
