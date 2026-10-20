// Regressão: a barra deve ficar fora da calça, inclusive antes do primeiro passo.
import assert from 'node:assert/strict';
import * as T from 'three';
import {carregarAmmoNode} from './ammo-node.mjs';
const {criarTecidoAmmo}=await import(process.env.ADAPTADOR_AMMO||'./tecido-ammo.js');
const root=new T.Group(),bone=new T.Bone();bone.name='mixamorig:Spine';root.add(bone);root.updateMatrixWorld(true);const skeleton=new T.Skeleton([bone]);
function mesh(geo,name){const n=geo.attributes.position.count;geo.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(n*4),4));geo.setAttribute('skinWeight',new T.Float32BufferAttribute(Array.from({length:n*4},(_,i)=>i%4===0?1:0),4));geo.computeVertexNormals();const m=new T.SkinnedMesh(geo,new T.MeshBasicMaterial());m.name=m.material.name=name;root.add(m);m.bind(skeleton);return m;}
mesh(new T.BoxGeometry(.2,.4,.16).translate(0,1,0),'corpo');
mesh(new T.BoxGeometry(.24,.4,.24).translate(0,1,0),'calca');
const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([-.04,.95,.105,.04,.95,.105,-.04,1.03,.105,.04,1.03,.105,-.04,1.30,.105,.04,1.30,.105],3));geo.setIndex([0,1,2,1,3,2,2,3,4,3,5,4]);mesh(geo,'camisa');
const cloth=await criarTecidoAmmo(root,await carregarAmmoNode());cloth.reset();
function verificar(phase){const p=cloth.engine.pecas.find(p=>p.group.name==='camisa');let min=Infinity;for(let i=0;i<p.P;i++)if(p.proxy.pontos[i].y<1.05)min=Math.min(min,p.sim[i*3+2]);console.log({phase,frenteCamisa:min,frenteCalca:.12});assert.ok(min>.12,'A camisa atravessou a calça: '+phase);}
verificar('primeiro quadro');for(let i=0;i<120;i++)cloth.update(1/120);verificar('depois de 120 passos');
// A integração não pode desfazer a solução nativa reposicionando os nós livres após o passo.
const p=cloth.engine.pecas.find(p=>p.group.name==='camisa'),world=cloth.debug.world,step=world.stepSimulation.bind(world);let solved;
world.stepSimulation=(...args)=>{const result=step(...args);solved=Array.from({length:p.P},(_,i)=>{const v=p.nodes.at(i).get_m_x();return[v.x(),v.y(),v.z()];});return result;};
for(let i=0;i<p.P;i++)if(!p.presos[i])p.nodes.at(i).get_m_v().setValue(4*(cloth.debug.unidade||1),0,0);
cloth.update(1/30);let checked=0;
for(let i=0;i<p.P;i++)if(!p.presos[i]){const v=p.nodes.at(i).get_m_x();for(const [k,value]of[v.x(),v.y(),v.z()].entries())assert.ok(Math.abs(value-solved[i][k])<1e-6,'O adaptador sobrescreveu a solução do Ammo');checked++;}
console.log({nosLivresPreservadosAposSolver:checked});assert.ok(checked>0);
// Nós presos não podem avançar duas vezes quando a animação muda a pose.
bone.position.y+=.03;root.updateMatrixWorld(true);cloth.update(1/60);let pinned=0;
for(let i=0;i<p.P;i++)if(p.presos[i]){const v=p.nodes.at(i).get_m_x(),unit=cloth.debug.unidade||1;for(const [k,value]of[v.x(),v.y(),v.z()].entries())assert.ok(Math.abs(value/unit-p.pele[i*3+k])<1e-5,'O ponto preso avançou além da pose animada');pinned++;}
console.log({pontosPresosSemAvancoDuplo:pinned});assert.ok(pinned>0);
// Trocar de animação teletransporta o início; isso não pode gerar velocidade corporal fictícia.
const priorStep=world.stepSimulation.bind(world);let firstStepVelocity=null;
world.stepSimulation=(...args)=>{const result=priorStep(...args);if(firstStepVelocity===null)firstStepVelocity=Math.max(...cloth.debug.colliders.map(c=>c.body.getLinearVelocity().length()));return result;};
bone.position.x+=.5;root.updateMatrixWorld(true);cloth.reset();console.log({velocidadeCorporalAoReiniciar:firstStepVelocity});assert.ok(firstStepVelocity<1e-4,'O reset criou velocidade fictícia nos colisores');
