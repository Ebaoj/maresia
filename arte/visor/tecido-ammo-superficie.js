// O Bullet cria nós até o maior índice. Vértices sem faces virariam partículas soltas.
import * as T from 'three';
import {SimplifyModifier} from 'three/addons/modifiers/SimplifyModifier.js';
export function compactarSuperficieAmmo(geo){
 const used=[...new Set(geo.index.array)].sort((a,b)=>a-b),map=new Map(used.map((old,i)=>[old,i])),out=new T.BufferGeometry();
 for(const key of ['position','normal','skinIndex','skinWeight']){const attr=geo.attributes[key];if(!attr)continue;const values=new attr.array.constructor(used.length*attr.itemSize);for(let i=0;i<used.length;i++)for(let k=0;k<attr.itemSize;k++)values[i*attr.itemSize+k]=attr.getComponent(used[i],k);out.setAttribute(key,new T.BufferAttribute(values,attr.itemSize));}
 out.setIndex(Array.from(geo.index.array,i=>map.get(i)));if(!out.attributes.normal)out.computeVertexNormals();return out;
}

// O contato detalhado não precisa de duplicatas de UV/normal. Os pesos precisam coincidir.
export function prepararPeleAmmo(geo,alturaMin=-Infinity,larguraMax=Infinity,larguraMin=0){
 const pos=geo.attributes.position,si=geo.attributes.skinIndex,sw=geo.attributes.skinWeight,points=[],joints=[],weights=[],indices=[],map=new Map(),ids=new Map(),faces=new Set();
 function node(old){if(ids.has(old))return ids.get(old);const influences=[0,1,2,3].map(k=>[si.getComponent(old,k),sw.getComponent(old,k)]).filter(p=>p[1]>0).sort((a,b)=>a[0]-b[0]);const point=[pos.getX(old),pos.getY(old),pos.getZ(old)],key=point.map(v=>v.toFixed(6)).join(',')+'|'+JSON.stringify(influences);let i=map.get(key);if(i===undefined){i=points.length/3;map.set(key,i);points.push(...point);for(let k=0;k<4;k++){joints.push(si.getComponent(old,k));weights.push(sw.getComponent(old,k));}}ids.set(old,i);return i;}
 for(let k=0;k<geo.index.count;k+=3){const tri=[0,1,2].map(c=>geo.index.getX(k+c));if(!tri.some(i=>pos.getY(i)>=alturaMin&&Math.abs(pos.getX(i))<=larguraMax&&Math.abs(pos.getX(i))>=larguraMin))continue;const abc=tri.map(node);if(new Set(abc).size<3)continue;const key=[...abc].sort((a,b)=>a-b).join(',');if(faces.has(key))continue;faces.add(key);indices.push(...abc);}
 const out=new T.BufferGeometry();out.setAttribute('position',new T.Float32BufferAttribute(points,3));out.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints,4));out.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));out.setIndex(indices);out.computeVertexNormals();return compactarSuperficieAmmo(out);
}

// Redução só do colisor: o corpo desenhado fica intacto. O colapso mantém pontos originais.
// No three 0.186 o SimplifyModifier.modify() virou assíncrono (usa o Meshopt por baixo).
export async function simplificarPeleAmmo(geo,reducao){
 if(reducao<=0||geo.attributes.position.count<200)return geo;
 const src=geo.attributes.position,byPosition=new Map();for(let i=0;i<src.count;i++){const key=[src.getX(i),src.getY(i),src.getZ(i)].map(v=>v.toFixed(6)).join(',');if(byPosition.has(key))return geo;byPosition.set(key,i);}
 const plain=new T.BufferGeometry();plain.setAttribute('position',src.clone());plain.setIndex(geo.index.clone());const simple=await new SimplifyModifier().modify(plain,Math.floor(src.count*reducao));
 for(const key of ['skinIndex','skinWeight']){const attr=geo.attributes[key],out=new attr.array.constructor(simple.attributes.position.count*4);for(let i=0;i<simple.attributes.position.count;i++){const p=simple.attributes.position,k=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(','),source=byPosition.get(k);if(source===undefined)throw Error('A simplificação deslocou um ponto do colisor.');for(let c=0;c<4;c++)out[i*4+c]=attr.getComponent(source,c);}simple.setAttribute(key,new T.BufferAttribute(out,4));}
 simple.computeVertexNormals();return simple;
}
