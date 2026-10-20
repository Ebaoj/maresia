import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { criarMedidorPele } from '/Users/joabecornelio/Projetos/maresia-three186/arte/visor/pele.mjs';
import { amostrarColisores } from '/Users/joabecornelio/Projetos/maresia-three186/src/jogador/roupa-colisores.js';
const bytes = await fs.readFile('arte/finais/neto-vestido.glb');
const jl = bytes.readUInt32LE(12), j = JSON.parse(bytes.subarray(20, 20 + jl).toString());
delete j.images; delete j.textures; delete j.samplers; j.materials = j.materials?.map(m => ({ name: m.name })); delete j.extensionsUsed; delete j.extensionsRequired;
const raw = Buffer.from(JSON.stringify(j)); const pad = (4 - raw.length % 4) % 4;
const json = Buffer.concat([raw, Buffer.alloc(pad, 32)]); const bin = bytes.subarray(20 + jl);
const rebuilt = Buffer.alloc(20 + json.length + bin.length);
bytes.copy(rebuilt, 0, 0, 12); rebuilt.writeUInt32LE(rebuilt.length, 8); rebuilt.writeUInt32LE(json.length, 12);
rebuilt.writeUInt32LE(0x4e4f534a, 16); json.copy(rebuilt, 20); bin.copy(rebuilt, 20 + json.length);
const { scene: root } = await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength), '');
root.updateMatrixWorld(true);
let pele = null; root.traverse(o => { if (o.isSkinnedMesh && !pele && !/camisa|calca/i.test(o.name)) pele = o; });
const medidor = criarMedidorPele(pele.geometry, pele.matrixWorld);
for (const parte of amostrarColisores(pele)) {
  let dentro = 0, pior = 0, soma = 0;
  const m = parte.bone.matrixWorld;
  for (const p of parte.pontos) {
    const v = new T.Vector3(p.x, p.y, p.z).applyMatrix4(m);
    const d = medidor.distancia(v);
    soma += d;
    if (medidor.dentro(v)) { dentro++; pior = Math.max(pior, d); }
  }
  console.log(`${parte.nome}: caixas=${parte.pontos.length} dentro=${dentro} pior=${(pior*1000).toFixed(1)}mm media=${(soma/parte.pontos.length*1000).toFixed(1)}mm`);
}
