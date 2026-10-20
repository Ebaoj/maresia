// Inspeção da estrutura do GLB do Neto: malhas, vértices, transformações de nó e accessor de POSITION.
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const ARQ = process.argv[2] || 'arte/finais/neto-vestido.glb';
const bytes = await fs.readFile(ARQ);
const jl = bytes.readUInt32LE(12);
const j = JSON.parse(bytes.subarray(20, 20 + jl).toString());
console.log('=== NODES ===');
for (const n of j.nodes) console.log(`${n.name} | mesh:${n.mesh ?? '-'} | children:${(n.children || []).length} | T:${JSON.stringify(n.translation || null)} R:${JSON.stringify(n.rotation || null)} S:${JSON.stringify(n.scale || null)}`);
console.log('=== MESHES ===');
for (const m of j.meshes) {
  const p = m.primitives.map(p => `${p.mode ?? 4} attrs:${Object.keys(p.attributes).join(',')} idx:${p.indices ?? '-'} mat:${p.material}`);
  console.log(`${m.name} | ${p.join(' | ')}`);
}
console.log('=== POSITION accessors ===');
for (const m of j.meshes) for (const p of m.primitives) {
  const a = j.accessors[p.attributes.POSITION];
  console.log(`${m.name}: POSITION acc=${p.attributes.POSITION} count=${a.count} min=${a.min} max=${a.max} view=${a.bufferView} off=${a.byteOffset ?? 0}`);
}
console.log('=== SKINS ===');
for (const s of j.skins ?? []) console.log(`${s.name} joints:${s.joints.length} skeleton:${s.skeleton}`);

const { scene: root } = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
console.log('=== CENA ===');
root.traverse(o => {
  if (!o.isMesh) return;
  const g = o.geometry;
  const b = new T.Box3().setFromBufferAttribute(g.attributes.position);
  console.log(`${o.name} | verts:${g.attributes.position.count} | tris:${(g.index ? g.index.count : g.attributes.position.count) / 3} | bbox:${b.min.toArray().map(v => v.toFixed(3))} -> ${b.max.toArray().map(v => v.toFixed(3))} | parent:${o.parent?.name ?? '-'} | matrixAutoUpdate:${o.matrixAutoUpdate} | pos:${o.position.toArray().map(v => v.toFixed(3))} scale:${o.scale.toArray().join(',')}`);
});
