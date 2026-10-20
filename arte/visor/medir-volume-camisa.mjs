// Quanto vale dar volume a camisa? A camisa do jogo nasce colada na pele (0,1 mm), e um pano que
// nasce colado na pele afunda um milímetro a cada passo de física: todo afundamento é uma
// atravessada, e nenhum colisor resolve, porque o colisor teria de estar exatamente na pele.
//
// Este script infla a camisa para fora, na direção da normal da pele, e mede os vazamentos de novo.
// uso: node arte/visor/medir-volume-camisa.mjs [CM_EM_METROS]
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshBVH } from 'three-mesh-bvh';

const INFLAR = Number(process.argv[2] || 0.02);
const bytes = await fs.readFile(process.env.MODELO_NETO || new URL('../finais/neto-vestido.glb', import.meta.url));
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

// a pele: BVH do corpo, e o teste de paridade para saber para que lado é "para fora"
let pele = null;
root.traverse(o => { if (o.isSkinnedMesh && !pele && !/camisa|calca/i.test(o.name)) pele = o; });
const posC = pele.geometry.attributes.position, idxC = pele.geometry.index.array;
const g = new T.BufferGeometry();
const pC = new Float32Array(posC.count * 3);
for (let i = 0; i < posC.count; i++) { const v = new T.Vector3().fromBufferAttribute(posC, i).applyMatrix4(pele.matrixWorld); pC[i * 3] = v.x; pC[i * 3 + 1] = v.y; pC[i * 3 + 2] = v.z; }
g.setAttribute('position', new T.BufferAttribute(pC, 3)); g.setIndex(Array.from(idxC));
const bvh = new MeshBVH(g, { targetLeafSize: 8 });
const dirs = [new T.Vector3(0.31, 0.13, 0.94).normalize(), new T.Vector3(-0.42, 0.22, 0.88).normalize(), new T.Vector3(0.19, -0.35, -0.92).normalize()];
const dentro = (p) => { let v = 0; for (const d of dirs) { const h = bvh.raycast(new T.Ray(p.clone().addScaledVector(d, 1e-4), d), T.DoubleSide); if (h.length % 2 === 1) v++ } return v >= 2 };
const alvo = { point: new T.Vector3(), distance: 0, faceIndex: 0 };

let movidos = 0;
root.traverse(o => {
  if (!o.isMesh || !/camisa/i.test(o.name)) return;
  const pos = o.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
    bvh.closestPointToPoint(v, alvo);
    const t = alvo.faceIndex * 3;
    const a = new T.Vector3().fromBufferAttribute(posC, idxC[t]).applyMatrix4(pele.matrixWorld);
    const b = new T.Vector3().fromBufferAttribute(posC, idxC[t + 1]).applyMatrix4(pele.matrixWorld);
    const c = new T.Vector3().fromBufferAttribute(posC, idxC[t + 2]).applyMatrix4(pele.matrixWorld);
    const n = new T.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize();
    // a normal aponta para fora? um passo ao longo dela ainda está dentro da pele?
    if (dentro(v.clone().addScaledVector(n, 0.01))) n.negate();
    v.addScaledVector(n, INFLAR);
    const local = v.clone().applyMatrix4(o.matrixWorld.clone().invert());
    pos.setXYZ(i, local.x, local.y, local.z);
    movidos++;
  }
  o.geometry.attributes.position.needsUpdate = true;
});
console.log(`camisa inflada ${(INFLAR * 100).toFixed(1)} cm: ${movidos} vértices`);
root.updateMatrixWorld(true);

const { criarTecidoJolt } = await import('./tecido-jolt.js');
const { converter, repouso, ossosPorNome } = await import('../../src/jogador/retarget.js');
const alvo_ = { raiz: root, ossos: ossosPorNome(root) }; alvo_.rep = repouso(alvo_.ossos);
const cloth = await criarTecidoJolt(root); cloth.setActive(process.env.PHYSICS === '1');
const shapes = [];
for (const group of cloth.groups) for (const mesh of group.parts) {
  const pos = mesh.geometry.attributes.position, idx = mesh.geometry.index.array; const tri = []; const used = new Set();
  for (let k = 0; k < idx.length; k += 3) { const y = (pos.getY(idx[k]) + pos.getY(idx[k + 1]) + pos.getY(idx[k + 2])) / 3; if (group.name === 'corpo' && (y < .90 || y > 1.20 || Math.abs((pos.getX(idx[k]) + pos.getX(idx[k + 1]) + pos.getX(idx[k + 2])) / 3) > .16)) continue; for (let j = 0; j < 3; j++) { tri.push(idx[k + j]); used.add(idx[k + j]) } }
  const gg = new T.BufferGeometry(); gg.setAttribute('position', new T.Float32BufferAttribute(new Float32Array(pos.count * 3), 3)); gg.setIndex(tri);
  shapes.push({ mesh, g: gg, used, body: group.name === 'corpo' });
}
const point = new T.Vector3(), ray = new T.Ray();
for (const name of (process.env.MOVIMENTOS || 'andar,correr').split(',')) {
  const buf = await fs.readFile(new URL('../../public/animacoes/mixamo/' + name + '.fbx', import.meta.url));
  const source = new (await import('three/addons/loaders/FBXLoader.js')).FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  const fonte = { raiz: source, ossos: ossosPorNome(source) }; fonte.rep = repouso(fonte.ossos);
  const clip = converter(source.animations[0], fonte, alvo_, { nome: name });
  const mixer = new T.AnimationMixer(root); mixer.clipAction(clip).play();
  mixer.update(0); cloth.reset(); let elapsed = 0;
  const frames = process.env.FULL ? Math.ceil(clip.duration * 30) : 12;
  let tested = 0, leaks = 0;
  for (let frame = 0; frame < frames; frame++) {
    const time = frame * (process.env.FULL ? 1 / 30 : clip.duration / frames);
    while (elapsed < time - .000001) { const dt = Math.min(Number(process.env.PASSO_FISICA) || 1 / 120, time - elapsed); mixer.update(dt); root.updateMatrixWorld(true); cloth.update(dt); elapsed += dt; }
    root.updateMatrixWorld(true); cloth.atualizarRender?.();
    const surfaces = [];
    for (const s of shapes) {
      const pos = s.mesh.geometry.attributes.position;
      for (const i of s.used) { point.fromBufferAttribute(pos, i); s.mesh.applyBoneTransform(i, point); if (process.env.PHYSICS === '1' && !s.body && !cloth.posicaoRender?.(s.mesh, i, point)) { const piece = cloth.engine.pecas.find(p => cloth.groups.find(gg => gg.mesh === p.malha).parts.includes(s.mesh)); const ind = s.mesh.geometry.attributes.aRoupaI, wei = s.mesh.geometry.attributes.aRoupaP; for (let k = 0; k < 4; k++) { const j = ind.getComponent(i, k) * 4, w = wei.getComponent(i, k); point.x += piece.dados[j] * w; point.y += piece.dados[j + 1] * w; point.z += piece.dados[j + 2] * w; } } point.applyMatrix4(s.mesh.matrixWorld); s.g.attributes.position.setXYZ(i, point.x, point.y, point.z); }
      if (!s.bvh) s.bvh = new MeshBVH(s.g, { targetLeafSize: 8 }); else s.bvh.refit(); surfaces.push({ body: s.body, bvh: s.bvh });
    }
    const center = alvo_.ossos.get('Hips').getWorldPosition(new T.Vector3());
    for (const angle of [0, Math.PI]) for (let x = -.16; x <= .16; x += .01) for (let y = .06; y <= .34; y += .01) {
      const vx = Math.sin(angle), vz = Math.cos(angle); ray.origin.set(center.x + vx * 2 + Math.cos(angle) * x, center.y + y, center.z + vz * 2 - Math.sin(angle) * x); ray.direction.set(-vx, 0, -vz);
      let skin = null, clothHit = null;
      for (const s of surfaces) { const h = s.bvh.raycastFirst(ray, T.DoubleSide); if (h) { if (s.body) { if (!skin || h.distance < skin.distance) skin = h; } else if (!clothHit || h.distance < clothHit.distance) clothHit = h; } }
      if (skin) { tested++; if (!clothHit || skin.distance < clothHit.distance - .001) leaks++; }
    }
  }
  console.log(`${name}: ${leaks} vazamentos / ${tested} raios`);
}
process.exit(0);
