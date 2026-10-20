// Ajuste da peça em repouso, antes de criar o soft body e seus comprimentos de costura.
import * as T from 'three';import {MeshBVH} from 'three-mesh-bvh';
export function ajustarEncaixeAmmo(geometry,body,margem,maximo){
 const skin=body.geometry.clone(),p=new T.Vector3();body.updateWorldMatrix(true,false);body.skeleton.update();for(let i=0;i<skin.attributes.position.count;i++){p.fromBufferAttribute(body.geometry.attributes.position,i);body.applyBoneTransform(i,p);p.applyMatrix4(body.matrixWorld);skin.attributes.position.setXYZ(i,p.x,p.y,p.z);}const bvh=new MeshBVH(skin,{targetLeafSize:8}),ray=new T.Ray(),n=new T.Vector3(),pos=geometry.attributes.position,normals=geometry.attributes.normal;let adjusted=0,max=0;
 for(let i=0;i<pos.count;i++){p.fromBufferAttribute(pos,i);n.fromBufferAttribute(normals,i).normalize();ray.origin.copy(p).addScaledVector(n,.15);ray.direction.copy(n).negate();const hit=bvh.raycastFirst(ray,T.DoubleSide);if(!hit)continue;const d=.15-hit.distance+margem;if(d>0&&d<=maximo){p.addScaledVector(n,d);pos.setXYZ(i,p.x,p.y,p.z);adjusted++;max=Math.max(max,d);}}
 geometry.computeVertexNormals();skin.dispose();return {adjusted,max};
}

// Só altera o molde antes da física; gola e parte alta mantêm a posição original.
export function ajustarBarraAmmo(geometry,extra,transicao){
 const positions=geometry.attributes.position,low=new T.Box3().setFromBufferAttribute(positions).min.y;
 for(let i=0;i<positions.count;i++){const y=positions.getY(i),t=Math.max(0,1-(y-low)/transicao);positions.setY(i,y-extra*t);}
 geometry.computeVertexNormals();
}
