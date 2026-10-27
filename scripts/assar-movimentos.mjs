// Assa os movimentos do Mixamo (public/animacoes/mixamo/*.fbx, fora do git pela licença) num GLB do jogo:
// arte/finais/movimentos-mixamo.glb = só o esqueleto do Y Bot (sem malha) + um clipe por movimento,
// reamostrado a 30 qps. No jogo, retarget.js usa este GLB quando os FBX não estão (CI / GitHub Pages);
// a conversão para o neto, o avô e o boneco continua em tempo de execução, igual à dos FBX.
// Uso: node scripts/assar-movimentos.mjs   (rodar de novo quando mudar algum FBX)
import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// o FBXLoader e o GLTFExporter esperam um navegador: o mínimo para rodar no Node
globalThis.self ??= globalThis
globalThis.window ??= globalThis
globalThis.FileReader ??= class {
  readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.() }) }
  readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.() }) }
}
THREE.TextureLoader.prototype.load = () => new THREE.Texture()

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const pasta = path.join(raiz, 'public/animacoes/mixamo')
const saida = path.join(raiz, 'arte/finais/movimentos-mixamo.glb')
const FPS = 30
const ler = (f) => { const b = fs.readFileSync(path.join(pasta, f)); return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '') }

const ybot = ler('ybot.fbx')
// sem malha nem material: só a hierarquia de ossos e o repouso em T
const tirar = []
ybot.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) tirar.push(o) })
tirar.forEach((o) => o.parent.remove(o))
ybot.name = 'ybot'
const nomesOssos = new Set()
ybot.traverse((o) => { if (o.isBone) { nomesOssos.add(o.name); o.userData.osso = true } })
// o FBX tem um grupo com o mesmo nome de cada osso: renomeia o grupo, para o GLB ficar com nomes únicos
// (o GLTFLoader só faz Bone de nó de pele; sem malha, o runtime acha os ossos pelo userData.osso)
ybot.traverse((o) => { if (!o.isBone && nomesOssos.has(o.name)) o.name += '_grupo' })

function reamostrar(clipe, nome) {
  const n = Math.max(2, Math.round(clipe.duration * FPS) + 1)
  const tempos = new Float32Array(n).map((_, i) => Math.min(clipe.duration, i / FPS))
  const trilhas = []
  for (const t of clipe.tracks) {
    const [osso] = t.name.split('.')
    if (!nomesOssos.has(osso)) continue
    const interp = t.createInterpolant()
    const tam = t.getValueSize()
    const v = new Float32Array(n * tam)
    for (let i = 0; i < n; i++) v.set(interp.evaluate(tempos[i]), i * tam)
    trilhas.push(new t.constructor(t.name, tempos, v))
  }
  return new THREE.AnimationClip(nome, clipe.duration, trilhas)
}

const clipes = []
for (const f of fs.readdirSync(pasta).filter((f) => f.endsWith('.fbx') && f !== 'ybot.fbx').sort()) {
  const obj = ler(f)
  if (!obj.animations[0]) { console.warn('sem clipe:', f); continue }
  clipes.push(reamostrar(obj.animations[0], f.replace(/\.fbx$/, '')))
}
const cena = new THREE.Scene()
cena.add(ybot)
const glb = await new GLTFExporter().parseAsync(cena, { binary: true, animations: clipes })
fs.writeFileSync(saida, Buffer.from(glb))
console.log(`${clipes.length} clipes -> ${path.relative(raiz, saida)} (${(glb.byteLength / 1e6).toFixed(2)} MB)`)
