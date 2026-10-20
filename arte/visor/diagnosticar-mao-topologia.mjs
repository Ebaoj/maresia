import fs from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { criarRoupa } from '../../src/jogador/roupa.js';
import { criarTecidoJolt } from './tecido-jolt.js';
import { converter,repouso,ossosPorNome } from '../../src/jogador/retarget.js';
const bytes=await fs.readFile(new URL('../finais/neto-v5-jolt.glb',import.meta.url));
const jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl).toString());delete j.images;delete j.textures;delete j.samplers;delete j.materials;delete j.extensionsUsed;delete j.extensionsRequired;
for(const m of j.meshes)for(const p of m.primitives)delete p.material;
const raw=Buffer.from(JSON.stringify(j));const pad=(4-raw.length%4)%4;const json=Buffer.concat([raw,Buffer.alloc(pad,32)]);const bin=bytes.subarray(20+jl);const rebuilt=Buffer.alloc(20+json.length+bin.length);bytes.copy(rebuilt,0,0,12);rebuilt.writeUInt32LE(rebuilt.length,8);rebuilt.writeUInt32LE(json.length,12);rebuilt.writeUInt32LE(0x4e4f534a,16);json.copy(rebuilt,20);bin.copy(rebuilt,20+json.length);
const {scene:root}=await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength),'');



root.updateMatrixWorld(true);const verts=[],faces=[],keys=new Map(),p=new T.Vector3();
root.traverse(o=>{if(!o.isSkinnedMesh||/camisa|calca/.test(o.name))return;const pos=o.geometry.attributes.position,idx=o.geometry.index.array,map=new Map();for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i).applyMatrix4(o.matrixWorld);if(p.x<.508)continue;const v=[p.x,-p.z,p.y],key=v.map(x=>Math.round(x*1e6)).join(',');if(!keys.has(key)){keys.set(key,verts.length);verts.push(v)}map.set(i,keys.get(key));}for(let k=0;k<idx.length;k+=3){const f=[map.get(idx[k]),map.get(idx[k+1]),map.get(idx[k+2])];if(f.every(i=>i!==undefined))faces.push(f);}});
await fs.writeFile('/Users/joabecornelio/Documents/Codex/2026-10-19/no-mac-em-algum-momento-estavamos/work/neto/tecido-fluido/mao-topologia.json',JSON.stringify({verts,faces}));console.log(verts.length,faces.length);
