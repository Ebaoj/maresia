// EXPERIMENTO REPROVADO VISUALMENTE — não usado no visor. Mantido para os testes de diagnóstico.
// Contato unilateral com a pele animada. A colisão tem prioridade sobre o limite da roupa.
import * as T from 'three';
import { MeshBVH } from 'three-mesh-bvh';

export function criarContatoPele(mesh,roupa,margem,deslocamentos=null){
 const src=mesh.geometry,rest=src.attributes.position,idx=src.index,box=new T.Box3().setFromBufferAttribute(roupa.geometry.attributes.position).expandByScalar(.1),tri=[],used=new Set(),p=new T.Vector3();
 for(let k=0;k<idx.count;k+=3){let relevant=false;for(let c=0;c<3;c++)if(box.containsPoint(p.fromBufferAttribute(rest,idx.getX(k+c))))relevant=true;if(relevant)for(let c=0;c<3;c++){const i=idx.getX(k+c);tri.push(i);used.add(i);}}
 const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(rest.count*3),3));geo.setIndex(tri);
 const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),normal=new T.Vector3(),delta=new T.Vector3(),hit={point:new T.Vector3()},bonePoint=new T.Vector3(),weighted=new T.Vector3(),skin=src.attributes.skinIndex,weights=src.attributes.skinWeight,matrices=mesh.skeleton.bones.map(()=>new T.Matrix4()),worldLinear=new T.Matrix3().setFromMatrix4(mesh.matrixWorld);let bvh;
 const centros=new Map(),donos=new Map(),normaisRest=new Float32Array(rest.count*3),normaisAnimadas=new Float32Array(rest.count*3),normalMatrices=matrices.map(()=>new T.Matrix3()),expected=new T.Vector3(),radial=new T.Vector3();
 for(const i of used){let dono=0,peso=-1;for(let k=0;k<4;k++)if(weights.getComponent(i,k)>peso){peso=weights.getComponent(i,k);dono=skin.getComponent(i,k);}donos.set(i,dono);if(!centros.has(dono))centros.set(dono,{p:new T.Vector3(),n:0});const center=centros.get(dono);center.p.add(p.fromBufferAttribute(rest,i));center.n++;}
 for(const center of centros.values())center.p.divideScalar(center.n);
 for(const i of used){radial.fromBufferAttribute(rest,i).sub(centros.get(donos.get(i)).p);radial.normalize().toArray(normaisRest,i*3);}
 function orientar(face){expected.set(0,0,0);for(let k=0;k<3;k++)expected.add(radial.fromArray(normaisAnimadas,geo.index.getX(face+k)*3));if(normal.dot(expected)<0)normal.negate();}
 function atualizar(){mesh.skeleton.update();mesh.skeleton.bones.forEach((b,i)=>matrices[i].multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse).multiply(b.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));normalMatrices.forEach((m,i)=>m.getNormalMatrix(matrices[i]));for(const i of used){bonePoint.set(0,0,0);for(let k=0;k<4;k++){const w=weights.getComponent(i,k);if(w)bonePoint.addScaledVector(weighted.fromBufferAttribute(rest,i).applyMatrix4(matrices[skin.getComponent(i,k)]),w);}if(deslocamentos){weighted.set(0,0,0);for(let k=0;k<4;k++){const j=src.attributes.aRoupaI.getComponent(i,k)*4,w=src.attributes.aRoupaP.getComponent(i,k);weighted.x+=deslocamentos[j]*w;weighted.y+=deslocamentos[j+1]*w;weighted.z+=deslocamentos[j+2]*w;}weighted.applyMatrix3(worldLinear);bonePoint.add(weighted);}
geo.attributes.position.setXYZ(i,bonePoint.x,bonePoint.y,bonePoint.z);bonePoint.set(0,0,0);for(let k=0;k<4;k++){const w=weights.getComponent(i,k);if(w)bonePoint.addScaledVector(weighted.fromArray(normaisRest,i*3).applyMatrix3(normalMatrices[skin.getComponent(i,k)]),w);}bonePoint.normalize().toArray(normaisAnimadas,i*3);}if(!bvh)bvh=new MeshBVH(geo,{targetLeafSize:8});else bvh.refit();}
 function ancorar(points){return points.map(point=>{
  if(!bvh.closestPointToPoint(point,hit,0,.1))return null;
  const face=hit.faceIndex*3,positions=geo.attributes.position;
  a.fromBufferAttribute(positions,geo.index.getX(face));b.fromBufferAttribute(positions,geo.index.getX(face+1));c.fromBufferAttribute(positions,geo.index.getX(face+2));
  return {face,bary:T.Triangle.getBarycoord(hit.point,a,b,c,new T.Vector3())};
 });}
 function projetar(point,distanciaMax=.1,anchor){
  if(!anchor)return false;
  const face=anchor.face,positions=geo.attributes.position;
  a.fromBufferAttribute(positions,geo.index.getX(face));b.fromBufferAttribute(positions,geo.index.getX(face+1));c.fromBufferAttribute(positions,geo.index.getX(face+2));hit.point.copy(a).multiplyScalar(anchor.bary.x).addScaledVector(b,anchor.bary.y).addScaledVector(c,anchor.bary.z);normal.subVectors(b,a).cross(delta.subVectors(c,a)).normalize();
  orientar(face);const signed=delta.subVectors(point,hit.point).dot(normal);
  if(signed>=margem)return false;
  // Corrigir só a componente normal: conservar o deslizamento tangencial do tecido.
  point.addScaledVector(normal,margem-signed);return true;
 }
 function projetarPreciso(point){
  if(!bvh.closestPointToPoint(point,hit,0,.04))return false;
  const face=hit.faceIndex*3,positions=geo.attributes.position;
  a.fromBufferAttribute(positions,geo.index.getX(face));b.fromBufferAttribute(positions,geo.index.getX(face+1));c.fromBufferAttribute(positions,geo.index.getX(face+2));normal.subVectors(b,a).cross(delta.subVectors(c,a)).normalize();
  orientar(face);const signed=delta.subVectors(point,hit.point).dot(normal);if(signed>=margem)return false;
  point.copy(hit.point).addScaledVector(normal,margem);return true;
 }
 atualizar();return {atualizar,projetar,projetarPreciso,ancorar,normal,geometry:geo,distancia:point=>{const h=bvh.closestPointToPoint(point);const n=new T.Vector3(),aa=new T.Vector3(),bb=new T.Vector3(),cc=new T.Vector3();aa.fromBufferAttribute(geo.attributes.position,geo.index.getX(h.faceIndex*3));bb.fromBufferAttribute(geo.attributes.position,geo.index.getX(h.faceIndex*3+1));cc.fromBufferAttribute(geo.attributes.position,geo.index.getX(h.faceIndex*3+2));n.subVectors(bb,aa).cross(cc.sub(aa)).normalize();return {...h,normal:n};}};
}

// Contato da malha visível, uma vez por quadro, depois da interpolação do pano físico.
export function prepararContatoRender(group,surfaces){
 const entries=[];
 for(const mesh of group.parts){
  const correction=new T.Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count*3),3);correction.setUsage(T.DynamicDrawUsage);mesh.geometry.setAttribute('aRoupaContato',correction);
  for(const material of [mesh.material,mesh.customDepthMaterial,mesh.customDistanceMaterial]){
   const before=material.onBeforeCompile,key=material.customProgramCacheKey();
   material.onBeforeCompile=(shader,renderer)=>{before(shader,renderer);shader.vertexShader='attribute vec3 aRoupaContato;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','transformed += aRoupaContato;\n#include <project_vertex>');};
   material.customProgramCacheKey=()=>key+'|contato-pele';material.needsUpdate=true;
  }
  const rest=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>new T.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld));
  entries.push({mesh,correction,anchors:surfaces.map(s=>s.ancorar(rest))});
 }
 const point=new T.Vector3(),weighted=new T.Vector3(),original=new T.Vector3(),inverse=new T.Matrix4();
 const matrices=group.mesh.skeleton.bones.map(()=>new T.Matrix4());
 return function atualizar(piece,surfaces,active){
  for(const {mesh,correction,anchors}of entries){
   const geo=mesh.geometry,pos=geo.attributes.position,skin=geo.attributes.skinIndex,sw=geo.attributes.skinWeight,indices=geo.attributes.aRoupaI,weights=geo.attributes.aRoupaP;inverse.copy(mesh.matrixWorld).invert();
   mesh.skeleton.bones.forEach((b,i)=>matrices[i].multiplyMatrices(mesh.bindMatrixInverse,b.matrixWorld).multiply(mesh.skeleton.boneInverses[i]).multiply(mesh.bindMatrix));
   for(let i=0;i<pos.count;i++){
    if(!active){correction.setXYZ(i,0,0,0);continue;}
    point.set(0,0,0);for(let k=0;k<4;k++){const w=sw.getComponent(i,k);if(w)point.addScaledVector(weighted.fromBufferAttribute(pos,i).applyMatrix4(matrices[skin.getComponent(i,k)]),w);}
    for(let k=0;k<4;k++){const j=indices.getComponent(i,k)*4,w=weights.getComponent(i,k);point.x+=piece.dados[j]*w;point.y+=piece.dados[j+1]*w;point.z+=piece.dados[j+2]*w;}
    original.copy(point);point.applyMatrix4(mesh.matrixWorld);let changed=false;for(let k=0;k<surfaces.length;k++)if(surfaces[k].projetar(point,.03,anchors[k][i]))changed=true;
    if(changed)point.applyMatrix4(inverse).sub(original);else point.set(0,0,0);correction.setXYZ(i,point.x,point.y,point.z);
   }correction.needsUpdate=true;
  }
 };
}
