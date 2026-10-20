// Vestir uma superfície única: paredes internas da peça gerada não podem ocupar a face externa.
// A pintura original é transferida por proximidade, sem modificar o corpo.
import * as T from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export function limparSuperficieCamisa(group,fisicaRefinada=true){
 const proxy=group.mesh.userData.roupaProxy;if(!proxy)return;
 const source=group.parts.map(mesh=>{const geometry=mesh.geometry.clone();return {mesh,geometry,bvh:new MeshBVH(geometry,{targetLeafSize:8})};});
 const p=proxy.attributes.position,si=proxy.attributes.skinIndex,sw=proxy.attributes.skinWeight;
 const vertices=Array.from({length:p.count},(_,i)=>({sim:[[i,1]],p:new T.Vector3().fromBufferAttribute(p,i),skin:[0,1,2,3].map(k=>[si.getComponent(i,k),sw.getComponent(i,k)])}));
 const edges=new Map();
 function meio(a,b){const key=[a,b].sort((a,b)=>a-b).join(',');if(edges.has(key))return edges.get(key);const skin=new Map();for(const i of [a,b])for(const [bone,w]of vertices[i].skin)skin.set(bone,(skin.get(bone)||0)+w/2);const weights=[...skin].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=weights.reduce((s,p)=>s+p[1],0);while(weights.length<4)weights.push([0,0]);const index=vertices.length;vertices.push({sim:[[a,.5],[b,.5]],p:vertices[a].p.clone().add(vertices[b].p).multiplyScalar(.5),skin:weights.map(([b,w])=>[b,w/sum])});edges.set(key,index);return index;}
 const faces=[];for(let i=0;i<proxy.index.count;i+=3){const a=proxy.index.getX(i),b=proxy.index.getX(i+1),c=proxy.index.getX(i+2),ab=meio(a,b),bc=meio(b,c),ca=meio(c,a);faces.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);}
 const physical=new T.BufferGeometry();physical.setAttribute('position',new T.Float32BufferAttribute(vertices.flatMap(v=>v.p.toArray()),3));physical.setAttribute('skinIndex',new T.Uint16BufferAttribute(vertices.flatMap(v=>v.skin.map(p=>p[0])),4));physical.setAttribute('skinWeight',new T.Float32BufferAttribute(vertices.flatMap(v=>v.skin.map(p=>p[1])),4));physical.setIndex(faces.flat());physical.computeVertexNormals();group.mesh.userData.roupaProxy=fisicaRefinada?physical:proxy;group.simPais=vertices.map((v,i)=>fisicaRefinada?[[i,1]]:v.sim);
 const buffers=source.map(()=>({position:[],normal:[],uv:[],skinIndex:[],skinWeight:[],sim:[]})),center=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),bary=new T.Vector3(),hit={point:new T.Vector3()};
 for(const face of faces){center.copy(vertices[face[0]].p).add(vertices[face[1]].p).add(vertices[face[2]].p).multiplyScalar(1/3);let best=0,distance=Infinity;source.forEach((s,i)=>{const h=s.bvh.closestPointToPoint(center);if(h.distance<distance){distance=h.distance;best=i;}});const s=source[best],out=buffers[best];
  for(const node of face){const v=vertices[node];s.bvh.closestPointToPoint(v.p,hit);const ids=[0,1,2].map(k=>s.geometry.index.getX(hit.faceIndex*3+k));a.fromBufferAttribute(s.geometry.attributes.position,ids[0]);b.fromBufferAttribute(s.geometry.attributes.position,ids[1]);c.fromBufferAttribute(s.geometry.attributes.position,ids[2]);T.Triangle.getBarycoord(hit.point,a,b,c,bary);const uv=new T.Vector2();for(let k=0;k<3;k++)uv.addScaledVector(new T.Vector2().fromBufferAttribute(s.geometry.attributes.uv,ids[k]),bary.getComponent(k));out.position.push(...v.p.toArray());out.normal.push(physical.attributes.normal.getX(node),physical.attributes.normal.getY(node),physical.attributes.normal.getZ(node));out.uv.push(...uv.toArray());out.skinIndex.push(...v.skin.map(p=>p[0]));out.skinWeight.push(...v.skin.map(p=>p[1]));out.sim.push(node);}
 }
 const geometries=[];group.simRender=[];
 source.forEach((s,i)=>{const out=buffers[i],geo=new T.BufferGeometry();for(const name of ['position','normal','uv','skinIndex','skinWeight'])geo.setAttribute(name,name==='skinIndex'?new T.Uint16BufferAttribute(out[name],4):new T.Float32BufferAttribute(out[name],name==='uv'?2:name==='skinWeight'?4:3));geo.setIndex(Array.from({length:out.sim.length},(_,i)=>i));s.mesh.geometry=geo;geometries.push(geo);group.simRender.push(...out.sim);s.geometry.dispose();});group.mesh.geometry=mergeGeometries(geometries,false);
}
