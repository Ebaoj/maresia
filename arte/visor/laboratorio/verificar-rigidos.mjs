// Verifica corpos no mesmo mundo do motor escolhido: queda, massa, impulso e cápsula cinemática.
import assert from 'node:assert/strict';
import * as T from 'three';
import {criarMundoJolt} from '../../../src/jogador/jolt.js';
import {carregarAmmoNode} from '../ammo-node.mjs';
import {criarRigidosJolt} from './rigidos-jolt.js';
import {criarRigidosAmmo} from './rigidos-ammo.js';
import {OBJETOS_FISICOS,massaObjeto} from '../../../src/mundo/objetos-fisicos.js';
const tipo=process.argv[2]||'jolt';let backend;
if(tipo==='jolt')backend=criarRigidosJolt(await criarMundoJolt({laboratorio:true,gravidade:25,subpassos:2}));
else{const A=await carregarAmmoNode(),c=new A.btSoftBodyRigidBodyCollisionConfiguration(),d=new A.btCollisionDispatcher(c),b=new A.btDbvtBroadphase(),s=new A.btSequentialImpulseConstraintSolver(),ss=new A.btDefaultSoftBodySolver(),world=new A.btSoftRigidDynamicsWorld(d,b,s,c,ss),g=new A.btVector3(0,-500,0);world.setGravity(g);world.getWorldInfo().set_m_gravity(g);backend=criarRigidosAmmo(A,world,20);}
const ground=new T.PlaneGeometry(20,20,2,2);ground.rotateX(-Math.PI/2);backend.terreno(ground);const desc=OBJETOS_FISICOS.bola,ball=backend.esfera(desc.raio,[0,2,0],{massa:massaObjeto('bola'),atrito:desc.atrito,restituicao:desc.restituicao}),mesh=new T.Object3D();
backend.caixa([.3,.5,.3],[3,.5,0],{atrito:.7});const capsule=backend.capsula(.5,.33,[-2,.85,0],{cinematico:true});
for(let i=0;i<240;i++){backend.passo(1/60,2);backend.ler(ball,mesh);assert.ok(Number.isFinite(mesh.position.y));assert.ok(mesh.position.y>desc.raio-.035,'A bola atravessou o terreno');}
assert.ok(Math.abs(mesh.position.y-desc.raio)<.04,'A bola não assentou no chão');
const v0=backend.velocidade(ball)[0],impulse=massaObjeto('bola')*2;backend.impulso(ball,[impulse,0,0]);const dv=backend.velocidade(ball)[0]-v0,mass=impulse/dv;
assert.ok(Math.abs(mass-massaObjeto('bola'))<1e-6,'A resposta ao impulso indica massa/unidades incorretas');
if(tipo==='jolt')assert.ok(Math.abs(1/ball.body.GetMotionProperties().GetInverseMass()-mass)<1e-6);
assert.ok(dv>1.95&&dv<2.05,'Impulso com unidades incorretas');
backend.reset(ball);for(let i=0;i<180;i++)backend.passo(1/60,2);
backend.reset(ball);ball.position=[0,.22,0];backend.reset(ball);
for(let i=0;i<60;i++){backend.mover(capsule,[-2+i*.045,.85,0],1/60);backend.passo(1/60,2);}backend.ler(ball,mesh);assert.ok(mesh.position.x>.05,'A cápsula do jogador não empurrou a bola');
console.log(JSON.stringify({motor:tipo,massa:mass,bolaDepoisDoEmpurrao:mesh.position.toArray(),corpos:backend.items.length,ok:true}));
