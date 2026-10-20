// Superfície cinemática: os nós têm massa inversa zero e seguem a pele animada.
// Os contatos vértice/face são resolvidos pelo próprio Bullet (VF_SS).
import * as T from 'three';
import {prepararPeleAmmo,simplificarPeleAmmo} from './tecido-ammo-superficie.js';

export async function criarPeleCinematicaAmmo(mesh,A,world,unidade,margem,regiao={}){
 const geometry=await simplificarPeleAmmo(prepararPeleAmmo(mesh.geometry,regiao.alturaMin,regiao.larguraMax,regiao.larguraMin),regiao.reducao||0),positions=geometry.attributes.position,si=geometry.attributes.skinIndex,sw=geometry.attributes.skinWeight;
 if(!geometry.index.count){geometry.dispose();return null;}
 const helper=new A.btSoftBodyHelpers(),body=helper.CreateFromTriMesh(world.getWorldInfo(),Array.from(positions.array,v=>v*unidade),Array.from(geometry.index.array),geometry.index.count/3,true);A.destroy(helper);
 const nodes=body.get_m_nodes();body.setTotalMass(nodes.size()*.002,false);for(let i=0;i<nodes.size();i++)nodes.at(i).set_m_im(0);body.setCollisionFlags(0);body.setActivationState(4);
 const cfg=body.get_m_cfg();cfg.set_collisions(0x10);cfg.set_kDP(0);cfg.set_piterations(1);cfg.set_viterations(0);body.getCollisionShape().setMargin(margem*unidade);world.addSoftBody(body,2,1);
 const base=A.getPointer(nodes.at(0)),stride=(A.getPointer(nodes.at(1))-base)>>2,offX=(A.getPointer(nodes.at(0).get_m_x())-base)>>2,offQ=(A.getPointer(nodes.at(0).get_m_q())-base)>>2,offV=(A.getPointer(nodes.at(0).get_m_v())-base)>>2;
 const matrices=mesh.skeleton.bones.map(()=>new T.Matrix4()),point=new T.Vector3(),weighted=new T.Vector3(),targets=new Float32Array(nodes.size()*3);
 function atualizar(dt,reset=false){
  mesh.updateWorldMatrix(true,false);mesh.skeleton.update();mesh.skeleton.bones.forEach((bone,i)=>matrices[i].multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse).multiply(bone.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));
  const H=A.HEAPF32;
  for(let i=0;i<nodes.size();i++){
   point.set(0,0,0);for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w)point.addScaledVector(weighted.fromBufferAttribute(positions,i).applyMatrix4(matrices[si.getComponent(i,k)]),w);}point.toArray(targets,i*3);
   const b=(base>>2)+i*stride;for(let k=0;k<3;k++){const target=targets[i*3+k]*unidade;if(reset){H[b+offX+k]=H[b+offQ+k]=target;H[b+offV+k]=0;}else H[b+offV+k]=(target-H[b+offX+k])/dt;}
  }
 }
 atualizar(1/60,true);return {body,nodes,targets,atualizar,vertices:nodes.size(),faces:geometry.index.count/3};
}

// O tórax sozinho não cobre a parte traseira das mangas nem o volume real do cós.
export async function criarSuperficiesContatoAmmo(groups,A,world,unidade,cfg){
 const corpo=groups.find(g=>g.name==='corpo'),calca=groups.find(g=>g.name==='calca'),surfaces=[];
 for(const mesh of corpo.parts){
  let regiao;
  if(mesh.material.name==='pele-torax'){
   const box=new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position),size=box.getSize(new T.Vector3());
   regiao={alturaMin:box.min.y+size.y*cfg.ammoPeleAltura,larguraMax:Math.max(Math.abs(box.min.x),Math.abs(box.max.x))*cfg.ammoPeleLargura,reducao:cfg.ammoPeleReducao};
  }else if(mesh.material.name==='Material_0.011')regiao={larguraMin:cfg.ammoBracoInicio,larguraMax:cfg.ammoBracoFim,reducao:cfg.ammoBracoReducao};
  if(regiao)surfaces.push(await criarPeleCinematicaAmmo(mesh,A,world,unidade,mesh.material.name==='Material_0.011'?cfg.ammoBracoMargem:cfg.ammoPeleMargem,regiao));
 }
 // Acima desta altura os vértices da calça são presos à animação. O colisor segue
 // esses mesmos pontos, em vez de aproximar toda a cintura por um único osso.
 for(const mesh of calca.parts)surfaces.push(await criarPeleCinematicaAmmo(mesh,A,world,unidade,cfg.roupaEspessura,{alturaMin:cfg.ammoCalcaAltura,reducao:cfg.ammoCalcaReducao}));
 return surfaces.filter(Boolean);
}
