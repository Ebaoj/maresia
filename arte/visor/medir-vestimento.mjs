// Mede o encaixe da roupa na pele: quanto da malha vestida está dentro do corpo.
// Separar as duas causas possíveis do defeito: o molde nasce por dentro da pele
// (problema do modelo) ou a física puxa o pano para dentro (problema da folga).
// uso: node arte/visor/medir-vestimento.mjs [--movimento andar] [--quadros 12]
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { converter, repouso, ossosPorNome } from '../../src/jogador/retarget.js';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d }
const MOVIMENTO = arg('--movimento', 'andar')
const QUADROS = Number(arg('--quadros', 12))
const MODELO = process.env.MODELO_NETO || new URL('../finais/neto-v5-jolt.glb', import.meta.url)

// o glb com as texturas removidas carrega bem mais rápido
const bytes = await fs.readFile(MODELO)
const jl = bytes.readUInt32LE(12)
const j = JSON.parse(bytes.subarray(20, 20 + jl).toString())
delete j.images; delete j.textures; delete j.samplers
j.materials = j.materials?.map(m => ({ name: m.name }))
delete j.extensionsUsed; delete j.extensionsRequired
const raw = Buffer.from(JSON.stringify(j)); const pad = (4 - raw.length % 4) % 4
const json = Buffer.concat([raw, Buffer.alloc(pad, 32)]); const bin = bytes.subarray(20 + jl)
const rebuilt = Buffer.alloc(20 + json.length + bin.length)
bytes.copy(rebuilt, 0, 0, 12); rebuilt.writeUInt32LE(rebuilt.length, 8); rebuilt.writeUInt32LE(json.length, 12)
rebuilt.writeUInt32LE(0x4e4f534a, 16); json.copy(rebuilt, 20); bin.copy(rebuilt, 20 + json.length)
const { scene: root } = await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength), '')

// separa corpo (pele) e peças vestidas pelo nome da malha
const pecas = []
root.traverse(o => {
  if (!o.isMesh) return
  const nome = o.name || ''
  const grupo = /camisa/i.test(nome) ? 'camisa' : /calca/i.test(nome) ? 'calca' : 'corpo'
  pecas.push({ grupo, mesh: o })
})
const corpo = pecas.find(p => p.grupo === 'corpo')
if (!corpo) throw Error('malha do corpo não encontrada')

// BVH da pele: só o que está acima do quadril e perto do tronco (a região que os raios cobrem)
const pos = corpo.mesh.geometry.attributes.position, idx = corpo.mesh.geometry.index.array
const tri = []
for (let k = 0; k < idx.length; k += 3) {
  const y = (pos.getY(idx[k]) + pos.getY(idx[k + 1]) + pos.getY(idx[k + 2])) / 3
  const x = (pos.getX(idx[k]) + pos.getX(idx[k + 1]) + pos.getX(idx[k + 2])) / 3
  if (y < 0.90 || y > 1.20 || Math.abs(x) > 0.16) continue
  tri.push(idx[k], idx[k + 1], idx[k + 2])
}
const gPele = new T.BufferGeometry()
// a BVH precisa das posições de verdade: só os índices do tronco entram
const pPele = new Float32Array(pos.count * 3)
for (let i = 0; i < pos.count; i++) { pPele[i * 3] = pos.getX(i); pPele[i * 3 + 1] = pos.getY(i); pPele[i * 3 + 2] = pos.getZ(i) }
gPele.setAttribute('position', new T.Float32BufferAttribute(pPele, 3))
gPele.setIndex(tri)
const bvh = new MeshBVH(gPele, { targetLeafSize: 8 })

const _alvo = { point: new T.Vector3(), distance: 0, faceIndex: 0 }
const dentro = (p) => {  // distância com sinal: negativo = dentro da pele
  bvh.closestPointToPoint(p, _alvo)
  const cp = _alvo.point
  // normal da face mais próxima (gPele guarda os índices do corpo)
  const t = _alvo.faceIndex * 3
  const a = new T.Vector3().fromBufferAttribute(pos, tri[t])
  const b = new T.Vector3().fromBufferAttribute(pos, tri[t + 1])
  const c = new T.Vector3().fromBufferAttribute(pos, tri[t + 2])
  const n = new T.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize()
  const fora = p.clone().sub(cp).dot(n)
  return fora >= 0 ? _alvo.distance : -_alvo.distance
}

const alvo = { raiz: root, ossos: ossosPorNome(root) }
alvo.rep = repouso(alvo.ossos)

const buf = await fs.readFile(new URL('../../public/animacoes/mixamo/' + MOVIMENTO + '.fbx', import.meta.url))
const source = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '')
const fonte = { raiz: source, ossos: ossosPorNome(source) }
fonte.rep = repouso(fonte.ossos)
const clip = converter(source.animations[0], fonte, alvo, { nome: MOVIMENTO })
const mixer = new T.AnimationMixer(root)
mixer.clipAction(clip).play()

const report = []
for (let frame = 0; frame < QUADROS; frame++) {
  const tempo = frame * (clip.duration / QUADROS)
  mixer.update(tempo - (frame ? (frame - 1) * (clip.duration / QUADROS) : 0))
  root.updateMatrixWorld(true)
  const linha = { quadro: frame, tempo }
  for (const p of pecas.filter(p => p.grupo !== 'corpo')) {
    const p2 = p.mesh.geometry.attributes.position
    let dentroN = 0, soma = 0, pior = 0, minAbs = Infinity
    for (let i = 0; i < p2.count; i++) {
      const v = new T.Vector3().fromBufferAttribute(p2, i)
      if (v.y < 0.90 || v.y > 1.20 || Math.abs(v.x) > 0.16) continue
      const d = dentro(v)
      soma += d; minAbs = Math.min(minAbs, Math.abs(d))
      if (d < 0) { dentroN++; pior = Math.min(pior, d) }
    }
    linha[p.grupo] = { dentroN, piorMm: +(pior * 1000).toFixed(2), medioMm: +(soma * 1000).toFixed(2), minAbsMm: +(minAbs * 1000).toFixed(2) }
  }
  report.push(linha)
}
console.log('movimento:', MOVIMENTO, '| modelo:', String(MODELO).split('/').pop())
for (const l of report) console.log(JSON.stringify(l))
console.log('RESUMO', JSON.stringify({
  movimento: MOVIMENTO,
  camisa: report.reduce((a, l) => ({ dentro: a.dentro + (l.camisa?.dentroN || 0), pior: Math.min(a.pior, l.camisa?.piorMm ?? 0) }), { dentro: 0, pior: 0 }),
  calca: report.reduce((a, l) => ({ dentro: a.dentro + (l.calca?.dentroN || 0), pior: Math.min(a.pior, l.calca?.piorMm ?? 0) }), { dentro: 0, pior: 0 }),
}))
