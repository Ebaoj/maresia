// Efeitos 2D desenhados (visual Arcane, docs/pesquisa-arcane.md): em Arcane, fumaça, poeira, água e
// faíscas são desenho 2D por cima do 3D, poucos quadros por segundo, formas chapadas de borda de pincel.
// Aqui cada efeito é uma folha de quadros desenhada uma vez no início (canvas, com semente): manchas
// irregulares em dois tons (sombra embaixo, luz em cima) que crescem, se abrem e somem, com buracos
// comendo a forma no fim. Cada partícula é um sprite que anda pelos quadros da folha.
//   poeira: passo de corrida e pouso na areia seca
//   fumaça: fogareiros da fatia (sobe e vai com o vento)
//   borrifo: arrebentação perto do jogador

import * as THREE from 'three'
import { luzFixa } from '../materiais.js'
import { criarAleatorio } from '../utils.js'

const QUADROS = 8
const LADO = 128

const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }

// mancha de borda irregular (como pincelada), centro (x, y), raio r
function mancha(g, rnd, x, y, r, pontas = 11) {
  g.beginPath()
  const desvios = Array.from({ length: pontas }, () => 0.78 + rnd.proximo() * 0.38)
  for (let i = 0; i <= pontas; i++) {
    const a = (i / pontas) * Math.PI * 2
    const k = desvios[i % pontas]
    const px = x + Math.cos(a) * r * k, py = y + Math.sin(a) * r * k
    if (i === 0) g.moveTo(px, py)
    else {
      const am = ((i - 0.5) / pontas) * Math.PI * 2
      const km = (desvios[i % pontas] + desvios[(i - 1) % pontas]) / 2 + 0.08
      g.quadraticCurveTo(x + Math.cos(am) * r * km, y + Math.sin(am) * r * km, px, py)
    }
  }
  g.fill()
}

// folha de quadros: manchas que crescem (abre), sobem (sobe) e somem
function folha({ semente, luz, sombra, manchas = 7, abre = 1, sobe = 0, espalha = 0.22 }) {
  const c = document.createElement('canvas')
  c.width = LADO * QUADROS
  c.height = LADO
  const g = c.getContext('2d')
  const base = criarAleatorio(semente)
  const bolhas = Array.from({ length: manchas }, () => ({
    dx: (base.proximo() - 0.5) * 2, dy: (base.proximo() - 0.6) * 1.2, r: 0.1 + base.proximo() * 0.12, s: base.proximo() * 1000,
  }))
  for (let q = 0; q < QUADROS; q++) {
    const t = q / (QUADROS - 1)
    const x0 = q * LADO
    for (const [tom, dx, dy, encolhe] of [[sombra, 0.04, 0.05, 1], [luz, -0.02, -0.03, 0.72]]) {
      g.fillStyle = tom
      for (const b of bolhas) {
        const rnd = criarAleatorio(Math.floor(b.s + q * 17)) // a borda muda a cada quadro: "ferve"
        const cx = x0 + LADO * (0.5 + b.dx * espalha * (0.35 + abre * t) + dx)
        const cy = LADO * (0.72 + b.dy * espalha - sobe * t * 0.45 + dy)
        const r = LADO * b.r * (0.55 + 0.85 * t) * (1 - 0.55 * suave(0.6, 1, t)) * encolhe
        if (r > 1) mancha(g, rnd, cx, cy, r)
      }
    }
    // no fim, buracos comem a forma (dissipa)
    if (t > 0.45) {
      g.save()
      g.globalCompositeOperation = 'destination-out'
      const rnd = criarAleatorio(semente * 7 + q)
      const n = Math.floor(3 + t * 9)
      for (let i = 0; i < n; i++) mancha(g, rnd, x0 + LADO * (0.2 + rnd.proximo() * 0.6), LADO * (0.25 + rnd.proximo() * 0.6), LADO * (0.03 + 0.09 * t * rnd.proximo()))
      g.restore()
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.repeat.set(1 / QUADROS, 1)
  tex.magFilter = THREE.LinearFilter
  return tex
}

export function criarEfeitos2d(cena) {
  const folhas = {
    poeira: folha({ semente: 3, luz: '#ead3a6', sombra: '#b79a76', manchas: 7, abre: 1.2, sobe: 0.15 }),
    fumaca: folha({ semente: 5, luz: '#d8d3cb', sombra: '#8f8b93', manchas: 6, abre: 0.6, sobe: 0.6, espalha: 0.16 }),
    borrifo: folha({ semente: 9, luz: '#fbfbf6', sombra: '#a9cbd6', manchas: 8, abre: 1.4, sobe: 0.35, espalha: 0.26 }),
  }
  const pool = []
  const livres = []
  function pegar() {
    if (livres.length) return livres.pop()
    const m = new THREE.SpriteMaterial({ alphaTest: 0.5, transparent: false, depthWrite: true })
    luzFixa(m, 0.85)
    m.customProgramCacheKey = () => 'luz-fixa-efeito2d'
    const sp = new THREE.Sprite(m)
    sp.renderOrder = 2
    cena.add(sp)
    const p = { sp, m, tex: {}, vivo: false }
    pool.push(p)
    return p
  }
  return {
    // tipo: 'poeira' | 'fumaca' | 'borrifo'; vida em s (8 quadros nela); vel em m/s
    emitir(tipo, pos, { tam = 0.6, vida = 0.66, vel = null, gira = 0 } = {}) {
      if (pool.filter((p) => p.vivo).length > 90) return
      const p = pegar()
      // cada partícula tem a própria cópia da textura (mesma imagem na GPU) para andar nos quadros
      if (!p.tex[tipo]) p.tex[tipo] = folhas[tipo].clone()
      p.m.map = p.tex[tipo]
      p.m.rotation = gira
      p.m.needsUpdate = true
      p.sp.position.copy(pos)
      p.sp.scale.set(tam, tam, 1)
      p.sp.visible = true
      p.vivo = true
      p.idade = 0
      p.vida = vida
      p.vel = vel ? vel.clone() : new THREE.Vector3()
    },
    atualizar(dt) {
      for (const p of pool) {
        if (!p.vivo) continue
        p.idade += dt
        if (p.idade >= p.vida) { p.vivo = false; p.sp.visible = false; livres.push(p); continue }
        const q = Math.min(QUADROS - 1, Math.floor((p.idade / p.vida) * QUADROS))
        p.m.map.offset.x = q / QUADROS
        p.sp.position.addScaledVector(p.vel, dt)
      }
    },
  }
}
