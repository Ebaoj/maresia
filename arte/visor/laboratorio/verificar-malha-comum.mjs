// Reproduz o comparativo anterior (BASELINE=1) e verifica malha e mundo compartilhados no novo.
import assert from 'node:assert/strict';import fs from 'node:fs/promises';import * as T from 'three';import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {PADRAO} from '../../../src/config.js';import {criarMundoJolt} from '../../../src/jogador/jolt.js';import {criarTecidoJolt} from '../tecido-jolt.js';import {criarTecidoAmmo} from '../tecido-ammo.js';import {carregarAmmoNode} from '../ammo-node.mjs';import {criarRigidosJolt} from './rigidos-jolt.js';import {criarRigidosAmmo} from './rigidos-ammo.js';import {assinaturaMalha} from './roteiro.js';
const bytes=await fs.readFile(new URL('../../finais/neto-v6-corpo.glb',import.meta.url)),jl=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+jl));delete j.images;delete j.textures;delete j.samplers;j.materials=j.materials.map(m=>({name:m.name}));delete j.extensionsUsed;delete j.extensionsRequired;
const raw=Buffer.from(JSON.stringify(j)),json=Buffer.concat([raw,Buffer.alloc((4-raw.length%4)%4,32)]),bin=bytes.subarray(20+jl),rebuilt=Buffer.alloc(20+json.length+bin.length);bytes.copy(rebuilt,0,0,12);rebuilt.writeUInt32LE(rebuilt.length,8);rebuilt.writeUInt32LE(json.length,12);rebuilt.writeUInt32LE(0x4e4f534a,16);json.copy(rebuilt,20);bin.copy(rebuilt,20+json.length);
const results=[];
for(const tipo of ['jolt','ammo']){
 const {scene:root}=await new GLTFLoader().parseAsync(rebuilt.buffer.slice(rebuilt.byteOffset,rebuilt.byteOffset+rebuilt.byteLength),'');let tecido,rigidos;
 if(tipo==='jolt'){const jolt=await criarMundoJolt({laboratorio:true,gravidade:25,subpassos:2});tecido=await criarTecidoJolt(root,PADRAO.personagem,{jolt,mesmaMalha:!process.env.BASELINE});rigidos=criarRigidosJolt(jolt);}
 else{const A=await carregarAmmoNode();tecido=await criarTecidoAmmo(root,A,PADRAO.personagem,{gravidade:25,grupoCorpo:2,mascaraCorpo:17});rigidos=criarRigidosAmmo(A,tecido.debug.world,20);}
 const hash=assinaturaMalha(tecido);results.push({motor:tipo,hash,nos:tecido.stats.particles});tecido.reset();const ball=rigidos.esfera(.22,[2,2,0],{massa:.01}),view=new T.Object3D();
 for(let i=0;i<12;i++){root.position.z=i*.001;root.rotation.y=i*.002;root.updateMatrixWorld(true);tecido.update(1/60);for(const piece of tecido.engine.pecas)assert.ok(piece.dados.every(Number.isFinite),'Tecido não finito');}
 rigidos.ler(ball,view);assert.ok(view.position.y<1.8,'O objeto não avançou no mesmo passo de física do tecido');
}
console.log(JSON.stringify(results));assert.equal(results[0].hash,results[1].hash,'Motores receberam malhas diferentes');assert.equal(results[0].nos,results[1].nos);
