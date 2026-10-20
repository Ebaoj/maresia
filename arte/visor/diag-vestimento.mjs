// Diagnóstico do encaixe: posição real de cada malha no mundo e o sinal da distância.
// Carrega o GLB sem texturas (o node não tem DOM) e aplica as matrizes de nó.
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';

export async function carregarSemTexturas(caminho) {
  const bytes = await fs.readFile(caminho);
  const jl = bytes.readUInt32LE(12);
  const j = JSON.parse(bytes.subarray(20, 20 + jl).toString());
  delete j.images; delete j.textures; delete j.samplers;
  j.materials = j.materials?.map(m => ({ name: m.name }));
  delete j.extensionsUsed; delete j.extensionsRequired;
  const raw = Buffer.from(JSON.stringify(j)); const pad = (4 - raw.length % 4) % 4;
  const json = Buffer.concat([raw, Buffer.alloc(pad, 32)]); const bin = bytes.subarray(20 + jl);
  const rebuilt = Buffer.alloc(20 + json.length + bin.length);
  bytes.copy(rebuilt, 0, 0, 12); rebuilt.writeUInt32LE(rebuilt.length, 8); rebuilt.writeUInt32LE(json.length, 12);
  rebuilt.writeUInt32LE(0x4e4f534a, 16); json.copy(rebuilt, 20); bin.copy(rebuilt, 20 + json.length);
  const { scene } = await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength), '');
  return { scene, json: j, bytes };
}

const ARQ = process.argv[2] || 'arte/finais/neto-vestido.glb';
const { scene, json } = await carregarSemTexturas(ARQ);
scene.updateMatrixWorld(true);
console.log('=== MALHAS (mundo) ===');
const malhas = [];
scene.traverse(o => {
  if (!o.isMesh) return;
  const g = o.geometry;
  const pos = g.attributes.position;
  const mundo = [];
  for (let i = 0; i < pos.count; i++) mundo.push(new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
  const b = new T.Box3().setFromPoints(mundo);
  const centro = mundo.reduce((a, v) => a.add(v), new T.Vector3()).multiplyScalar(1 / mundo.length);
  malhas.push({ nome: o.name, mundo, centro, bbox: b, node: o });
  console.log(`${o.name} | verts:${pos.count} | pais:${o.parent?.name ?? '-'} | posNó:${o.position.toArray().map(v => v.toFixed(4))} | esc:${o.scale.toArray().map(v => v.toFixed(4))} | bbox:${b.min.toArray().map(v => v.toFixed(3))} -> ${b.max.toArray().map(v => v.toFixed(3))} | centro:${centro.toArray().map(v => v.toFixed(3))}`);
});
console.log('=== SINAL DA NORMAL (a face aponta para fora do centro do corpo?) ===');
const corpo = malhas.find(m => !/camisa|calca/i.test(m.nome));
if (corpo) {
  const g = corpo.node.geometry, pos = g.attributes.position, idx = g.index.array;
  let parafora = 0, paradentro = 0;
  for (let k = 0; k < Math.min(idx.length, 3000); k += 3) {
    const a = new T.Vector3().fromBufferAttribute(pos, idx[k]).applyMatrix4(corpo.node.matrixWorld);
    const b = new T.Vector3().fromBufferAttribute(pos, idx[k + 1]).applyMatrix4(corpo.node.matrixWorld);
    const c = new T.Vector3().fromBufferAttribute(pos, idx[k + 2]).applyMatrix4(corpo.node.matrixWorld);
    const n = new T.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    const meio = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    if (n.dot(meio.clone().sub(corpo.centro)) > 0) parafora++; else paradentro++;
  }
  console.log(`faces para fora: ${parafora} | para dentro: ${paradentro} (${parafora > paradentro ? 'sentido CORRETO' : 'sentido INVERTIDO'})`);
}
console.log('=== PRIMITIVAS POR MALHA ===');
for (const m of json.meshes) console.log(`${m.name}: ${m.primitives.length} primitivas`);
