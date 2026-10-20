import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { criarRoupa } from '../../src/jogador/roupa.js';
import { criarTecidoJolt } from './tecido-jolt.js';
import { converter,repouso,ossosPorNome } from '../../src/jogador/retarget.js';
import { usarDedosGravados } from '../../src/jogador/dedos.js';
import { PADRAO } from '../../src/config.js';
const bytes=await fs.readFile(process.env.MAOS_MODELO || new URL('../finais/neto-v5-jolt.glb',import.meta.url));
const jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl).toString());delete j.images;delete j.textures;delete j.samplers;delete j.materials;delete j.extensionsUsed;delete j.extensionsRequired;
for(const m of j.meshes)for(const p of m.primitives)delete p.material;
const raw=Buffer.from(JSON.stringify(j));const pad=(4-raw.length%4)%4;const json=Buffer.concat([raw,Buffer.alloc(pad,32)]);const bin=bytes.subarray(20+jl);const rebuilt=Buffer.alloc(20+json.length+bin.length);bytes.copy(rebuilt,0,0,12);rebuilt.writeUInt32LE(rebuilt.length,8);rebuilt.writeUInt32LE(json.length,12);rebuilt.writeUInt32LE(0x4e4f534a,16);json.copy(rebuilt,20);bin.copy(rebuilt,20+json.length);
const {scene:root}=await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength),'');



const alvo={raiz:root,ossos:ossosPorNome(root)};alvo.rep=repouso(alvo.ossos);
const yb=await fs.readFile(new URL('../../public/animacoes/mixamo/ybot.fbx',import.meta.url));const ybot=new FBXLoader().parse(yb.buffer.slice(yb.byteOffset,yb.byteOffset+yb.byteLength),'');const repFonte=repouso(ossosPorNome(ybot));
const shapes=[];const point=new T.Vector3();
root.updateMatrixWorld(true);
root.traverse(mesh=>{if(!mesh.isSkinnedMesh||/camisa|calca/.test(mesh.name))return;const pos=mesh.geometry.attributes.position,idx=mesh.geometry.index.array,used=new Set(),edges=[],seen=new Set();for(let k=0;k<idx.length;k+=3)for(let j=0;j<3;j++){const a=idx[k+j],b=idx[k+(j+1)%3];if(Math.min(Math.abs(pos.getX(a)),Math.abs(pos.getX(b)))<.55)continue;const key=[Math.min(a,b),Math.max(a,b)].join(',');if(seen.has(key))continue;seen.add(key);const len=new T.Vector3().fromBufferAttribute(pos,a).distanceTo(new T.Vector3().fromBufferAttribute(pos,b));if(len<.002)continue;edges.push([a,b,len]);used.add(a);used.add(b);}if(edges.length)shapes.push({mesh,used,edges,points:new Float32Array(pos.count*3)});});
const report=[];
for(const name of (process.env.MAOS_MOV? [process.env.MAOS_MOV]:['andar','correr','olhando'])){
 const b=await fs.readFile(new URL('../../public/animacoes/mixamo/'+name+'.fbx',import.meta.url));const source=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');const fonte={raiz:source,ossos:ossosPorNome(source),rep:repFonte};let c=converter(source.animations[0],fonte,alvo,{nome:name});if(name==='andar' && PADRAO.personagem.dedosReferenciaAndar!=='andar'){const bytesRef=await fs.readFile(new URL('../../public/animacoes/mixamo/'+PADRAO.personagem.dedosReferenciaAndar+'.fbx',import.meta.url));const ref=new FBXLoader().parse(bytesRef.buffer.slice(bytesRef.byteOffset,bytesRef.byteOffset+bytesRef.byteLength),'');const convertido=converter(ref.animations[0],{raiz:ref,ossos:ossosPorNome(ref),rep:repFonte},alvo,{nome:name});c=usarDedosGravados(c,convertido,{fechamento:PADRAO.personagem.dedosFecharCiclo});}const mixer=new T.AnimationMixer(root);mixer.clipAction(c).play();const ratios=[];let max=0,worst=null;
 for(let frame=0;frame<Math.ceil(c.duration*30);frame++){mixer.setTime(frame/30);root.updateMatrixWorld(true);for(const s of shapes){for(const i of s.used){point.fromBufferAttribute(s.mesh.geometry.attributes.position,i);s.mesh.applyBoneTransform(i,point);point.toArray(s.points,i*3);}for(const [a,b,len]of s.edges){const length=Math.hypot(s.points[a*3]-s.points[b*3],s.points[a*3+1]-s.points[b*3+1],s.points[a*3+2]-s.points[b*3+2]),ratio=length/len;ratios.push(ratio);if(ratio>max){max=ratio;worst={frame,mesh:s.mesh.name,edge:[a,b],restLength:len,posedLength:length,vertices:[a,b].map(i=>({rest:new T.Vector3().fromBufferAttribute(s.mesh.geometry.attributes.position,i).toArray(),weights:[0,1,2,3].map(c=>[s.mesh.skeleton.bones[s.mesh.geometry.attributes.skinIndex.getComponent(i,c)].name,s.mesh.geometry.attributes.skinWeight.getComponent(i,c)])}))}}}}}
 ratios.sort((a,b)=>a-b);const item={motion:name,edgesEvaluated:ratios.length,maxStretch:max,p99:ratios[Math.floor(ratios.length*.99)],stretchedOver2:ratios.filter(v=>v>2).length,worst,fingerTracks:c.tracks.filter(t=>/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(t.name)).length};report.push(item);console.log(item);mixer.stopAllAction();
}
await fs.writeFile(process.env.MAOS_REPORT||'/Users/joabecornelio/Documents/Codex/2026-10-19/no-mac-em-algum-momento-estavamos/work/neto/tecido-fluido/maos-antes.json',JSON.stringify(report,null,2));
if(process.env.ASSERT_MAOS && report.some(r=>r.maxStretch>3))throw Error('A mão tem arestas esticadas mais de três vezes nas poses gravadas');
