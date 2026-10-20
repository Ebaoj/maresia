// Ammo nativo: corpo/calça cinemáticos, camisa soft body; só os pontos presos seguem a animação.
import * as T from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { agruparPecas, aplicarRoupaRender } from './tecido-jolt.js';
import { montarProxy, injetar, regrasCamisa, regrasCalca } from '../../src/jogador/roupa.js';
import { amostrarColisores } from '../../src/jogador/roupa-colisores.js';
import { prepararRenderAmmo,posicaoRenderAmmo } from './tecido-ammo-render.js';
import { compactarSuperficieAmmo } from './tecido-ammo-superficie.js';
import { criarSuperficiesContatoAmmo } from './tecido-ammo-pele.js';
import { prepararCamisaComparacao } from './tecido-padrao.js';
import { PADRAO } from '../../src/config.js';

export async function criarTecidoAmmo(raiz,A,ajustes=PADRAO.personagem,ambiente={}){
 const cfg={...PADRAO.personagem,...ajustes},groups=agruparPecas(raiz),colisao=new A.btSoftBodyRigidBodyCollisionConfiguration(),dispatcher=new A.btCollisionDispatcher(colisao),broadphase=new A.btDbvtBroadphase(),solver=new A.btSequentialImpulseConstraintSolver(),softSolver=new A.btDefaultSoftBodySolver(),world=new A.btSoftRigidDynamicsWorld(dispatcher,broadphase,solver,colisao,softSolver);
 // O SDF nativo usa células de 0,25 unidades. Escala interna ×20: resolução de 12,5 mm.
 const UNIDADE=20;const gravity=new A.btVector3(0,-(ambiente.gravidade??9.81)*UNIDADE,0);world.setGravity(gravity);world.getWorldInfo().set_m_gravity(gravity);const helper=new A.btSoftBodyHelpers(),v=new A.btVector3(0,0,0),q=new A.btQuaternion(0,0,0,1),tr=new A.btTransform(),zero=new A.btVector3(0,0,0),tmp=new T.Vector3(),rot=new T.Quaternion(),scale=new T.Vector3(),mat=new T.Matrix4(),inv=new T.Matrix3();
 prepararCamisaComparacao(groups,cfg);
 const colliders=[];
 for(const group of groups.filter(g=>g.name!=='camisa'))for(const data of amostrarColisores(group.mesh)){
  const box=new T.Box3().setFromPoints(data.pontos),localCenter=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());
  let hullPoints=data.pontos;
  if(Math.min(size.x,size.y,size.z)>1e-6){const hull=new ConvexHull().setFromPoints(data.pontos),outer=new Set();for(const face of hull.faces){let edge=face.edge;do{outer.add(edge.head().point);edge=edge.next;}while(edge!==face.edge);}hullPoints=[...outer];}
  const shape=new A.btConvexHullShape();for(let i=0;i<hullPoints.length;i++){const p=hullPoints[i];v.setValue((p.x-localCenter.x)*UNIDADE,(p.y-localCenter.y)*UNIDADE,(p.z-localCenter.z)*UNIDADE);shape.addPoint(v,i===hullPoints.length-1);}shape.setMargin(0);shape.initializePolyhedralFeatures(0);
  data.bone.matrixWorld.decompose(tmp,rot,scale);tmp.add(localCenter.clone().applyQuaternion(rot));tr.setIdentity();v.setValue(tmp.x*UNIDADE,tmp.y*UNIDADE,tmp.z*UNIDADE);q.setValue(rot.x,rot.y,rot.z,rot.w);tr.setOrigin(v);tr.setRotation(q);
  const state=new A.btDefaultMotionState(tr),info=new A.btRigidBodyConstructionInfo(0,state,shape,zero),body=new A.btRigidBody(info);body.setCollisionFlags(2);body.setActivationState(4);body.setFriction(.25);world.addRigidBody(body,ambiente.grupoCorpo??1,ambiente.mascaraCorpo??-1);colliders.push({...data,hullPoints,roupa:group.name,body,state,shape,localCenter});A.destroy(info);
 }
 const pecas=[],barra=Math.min(...groups.find(g=>g.name==='camisa').mesh.geometry.attributes.position.array.filter((_,i)=>i%3===1));
 for(const group of groups.filter(g=>g.name!=='corpo')){
  const mesh=group.mesh,geo=mesh.geometry,proxy=montarProxy(mesh.userData.roupaProxy?compactarSuperficieAmmo(mesh.userData.roupaProxy):geo,.045,geo),P=proxy.pontos.length,positions=proxy.pontos.flatMap(p=>p.toArray().map(v=>v*UNIDADE)),indices=proxy.faces.flat();
  if(group.simRender)for(let i=0;i<group.simRender.length;i++){const weights=group.simPais?.[group.simRender[i]]||[[group.simRender[i],1]];for(let k=0;k<4;k++){proxy.indices[i*4+k]=weights[k]?.[0]||0;proxy.pesos[i*4+k]=weights[k]?.[1]||0;}}
  const body=helper.CreateFromTriMesh(world.getWorldInfo(),positions,indices,proxy.faces.length,true),nodes=body.get_m_nodes();if(nodes.size()!==P)throw Error('Ammo alterou a ordem da superfície: '+nodes.size()+'/'+P);
  const config=body.get_m_cfg();config.set_viterations(0);config.set_piterations(cfg.ammoIteracoes);config.set_kDP(Math.min(.99,cfg.roupaAmortecimento/10));config.set_kDF(.25);config.set_collisions(group.name==='camisa'?0x11:0x1);/* SDF_RS para os volumes + VF_SS para a superfície animada. */config.set_kCHR(1);config.set_kKHR(1);config.set_kSHR(1);const material=body.get_m_materials().at(0);material.set_m_kLST(.95);material.set_m_kAST(.5);body.generateBendingConstraints(2,material);body.setTotalMass(P*.002,false);body.setCollisionFlags(0);A.castObject(body,A.btCollisionObject).getCollisionShape().setMargin(cfg.roupaEspessura*UNIDADE);body.setActivationState(4);
  const regra=group.name==='camisa'?regrasCamisa:regrasCalca,folga=regra(proxy.pontos,{fisica:cfg,barraPorCima:barra}),maxDist=Float32Array.from(proxy.pontos,p=>folga(p));for(let i=0;i<P;i++)if(maxDist[i]<.002)nodes.at(i).set_m_im(0);
  // A calça é cinemática para a camisa; seus volumes também participam dos contatos nativos.
  world.addSoftBody(body,1,group.name==='camisa'?-1:0);
  const base=A.getPointer(nodes.at(0)),stride=(A.getPointer(nodes.at(1))-base)>>2,offX=(A.getPointer(nodes.at(0).get_m_x())-base)>>2,offQ=(A.getPointer(nodes.at(0).get_m_q())-base)>>2,offV=(A.getPointer(nodes.at(0).get_m_v())-base)>>2;
  const dados=new Float32Array(64*Math.ceil(P/64)*4),tex=new T.DataTexture(dados,64,Math.ceil(P/64),T.RGBAFormat,T.FloatType);tex.needsUpdate=true;geo.setAttribute('aRoupaI',new T.BufferAttribute(proxy.indices,4));geo.setAttribute('aRoupaP',new T.BufferAttribute(proxy.pesos,4));geo.setAttribute('aRoupaDentro',new T.Float32BufferAttribute(new Float32Array(geo.attributes.position.count),1));injetar(mesh.material,tex,64);
  pecas.push({group,malha:mesh,proxy,P,body,nodes,base,stride,offX,offQ,offV,maxDist,presos:Uint8Array.from(maxDist,v=>v<.002?1:0),dados,tex,pele:new Float32Array(P*3),sim:new Float32Array(P*3)});
 }
 const pele=await criarSuperficiesContatoAmmo(groups,A,world,UNIDADE,cfg);
 const shirt=pecas.find(p=>p.group.name==='camisa'),estado={value:1};prepararRenderAmmo(shirt,estado);const render=aplicarRoupaRender(groups);let active=true,first=true;
 function targets(p){p.malha.skeleton.update();const skin=p.malha.skeleton,bones=skin.bones,comb=bones.map((b,i)=>new T.Matrix4().multiplyMatrices(b.matrixWorld,skin.boneInverses[i]).multiply(p.malha.bindMatrix));for(let i=0;i<p.P;i++){tmp.set(0,0,0);for(const[bone,w]of p.proxy.pele[i])if(w)tmp.addScaledVector(new T.Vector3().copy(p.proxy.pontos[i]).applyMatrix4(comb[bone]),w);tmp.toArray(p.pele,i*3);}}
 function reset(){raiz.updateMatrixWorld(true);const H=A.HEAPF32;for(const p of pecas){targets(p);for(let i=0;i<p.P;i++){const b=(p.base>>2)+i*p.stride;for(let k=0;k<3;k++){H[b+p.offX+k]=H[b+p.offQ+k]=p.pele[i*3+k]*UNIDADE;H[b+p.offV+k]=0;} }p.dados.fill(0);p.tex.needsUpdate=true;}first=false;for(const c of colliders){c.bone.matrixWorld.decompose(tmp,rot,scale);tmp.add(c.localCenter.clone().applyQuaternion(rot));v.setValue(tmp.x*UNIDADE,tmp.y*UNIDADE,tmp.z*UNIDADE);q.setValue(rot.x,rot.y,rot.z,rot.w);tr.setIdentity();tr.setOrigin(v);tr.setRotation(q);c.state.setWorldTransform(tr);c.body.setWorldTransform(tr);c.body.setCenterOfMassTransform(tr);c.body.setLinearVelocity(zero);c.body.setAngularVelocity(zero);}for(const surface of pele)surface.atualizar(1/120,true);for(const p of pecas)p.body.get_m_cfg().set_kDP(.9);for(let step=0;step<cfg.ammoPassosAssentar;step++)update(1/120);for(const p of pecas){p.body.get_m_cfg().set_kDP(Math.min(.99,cfg.roupaAmortecimento/10));for(let i=0;i<p.P;i++){const b=(p.base>>2)+i*p.stride;H[b+p.offV]=H[b+p.offV+1]=H[b+p.offV+2]=0;}}}
 function update(dt){
  raiz.updateMatrixWorld(true);if(first)reset();const H=A.HEAPF32;
  for(const c of colliders){c.bone.matrixWorld.decompose(tmp,rot,scale);tmp.add(c.localCenter.clone().applyQuaternion(rot));v.setValue(tmp.x*UNIDADE,tmp.y*UNIDADE,tmp.z*UNIDADE);q.setValue(rot.x,rot.y,rot.z,rot.w);tr.setIdentity();tr.setOrigin(v);tr.setRotation(q);c.state.setWorldTransform(tr);c.body.setWorldTransform(tr);c.body.activate();}
  for(const p of pecas){targets(p);for(let i=0;i<p.P;i++)if(p.maxDist[i]<.002){const b=(p.base>>2)+i*p.stride;for(let k=0;k<3;k++){H[b+p.offV+k]=0;/* posição cinemática já está no alvo; velocidade extra duplicaria o movimento. */H[b+p.offX+k]=H[b+p.offQ+k]=p.pele[i*3+k]*UNIDADE;}}}
  for(const surface of pele)surface.atualizar(dt);
  world.stepSimulation(dt,cfg.ammoSubpassos,dt/cfg.ammoSubpassos);
  // Camisa: ler a solução do Bullet sem limitar posições depois do contato.
  // A calça mantém o ajuste animado; a região do cós já está presa.
  for(const p of pecas){inv.setFromMatrix4(p.malha.matrixWorld).invert();for(let i=0;i<p.P;i++){
   const b=(p.base>>2)+i*p.stride,x=p.pele[i*3],y=p.pele[i*3+1],z=p.pele[i*3+2],limit=p.maxDist[i];tmp.set(H[b+p.offX]/UNIDADE-x,H[b+p.offX+1]/UNIDADE-y,H[b+p.offX+2]/UNIDADE-z);const len=tmp.length();if(len>limit&&p.group.name!=='camisa'){tmp.multiplyScalar(limit/len);H[b+p.offX]=H[b+p.offQ]=(x+tmp.x)*UNIDADE;H[b+p.offX+1]=H[b+p.offQ+1]=(y+tmp.y)*UNIDADE;H[b+p.offX+2]=H[b+p.offQ+2]=(z+tmp.z)*UNIDADE;const nx=tmp.x/(limit||1),ny=tmp.y/(limit||1),nz=tmp.z/(limit||1),out=H[b+p.offV]*nx+H[b+p.offV+1]*ny+H[b+p.offV+2]*nz;if(out>0){H[b+p.offV]-=out*nx;H[b+p.offV+1]-=out*ny;H[b+p.offV+2]-=out*nz;}}
   p.sim[i*3]=x+tmp.x;p.sim[i*3+1]=y+tmp.y;p.sim[i*3+2]=z+tmp.z;const d=i*4;if(p===shirt){tmp.fromArray(p.sim,i*3).applyMatrix4(mat.copy(p.malha.matrixWorld).invert());p.dados[d]=tmp.x;p.dados[d+1]=tmp.y;p.dados[d+2]=tmp.z;}else{tmp.applyMatrix3(inv);p.dados[d]=active?tmp.x:0;p.dados[d+1]=active?tmp.y:0;p.dados[d+2]=active?tmp.z:0;}
  }p.tex.needsUpdate=true;}
 }
 return{debug:{world,colliders,A,pele,unidade:UNIDADE},groups,render,engine:{pecas},stats:{motor:'Ammo nativo (SDF_RS + VF_SS)',particles:pecas.reduce((n,p)=>n+p.P,0),capsules:colliders.length},reset,update,posicaoRender(mesh,i,target){if(!active||!shirt.group.parts.includes(mesh))return false;posicaoRenderAmmo(mesh,i,shirt.dados,target);return true;},setActive(value){active=value;estado.value=value?1:0;}};
}
