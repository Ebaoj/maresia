// Regressão das mangas e do cós na corrida: interseções reais entre triângulos
// desenhados, com segmento >2 mm (comprimento, não profundidade). Traseiro =
// z menor que o quadril; registra também contatos dos braços na frente.
// ASSERT_COSTAS permanece estrito: qualquer cruzamento traseiro reprova.
import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { MeshBVH } from 'three-mesh-bvh';
import { criarTecidoJolt } from './tecido-jolt.js';
const {criarTecidoAmmo}=await import(process.env.ADAPTADOR_AMMO||'./tecido-ammo.js');
import { carregarAmmoNode } from './ammo-node.mjs';
import { converter,repouso,ossosPorNome } from '../../src/jogador/retarget.js';
const bytes=await fs.readFile(process.env.MODELO_NETO || new URL('../finais/neto-v5-jolt.glb',import.meta.url));
const jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl).toString());delete j.images;delete j.textures;delete j.samplers;j.materials=j.materials?.map(m=>({name:m.name}));delete j.extensionsUsed;delete j.extensionsRequired;

const raw=Buffer.from(JSON.stringify(j));const pad=(4-raw.length%4)%4;const json=Buffer.concat([raw,Buffer.alloc(pad,32)]);const bin=bytes.subarray(20+jl);const rebuilt=Buffer.alloc(20+json.length+bin.length);bytes.copy(rebuilt,0,0,12);rebuilt.writeUInt32LE(rebuilt.length,8);rebuilt.writeUInt32LE(json.length,12);rebuilt.writeUInt32LE(0x4e4f534a,16);json.copy(rebuilt,20);bin.copy(rebuilt,20+json.length);
const {scene:root}=await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength),'');


const alvo={raiz:root,ossos:ossosPorNome(root)};alvo.rep=repouso(alvo.ossos);const cloth=process.env.MOTOR==='ammo'?await criarTecidoAmmo(root,await carregarAmmoNode()):await criarTecidoJolt(root);cloth.setActive(process.env.PHYSICS==='1');
const shapes=[];
for(const group of cloth.groups)for(const mesh of group.parts){
 const pos=mesh.geometry.attributes.position,idx=mesh.geometry.index.array;const tri=[];const used=new Set();
 for(let k=0;k<idx.length;k+=3){const y=(pos.getY(idx[k])+pos.getY(idx[k+1])+pos.getY(idx[k+2]))/3;if(false)continue;for(let j=0;j<3;j++){tri.push(idx[k+j]);used.add(idx[k+j]);}}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(pos.count*3),3));g.setIndex(tri);shapes.push({mesh,g,used,body:group.name==='corpo',group:group.name});
}
const point=new T.Vector3(),ray=new T.Ray();const report=[];
for(const name of (process.env.MOVIMENTOS||'andar').split(',')){const buf=await fs.readFile(new URL('../../public/animacoes/mixamo/'+name+'.fbx',import.meta.url));const source=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');const fonte={raiz:source,ossos:ossosPorNome(source)};fonte.rep=repouso(fonte.ossos);const clip=converter(source.animations[0],fonte,alvo,{nome:name});const mixer=new T.AnimationMixer(root);mixer.clipAction(clip).play();
mixer.update(0);cloth.reset();let elapsed=0;
const frames=Math.ceil(clip.duration*30)*(Number(process.env.CICLOS)||1);
for(let frame=0;frame<frames;frame++){
 const time=frame/30;
 while(elapsed<time-.000001){const dt=Math.min(Number(process.env.PASSO_FISICA)||1/120,time-elapsed);mixer.update(dt);root.updateMatrixWorld(true);cloth.update(dt);elapsed+=dt;}
 root.updateMatrixWorld(true);cloth.atualizarRender?.();
 const surfaces=[];
 for(const s of shapes){const pos=s.mesh.geometry.attributes.position;for(const i of s.used){point.fromBufferAttribute(pos,i);s.mesh.applyBoneTransform(i,point);if(process.env.PHYSICS==='1'&&!s.body&&!cloth.posicaoRender?.(s.mesh,i,point)){const piece=cloth.engine.pecas.find(p=>cloth.groups.find(g=>g.mesh===p.malha).parts.includes(s.mesh));const ind=s.mesh.geometry.attributes.aRoupaI,wei=s.mesh.geometry.attributes.aRoupaP;for(let k=0;k<4;k++){const j=ind.getComponent(i,k)*4,w=wei.getComponent(i,k);point.x+=piece.dados[j]*w;point.y+=piece.dados[j+1]*w;point.z+=piece.dados[j+2]*w;}}if(process.env.PHYSICS==='1'&&!s.body&&s.mesh.geometry.attributes.aRoupaContato){const c=s.mesh.geometry.attributes.aRoupaContato;point.x+=c.getX(i);point.y+=c.getY(i);point.z+=c.getZ(i);}
point.applyMatrix4(s.mesh.matrixWorld);s.g.attributes.position.setXYZ(i,point.x,point.y,point.z);}if(!s.bvh)s.bvh=new MeshBVH(s.g,{targetLeafSize:8});else s.bvh.refit();surfaces.push({body:s.body,bvh:s.bvh,source:s.mesh.material.name,group:s.group});}
 const center=alvo.ossos.get('Hips').getWorldPosition(new T.Vector3());let tested=0,leaks=0,examples=[],porMaterial={};
 const segment=new T.Line3(),identity=new T.Matrix4();
 for(const shirt of surfaces.filter(s=>s.group==='camisa'))for(const other of surfaces.filter(s=>s.group!=='camisa')){
  const counts=porMaterial[other.source]??={tested:0,leaks:0,traseiros:0};
  shirt.bvh.bvhcast(other.bvh,identity,{intersectsTriangles(a,b){
   tested++;counts.tested++;
   if(a.intersectsTriangle(b,segment)&&segment.distance()>.002){const midpoint=segment.getCenter(new T.Vector3());if((midpoint.z<center.z||other.source==='Material_0.011')&&midpoint.y>center.y-.10){leaks++;counts.leaks++;if(midpoint.z<center.z)counts.traseiros++;if(examples.length<12)examples.push({point:midpoint.toArray(),source:other.source,length:segment.distance()});}}
   return false;
  }});
 }
 report.push({motion:name,physics:process.env.PHYSICS==='1',time,tested,leaks,porMaterial,examples});if(leaks)console.log(JSON.stringify(report.at(-1)));
}
mixer.stopAllAction();console.log(name,JSON.stringify(report.filter(r=>r.motion===name).reduce((a,r)=>({frames:a.frames+1,tested:a.tested+r.tested,leaks:a.leaks+r.leaks}),{frames:0,tested:0,leaks:0})));}
console.log('PERF',cloth.debug?.perf);await fs.writeFile(process.env.RELATORIO_COBERTURA || new URL('./cobertura-jolt.json',import.meta.url),JSON.stringify(report,null,2));

if(process.env.ASSERT_COSTAS&&report.some(r=>Object.values(r.porMaterial).some(m=>m.traseiros)))throw Error('Ainda há cruzamentos traseiros');
if(process.env.ASSERT_SEM_ATRAVESSAR&&report.some(r=>r.leaks))throw Error('As superfícies ainda se cruzam atrás: '+report.reduce((sum,r)=>sum+r.leaks,0));
