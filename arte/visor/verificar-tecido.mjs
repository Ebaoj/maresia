import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { criarTecidoFisico } from './tecido-fisica.js';
import { converter,repouso,ossosPorNome } from '../../src/jogador/retarget.js';
const bytes=await fs.readFile(new URL('../finais/neto-v5-fisica.glb',import.meta.url));
const jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl).toString());delete j.images;delete j.textures;delete j.samplers;delete j.materials;delete j.extensionsUsed;delete j.extensionsRequired;
for(const m of j.meshes)for(const p of m.primitives)delete p.material;
const raw=Buffer.from(JSON.stringify(j));const pad=(4-raw.length%4)%4;const json=Buffer.concat([raw,Buffer.alloc(pad,32)]);const bin=bytes.subarray(20+jl);const rebuilt=Buffer.alloc(20+json.length+bin.length);bytes.copy(rebuilt,0,0,12);rebuilt.writeUInt32LE(rebuilt.length,8);rebuilt.writeUInt32LE(json.length,12);rebuilt.writeUInt32LE(0x4e4f534a,16);json.copy(rebuilt,20);bin.copy(rebuilt,20+json.length);
const {scene:root}=await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength),'');
const data=JSON.parse(await fs.readFile(new URL('../finais/neto-v5-colisores.json',import.meta.url),'utf8'));
const alvo={raiz:root,ossos:ossosPorNome(root)};alvo.rep=repouso(alvo.ossos);
const cloth=criarTecidoFisico(root,data);const report=[];
for(const name of ['andar','correr','olhando']){
 const buf=await fs.readFile(new URL('../../public/animacoes/mixamo/'+name+'.fbx',import.meta.url));const src=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');const fonte={raiz:src,ossos:ossosPorNome(src)};fonte.rep=repouso(fonte.ossos);
 const clip=converter(src.animations[0],fonte,alvo,{nome:name});const mix=new T.AnimationMixer(root);mix.clipAction(clip).play();cloth.reset();let maxMs=0,meanMs=0,maxPenetration=0;
 const count=process.env.FULL?Math.ceil(clip.duration*30):5;
 for(let f=0;f<count;f++){mix.update(1/30);cloth.update(1/30);if(process.env.DEBUG)console.log(f,cloth.stats);const t=cloth.stats.physicsMs+cloth.stats.renderMs;maxMs=Math.max(t,maxMs);meanMs+=t;for(const ob of [cloth.shirt,cloth.pants])if(!ob.pos.every(Number.isFinite))throw Error('Non-finite simulation');for(const r of cloth.render){const pos=r.mesh.geometry.attributes.position;for(let i=0;i<pos.count;i+=31){const p=new T.Vector3().fromBufferAttribute(pos,i);const amount=cloth.body.contact(p,.0005,.05);if(process.env.DEBUG&&amount>.02){let seq=[amount];for(let z=0;z<5;z++)seq.push(cloth.body.contact(p,.0005,.08));console.log('DEPTH',r.o.name,i,seq);}maxPenetration=Math.max(maxPenetration,amount);}}}
 report.push({name,frames:count,maxPenetrationMm:maxPenetration*1000,maxMs,meanMs:meanMs/count,stats:{...cloth.stats}});mix.stopAllAction();console.log(JSON.stringify(report.at(-1)));
}
await fs.writeFile(new URL('./verificacao-tecido.json',import.meta.url),JSON.stringify(report,null,2));
