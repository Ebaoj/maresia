// A obra dos marcos de 1932 (Sé, Estação Central, Passeio Público): o canteiro onde cada marco é
// montado peça por peça, em metros de verdade, num sistema local (x = leste da malha de Herbster,
// z = sul da malha, y = para cima, a partir do chão do marco).
//
// Cada peça vai para um "material" (uma chave: cal, cimalha, telha, ferro...). No fim, as peças de
// cada chave viram UMA malha só (mergeGeometries): um marco inteiro sai em uns dez desenhos.
// As chaves marcadas como detalhe (gradil, balaústre, estátua, lampião) ficam numa camada que some
// longe da câmera (cfg.mundo.marcosNorte.detalheAte): de longe o que lê é a silhueta.
//
// Por que material liso (toon de uma cor) e não cor por vértice: no WebGPU uma malha com o atributo
// `color` e material vertexColors às vezes some (docs/motor-f4-otimizacao-webgpu.md). Aqui só as
// chaves que reaproveitam os materiais das casas (telha e madeira, que pedem cor por vértice e já
// aparecem no WebGPU nas casas) levam o atributo.
//
// Colisão, piso (deck) e caixas da câmera também são pedidos em coordenada local e convertidos
// para o mundo aqui, num lugar só.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { adicionarCaixa, adicionarCirculo, adicionarDeck } from './colisao.js'
import { instanciarEmBlocos } from './blocos.js'
import { registrarEstatico } from '../render/sombra-estatica.js'
import { congelar } from './congelar.js'
import { ocupacao } from './ocupacao.js'
import { luzFixa, toon, texturizar } from '../materiais.js'
import { registrarLampiao } from './cenografia.js'
import { materiaisDasCasas } from './quarteirao.js'
import { globais } from '../globais.js'

// a malha de Herbster no jogo: o eixo x local (leste da malha) vai para (cos, -sen) do rotation.y
import { ROT_MALHA } from './lotes-marcos.js'
export { ROT_MALHA }

function preparar(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo
  if (g.attributes.uv) g.deleteAttribute('uv')
  if (g.attributes.uv1) g.deleteAttribute('uv1')
  if (!g.attributes.normal) g.computeVertexNormals()
  return g
}

function colorir(g, hex) {
  const c = new THREE.Color(hex)
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
  return g
}

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()

export class Obra {
  // x, z: onde fica a origem local no mundo; y0: altura do chão do marco; rot: rotation.y do marco
  constructor(nome, x, z, y0, rot = ROT_MALHA) {
    this.nome = nome
    this.x = x
    this.z = z
    this.y0 = y0
    this.rot = rot
    this.c = Math.cos(rot)
    this.s = Math.sin(rot)
    this.pecas = new Map() // chave -> [geometrias]
    this.cores = new Map() // chave -> cor (para quem pede cor por vértice)
    this.camera = [] // caixas que a câmera não atravessa
    this.lampioes = [] // [x, y, z] locais, para a luz da noite
  }

  // local (x, z) -> mundo (x, z)
  mundo(lx, lz) { return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c] }
  // mundo -> local
  local(x, z) {
    const dx = x - this.x
    const dz = z - this.z
    return [dx * this.c - dz * this.s, dx * this.s + dz * this.c]
  }

  geo(chave, g) {
    if (!this.pecas.has(chave)) this.pecas.set(chave, [])
    this.pecas.get(chave).push(preparar(g))
    return this
  }

  // caixa centrada em (x, y, z) local, com rotações opcionais
  caixa(chave, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) {
    const g = new THREE.BoxGeometry(sx, sy, sz)
    _e.set(rx, ry, rz)
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(1, 1, 1)))
    return this.geo(chave, g)
  }

  // caixa pelo pé: (x, z) do centro, y do pé
  bloco(chave, x, y, z, sx, sy, sz, ry = 0) { return this.caixa(chave, x, y + sy / 2, z, sx, sy, sz, ry) }

  cilindro(chave, x, y, z, rTopo, rPe, h, lados = 10, ry = 0) {
    const g = new THREE.CylinderGeometry(rTopo, rPe, h, lados)
    g.rotateY(ry)
    g.translate(x, y + h / 2, z)
    return this.geo(chave, g)
  }

  // uma geometria qualquer posicionada por matriz (pos, rot Euler, escala)
  posta(chave, g, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0) {
    _e.set(rx, ry, 0)
    g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.set(sx, sy, sz)))
    return this.geo(chave, g)
  }

  // sólido para o jogador: caixa local (centro, meias medidas, giro extra)
  solido(lx, lz, hx, hz, giro = 0) {
    const [x, z] = this.mundo(lx, lz)
    adicionarCaixa(x, z, hx, hz, this.rot + giro)
    return this
  }

  // reserva o chão (local) para nenhuma árvore, poste, banco ou gente de rua nascer ali
  ocupa(lx, lz, hx, hz) {
    const [x, z] = this.mundo(lx, lz)
    ocupacao.marcar(x, z, hx, hz, this.rot)
    return this
  }

  coluna(lx, lz, r) {
    const [x, z] = this.mundo(lx, lz)
    adicionarCirculo(x, z, r)
    return this
  }

  // piso em que se anda, a uma altura local y
  piso(lx, lz, hx, hz, y, giro = 0) {
    const [x, z] = this.mundo(lx, lz)
    adicionarDeck(x, z, hx, hz, this.rot + giro, this.y0 + y)
    return this
  }

  // escada: degraus de piso de `alto` em `alto`, do (lx, lz) andando no sentido (dx, dz) local
  escada(lx, lz, dx, dz, largura, y0, y1, chave = null) {
    const n = Math.max(1, Math.round(Math.abs(y1 - y0) / 0.17))
    const giro = Math.atan2(dx, dz)
    const comp = Math.hypot(dx, dz)
    const ux = dx / comp
    const uz = dz / comp
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n
      const yTopo = y0 + ((y1 - y0) * (i + 1)) / n
      const cx = lx + ux * comp * t
      const cz = lz + uz * comp * t
      const passo = comp / n
      if (chave) {
        const alt = Math.max(0.05, yTopo - Math.min(y0, y1) + 0.02)
        const g = new THREE.BoxGeometry(largura, alt, passo + 0.02)
        g.translate(0, yTopo - alt / 2, 0)
        g.rotateY(giro)
        g.translate(cx, 0, cz)
        this.geo(chave, g)
      }
      this.piso(cx, cz, largura / 2, passo / 2 + 0.02, yTopo, giro)
    }
    return this
  }

  // caixa que a câmera não atravessa (invisível), local
  bloqueiaCamera(x, y, z, sx, sy, sz, ry = 0) {
    this.camera.push([x, y, z, sx, sy, sz, ry])
    return this
  }

  lampiao(x, y, z) { this.lampioes.push([x, y, z]); return this }

  // monta as malhas: materiais = { chave: { mat, detalhe?, cor?, sombra? } }
  montar(cena, materiais) {
    const grupo = new THREE.Group()
    grupo.name = this.nome
    grupo.position.set(this.x, this.y0, this.z)
    grupo.rotation.y = this.rot
    const detalhe = new THREE.Group()
    detalhe.name = `${this.nome}-detalhe`
    grupo.add(detalhe)
    let tris = 0
    for (const [chave, lista] of this.pecas) {
      const def = materiais[chave]
      if (!def) throw new Error(`obra ${this.nome}: material sem definição: ${chave}`)
      if (def.mat.vertexColors) for (const g of lista) colorir(g, def.cor || '#ffffff')
      else for (const g of lista) if (g.attributes.color) g.deleteAttribute('color')
      const geo = mergeGeometries(lista)
      if (!geo) throw new Error(`obra ${this.nome}: não juntou ${chave}`)
      geo.computeBoundingSphere()
      tris += geo.attributes.position.count / 3
      const malha = new THREE.Mesh(geo, def.mat)
      malha.name = `${this.nome}-${chave}`
      malha.castShadow = def.sombra !== false
      malha.receiveShadow = def.recebe !== false
      ;(def.detalhe ? detalhe : grupo).add(malha)
    }
    cena.add(grupo)
    grupo.updateMatrixWorld(true)
    grupo.traverse((o) => { congelar(o); if (o.isMesh) registrarEstatico(o) })

    // caixas da câmera: cópias invisíveis de uma caixa (como as casas)
    if (this.camera.length) {
      const mats = this.camera.map(([x, y, z, sx, sy, sz, ry]) => {
        const [wx, wz] = this.mundo(x, z)
        return new THREE.Matrix4().compose(new THREE.Vector3(wx, this.y0 + y, wz),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rot + ry), new THREE.Vector3(sx, sy, sz))
      })
      const invisivel = luzFixa(new THREE.MeshBasicMaterial())
      for (const m of instanciarEmBlocos(cena, new THREE.BoxGeometry(1, 1, 1), invisivel, mats, null, { nome: `${this.nome}-camera`, sombra: false, recebe: false, solido: true })) {
        m.visible = false
        m.userData.nuncaDesenha = true
      }
    }
    for (const [x, y, z] of this.lampioes) {
      const [wx, wz] = this.mundo(x, z)
      registrarLampiao(wx, this.y0 + y, wz)
    }
    const v = new THREE.Vector3()
    return {
      grupo,
      detalhe,
      triangulos: Math.round(tris),
      // a camada de detalhe some longe; o marco inteiro some se desligado no painel
      atualizar(camera, ligado, detalheAte) {
        grupo.visible = ligado
        if (!ligado || !camera) return
        v.copy(grupo.position)
        const longe = camera.position.distanceTo(v) > detalheAte
        if (detalhe.visible === longe) detalhe.visible = !longe
      },
    }
  }
}

// ---------- os materiais ----------

// os materiais das casas (telha canal e madeira pintada) são criados uma vez e repartidos
let _casas = null
const casas = () => (_casas ||= materiaisDasCasas())

// o vidro dos lampiões: claro e apagado de dia, quente à noite (o mesmo dos lampiões da cenografia)
const VIDRO_APAGADO = new THREE.Color('#e8e0c8')
const VIDRO_ACESO = new THREE.Color('#ffc66a').multiplyScalar(2.4)
let _vidro = null
export function vidroLampiao() {
  return (_vidro ||= luzFixa(new THREE.MeshBasicMaterial({ color: '#e8e0c8' }), 1, globais.uNoite))
}
export function acenderVidros() {
  if (_vidro) _vidro.color.copy(VIDRO_APAGADO).lerp(VIDRO_ACESO, globais.uNoite.value)
}

// a pincelada das paredes dos marcos (o painel mexe)
export const uPincelMarcos = { value: 0.1 }

// Monta a tabela de materiais de um marco a partir de uma tabela simples:
//   { chave: { cor, tex: 'cal' | 'pedra' | ..., tam, detalhe, sombra, recebe, tipo: 'telha' | 'madeira' | 'vidro' } }
// recebe: false nas paredes. O sol do jogo é o de agosto (ao norte): a fachada que olha para o sul fica de
// lado para a luz quase o dia inteiro, e ali o mapa de sombra mancha a parede inteira (acne no limite da luz,
// visto em A/B no WebGPU: some sem receber sombra). A parede se ilumina só pelo ângulo do sol; o chão, os
// degraus e as plataformas continuam recebendo a sombra do prédio.
// tipo 'telha' e 'madeira' reaproveitam os materiais das casas (quarteirao.js) com a cor por vértice.
export function materiaisObra(tabela) {
  const saida = {}
  for (const [chave, d] of Object.entries(tabela)) {
    let mat
    if (d.tipo === 'telha') mat = casas().telhas
    else if (d.tipo === 'madeira') mat = casas().pecas
    else if (d.tipo === 'vidro') mat = vidroLampiao()
    else if (d.tex) mat = texturizar(toon(d.cor, { semCache: true }), { topo: d.tex, lado: d.texLado || d.tex, tam: d.tam || 2.5, contraste: d.contraste ?? 0.8, massa: d.massa ?? 0.3 })
    else mat = toon(d.cor, d.proprio ? { semCache: true } : {}) // proprio: a cor muda pelo painel, não reparte
    // parede grande e lisa: a pincelada da borda das faixas fica mais curta (cfg.mundo.marcosNorte.pincel); com a do
    // resto do jogo (0,35), a fachada inteira na luz rasante do sol de agosto virava camuflagem
    if (d.recebe === false) mat.userData.arcPincel = uPincelMarcos
    saida[chave] = { mat, cor: d.cor, detalhe: !!d.detalhe, sombra: d.tipo === 'vidro' ? false : d.sombra, recebe: d.recebe }
  }
  return saida
}
