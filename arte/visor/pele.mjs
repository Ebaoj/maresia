// Medidor de pele independente do winding: dentro/fora por paridade de raios.
// Usado pelas ferramentas de vestimento para medir a roupa contra o corpo.
import * as T from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export function criarMedidorPele (geo, matrixWorld = null) {
  const pos = geo.attributes.position, idx = geo.index.array;
  const n = pos.count;
  const p = new Float32Array(n * 3);
  const v = new T.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    if (matrixWorld) v.applyMatrix4(matrixWorld);
    p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z;
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(p, 3));
  g.setIndex(Array.from(idx));
  const bvh = new MeshBVH(g, { targetLeafSize: 8 });
  const dirs = [new T.Vector3(0.31, 0.13, 0.94).normalize(), new T.Vector3(-0.42, 0.22, 0.88).normalize(), new T.Vector3(0.19, -0.35, -0.92).normalize()];
  const alvo = { point: new T.Vector3(), distance: 0, faceIndex: 0 };
  const dentro = (ponto) => {
    let votos = 0;
    for (const d of dirs) {
      const hits = bvh.raycast(new T.Ray(ponto.clone().addScaledVector(d, 1e-4), d), T.DoubleSide);
      if (hits.length % 2 === 1) votos++;
    }
    return votos >= 2;
  };
  const distancia = (ponto) => { bvh.closestPointToPoint(ponto, alvo); return alvo.distance; };
  return { bvh, dentro, distancia, geometria: g, posicoes: p };
}
