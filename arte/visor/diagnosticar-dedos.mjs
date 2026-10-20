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


const counts={};root.traverse(o=>{if(!o.isSkinnedMesh||/camisa|calca/.test(o.name))return;const si=o.geometry.attributes.skinIndex,sw=o.geometry.attributes.skinWeight;for(let i=0;i<si.count;i++)for(let c=0;c<4;c++){const w=sw.getComponent(i,c);if(w>.01){const n=o.skeleton.bones[si.getComponent(i,c)].name;if(/Hand/.test(n))counts[n]=(counts[n]||0)+1}}});console.log(counts);
