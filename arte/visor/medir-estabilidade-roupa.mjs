import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { criarRoupa } from '../../src/jogador/roupa.js';
import { criarTecidoJolt } from './tecido-jolt.js';
import { criarTecidoAmmo } from './tecido-ammo.js';
import { carregarAmmoNode } from './ammo-node.mjs';
import { converter,repouso,ossosPorNome } from '../../src/jogador/retarget.js';
const bytes=await fs.readFile(process.env.MODELO_NETO || new URL('../finais/neto-v5-jolt.glb',import.meta.url));
const jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl).toString());delete j.images;delete j.textures;delete j.samplers;delete j.materials;delete j.extensionsUsed;delete j.extensionsRequired;
for(const m of j.meshes)for(const p of m.primitives)delete p.material;
const raw=Buffer.from(JSON.stringify(j));const pad=(4-raw.length%4)%4;const json=Buffer.concat([raw,Buffer.alloc(pad,32)]);const bin=bytes.subarray(20+jl);const rebuilt=Buffer.alloc(20+json.length+bin.length);bytes.copy(rebuilt,0,0,12);rebuilt.writeUInt32LE(rebuilt.length,8);rebuilt.writeUInt32LE(json.length,12);rebuilt.writeUInt32LE(0x4e4f534a,16);json.copy(rebuilt,20);bin.copy(rebuilt,20+json.length);
const {scene:root}=await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength),'');

const alvo={raiz:root,ossos:ossosPorNome(root)};alvo.rep=repouso(alvo.ossos);
if(process.env.BASELINE){const all=[];root.traverse(o=>{if(o.isSkinnedMesh)all.push(o);});const old=await criarRoupa(all);const expected=all.filter(o=>/camisa|calca/.test(o.name)).reduce((s,o)=>s+o.geometry.attributes.position.count,0),actual=old.pecas.reduce((s,p)=>s+p.malha.geometry.attributes.position.count,0);if(actual!==expected||!old.capsulas?.length)throw Error('BASELINE: frente/costas fora da simulação ou corpo sem colisores: '+actual+'/'+expected+' vértices; cápsulas '+(old.capsulas?.length||0));}
const cloth=process.env.MOTOR==='ammo'?await criarTecidoAmmo(root,await carregarAmmoNode()):await criarTecidoJolt(root);console.log('JOLT',cloth.stats);
const shirt=cloth.engine.pecas[0],edges=new Map();for(const face of shirt.proxy.faces)for(let k=0;k<3;k++){const key=[face[k],face[(k+1)%3]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1)}
if(process.env.SEM_COLISAO){cloth.engine.colisores.destruir();cloth.engine.colisores.mover=()=>{};}
const report={proxy:{points:shirt.P,faces:shirt.proxy.faces.length,edges:edges.size,nonManifoldEdges:[...edges.values()].filter(n=>n>2).length},motions:[]};
for(const name of ['T','andar','correr']){
 let mixer=null,clip=null;if(name!=='T'){const data=await fs.readFile(new URL('../../public/animacoes/mixamo/'+name+'.fbx',import.meta.url));const source=new FBXLoader().parse(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');const fonte={raiz:source,ossos:ossosPorNome(source)};fonte.rep=repouso(fonte.ossos);clip=converter(source.animations[0],fonte,alvo,{nome:name});mixer=new T.AnimationMixer(root);mixer.clipAction(clip).play();mixer.update(0);}cloth.reset();
 const second=[],delta=[],frames=name==='T'?600:Math.ceil(clip.duration*120)*3;let ant=null,prev=null,skinAnt=null,skinPrev=null;const skinSecond=[],piores=[];
 for(let f=0;f<frames;f++){mixer?.update(1/120);cloth.update(1/120);const now=shirt.sim.slice(),skin=shirt.pele.slice();if(f>frames/2&&ant&&prev){for(let k=0;k<shirt.P;k++){if(shirt.presos[k])continue;const i=k*3;delta.push(Math.hypot(now[i]-prev[i],now[i+1]-prev[i+1],now[i+2]-prev[i+2])*1000);const acc=Math.hypot(now[i]-2*prev[i]+ant[i],now[i+1]-2*prev[i+1]+ant[i+1],now[i+2]-2*prev[i+2]+ant[i+2])*1000;second.push(acc);skinSecond.push(Math.hypot(skin[i]-2*skinPrev[i]+skinAnt[i],skin[i+1]-2*skinPrev[i+1]+skinAnt[i+1],skin[i+2]-2*skinPrev[i+2]+skinAnt[i+2])*1000);if(acc>30)piores.push({frame:f,point:k,rest:shirt.proxy.pontos[k].toArray(),acc});}}ant=prev;prev=now;skinAnt=skinPrev;skinPrev=skin;}
 const stats=arr=>{arr.sort((a,b)=>a-b);return{max:arr.at(-1),p95:arr[Math.floor(arr.length*.95)],p99:arr[Math.floor(arr.length*.99)],mean:arr.reduce((a,b)=>a+b,0)/arr.length}};report.motions.push({name,deltaMm:stats(delta),secondDifferenceMm:stats(second),skinSecondMm:stats(skinSecond),worst:piores.sort((a,b)=>b.acc-a.acc).slice(0,12)});console.log(report.motions.at(-1));mixer?.stopAllAction();}
await fs.writeFile(process.env.RELATORIO_ESTABILIDADE,JSON.stringify(report,null,2));console.log(report.proxy);
if(process.env.ASSERT_ESTAVEL && report.motions[0].deltaMm.p99>.5)throw Error('Camisa parada continua oscilando mais de 0,5 mm por subpasso');
