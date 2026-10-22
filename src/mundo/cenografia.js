// Cenografia de 1932 nas ruas do casario (docs/direcao-de-arte.md):
//   - lampião a gás em braço de ferro na fachada: a iluminação pública de Fortaleza em 1932 ainda
//     era a gás (documentado; a era do gás acabou em 25/10/1935); acende à noite
//   - lampião a gás de coluna de ferro nas ruas, no lugar dos postes de luz (22/10/2026, decisão do Joabe):
//     a mesma lanterna do de parede, sobre uma coluna; rua.js registra onde cada um fica
//   - cadeiras na calçada em frente às portas (o fim de tarde de Fortaleza)
// Usa os dados de fachada que quarteirao.js guarda em cada casa (it.fachada).

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { toonVertice, luzFixa } from '../materiais.js'
import { globais } from '../globais.js'
import { instanciarEmBlocos } from './blocos.js'
import { adicionarCirculo } from './colisao.js'
import { criarAleatorio } from '../utils.js'
import { ESQUADRIAS } from '../paleta.js'

export function colorir(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}

// lampião de parede: braço de ferro com voluta, caixa de vidro de 4 faces, chapéu piramidal.
// Origem na parede, braço saindo para +z.
function geometriaLampiao() {
  const ferro = '#2b2622'
  const partes = [
    colorir(new THREE.BoxGeometry(0.06, 0.06, 0.75).translate(0, 0, 0.38), ferro),
    colorir(new THREE.BoxGeometry(0.04, 0.45, 0.04).rotateX(0.75).translate(0, -0.18, 0.2), ferro),
    colorir(new THREE.BoxGeometry(0.16, 0.22, 0.04).translate(0, 0, 0.02), ferro), // chapa na parede
    colorir(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 5).translate(0, -0.09, 0.75), ferro),
    colorir(new THREE.CylinderGeometry(0.17, 0.12, 0.05, 4).rotateY(Math.PI / 4).translate(0, -0.2, 0.75), ferro),
    colorir(new THREE.CylinderGeometry(0.1, 0.07, 0.06, 4).rotateY(Math.PI / 4).translate(0, -0.63, 0.75), ferro),
    colorir(new THREE.ConeGeometry(0.22, 0.2, 4).rotateY(Math.PI / 4).translate(0, -0.12, 0.75), ferro),
  ]
  // quinas da caixa de vidro
  for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
    partes.push(colorir(new THREE.BoxGeometry(0.02, 0.4, 0.02).translate(x * 1.05, -0.42, 0.75 + z * 1.05), ferro))
  }
  return mergeGeometries(partes)
}

// lampião a gás de coluna: a mesma lanterna do de parede (chapéu, aros, quinas), sem o braço, no alto de
// uma coluna de ferro fundido com pedestal. Origem no chão; o vidro fica em VIDRO_COLUNA.
export const ALTURA_LAMPIAO_COLUNA = 3.4 // o alto do chapéu da lanterna
export const VIDRO_COLUNA = ALTURA_LAMPIAO_COLUNA - 0.42 // o centro do vidro (onde a luz nasce)
export function geometriaLampiaoColuna() {
  const ferro = '#2b2622'
  const H = ALTURA_LAMPIAO_COLUNA
  const partes = [
    colorir(new THREE.CylinderGeometry(0.15, 0.2, 0.4, 8).translate(0, 0.2, 0), ferro), // pedestal
    colorir(new THREE.CylinderGeometry(0.09, 0.13, 0.12, 8).translate(0, 0.46, 0), ferro),
    colorir(new THREE.CylinderGeometry(0.045, 0.07, H - 1.2, 8).translate(0, 0.52 + (H - 1.2) / 2, 0), ferro), // fuste
    colorir(new THREE.CylinderGeometry(0.11, 0.06, 0.1, 8).translate(0, H - 0.63, 0), ferro), // capitel sob a lanterna
    // a lanterna do de parede, no eixo da coluna
    colorir(new THREE.CylinderGeometry(0.17, 0.12, 0.05, 4).rotateY(Math.PI / 4).translate(0, H - 0.2, 0), ferro),
    colorir(new THREE.CylinderGeometry(0.1, 0.07, 0.06, 4).rotateY(Math.PI / 4).translate(0, H - 0.63, 0), ferro),
    colorir(new THREE.ConeGeometry(0.22, 0.2, 4).rotateY(Math.PI / 4).translate(0, H - 0.12, 0), ferro),
    colorir(new THREE.SphereGeometry(0.035, 6, 4).translate(0, H + 0.0, 0), ferro), // pinha do chapéu
  ]
  for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) {
    partes.push(colorir(new THREE.BoxGeometry(0.02, 0.4, 0.02).translate(x * 1.05, VIDRO_COLUNA, z * 1.05), ferro))
  }
  // a escora da escada do acendedor: a travessa curta sob a lanterna
  partes.push(colorir(new THREE.BoxGeometry(0.5, 0.03, 0.03).translate(0, H - 0.85, 0), ferro))
  return mergeGeometries(partes)
}

// os lampiões de coluna das ruas (rua.js): pé no chão (x, y, z) e o giro; entram no mapa de luz
const lampioesColuna = []
export function registrarLampiaoColuna(x, y, z, yaw = 0) {
  lampioesColuna.push({ x, y, z, yaw })
}

export function geometriaCadeira(hex) {
  const madeira = new THREE.Color(hex)
  const escuro = madeira.clone().multiplyScalar(0.75).getHex()
  const partes = [colorir(new THREE.BoxGeometry(0.44, 0.04, 0.42).translate(0, 0.45, 0), hex)]
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    partes.push(colorir(new THREE.BoxGeometry(0.04, 0.45, 0.04).translate(x, 0.225, z), escuro))
  }
  for (const x of [-0.19, 0.19]) partes.push(colorir(new THREE.BoxGeometry(0.04, 0.5, 0.04).translate(x, 0.72, -0.19), escuro))
  for (const y of [0.62, 0.8, 0.94]) partes.push(colorir(new THREE.BoxGeometry(0.42, 0.06, 0.025).translate(0, y, -0.2), hex))
  return mergeGeometries(partes)
}

// metros por pixel do mapa de luz para uma caixa de largura x altura (m): 0,5, ou mais grosso se a
// textura passar de MAX_PIXELS_LUZ (testes/unidade/mapa-de-luz.test.js)
export const MAX_PIXELS_LUZ = 8e6
export function resolucaoMapaDeLuz(largura, altura) {
  return Math.max(0.5, Math.sqrt((largura * altura) / MAX_PIXELS_LUZ))
}

// Mapa da luz dos lampiões visto de cima, 0,5 m por pixel: cada lampião espalha uma poça que cai
// com a distância. Os materiais toon (pintar) somam essa luz à noite. G guarda a altura do lampião.
function mapaDeLuz(lampioes) {
  if (!lampioes.length) return
  const pos = lampioes.map((m) => new THREE.Vector3().setFromMatrixPosition(m))
  const R = 6.5
  const min = new THREE.Vector2(Math.min(...pos.map((p) => p.x)) - R, Math.min(...pos.map((p) => p.z)) - R)
  const max = new THREE.Vector2(Math.max(...pos.map((p) => p.x)) + R, Math.max(...pos.map((p) => p.z)) + R)
  // 0,5 m por pixel, a não ser que a caixa dos lampiões fique grande demais: a textura (RGBA float,
  // 16 bytes por pixel) passa do limite de buffer do WebGPU (256 MB) quando o mundo cresce (o Campo do
  // Urubu em tamanho real levou a caixa a 18 milhões de pixels, 290 MB). Teto de 8 milhões de pixels.
  const RES = resolucaoMapaDeLuz(max.x - min.x, max.y - min.y)
  const W = Math.ceil((max.x - min.x) / RES)
  const H = Math.ceil((max.y - min.y) / RES)
  const dados = new Float32Array(W * H * 4)
  for (const p of pos) {
    const i0 = Math.floor((p.x - R - min.x) / RES)
    const j0 = Math.floor((p.z - R - min.y) / RES)
    for (let j = j0; j <= j0 + (2 * R) / RES; j++) {
      for (let i = i0; i <= i0 + (2 * R) / RES; i++) {
        if (i < 0 || j < 0 || i >= W || j >= H) continue
        const d = Math.hypot(min.x + (i + 0.5) * RES - p.x, min.y + (j + 0.5) * RES - p.z)
        const v = Math.pow(Math.max(0, 1 - d / R), 2)
        const k = (j * W + i) * 4
        if (v > dados[k]) dados[k + 1] = p.y
        dados[k] = Math.min(1.2, dados[k] + v)
      }
    }
  }
  const tex = new THREE.DataTexture(dados, W, H, THREE.RGBAFormat, THREE.FloatType)
  tex.minFilter = tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  globais.tLampioes.value = tex
  globais.uLampMin.value.copy(min)
  globais.uLampTam.value.set(W * RES, H * RES)
}

// Lampiões dos marcos de 1932 (Passeio Público, Estação, Sé: obra1932.js): entram no mesmo mapa de luz
// dos lampiões de parede. Precisam ser registrados antes de criarCenografia (main.js cria os marcos antes).
const lampioesExtras = []
export function registrarLampiao(x, y, z) {
  lampioesExtras.push(new THREE.Matrix4().makeTranslation(x, y, z))
}

// lanternasExtras: as lanternas dos marcos do centro (marcos1932/mobiliario.js), no mesmo mapa de luz
export function criarCenografia(cena, casas, lanternasExtras = []) {
  const rnd = criarAleatorio(1881)
  const lampioes = []
  const vidros = []
  const cadeiras = ESQUADRIAS.slice(0, 3).map(() => [])
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  const um = new THREE.Vector3(1, 1, 1)
  let n = 0
  for (const it of casas) {
    const f = it.fachada
    if (!f || f.simples) continue
    const c = Math.cos(f.ang)
    const s = Math.sin(f.ang)
    // local (x, z) da casa -> mundo
    const mundo = (lx, lz) => [it.x + lx * c + lz * s, it.z - lx * s + lz * c]
    const zf = f.D / 2

    // lampião a cada ~3 casas, na quina da fachada
    if (n++ % 3 === 0) {
      const lx = (rnd.chance(0.5) ? 1 : -1) * (f.F / 2 - 0.45)
      const [x, z] = mundo(lx, zf)
      const y = f.chao + f.calcada + (f.sobrado ? 3.55 : 3.25)
      q.setFromAxisAngle(Y, f.ang)
      lampioes.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, um))
      const [vx, vz] = mundo(lx, zf + 0.75)
      vidros.push(new THREE.Matrix4().compose(new THREE.Vector3(vx, y - 0.42, vz), q, um))
    }

    // cadeiras na calçada ao lado da porta, viradas um pouco para a rua
    if (!f.sobrado && rnd.chance(0.3)) {
      const qtd = rnd.chance(0.4) ? 2 : 1
      for (let k = 0; k < qtd; k++) {
        const lado = k === 0 ? (rnd.chance(0.5) ? 1 : -1) : -1
        const lx = f.portaX + lado * rnd.entre(0.95, 1.4)
        if (Math.abs(lx) > f.F / 2 - 0.3) continue
        const [x, z] = mundo(lx, zf + rnd.entre(0.45, 0.75))
        q.setFromAxisAngle(Y, f.ang + rnd.entre(-0.5, 0.5) + (rnd.chance(0.15) ? Math.PI / 2 : 0))
        cadeiras[Math.floor(rnd.entre(0, cadeiras.length))].push(new THREE.Matrix4().compose(new THREE.Vector3(x, f.chao + f.calcada, z), q, um))
        adicionarCirculo(x, z, 0.28)
      }
    }
  }

  const matPeca = toonVertice()
  instanciarEmBlocos(cena, geometriaLampiao(), matPeca, lampioes, null, { nome: 'lampioes' })
  // vidro do lampião: claro e apagado de dia, quente à noite (vira brilho em pontos no filtro)
  const matVidro = luzFixa(new THREE.MeshBasicMaterial({ color: '#e8e0c8', transparent: false }), 1, globais.uNoite)
  const geoVidro = new THREE.BoxGeometry(0.19, 0.38, 0.19)
  instanciarEmBlocos(cena, geoVidro, matVidro, vidros, null, { nome: 'lampioes-vidro', sombra: false })
  // os de coluna das ruas: o ferro, o vidro (o mesmo material, acende junto) e o ponto de luz no vidro
  const colunas = lampioesColuna.map(({ x, y, z, yaw }) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(Y, yaw), um))
  const vidrosColuna = lampioesColuna.map(({ x, y, z, yaw }) => new THREE.Matrix4().compose(new THREE.Vector3(x, y + VIDRO_COLUNA, z), q.setFromAxisAngle(Y, yaw), um))
  if (colunas.length) {
    instanciarEmBlocos(cena, geometriaLampiaoColuna(), matPeca, colunas, null, { nome: 'lampioes-coluna' })
    instanciarEmBlocos(cena, geoVidro, matVidro, vidrosColuna, null, { nome: 'lampioes-coluna-vidro', sombra: false })
  }
  ESQUADRIAS.slice(0, 3).forEach((hex, i) => {
    const madeira = i === 2 ? '#8a5a3c' : hex
    instanciarEmBlocos(cena, geometriaCadeira(madeira), matPeca, cadeiras[i], null, { nome: 'cadeiras' })
  })

  mapaDeLuz([...lampioes, ...vidrosColuna, ...lanternasExtras, ...lampioesExtras])

  const apagado = new THREE.Color('#e8e0c8')
  const aceso = new THREE.Color('#ffc66a').multiplyScalar(2.4)
  return {
    atualizar() {
      matVidro.color.copy(apagado).lerp(aceso, globais.uNoite.value)
    },
  }
}
