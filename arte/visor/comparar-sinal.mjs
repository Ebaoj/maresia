// Compara o sinal pela normal da face (o método antigo) com o sinal por paridade (o novo),
// para achar onde o primeiro erra. uso: node arte/visor/comparar-sinal.mjs [MODELO]
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';

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
const { scene } = await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset, rebuilt.byteOffset + rebuilt.byteLength), '');
scene.updateMatrixWorld(true);
const malhas = []; scene.traverse(o => { if (o.isMesh) malhas.push(o); });
const corpo = malhas.find(o => !/camisa|calca/i.test(o.name));
const camisas = malhas.filter(o => /camisa/i.test(o.name));

const geo = corpo.geometry, pos = geo.attributes.position, indices = geo.index.array;
const bvh = new MeshBVH(geo, { targetLeafSize: 8 });
const alvo = { point: new T.Vector3(), distance: 0, faceIndex: 0 };
const raios = [new T.Vector3(0.31, 0.13, 0.94).normalize(), new T.Vector3(-0.42, 0.22, 0.88).normalize(), new T.Vector3(0.19, -0.35, -0.92).normalize()];
const dentro = (p) => { let votos = 0; for (const d of raios) { const h = bvh.raycast(new T.Ray(p.clone().addScaledVector(d, 1e-4), d), T.DoubleSide); if (h.length % 2 === 1) votos++ } return votos >= 2 };
const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3();

for (const camisa of camisas) {
  const p2 = camisa.geometry.attributes.position;
  let velhoDentro = 0, novoDentro = 0, discordam = 0, velhosValem = 0, exemplos = [];
  for (let i = 0; i < p2.count; i++) {
    const v = new T.Vector3().fromBufferAttribute(p2, i);
    if (v.y < 0.90 || v.y > 1.20 || Math.abs(v.x) > 0.16) continue;
    bvh.closestPointToPoint(v, alvo);
    const t = alvo.faceIndex * 3;
    a.fromBufferAttribute(pos, indices[t]); b.fromBufferAttribute(pos, indices[t + 1]); c.fromBufferAttribute(pos, indices[t + 2]);
    n.crossVectors(b.sub(a), c.sub(a)).normalize();
    const fora = v.clone().sub(alvo.point);
    const velho = fora.dot(n) < 0 ? alvo.distance : 0;
    const novo = dentro(v) ? alvo.distance : 0;
    if (velho > 0) velhoDentro++;
    if (novo > 0) novoDentro++;
    if ((velho > 0) !== (novo > 0)) { discordam++; if (exemplos.length < 6) exemplos.push({ i, v: v.toArray().map(x => +x.toFixed(3)), velho: +(velho * 1000).toFixed(1), novo: +(novo * 1000).toFixed(1), face: alvo.faceIndex }) }
    if (velho > 0 && Math.abs(velho - alvo.distance) < 1e-9) velhosValem++;
  }
  console.log(`${camisa.name}: método antigo diz "dentro" em ${velhoDentro} pontos, o novo em ${novoDentro}; discordam em ${discordam}`);
  for (const ex of exemplos) console.log('   ', JSON.stringify(ex));
}
