// Fase 4: o horizonte. Três camadas de serra, cada uma mais clara e mais parecida com o céu
// (perspectiva atmosférica pintada), e cidade densa continuando pela costa nos dois lados.
// Tudo com cor calculada a partir da paleta do céu; nada disso recebe luz.

import * as THREE from 'three'
import { fbm, linhaCosta } from './mapa.js'
import { globais } from '../globais.js'
import { luzFixa, SAIDA_LUZ } from '../materiais.js'
import { criarAleatorio } from '../utils.js'

const rnd = criarAleatorio(2025)

// Faixa de serra em volta do mapa: base no chão, crista com ruído.
function cordilheira(raio, alturaMin, alturaMax, semente, angIni, angFim) {
  const pos = []
  const idx = []
  const passos = 220
  for (let i = 0; i <= passos; i++) {
    const a = angIni + (angFim - angIni) * (i / passos)
    const x = Math.cos(a) * raio
    const z = 100 + Math.sin(a) * raio * 0.75
    const n = fbm(Math.cos(a) * 3 + semente, Math.sin(a) * 3, 4, semente) * 0.5 + 0.5
    const h = alturaMin + (alturaMax - alturaMin) * n
    pos.push(x, -20, z, x, h, z)
    if (i > 0) {
      const k = (i - 1) * 2
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

const vertCidade = /* glsl */ `
varying vec3 vN; varying vec3 vLocal; varying float vInst;
void main() {
  vN = normalize(mat3(instanceMatrix) * normal);
  vLocal = position;
  vInst = float(gl_InstanceID);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}`

const fragCidade = /* glsl */ `
uniform vec3 uCor; uniform vec3 uLuz; uniform float uNoite;
varying vec3 vN; varying vec3 vLocal; varying float vInst;
${SAIDA_LUZ}
float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main() {
  vec3 cor = uCor * (0.88 + 0.12 * vN.x);
  // à noite, pontinhos de janela acesa ao longe
  vec2 g = floor(vec2(vLocal.x + vLocal.z, vLocal.y) * vec2(6.0, 10.0));
  float acesa = step(0.78, h(vec3(g, vInst))) * step(abs(vN.y), 0.5);
  cor = mix(cor, uLuz, acesa * uNoite);
  gl_FragColor = vec4(cor, 1.0);
  gLuz = vec4(0.8, acesa * uNoite, 0.0, 1.0);
}`

export function criarHorizonte(cena) {
  const camadas = [
    { raio: 1250, min: 60, max: 210, semente: 3, mistura: 0.35 },
    { raio: 1550, min: 120, max: 330, semente: 7, mistura: 0.6 },
    { raio: 1850, min: 200, max: 460, semente: 11, mistura: 0.8 },
  ].map((c) => {
    const mat = luzFixa(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 0.8)
    const m = new THREE.Mesh(cordilheira(c.raio, c.min, c.max, c.semente, -0.35, Math.PI + 0.35), mat)
    m.frustumCulled = false
    m.userData.semNormal = true
    m.renderOrder = -5
    cena.add(m)
    return { ...c, mat }
  })

  // cidade continuando pela costa, a oeste e a leste do mapa
  const caixas = []
  for (const lado of [-1, 1]) {
    for (let i = 0; i < 700; i++) {
      const x = lado * rnd.entre(520, 1250)
      const z = linhaCosta(lado * 450) + rnd.entre(30, 420) * (rnd.chance(0.7) ? 0.6 : 1)
      const w = rnd.entre(10, 26)
      const d = rnd.entre(10, 26)
      const perto = 1 - Math.min(1, (Math.abs(x) - 520) / 700)
      const h = rnd.entre(8, 22) + rnd.entre(0, 55) * perto * (rnd.chance(0.3) ? 1 : 0.4)
      caixas.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd.entre(-0.2, 0.2)), new THREE.Vector3(w, h, d)))
    }
  }
  const uCidade = { uCor: { value: new THREE.Color() }, uLuz: { value: new THREE.Color('#ffd27a') }, uNoite: globais.uNoite }
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)
  const cidade = new THREE.InstancedMesh(geo, new THREE.ShaderMaterial({ uniforms: uCidade, vertexShader: vertCidade, fragmentShader: fragCidade }), caixas.length)
  caixas.forEach((m, i) => cidade.setMatrixAt(i, m))
  cidade.frustumCulled = false
  cidade.userData.semNormal = true
  cena.add(cidade)

  const tmp = new THREE.Color()
  return {
    // cada camada mistura a cor da serra com a névoa: quanto mais longe, mais céu
    atualizar(paleta) {
      const base = tmp.set('#3f6a7a').lerp(paleta.chao, 0.35).multiplyScalar(0.55 + 0.45 * (1 - paleta.noite))
      for (const c of camadas) c.mat.color.copy(base).lerp(globais.uNevoaCor.value, c.mistura)
      uCidade.uCor.value.copy(paleta.ceu).multiplyScalar(0.5).lerp(globais.uNevoaCor.value, 0.55)
    },
  }
}
