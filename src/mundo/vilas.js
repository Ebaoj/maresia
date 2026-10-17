// Vilas de jangadeiros de 1932 (Pirambu, Praia do Peixe, Mucuripe). Refeito em 16/10/2026 a partir
// das fotos (docs/referencias-fotos-1932.md, seção "Vila de jangadeiros"):
// - Platt 1935, ids 2987 e 3019: casebre de PALHA também nas paredes (trançado de folha de
//   coqueiro), cobertura grossa de quatro águas ou de duas, beiral baixo quase na altura da porta;
//   uma ou outra casa de tábuas; cerca de varas finas e tortas marcando o quintal; coqueiro
//   pequeno plantado no quintal; coqueiral alto e denso em volta; espaçamento irregular.
// - Nirez, "as antigas casinhas de pescadores na Praia do Peixe": casas baixas em grupos soltos,
//   areia aberta na frente, coqueiral atrás.
// - Subúrbio de Fortaleza, 1907: taipa sem reboco com a trama de varas à mostra.
// Onde a planta de 1931-32 já registra lotes (a Praia de Iracema dos chalés), não entra palha.

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { linhaCosta, larguraPraia, rioX, RIO_MEIA_LARGURA } from './mapa.js'
import { alturaTerreno } from './terreno.js'
import { texturizar, toonVertice } from '../materiais.js'
import { adicionarCaixa } from './colisao.js'
import { ocupacao } from './ocupacao.js'
import { instanciarEmBlocos } from './blocos.js'
import { trechosJogo, VILAS, densidadeLotes } from './fortaleza1932.js'
import { criarAleatorio } from '../utils.js'
import { CAL } from '../paleta.js'

const rnd = criarAleatorio(1881)

// coqueiros das vilas: preenchido por criarVilas, lido por criarCoqueiros (vegetacao.js)
export const coqueirosDasVilas = []

const cor = new THREE.Color()

// pinta a geometria; fn(cor, x, y, z, i) muda a cor de cada vértice
function pintarGeo(geo, hex, fn = null) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g.attributes.uv) g.deleteAttribute('uv')
  const p = g.attributes.position
  const a = new Float32Array(p.count * 3)
  for (let i = 0; i < p.count; i++) {
    cor.set(hex)
    if (fn) fn(cor, p.getX(i), p.getY(i), p.getZ(i), i)
    a[i * 3] = cor.r; a[i * 3 + 1] = cor.g; a[i * 3 + 2] = cor.b
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}

const caixa = (w, h, d, x, y, z, hex, k = 1) => pintarGeo(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex, (c) => c.multiplyScalar(k))

// Uma parede feita de painéis verticais lado a lado (folhas trançadas, tábuas ou panos de taipa),
// cada um com seu tom; os vãos (porta, janela) são painéis que faltam.
// A parede corre em x de -L/2 a L/2, em z = 0, de y = 0 a h; vaos: [{x0, x1, y0, y1}]
function parede(L, h, tipo, vaos, partes) {
  const larg = { palha: 0.62, taboa: 0.24, taipa: 1.1 }[tipo]
  const base = { palha: '#bba881', taboa: '#9d9483', taipa: CAL.taipa }[tipo]
  const n = Math.max(1, Math.round(L / larg))
  const lw = L / n
  for (let i = 0; i < n; i++) {
    const x0 = -L / 2 + i * lw
    const x1 = x0 + lw
    const k = 0.84 + rnd.proximo() * 0.26
    const topo = h + (tipo === 'palha' ? rnd.entre(-0.06, 0.08) : 0)
    // trechos de altura sem vão neste painel
    let cortes = [[0, topo]]
    for (const v of vaos) {
      if (x1 <= v.x0 + 0.02 || x0 >= v.x1 - 0.02) continue
      cortes = cortes.flatMap(([a, b]) => [[a, Math.min(b, v.y0)], [Math.max(a, v.y1), b]]).filter(([a, b]) => b - a > 0.04)
    }
    const dz = tipo === 'taboa' ? 0 : rnd.entre(-0.02, 0.02)
    for (const [a, b] of cortes) {
      const fiadas = tipo === 'palha' ? Math.max(1, Math.round((b - a) / 0.11)) : 1
      const g = new THREE.BoxGeometry(lw - (tipo === 'taboa' ? 0.015 : 0), b - a, 0.07, 1, fiadas, 1).translate((x0 + x1) / 2, (a + b) / 2, dz).toNonIndexed()
      const P = g.attributes.position
      partes.push(pintarGeo(g, base, (c, _x, y, _z, iv) => {
        c.multiplyScalar(k * (0.86 + 0.14 * Math.min(1, y / 0.6))) // barra de areia e respingo embaixo
        if (fiadas > 1) {
          // trançado: cada fiada de folha num tom (pelo centro do triângulo)
          const t = iv - (iv % 3)
          const yc = (P.getY(t) + P.getY(t + 1) + P.getY(t + 2)) / 3
          c.multiplyScalar(Math.floor(yc / 0.11 + (i % 2) * 0.5) % 2 ? 0.94 : 1.03)
        }
      }))
    }
  }
  // ripas horizontais segurando a palha; na taipa, a trama de varas aparecendo
  if (tipo === 'palha') for (const y of [0.45, h * 0.62]) partes.push(caixa(L, 0.045, 0.05, 0, y + rnd.entre(-0.05, 0.05), 0.05, '#6b5638'))
  if (tipo === 'taipa') {
    for (let y = 0.35; y < h; y += 0.32) partes.push(caixa(L, 0.035, 0.03, 0, y, 0.045, '#7a5638'))
    for (let x = -L / 2 + 0.3; x < L / 2; x += 0.55) partes.push(caixa(0.035, h, 0.03, x, h / 2, 0.05, '#7a5638'))
  }
}

// cobertura de palha: superfície subdividida em colunas (as folhas descem pela água do telhado,
// cada coluna de um tom), bojo de palha grossa, franja irregular na beira
function cobertura(w, d, alto, beiral, quatroAguas, hex, partes) {
  const W = w / 2 + beiral
  const D = d / 2 + beiral
  const r = quatroAguas ? Math.max(0, (w - d) / 2) : W
  const pos = []
  const cores = []
  const base = new THREE.Color(hex)
  const nv = 5 // fiadas de palha, cada uma cobrindo a ponta da de cima
  // lip = 1 na beira de baixo de cada fiada (o feixe estufado), 0 no alto dela
  const ponto = (A, B, C, E, u, v, lip) => {
    const p = new THREE.Vector3().lerpVectors(A, B, u).lerp(new THREE.Vector3().lerpVectors(E, C, u), v)
    p.y += 0.16 * Math.sin(Math.PI * Math.min(1, v * 1.15)) * (0.6 + 0.4 * Math.sin(Math.PI * u)) // palha estufada
    p.y += 0.05 * lip * (1 - v * 0.5) // degrau leve de cada fiada
    return p
  }
  // A, B na beira; E, C no cume (E acima de A)
  const agua = (A, B, C, E) => {
    const comp = A.distanceTo(B)
    const nu = Math.max(3, Math.round(comp / 0.28))
    let quedaAnt = null // a franja é contínua: cada coluna começa onde a anterior terminou
    for (let i = 0; i < nu; i++) {
      const tom = 0.74 + rnd.proximo() * 0.38
      // as fiadas não são retas: cada coluna tem as divisas um pouco acima ou abaixo
      const vs = [0]
      for (let j = 1; j < nv; j++) vs.push(Math.min(0.97, Math.max(0.03, j / nv + rnd.entre(-0.07, 0.07))))
      vs.push(1)
      for (let j = 0; j < nv; j++) {
        const q = [ponto(A, B, C, E, i / nu, vs[j], 1), ponto(A, B, C, E, (i + 1) / nu, vs[j], 1), ponto(A, B, C, E, (i + 1) / nu, vs[j + 1], 0), ponto(A, B, C, E, i / nu, vs[j + 1], 0)]
        const kq = tom * (0.8 + 0.2 * (j / nv)) * (0.9 + rnd.proximo() * 0.2) // a beira é mais velha e escura
        const lips = [1, 1, 0, 1, 0, 0]
        ;[0, 1, 2, 0, 2, 3].forEach((t, n) => {
          const k = kq * (0.86 + 0.14 * lips[n]) // sombra leve logo abaixo do feixe da fiada de cima
          pos.push(q[t].x, q[t].y, q[t].z)
          cores.push(base.r * k, base.g * k, base.b * k)
        })
      }
      // franja: palha pendurada na beira, grossa e de comprimento desigual
      const a = ponto(A, B, C, E, i / nu, 0, 1)
      const b = ponto(A, B, C, E, (i + 1) / nu, 0, 1)
      const qa = quedaAnt ?? rnd.entre(0.12, 0.36)
      const queda = rnd.entre(0.12, 0.36)
      quedaAnt = queda
      const k = tom * 0.66
      for (const p of [a, b, [b.x, b.y - queda, b.z], a, [b.x, b.y - queda, b.z], [a.x, a.y - qa, a.z]]) {
        pos.push(p.x ?? p[0], p.y ?? p[1], p.z ?? p[2])
        cores.push(base.r * k, base.g * k, base.b * k)
      }
    }
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z)
  agua(V(-W, 0, D), V(W, 0, D), V(r, alto, 0), V(-r, alto, 0))
  agua(V(W, 0, -D), V(-W, 0, -D), V(-r, alto, 0), V(r, alto, 0))
  if (quatroAguas) {
    agua(V(W, 0, D), V(W, 0, -D), V(r, alto, 0), V(r, alto, 0))
    agua(V(-W, 0, -D), V(-W, 0, D), V(-r, alto, 0), V(-r, alto, 0))
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3))
  g.computeVertexNormals()
  partes.push(g)
  // cumeeira: o feixe de palha amarrado em cima
  const L = Math.max(0.5, 2 * r + 0.3)
  partes.push(pintarGeo(new THREE.CylinderGeometry(0.15, 0.15, L, 6).rotateZ(Math.PI / 2).translate(0, alto + 0.08, 0), hex, (c) => c.multiplyScalar(0.62)))
}

// um casebre: paredes, vãos, interior escuro, esteios nos cantos e a cobertura
function casebre({ w, d, h, tipo, quatroAguas, alto, beiral, palhaHex, janela, portaX }) {
  const partes = []
  const porta = { x0: portaX - 0.42, x1: portaX + 0.42, y0: 0, y1: Math.min(h - 0.1, 1.7) }
  const vaosFrente = [porta]
  if (janela) vaosFrente.push({ x0: -portaX - 0.32, x1: -portaX + 0.32, y0: 0.95, y1: 1.5 })
  const lado = (L, vaos, ang, dist) => {
    const p = []
    parede(L, h, tipo, vaos, p)
    const g = mergeGeometries(p)
    g.rotateY(ang)
    g.translate(Math.sin(ang) * dist, 0, Math.cos(ang) * dist)
    partes.push(g)
  }
  lado(w, vaosFrente, 0, d / 2) // frente (z+), virada para o mar
  lado(w, rnd.chance(0.5) ? [{ x0: 0.2, x1: 0.8, y0: 1.0, y1: 1.45 }] : [], Math.PI, d / 2)
  lado(d, [], Math.PI / 2, w / 2)
  lado(d, [], -Math.PI / 2, w / 2)
  // escuro de dentro: é o que se vê pela porta e pela janela
  partes.push(caixa(w - 0.2, h - 0.05, d - 0.2, 0, h / 2, 0, '#2a1f19'))
  // esteios de madeira roliça nos cantos
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    partes.push(pintarGeo(new THREE.CylinderGeometry(0.06, 0.07, h + 0.25, 5).translate(sx * (w / 2 + 0.02), (h + 0.25) / 2, sz * (d / 2 + 0.02)), '#6b5638'))
  }
  // empenas: no telhado de duas águas o triângulo é fechado com o mesmo material da parede
  const y0 = h - alto * (beiral / (d / 2 + beiral)) // a água passa pela linha do topo da parede
  if (!quatroAguas) {
    const topo = y0 + alto
    for (const sx of [-1, 1]) {
      const tri = new THREE.BufferGeometry()
      const x = sx * w / 2
      tri.setAttribute('position', new THREE.Float32BufferAttribute([x, h, d / 2, x, h, -d / 2, x, topo, 0, x, h, -d / 2, x, h, d / 2, x, topo, 0], 3))
      tri.computeVertexNormals()
      partes.push(pintarGeo(tri, tipo === 'palha' ? '#bba881' : tipo === 'taboa' ? '#9d9483' : CAL.taipa, (c) => c.multiplyScalar(0.9)))
    }
  }
  const tel = []
  cobertura(w, d, alto, beiral, quatroAguas, palhaHex, tel)
  partes.push(mergeGeometries(tel).translate(0, y0, 0))
  return mergeGeometries(partes)
}

// tipos de casa: a maioria toda de palha (fotos de 1935), algumas de tábuas e de taipa
function sortearTipos() {
  const tipos = []
  const receitas = [
    { tipo: 'palha', quatroAguas: true }, { tipo: 'palha', quatroAguas: true }, { tipo: 'palha', quatroAguas: false },
    { tipo: 'palha', quatroAguas: false }, { tipo: 'palha', quatroAguas: true }, { tipo: 'taboa', quatroAguas: false },
    { tipo: 'taipa', quatroAguas: false }, { tipo: 'palha', quatroAguas: true }, { tipo: 'taipa', quatroAguas: true },
  ]
  for (const r of receitas) {
    const comprida = !r.quatroAguas && rnd.chance(0.6)
    const w = comprida ? rnd.entre(5.5, 7.5) : rnd.entre(3.6, 5.0)
    const d = rnd.entre(3.0, 3.9)
    const opc = {
      ...r, w, d,
      h: rnd.entre(1.75, 2.05),
      alto: rnd.entre(1.5, 2.0), // palha precisa de caimento forte
      beiral: rnd.entre(0.4, 0.6),
      palhaHex: rnd.escolha(['#9a8a66', '#a38f63', '#8f8264', '#b09a68']), // palha velha acinzentada
      janela: rnd.chance(0.6),
      portaX: rnd.entre(-0.25, 0.25) * w,
    }
    tipos.push({ geo: casebre(opc), w, d, mats: [] })
  }
  return tipos
}

// cerca de varas: geometria de uma vara com 1 m de altura, instanciada e esticada
function geometriaVara() {
  return pintarGeo(new THREE.CylinderGeometry(0.03, 0.045, 1, 4).translate(0, 0.5, 0), '#7d6a52', (c, x, y) => c.multiplyScalar(0.8 + 0.25 * y))
}
function geometriaTravessa() {
  return pintarGeo(new THREE.CylinderGeometry(0.022, 0.022, 1, 4).rotateZ(Math.PI / 2), '#6e5d48')
}

export function criarVilas(cena) {
  const tipos = sortearTipos()
  const casas = [] // para o mapa (tecla M)
  const varas = []
  const travessas = []
  const Y = new THREE.Vector3(0, 1, 0)
  const q = new THREE.Quaternion()
  const e = new THREE.Euler()
  const m = new THREE.Matrix4()

  // cerca de um lado: de (ax, az) a (bx, bz), varas a cada ~0,7 m, uma travessa às vezes
  const cerca = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az)
    const n = Math.max(2, Math.round(L / rnd.entre(0.6, 0.85)))
    const ang = Math.atan2(bz - az, bx - ax)
    for (let i = 0; i <= n; i++) {
      if (rnd.chance(0.06)) continue // vara caída
      const x = ax + ((bx - ax) * i) / n + rnd.entre(-0.06, 0.06)
      const z = az + ((bz - az) * i) / n + rnd.entre(-0.06, 0.06)
      const alt = rnd.entre(0.9, 1.45)
      e.set(rnd.entre(-0.1, 0.1), rnd.entre(0, 6.28), rnd.entre(-0.1, 0.1))
      m.compose(new THREE.Vector3(x, alturaTerreno(x, z) - 0.05, z), q.setFromEuler(e), new THREE.Vector3(1, alt, 1))
      varas.push(m.clone())
    }
    if (rnd.chance(0.55)) {
      const cx = (ax + bx) / 2
      const cz = (az + bz) / 2
      m.compose(new THREE.Vector3(cx, alturaTerreno(cx, cz) + rnd.entre(0.55, 0.8), cz), q.setFromAxisAngle(Y, -ang), new THREE.Vector3(L, 1, 1))
      travessas.push(m.clone())
    }
    adicionarCaixa((ax + bx) / 2, (az + bz) / 2, L / 2, 0.06, -ang)
  }

  const podeCasa = (x, z) => {
    const s = z - linhaCosta(x)
    if (s < larguraPraia(x) * 0.8) return false // não na areia molhada
    if (densidadeLotes(x, z) > 0.08) return false // ali a planta de 1932 já tem lote de cidade
    if (Math.abs(x - rioX(z)) < RIO_MEIA_LARGURA * 2.5) return false
    return true
  }
  const coqueiro = (x, z, escala, noQuintal = false) => coqueirosDasVilas.push({ x, z, escala, noQuintal })

  for (const vila of VILAS) {
    const [a, b] = trechosJogo[vila]
    // grupos soltos de casas (como na foto do Nirez), em profundidades diferentes atrás da praia
    for (let gx = a + rnd.entre(0, 12); gx < b; gx += rnd.entre(20, 36)) {
      const grupos = rnd.chance(0.55) ? 2 : 1
      for (let gi = 0; gi < grupos; gi++) {
        const bw = larguraPraia(gx)
        const s0 = bw + rnd.entre(-2, 18) + gi * rnd.entre(22, 34)
        const n = 2 + Math.floor(rnd.proximo() * 4)
        for (let k = 0; k < n; k++) {
          for (let tent = 0; tent < 6; tent++) {
            const x = gx + rnd.entre(-13, 13)
            const z = linhaCosta(x) + s0 + rnd.entre(-9, 9)
            if (!podeCasa(x, z)) continue
            const t = rnd.escolha(tipos)
            const tangente = Math.atan2(linhaCosta(x + 1) - linhaCosta(x - 1), 2)
            let rot = -tangente + Math.PI + rnd.entre(-0.55, 0.55) // porta mais ou menos para o mar
            if (rnd.chance(0.15)) rot += rnd.chance(0.5) ? Math.PI / 2 : -Math.PI / 2
            if (!ocupacao.livre(x, z, t.w / 2 + 1.2, t.d / 2 + 1.2, rot)) continue
            ocupacao.marcar(x, z, t.w / 2 + 0.7, t.d / 2 + 0.7, rot)
            adicionarCaixa(x, z, t.w / 2 + 0.15, t.d / 2 + 0.15, rot)
            const y = Math.min(alturaTerreno(x - 1, z), alturaTerreno(x + 1, z), alturaTerreno(x, z)) - 0.1
            casas.push({ x, z, rot, w: t.w, d: t.d })
            t.mats.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, rot), new THREE.Vector3(1, 1, 1)))
            // eixos da casa no mundo: frente (para o mar) e lado
            const fx = Math.sin(rot)
            const fz = Math.cos(rot)
            const lx = Math.cos(rot)
            const lz = -Math.sin(rot)
            const local = (u, v) => [x + lx * u + fx * v, z + lz * u + fz * v]
            // quintal cercado atrás ou ao lado (fotos 2987 e 3019), com uma abertura
            if (rnd.chance(0.6)) {
              const qw = t.w + rnd.entre(2, 6)
              const qd = rnd.entre(5, 9)
              const qu = rnd.entre(-1.5, 1.5)
              const [cx, cz] = local(qu, -t.d / 2 - qd / 2)
              if (ocupacao.livre(cx, cz, qw / 2, qd / 2 - 0.3, rot)) {
                ocupacao.marcar(cx, cz, qw / 2, qd / 2, rot)
                const v0 = -t.d / 2
                const v1 = -t.d / 2 - qd
                const u0 = qu - qw / 2
                const u1 = qu + qw / 2
                const portao = rnd.entre(0.2, 0.8)
                cerca(...local(u0, v0), ...local(u0, v1))
                cerca(...local(u1, v1), ...local(u1, v0))
                const pm = u0 + (u1 - u0) * portao
                cerca(...local(u0, v1), ...local(pm - 0.6, v1))
                cerca(...local(pm + 0.6, v1), ...local(u1, v1))
                // coqueiro novo plantado no quintal
                if (rnd.chance(0.6)) coqueiro(...local(rnd.entre(u0 + 1, u1 - 1), rnd.entre(v1 + 1, v0 - 1)), rnd.entre(0.35, 0.6), true)
              }
            }
            break
          }
        }
        // coqueiral em volta do grupo: alto, denso, inclinado
        const nc = 6 + Math.floor(rnd.proximo() * 8)
        for (let c = 0; c < nc; c++) {
          const x = gx + rnd.entre(-22, 22)
          const z = linhaCosta(x) + s0 + rnd.entre(-6, 26)
          if (z - linhaCosta(x) < larguraPraia(x) * 0.7) continue
          coqueiro(x, z, rnd.entre(0.95, 1.4))
        }
      }
    }
    // o coqueiral contínuo atrás das vilas (Nirez, "a tranquilidade da Praia de Iracema")
    for (let x = a; x < b; x += rnd.entre(4, 9)) {
      const z = linhaCosta(x) + larguraPraia(x) + rnd.entre(30, 75)
      if (densidadeLotes(x, z) > 0.08) continue
      coqueiro(x, z, rnd.entre(1.0, 1.45))
    }
  }

  // textura pintada (visual Arcane): palha no que olha para cima (cobertura), tábua nas paredes e varas
  const mat = texturizar(toonVertice({ side: THREE.DoubleSide }), { topo: 'palha', lado: 'madeira', tam: 1.6 })
  for (const t of tipos) {
    if (!t.mats.length) continue
    instanciarEmBlocos(cena, t.geo, mat, t.mats, null, { nome: 'casas-de-palha', solido: true })
  }
  if (varas.length) instanciarEmBlocos(cena, geometriaVara(), mat, varas, null, { nome: 'cercas', sombra: true })
  if (travessas.length) instanciarEmBlocos(cena, geometriaTravessa(), mat, travessas, null, { nome: 'cercas' })
  return casas
}
