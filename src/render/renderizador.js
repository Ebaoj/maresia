// Renderizador do jogo: o WebGL de sempre ou, com cfg.desempenho.renderizador = 'webgpu' (motor F1,
// KAN-67), o WebGPURenderer do three. No modo webgpu ainda não existem o pós (aranhaverso), os passes de
// toque e de areia e os materiais com shader próprio: a cena é desenhada direto, e cada material sem versão
// para o WebGPU entra com um material padrão do three e vai para a lista "falta portar"
// (window.__faltaPortar), que a fase 2 usa para se fatiar.

import * as THREE from 'three'
import { atualizarUniformsArcane, materialArcane } from './arcane-tsl.js'

let W = null // o módulo three/webgpu, no modo webgpu

export async function criarRenderizador(cfg, canvas) {
  if (cfg.desempenho.renderizador === 'webgpu') {
    // o three/webgpu do 0.170 é um pacote separado do three (outra cópia do núcleo); a cena continua
    // sendo do three, e o renderizador lê os objetos pelas marcas (isMesh, isTexture...)
    W = await import('three/webgpu')
    const renderer = new W.WebGPURenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
    // o WebGPU acha o material pelo nome do tipo (funciona com a outra cópia), mas a luz pela classe: sem
    // registrar as classes de luz do three, nenhuma luz da cena era achada e tudo saía preto
    for (const [no, classe] of [[W.DirectionalLightNode, THREE.DirectionalLight], [W.HemisphereLightNode, THREE.HemisphereLight],
      [W.AmbientLightNode, THREE.AmbientLight], [W.PointLightNode, THREE.PointLight], [W.SpotLightNode, THREE.SpotLight],
      [W.RectAreaLightNode, THREE.RectAreaLight], [W.LightProbeNode, THREE.LightProbe]]) renderer.library.addLight(no, classe)
    await renderer.init()
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    return { renderer, webgpu: true }
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // borda nítida, combina com o toon
  renderer.shadowMap.autoUpdate = false
  return { renderer, webgpu: false }
}

// Cor de reserva para o que ainda não tem versão no WebGPU, pelo nome do objeto (só para a cena ficar legível)
function corReserva(o) {
  const n = (o.name || '').toLowerCase()
  if (n.includes('mar') || n.includes('rio')) return '#3aa8b5'
  if (n.includes('ceu') || n.includes('céu') || n.includes('nuvem')) return '#a9cbe6'
  if (n.includes('areia')) return '#d9c38f'
  return '#8a8a8a'
}

const vistos = new WeakSet()
const reservas = new Map()
const falta = new Map()
const convertidos = new Set()

// Troca o que o WebGPU não roda por material padrão e anota em "falta portar". Pode ser chamada de novo:
// só olha os materiais que ainda não viu (o corpo do jogador e outras coisas chegam depois).
export function prepararCenaWebgpu(cena) {
  cena.traverse((o) => {
    if (!o.material) return
    const lista = [].concat(o.material)
    let mudou = false
    const novas = lista.map((m) => {
      if (reservas.has(m)) { mudou = true; return reservas.get(m) }
      if (vistos.has(m)) return m
      vistos.add(m)
      if (m.isNodeMaterial) return m // já é do WebGPU (os convertidos aqui mesmo, vistos de novo na volta seguinte)
      const onde = o.name || o.type
      // o visual Arcane (pintar() de materiais.js) tem versão em TSL (arcane-tsl.js); o código extra que
      // alguns materiais somam a ele (vento, janelas, roupa) ainda não, e fica anotado pela chave
      if (m.isMeshToonMaterial && m.userData.luzMRT) {
        const nm = materialArcane(W, m)
        reservas.set(m, nm)
        convertidos.add(m.customProgramCacheKey ? m.customProgramCacheKey() : onde)
        mudou = true
        return nm
      }
      if (m.isShaderMaterial || m.isRawShaderMaterial) {
        anotar(`shader próprio (${m.type})`, onde)
        const r = o.isPoints
          ? new THREE.PointsMaterial({ color: '#ffffff', size: 0.06, transparent: true, opacity: 0.5, depthWrite: false })
          : new THREE.MeshBasicMaterial({ color: corReserva(o), side: m.side, transparent: m.transparent, opacity: m.transparent ? 0.7 : 1 })
        reservas.set(m, r)
        mudou = true
        return r
      }
      if (m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) anotar(`código injetado no material (${m.type}): sai no material padrão`, onde)
      return m
    })
    if (mudou) o.material = Array.isArray(o.material) ? novas : novas[0]
  })
  window.__faltaPortar = [...falta.entries()].map(([k, s]) => ({ peca: k, onde: [...s].slice(0, 12), quantos: s.size }))
  window.__convertidosTsl = [...convertidos]
}

// a cada quadro no modo webgpu: o painel continua mexendo no visual pelos mesmos globais do WebGL
export function quadroWebgpu() { atualizarUniformsArcane() }

function anotar(peca, onde) {
  if (!falta.has(peca)) falta.set(peca, new Set())
  falta.get(peca).add(onde)
}
