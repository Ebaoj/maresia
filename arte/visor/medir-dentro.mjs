// Mede o quanto a roupa nasce dentro da pele, sem depender do winding das faces.
// O winding do corpo é misto (parte das faces aponta para dentro), então o sinal pela
// normal da face é confiável. Aqui o dentro/fora vem de paridade (contagem de interseções
// de um raio) e a direção para fora vem da normal da face, orientada pelo teste.
//
// uso: node arte/visor/medir-dentro.mjs [MODELO] [--json SAIDA]
import fs from 'node:fs/promises';
import * as T from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { carregarSemTexturas } from './diag-vestimento.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d };
const posicional = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const ARQ = posicional || arg('--modelo', 'arte/finais/neto-vestido.glb');
const SAIDA = arg('--json', null);

const { scene } = await carregarSemTexturas(ARQ);
scene.updateMatrixWorld(true);
const malhas = [];
scene.traverse(o => { if (o.isMesh) malhas.push(o); });
const corpo = malhas.find(o => !/camisa|calca/i.test(o.name));
const camisas = malhas.filter(o => /camisa/i.test(o.name));
if (!corpo || !camisas.length) throw Error('corpo ou camisa não encontrados');

// geometria do corpo no espaço do mundo
const gC = corpo.geometry, posC = gC.attributes.position, idxC = gC.index.array;
const mundoC = posC.count;
const pC = new Float32Array(mundoC * 3);
for (let i = 0; i < mundoC; i++) {
  const v = new T.Vector3().fromBufferAttribute(posC, i).applyMatrix4(corpo.matrixWorld);
  pC[i * 3] = v.x; pC[i * 3 + 1] = v.y; pC[i * 3 + 2] = v.z;
}
const gBvh = new T.BufferGeometry();
gBvh.setAttribute('position', new T.BufferAttribute(pC, 3));
gBvh.setIndex(Array.from(idxC));
const bvh = new MeshBVH(gBvh, { targetLeafSize: 8 });

// quantas camadas o corpo tem? raio de fora para dentro no tronco
const camadas = [];
for (const alvo of [new T.Vector3(0, 1.05, 0), new T.Vector3(0, 0.95, 0), new T.Vector3(0.08, 1.10, 0)]) {
  const origem = alvo.clone().add(new T.Vector3(0, 0, 1.2));
  const hits = bvh.raycast(new T.Ray(origem, new T.Vector3(0, 0, -1)), T.DoubleSide);
  camadas.push(hits.length);
}
console.log('camadas no tronco (raio de fora para dentro):', camadas.join(', '));

// teste de paridade: dentro = número ímpar de interseções
const direcoes = [new T.Vector3(0.3, 0.1, 1).normalize(), new T.Vector3(-0.4, 0.2, 0.9).normalize(), new T.Vector3(0.2, -0.3, -1).normalize()];
function dentro (v) {
  let votos = 0;
  for (const d of direcoes) {
    const hits = bvh.raycast(new T.Ray(v.clone().addScaledVector(d, 1e-4), d), T.DoubleSide);
    if (hits.length % 2 === 1) votos++;
  }
  return votos >= 2;
}

const alvo = { point: new T.Vector3(), distance: 0, faceIndex: 0 };
const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3();
const medidas = [];
for (const camisa of camisas) {
  const g = camisa.geometry, pos = g.attributes.position;
  const lista = [];
  for (let i = 0; i < pos.count; i++) {
    const v = new T.Vector3().fromBufferAttribute(pos, i).applyMatrix4(camisa.matrixWorld);
    bvh.closestPointToPoint(v, alvo);
    const t = alvo.faceIndex * 3;
    a.fromBufferAttribute(posC, idxC[t]); b.fromBufferAttribute(posC, idxC[t + 1]); c.fromBufferAttribute(posC, idxC[t + 2]);
    n.crossVectors(b.sub(a), c.sub(a)).normalize();
    const dentroPele = dentro(v);
    // normal para fora: se o vértice está dentro, a normal da face que aponta para o interior está invertida
    const sinal = dentroPele ? -1 : 1;
    const s = (v.x - alvo.point.x) * n.x * sinal + (v.y - alvo.point.y) * n.y * sinal + (v.z - alvo.point.z) * n.z * sinal;
    lista.push({ i, x: v.x, y: v.y, z: v.z, s, dentro: dentroPele, dist: alvo.distance });
  }
  medidas.push({ nome: camisa.name, lista });
}

// resumo
for (const { nome, lista } of medidas) {
  const dentroN = lista.filter(m => m.dentro).length;
  const foraN = lista.filter(m => !m.dentro).length;
  const depths = lista.filter(m => m.dentro).map(m => -m.s).sort((x, y) => y - x);
  const hist = {};
  for (const d of depths) { const k = (Math.floor(d * 100) / 100).toFixed(2); hist[k] = (hist[k] || 0) + 1; }
  console.log(`\n=== ${nome}: ${lista.length} vértices | dentro: ${dentroN} | fora: ${foraN}`);
  console.log(`profundidade máxima: ${(depths[0] ?? 0).toFixed(3)} m | mediana: ${(depths[Math.floor(depths.length / 2)] ?? 0).toFixed(3)} m`);
  console.log('histograma (m):', JSON.stringify(hist));
  // onde estão os piores
  const piores = lista.filter(m => m.dentro).sort((x, y) => x.s - y.s).slice(0, 5);
  for (const p of piores) console.log(`  pior: x=${p.x.toFixed(3)} y=${p.y.toFixed(3)} z=${p.z.toFixed(3)} profundidade=${(-p.s).toFixed(3)}`);
}
if (SAIDA) await fs.writeFile(SAIDA, JSON.stringify(medidas));
