// Fase 2: forma secundária dos prédios. Tudo em InstancedMesh, preso a cada caixa:
// cornija, frisos, telhado de barro, toldo listrado, letreiro pintado à mão,
// varanda dos prédios da orla, ar-condicionado e antena.

import * as THREE from 'three'
import { toon, texturaCanvas, pintar, gradienteToon } from '../materiais.js'
import { alturaTerreno } from './terreno.js'
import { criarAleatorio } from '../utils.js'
import { instanciarEmBlocos } from './blocos.js'

const rnd = criarAleatorio(77)

const NOMES = [
  'PADARIA', 'FARMÁCIA', 'BAR DO ZÉ', 'AÇAÍ', 'TAPIOCA', 'MERCADINHO', 'SORVETES', 'ÓTICA',
  'BARBEARIA', 'LANCHONETE', 'ARMARINHO', 'PEIXARIA', 'PASTELARIA', 'CALDO DE CANA', 'LOTÉRICA', 'SALÃO',
]
const FUNDOS = ['#e7d3a3', '#a8432e', '#5e8a6e', '#4f7c9a', '#f4eee2', '#c9963f', '#8a5a3c', '#efe6d2']

// Matriz de um objeto preso à fachada: "frente" é a direção para fora, no espaço da caixa.
function naFachada(it, frente, lateral, altura, afastar, alvo) {
  const [fx, fz] = frente
  const meia = fx !== 0 ? it.w / 2 : it.d / 2
  const lx = fx * (meia + afastar) + (fz !== 0 ? lateral : 0)
  const lz = fz * (meia + afastar) + (fx !== 0 ? lateral : 0)
  const c = Math.cos(it.rot)
  const s = Math.sin(it.rot)
  const x = it.x + lx * c + lz * s
  const z = it.z - lx * s + lz * c
  // direção para fora no mundo, para girar o objeto
  const ox = fx * c + fz * s
  const oz = -fx * s + fz * c
  alvo.set(x, it.y + altura, z, Math.atan2(ox, oz))
  return alvo
}

function larguraFachada(it, frente) {
  return frente[0] !== 0 ? it.d : it.w
}

class Lista {
  constructor(geo, material, nome) {
    this.geo = geo
    this.material = material
    this.nome = nome
    this.matrizes = []
    this.cores = []
  }
  add(x, y, z, yaw, sx = 1, sy = 1, sz = 1, cor = null) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(sx, sy, sz)
    )
    this.matrizes.push(m)
    this.cores.push(cor)
  }
  criar(cena, { sombra = true, solido = false } = {}) {
    if (!this.matrizes.length) return null
    return instanciarEmBlocos(cena, this.geo, this.material, this.matrizes, this.cores, { nome: this.nome, sombra, solido })
  }
}

// Telhado de duas águas: cumeeira ao longo de x, de -0,5 a 0,5; altura 1.
function geometriaTelhado() {
  const p = [
    // água sul
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 1, 0, -0.5, 0, -0.5, 0.5, 1, 0, -0.5, 1, 0,
    // água norte
    0.5, 0, 0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, -0.5, 1, 0, 0.5, 1, 0,
    // oitões
    -0.5, 0, 0.5, -0.5, 0, -0.5, -0.5, 1, 0,
    0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 1, 0,
  ]
  const uv = [
    0, 0, 3, 0, 3, 2, 0, 0, 3, 2, 0, 2,
    0, 0, 3, 0, 3, 2, 0, 0, 3, 2, 0, 2,
    0, 0, 1, 0, 0.5, 0.5,
    0, 0, 1, 0, 0.5, 0.5,
  ]
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeVertexNormals()
  return g
}

function texturaTelha() {
  return texturaCanvas(256, 256, (ctx, W, H) => {
    ctx.fillStyle = '#c8553d'
    ctx.fillRect(0, 0, W, H)
    const linhas = 8
    for (let r = 0; r < linhas; r++) {
      const y = (r / linhas) * H
      for (let k = 0; k < 8; k++) {
        const x = (k / 8) * W + (r % 2) * (W / 16)
        ctx.fillStyle = ['#d8673f', '#b94a36', '#cf5b3a', '#e07a4a'][(r * 3 + k) % 4]
        ctx.beginPath()
        ctx.ellipse(x + W / 16, y + H / linhas * 0.55, W / 17, H / linhas * 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(60,20,20,0.35)'
      ctx.fillRect(0, y, W, 3)
    }
  })
}

function texturaToldo(c1, c2) {
  return texturaCanvas(128, 64, (ctx, W, H) => {
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? c1 : c2
      ctx.fillRect((i / 8) * W, 0, W / 8, H)
    }
    // babado da borda
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    for (let i = 0; i < 16; i++) {
      ctx.beginPath()
      ctx.arc((i + 0.5) * (W / 16), H, W / 32, Math.PI, 0)
      ctx.fill()
    }
  })
}

// Letreiros pintados à mão: um atlas com todos os nomes, 2 colunas x 8 linhas.
function atlasLetreiros() {
  const tex = texturaCanvas(1024, 1024, (ctx, W, H) => {
    const cw = W / 2
    const ch = H / 8
    NOMES.forEach((nome, i) => {
      const x = (i % 2) * cw
      const y = Math.floor(i / 2) * ch
      const fundo = FUNDOS[i % FUNDOS.length]
      ctx.fillStyle = fundo
      ctx.fillRect(x, y, cw, ch)
      ctx.strokeStyle = '#3b2a22'
      ctx.lineWidth = 8
      ctx.strokeRect(x + 6, y + 6, cw - 12, ch - 12)
      const claro = ['#e7d3a3', '#f4eee2', '#efe6d2', '#c9963f'].includes(fundo)
      ctx.fillStyle = claro ? '#3b2a22' : '#f4eee2'
      ctx.save()
      ctx.translate(x + cw / 2, y + ch / 2 + 4)
      ctx.rotate((((i * 37) % 7) - 3) * 0.006)
      let tam = 76
      ctx.font = `900 ${tam}px Impact, "Arial Black", sans-serif`
      while (ctx.measureText(nome).width > cw - 60 && tam > 30) {
        tam -= 4
        ctx.font = `900 ${tam}px Impact, "Arial Black", sans-serif`
      }
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(nome, 0, 0)
      ctx.restore()
    })
  }, { repetir: false })
  return tex
}

function geometriaLetreiro(i) {
  const g = new THREE.PlaneGeometry(1, 1)
  const uv = g.attributes.uv
  const col = i % 2
  const lin = Math.floor(i / 2)
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, (col + uv.getX(k)) / 2, 1 - (lin + 1 - uv.getY(k)) / 8)
  }
  return g
}

export function criarFachadas(cena, predios) {
  const tmp = new THREE.Vector4()

  const cornija = new Lista(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), toon('#f3ede0'), 'cornijas')
  const friso = new Lista(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), toon('#f3ede0'), 'frisos')
  const telhado = new Lista(geometriaTelhado(), pintar(new THREE.MeshToonMaterial({ map: (() => { const t = texturaTelha(); t.repeat.set(2, 3); return t })(), gradientMap: gradienteToon() }), 'toon-pintado'), 'telhados')
  const cores = [['#a8432e', '#efe6d2'], ['#5e8a6e', '#efe6d2'], ['#c9963f', '#efe6d2'], ['#4f7c9a', '#efe6d2'], ['#8a5a3c', '#e7d3a3']]
  const geoToldo = new THREE.BoxGeometry(1, 0.06, 1).translate(0, 0, 0.5).rotateX(0.38)
  const toldos = cores.map(([a, b], i) => new Lista(geoToldo, toon('#ffffff', { map: texturaToldo(a, b) }), `toldos-${i}`))
  const atlas = atlasLetreiros()
  const matLetreiro = toon('#ffffff', { map: atlas })
  const letreiros = NOMES.map((_, i) => new Lista(geometriaLetreiro(i), matLetreiro, `letreiro-${i}`))
  const varanda = new Lista(new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5), toon('#f4f1ea'), 'varandas')
  const vidroVaranda = new Lista(new THREE.BoxGeometry(1, 1, 0.05).translate(0, 0.5, 0), toon('#6b6258'), 'guarda-corpos')
  const arCond = new Lista(new THREE.BoxGeometry(0.85, 0.55, 0.5).translate(0, 0, 0.25), toon('#e8e6df'), 'ar-condicionado')
  const geoAntena = (() => {
    const haste = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4).translate(0, 1.1, 0)
    const b1 = new THREE.BoxGeometry(1.2, 0.04, 0.04).translate(0, 1.8, 0)
    const b2 = new THREE.BoxGeometry(0.8, 0.04, 0.04).translate(0, 2.1, 0)
    return [haste, b1, b2].reduce((acc, x) => acc.concat([x.toNonIndexed()]), [])
  })()
  const antenas = geoAntena.map((g, i) => new Lista(g, toon('#3a3550'), `antena-${i}`))

  for (const it of predios) {
    if (it.detalhado) continue // casa de 1932 com fachada própria (quarteirao.js)
    const topo = it.y + it.h
    const cs = Math.cos(it.rot)
    const sn = Math.sin(it.rot)

    if (it.tipo === 'casario' || it.tipo === 'orla') {
      // cornija no topo, um pouco mais larga que a caixa
      // cornija logo ABAIXO da beira do telhado. Se o topo dela coincidir com o topo do prédio,
      // as duas superfícies disputam o mesmo lugar e o telhado "pisca" quando a câmera mexe.
      cornija.add(it.x, topo - 0.45, it.z, it.rot, it.w + 0.35, 0.38, it.d + 0.35)
    }

    if (it.tipo === 'casario') {
      const loja = 3.4
      friso.add(it.x, it.y + loja, it.z, it.rot, it.w + 0.14, 0.2, it.d + 0.14)
      if (rnd.chance(0.45)) {
        const altTelhado = Math.min(it.w, it.d) * rnd.entre(0.28, 0.38)
        const ladoX = it.w >= it.d
        telhado.add(it.x, topo, it.z, it.rot + (ladoX ? 0 : Math.PI / 2), (ladoX ? it.w : it.d) + 0.6, altTelhado, (ladoX ? it.d : it.w) + 0.6)
      }
      if (it.frente && rnd.chance(0.75)) {
        const larg = larguraFachada(it, it.frente)
        // toldo
        if (rnd.chance(0.65)) {
          naFachada(it, it.frente, 0, loja - 0.45, 0.02, tmp)
          rnd.escolha(toldos).add(tmp.x, tmp.y, tmp.z, tmp.w, larg * 0.86, 1, 1.4)
        }
        // letreiro acima da porta, colado na parede
        naFachada(it, it.frente, 0, loja + 0.55, 0.03, tmp)
        rnd.escolha(letreiros).add(tmp.x, tmp.y, tmp.z, tmp.w, Math.min(larg * 0.82, 4.2), 0.85, 1)
      }
    }

    if (it.tipo === 'orla') {
      // varandas na fachada que dá para o mar
      if (it.frente && rnd.chance(0.8)) {
        const util = it.h - 4 - 0.7 // mesma conta do shader de janelas
        const andares = Math.max(1, Math.floor(util / 3))
        const cel = util / andares
        const larg = larguraFachada(it, it.frente) * 0.9
        for (let k = 1; k < andares; k++) {
          const y = 4 + k * cel - 0.12
          if (it.y + y < it.chao + 3) continue
          naFachada(it, it.frente, 0, y, 0, tmp)
          varanda.add(tmp.x, tmp.y, tmp.z, tmp.w, larg, 0.18, 1.3)
          naFachada(it, it.frente, 0, y + 0.09, 1.25, tmp)
          vidroVaranda.add(tmp.x, tmp.y, tmp.z, tmp.w, larg, 1, 1)
        }
      }
      if (it.frente) {
        naFachada(it, it.frente, 0, 4 - 0.4, 0.02, tmp)
        rnd.escolha(toldos).add(tmp.x, tmp.y, tmp.z, tmp.w, larguraFachada(it, it.frente) * 0.7, 1, 2.2)
      }
    }

    if (it.tipo === 'casario' || it.tipo === 'favela') {
      // ar-condicionado pendurado numa parede qualquer
      const n = it.tipo === 'favela' ? (rnd.chance(0.35) ? 1 : 0) : Math.floor(rnd.entre(0, 3))
      for (let k = 0; k < n; k++) {
        const lados = [[0, -1], [0, 1], [-1, 0], [1, 0]]
        const f = rnd.escolha(lados)
        const larg = larguraFachada(it, f)
        const yMin = Math.max(it.chao - it.y + 2.4, it.tipo === 'casario' ? 4.2 : 1.6)
        const yMax = it.h - 1.2
        if (yMax <= yMin) continue
        naFachada(it, f, rnd.entre(-larg / 2 + 0.6, larg / 2 - 0.6), rnd.entre(yMin, yMax), 0, tmp)
        arCond.add(tmp.x, tmp.y, tmp.z, tmp.w)
      }
      if (rnd.chance(it.tipo === 'favela' ? 0.25 : 0.35)) {
        const yaw = rnd.entre(0, Math.PI)
        const ox = rnd.entre(-0.3, 0.3) * it.w
        const oz = rnd.entre(-0.3, 0.3) * it.d
        for (const a of antenas) a.add(it.x + ox * cs + oz * sn, topo, it.z - ox * sn + oz * cs, yaw)
      }
    }
  }

  cornija.criar(cena)
  friso.criar(cena)
  telhado.criar(cena, { solido: true })
  toldos.forEach((t) => t.criar(cena))
  letreiros.forEach((l) => l.criar(cena, { sombra: false }))
  varanda.criar(cena)
  vidroVaranda.criar(cena)
  arCond.criar(cena)
  antenas.forEach((a) => a.criar(cena))
}
