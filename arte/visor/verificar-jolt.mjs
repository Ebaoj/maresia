import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { criarRoupa } from '../../src/jogador/roupa.js';
import { criarTecidoJolt } from './tecido-jolt.js';
import { converter,repouso,ossosPorNome } from '../../src/jogador/retarget.js';
const bytes=await fs.readFile(process.env.MODELO_NETO || new URL('../finais/neto-v5-jolt.glb',import.meta.url));
const jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl).toString());delete j.images;delete j.textures;delete j.samplers;delete j.materials;delete j.extensionsUsed;delete j.extensionsRequired;
for(const m of j.meshes)for(const p of m.primitives)delete p.material;
const raw=Buffer.from(JSON.stringify(j));const pad=(4-raw.length%4)%4;const json=Buffer.concat([raw,Buffer.alloc(pad,32)]);const bin=bytes.subarray(20+jl);const rebuilt=Buffer.alloc(20+json.length+bin.length);bytes.copy(rebuilt,0,0,12);rebuilt.writeUInt32LE(rebuilt.length,8);rebuilt.writeUInt32LE(json.length,12);rebuilt.writeUInt32LE(0x4e4f534a,16);json.copy(rebuilt,20);bin.copy(rebuilt,20+json.length);
const {scene:root}=await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength),'');

const alvo={raiz:root,ossos:ossosPorNome(root)};alvo.rep=repouso(alvo.ossos);
if(process.env.BASELINE){const all=[];root.traverse(o=>{if(o.isSkinnedMesh)all.push(o);});const old=await criarRoupa(all);const expected=all.filter(o=>/camisa|calca/.test(o.name)).reduce((s,o)=>s+o.geometry.attributes.position.count,0),actual=old.pecas.reduce((s,p)=>s+p.malha.geometry.attributes.position.count,0);if(actual!==expected||!old.capsulas?.length)throw Error('BASELINE: frente/costas fora da simulação ou corpo sem colisores: '+actual+'/'+expected+' vértices; cápsulas '+(old.capsulas?.length||0));}
const cloth=await criarTecidoJolt(root);console.log('JOLT',cloth.stats);
const expected=[];root.traverse(o=>{if(o.isSkinnedMesh&&/camisa|calca/.test(o.name)&&o.visible)expected.push(o);});
if(cloth.render.length!==expected.length||cloth.stats.garments!==2||cloth.stats.capsules<4)throw Error('Integração incompleta');
for(const {mesh} of cloth.render)for(const name of ['aRoupaI','aRoupaP','aRoupaDentro'])if(mesh.geometry.attributes[name].count!==mesh.geometry.attributes.position.count)throw Error('Parte sem simulação');
const report=[];
for(const name of ['andar','correr','olhando']){
 const buf=await fs.readFile(new URL('../../public/animacoes/mixamo/'+name+'.fbx',import.meta.url));const source=new FBXLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'');const fonte={raiz:source,ossos:ossosPorNome(source)};fonte.rep=repouso(fonte.ossos);const clip=converter(source.animations[0],fonte,alvo,{nome:name});const mixer=new T.AnimationMixer(root);mixer.clipAction(clip).play();mixer.update(0);cloth.reset();
 const count=process.env.FULL?Math.ceil(clip.duration*120):12;let maxOffset=0,maxPinned=0,totalMs=0;
 for(let frame=0;frame<count;frame++){
  const start=performance.now();mixer.update(1/120);cloth.update(1/120);totalMs+=performance.now()-start;
  for(const p of cloth.engine.pecas){if(!p.dados.every(Number.isFinite))throw Error('Simulação não finita');for(let k=0;k<p.P;k++){const d=Math.hypot(...p.dados.subarray(k*4,k*4+3));maxOffset=Math.max(maxOffset,d);if(p.presos[k]){maxPinned=Math.max(maxPinned,d);if(d>.002&&process.env.PINNED)throw Error('Pino afastou '+(d*1000)+' mm em '+name+'; ativo='+p.corpo.IsActive());}}}
 }
 report.push({motion:name,steps:count,maxOffsetMm:maxOffset*1000,maxPinnedMm:maxPinned*1000,meanStepMs:totalMs/count});console.log(report.at(-1));mixer.stopAllAction();
}
await fs.writeFile(process.env.RELATORIO_JOLT || new URL('./verificacao-jolt.json',import.meta.url),JSON.stringify({stats:cloth.stats,motions:report},null,2));
