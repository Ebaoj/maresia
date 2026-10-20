// A camisa desenhada segue posições absolutas do Bullet, não uma segunda animação por cima.
import * as T from 'three';

export function prepararRenderAmmo(piece,estado){
 const geo=piece.malha.geometry,pos=geo.attributes.position,base=new Float32Array(pos.count*3),weighted=new T.Vector3(),p=new T.Vector3();
 for(let i=0;i<pos.count;i++){
  weighted.set(0,0,0);for(let k=0;k<4;k++){const node=piece.proxy.indices[i*4+k],w=piece.proxy.pesos[i*4+k];weighted.addScaledVector(piece.proxy.pontos[node],w);}
  p.fromBufferAttribute(pos,i).sub(weighted).toArray(base,i*3);
 }
 let offset=0;for(const mesh of piece.group.parts){const n=mesh.geometry.attributes.position.count;mesh.geometry.setAttribute('aAmmoBase',new T.Float32BufferAttribute(base.slice(offset*3,(offset+n)*3),3));offset+=n;}
 const before=piece.malha.material.onBeforeCompile,key=piece.malha.material.customProgramCacheKey();
 piece.malha.material.onBeforeCompile=(shader,renderer)=>{
  before(shader,renderer);shader.uniforms.uAmmoAtivo=estado;
  shader.vertexShader='attribute vec3 aAmmoBase;\nuniform float uAmmoAtivo;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace(/transformed \+= roupaDesl\([\s\S]*?;/,`if(uAmmoAtivo > 0.5) transformed = aAmmoBase
   + roupaDesl(aRoupaI.x)*aRoupaP.x + roupaDesl(aRoupaI.y)*aRoupaP.y
   + roupaDesl(aRoupaI.z)*aRoupaP.z + roupaDesl(aRoupaI.w)*aRoupaP.w;`);
 };
 piece.malha.material.customProgramCacheKey=()=>key+'|ammo-posicoes-absolutas';
}

export function posicaoRenderAmmo(mesh,index,data,target){
 target.fromBufferAttribute(mesh.geometry.attributes.aAmmoBase,index);
 const ind=mesh.geometry.attributes.aRoupaI,weights=mesh.geometry.attributes.aRoupaP;
 for(let k=0;k<4;k++){const i=ind.getComponent(index,k)*4,w=weights.getComponent(index,k);target.x+=data[i]*w;target.y+=data[i+1]*w;target.z+=data[i+2]*w;}
 return target;
}
