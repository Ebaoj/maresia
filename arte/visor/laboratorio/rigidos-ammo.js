// O btSoftRigidDynamicsWorld vem do tecido: nenhum segundo motor/mundo de objetos.
export function criarRigidosAmmo(A,world,unidade=20){
 const items=[],v=new A.btVector3(0,0,0),q=new A.btQuaternion(0,0,0,1),tr=new A.btTransform();
 function criar(shape,position,{massa=0,atrito=.7,restituicao=0,cinematico=false,camada=cinematico?8:massa?16:4,mascara=cinematico?16:massa?31:17}={}){
  tr.setIdentity();v.setValue(...position.map(x=>x*unidade));tr.setOrigin(v);const state=new A.btDefaultMotionState(tr),inertia=new A.btVector3(0,0,0);if(massa)shape.calculateLocalInertia(massa,inertia);
  const info=new A.btRigidBodyConstructionInfo(massa,state,shape,inertia),body=new A.btRigidBody(info);A.destroy(info);A.destroy(inertia);body.setFriction(atrito);body.setRestitution(restituicao);body.setDamping(0,0);
  if(cinematico){body.setCollisionFlags(2);body.setActivationState(4);}world.addRigidBody(body,camada,mascara);
  const item={body,state,shape,massa,position:[...position]};items.push(item);return item;
 }
 return {
  items,
  esfera(r,pos,opt){const item=criar(new A.btSphereShape(r*unidade),pos,opt);if(item.massa){item.body.setCcdMotionThreshold(r*.5*unidade);item.body.setCcdSweptSphereRadius(r*.8*unidade);}return item;},
  caixa(half,pos,opt){v.setValue(...half.map(x=>x*unidade));const shape=new A.btBoxShape(v);shape.setMargin(0);return criar(shape,pos,opt);},
  capsula(half,r,pos,opt){return criar(new A.btCapsuleShape(r*unidade,half*2*unidade),pos,opt);},
  terreno(geo){const triangles=new A.btTriangleMesh(),pos=geo.attributes.position,ix=geo.index.array,vs=[new A.btVector3(),new A.btVector3(),new A.btVector3()];for(let i=0;i<ix.length;i+=3){for(let k=0;k<3;k++)vs[k].setValue(pos.getX(ix[i+k])*unidade,pos.getY(ix[i+k])*unidade,pos.getZ(ix[i+k])*unidade);triangles.addTriangle(...vs,true);}const shape=new A.btBvhTriangleMeshShape(triangles,true,true);shape.setMargin(0);const item=criar(shape,[0,0,0],{camada:4,mascara:17,atrito:.8});item.triangles=triangles;vs.forEach(x=>A.destroy(x));return item;},
  mover(item,pos,dt,teleporte=false,rotacao=null){tr.setIdentity();q.setValue(...(rotacao||[0,0,0,1]));tr.setRotation(q);v.setValue(...pos.map(x=>x*unidade));tr.setOrigin(v);item.state.setWorldTransform(tr);item.body.setWorldTransform(tr);if(teleporte)item.body.setCenterOfMassTransform(tr);item.body.activate();},
  impulso(item,imp){v.setValue(...imp.map(x=>x*unidade));item.body.applyCentralImpulse(v);item.body.activate();},
  velocidade(item){const x=item.body.getLinearVelocity();return [x.x()/unidade,x.y()/unidade,x.z()/unidade];},
  amortecer(item,fator){const a=item.body.getAngularVelocity();v.setValue(a.x()*fator,a.y()*fator,a.z()*fator);item.body.setAngularVelocity(v);},
  ler(item,mesh){const x=item.body.getWorldTransform().getOrigin(),r=item.body.getWorldTransform().getRotation();mesh.position.set(x.x()/unidade,x.y()/unidade,x.z()/unidade);mesh.quaternion.set(r.x(),r.y(),r.z(),r.w());},
  reset(item){this.mover(item,item.position,0,true);v.setValue(0,0,0);item.body.setLinearVelocity(v);item.body.setAngularVelocity(v);world.updateSingleAabb?.(item.body);},
  passo(dt,subpassos=2){world.stepSimulation(dt,subpassos,dt/subpassos);},
 };
}
