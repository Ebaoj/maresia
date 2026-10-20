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



root.updateMatrixWorld(true);const head=[];root.traverse(o=>{if(o.isSkinnedMesh&&o.name==='neto002_1'){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++)head.push(new T.Vector3().fromBufferAttribute(p,i).toArray());}});for(const y of [1.20,1.21,1.22,1.23,1.24,1.25,1.265]){const a=head.filter(p=>Math.abs(p[1]-y)<.003);console.log(y,a.length,a.length?{xmin:Math.min(...a.map(p=>p[0])),xmax:Math.max(...a.map(p=>p[0])),zmin:Math.min(...a.map(p=>p[2])),zmax:Math.max(...a.map(p=>p[2]))}:null);}
