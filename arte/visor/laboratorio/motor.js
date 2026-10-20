import {criarMundoJolt} from '../../../src/jogador/jolt.js';
import {criarTecidoJolt} from '../tecido-jolt.js';
import {criarTecidoAmmo} from '../tecido-ammo.js';
import {criarRigidosJolt} from './rigidos-jolt.js';
import {criarRigidosAmmo} from './rigidos-ammo.js';

export async function criarMotor(tipo,raiz,cfg,roupa=true){
 let tecido,rigidos,jolt;
 const ajustes={...cfg.personagem,ammoSubpassos:cfg.laboratorioFisica.subpassos};
 if(tipo==='jolt'){
  jolt=await criarMundoJolt({laboratorio:true,gravidade:cfg.laboratorioFisica.gravidade,subpassos:cfg.laboratorioFisica.subpassos});
  tecido=await criarTecidoJolt(raiz,ajustes,{jolt,mesmaMalha:true});rigidos=criarRigidosJolt(jolt);
 }else{
  if(!window.Ammo){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='/node_modules/three/examples/jsm/libs/ammo.wasm.js';s.onload=resolve;s.onerror=reject;document.head.append(s);});}
  const A=await window.Ammo({locateFile:name=>'/node_modules/three/examples/jsm/libs/'+name});
  tecido=await criarTecidoAmmo(raiz,A,ajustes,{gravidade:cfg.laboratorioFisica.gravidade,grupoCorpo:2,mascaraCorpo:17});
  rigidos=criarRigidosAmmo(A,tecido.debug.world,tecido.debug.unidade);
 }
 const auxiliar={camisa:tecido.engine.pecas.find(p=>p.group?.name==='camisa'||p.malha.material.name==='camisa').P};
 if(!roupa){
  tecido.setActive(false);
  if(tipo==='jolt')for(const p of tecido.engine.pecas)jolt.corpos.RemoveBody(p.corpo.GetID());
  else{for(const p of tecido.engine.pecas)tecido.debug.world.removeSoftBody(p.body);for(const p of tecido.debug.pele)tecido.debug.world.removeSoftBody(p.body);}
 }
 return {tipo,tecido,rigidos,auxiliar,
  passo(dt){
   if(roupa)tecido.update(dt);
   else if(tipo==='jolt'){raiz.updateMatrixWorld(true);tecido.engine.colisores?.mover(dt,false);rigidos.passo(dt);}
   else{raiz.updateMatrixWorld(true);for(const c of tecido.debug.colliders){const p=c.bone.getWorldPosition(new (raiz.position.constructor)()),q=c.bone.getWorldQuaternion(raiz.quaternion.clone());p.add(c.localCenter.clone().applyQuaternion(q));rigidos.mover(c,[p.x,p.y,p.z],dt,false,[q.x,q.y,q.z,q.w]);}rigidos.passo(dt,cfg.laboratorioFisica.subpassos);}
  },
 };
}
