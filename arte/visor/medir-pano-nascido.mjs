// Onde o pano nasce em relação à pele, e quanto a casca convexa do colisor fica dentro dela.
// uso: node arte/visor/medir-pano-nascido.mjs [MODELO]
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { criarTecidoJolt } from './tecido-jolt.js';
import { criarMedidorPele } from './pele.mjs';

const ARQ = process.argv[2] || 'arte/finais/neto-vestido.glb';
const bytes = await fs.readFile(ARQ);
const jl = bytes.readUInt32LE(12), j = JSON.parse(bytes.subarray(20, 20 + jl).toString());
delete j.images; delete j.textures; delete j.samplers;
j.materials = j.materials?.map(m => ({ name: m.name })); delete j.extensionsUsed; delete j.extensionsRequired;
const raw = Buffer.from(JSON.stringify(j)); const pad = (4 - raw.length % 4) % 4;
const json = Buffer.concat([raw, Buffer.alloc(pad, 32)]); const bin = bytes.subarray(20 + jl);
const rebuilt = Buffer.alloc(20 + json.length + bin.length);
bytes.copy(rebuilt, 0, 0, 12); rebuilt.writeUInt32LE(rebuilt.length, 8); rebuilt.writeUInt32LE(json.length, 12);
rebuilt.writeUInt32LE(0x4e4f534a, 16); json.copy(rebuilt, 20); bin.copy(rebuilt, 20 + json.length);
const { scene: root } = await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength), '');
root.updateMatrixWorld(true);

let pele = null;
root.traverse(o => { if (o.isSkinnedMesh && !pele && !/camisa|calca/i.test(o.name)) pele = o; });
if (!pele) throw Error('pele não encontrada');
const medidor = criarMedidorPele(pele.geometry, pele.matrixWorld);

const cloth = await criarTecidoJolt(root);
console.log(`modelo: ${ARQ.split('/').pop()} | pontos do pano: ${cloth.engine.pontos} | peças: ${cloth.engine.pecas.length}`);
for (const peca of cloth.engine.pecas) {
  const pontos = peca.proxy.pontos;
  let dentroN = 0, soma = 0, pior = 0;
  const depths = [];
  for (const p of pontos) {
    const v = new T.Vector3(p.x, p.y, p.z);
    if (v.y < 0.90 || v.y > 1.20 || Math.abs(v.x) > 0.16) continue;
    const d = medidor.distancia(v);
    if (medidor.dentro(v)) { dentroN++; depths.push(d); soma += d; pior = Math.max(pior, d); }
  }
  depths.sort((a, b) => b - a);
  console.log(`  ${peca.malha.material.name}: pontos=${pontos.length} | dentro da pele (tronco): ${dentroN} | pior=${(pior * 1000).toFixed(1)} mm | mediana=${depths.length ? (depths[Math.floor(depths.length / 2)] * 1000).toFixed(1) : 0} mm`);
}

// quanto a casca convexa do colisor fica dentro da pele visível
console.log('--- folga entre a pele e a casca convexa do colisor ---');
for (const parte of cloth.engine.colisores?.partes ?? []) {
  let pior = 0;
  for (const ponto of parte.pontos) {
    const v = new T.Vector3(ponto.x, ponto.y, ponto.z).applyMatrix4(pele.matrixWorld);
    const d = medidor.distancia(v);
    if (medidor.dentro(v)) pior = Math.max(pior, d);
  }
  console.log(`  ${parte.nome}: ${parte.pontos.length} amostras | ponto mais para dentro da pele: ${(pior * 1000).toFixed(1)} mm`);
}
process.exit(0);
