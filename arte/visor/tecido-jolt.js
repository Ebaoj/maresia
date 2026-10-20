// Adapter for the revision GLB. The solver and clothing rules are the game's own roupa.js.
// GLTF splits front/back paintings into primitives; all primitives of each garment must share one cloth.
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PADRAO } from '../../src/config.js';
import { prepararCamisaComparacao } from './tecido-padrao.js';
import { prepararRenderAmmo,posicaoRenderAmmo } from './tecido-ammo-render.js';
import { criarRoupa } from '../../src/jogador/roupa.js';

export function agruparPecas(raiz) {
  const groups={camisa:[],calca:[],corpo:[]};
  raiz.updateMatrixWorld(true);
  raiz.traverse(o=>{if(!o.isSkinnedMesh)return;const label=o.name+' '+(Array.isArray(o.material)?o.material.map(m=>m.name).join(' '):o.material?.name||'');groups[/camisa/i.test(label)?'camisa':/calca/i.test(label)?'calca':'corpo'].push(o);});
  const combined=[];
  for(const [name,parts] of Object.entries(groups)){
    if(!parts.length)throw Error('Peça ausente: '+name);
    const first=parts[0],geometries=[];
    for(const part of parts){
      if(part.skeleton!==first.skeleton)throw Error('As partes precisam compartilhar o esqueleto: '+name);
      if(part.matrixWorld.elements.some((v,i)=>Math.abs(v-first.matrixWorld.elements[i])>1e-6))throw Error('Transformações diferentes: '+name);
      const g=new T.BufferGeometry();for(const key of ['position','normal','skinIndex','skinWeight'])g.setAttribute(key,part.geometry.attributes[key].clone());g.setIndex(part.geometry.index.clone());geometries.push(g);
    }
    const geometry=mergeGeometries(geometries,false),material=new T.MeshStandardMaterial();material.name=name;
    const mesh=new T.SkinnedMesh(geometry,material);mesh.name=name;mesh.bind(first.skeleton,first.bindMatrix.clone());mesh.position.copy(first.position);mesh.quaternion.copy(first.quaternion);mesh.scale.copy(first.scale);mesh.visible=false;first.parent.add(mesh);mesh.updateMatrixWorld(true);
    const data=raiz.userData.roupaProxies?.[name];
    if(data){
      const boneIndex=new Map(mesh.skeleton.bones.map((b,i)=>[b.name.replace(/^mixamorig\d*[:_]?/i,''),i]));
      const remap=data.bones.map(n=>boneIndex.get(n.replace(/^mixamorig\d*[:_]?/i,'')));
      if(remap.some(i=>i===undefined))throw Error('O tecido físico referencia osso ausente.');
      const proxy=new T.BufferGeometry();proxy.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));proxy.setAttribute('skinIndex',new T.Uint16BufferAttribute(data.joints.map(i=>remap[i]),4));proxy.setAttribute('skinWeight',new T.Float32BufferAttribute(data.weights,4));proxy.setIndex(data.indices);proxy.computeVertexNormals();mesh.userData.roupaProxy=proxy;
    }
    combined.push({name,mesh,parts});
  }
  return combined;
}

export async function criarTecidoJolt(raiz,ajustes=PADRAO.personagem,opcoes={}){
  const groups=agruparPecas(raiz);
  if(opcoes.mesmaMalha)prepararCamisaComparacao(groups,ajustes);
  const engine=await criarRoupa(groups.map(g=>g.mesh),ajustes,opcoes.jolt);
  if(!engine||engine.tipo!=='jolt')throw Error('A física da roupa não iniciou no Jolt.');
  const shirt=engine.pecas.find(p=>p.malha.material.name==='camisa'),group=groups.find(g=>g.name==='camisa'),estado={value:1};
  if(opcoes.mesmaMalha){
    for(let i=0;i<group.simRender.length;i++){const weights=group.simPais[group.simRender[i]];for(let k=0;k<4;k++){shirt.proxy.indices[i*4+k]=weights[k]?.[0]||0;shirt.proxy.pesos[i*4+k]=weights[k]?.[1]||0;}}
    shirt.group=group;prepararRenderAmmo(shirt,estado);
  }
  const render=aplicarRoupaRender(groups);
  const {J}=engine.jolt,identity=new J.RMat44().sIdentity(),joints=new J.ArrayMat44();joints.resize(Math.max(...engine.pecas.map(p=>p.nJ)));
  const ptr=J.getPointer(joints.at(0))>>2,stride=(J.getPointer(joints.at(1))-J.getPointer(joints.at(0)))>>2;
  const stats={motor:'Jolt (src/jogador/roupa.js)',frames:0,particles:engine.pontos,garments:engine.pecas.length,renderParts:render.length,bodyParts:groups.find(g=>g.name==='corpo').parts.length,capsules:engine.capsulas?.length||0};
  function atualizarAbsoluto(){if(opcoes.mesmaMalha){const H=engine.jolt.J.HEAPF32,inv=shirt.malha.matrixWorld.clone().invert(),p=new T.Vector3();for(let i=0;i<shirt.P;i++){const k=(shirt.base>>2)+i*shirt.passo+shirt.offPos;p.set(H[k],H[k+1],H[k+2]).applyMatrix4(inv);p.toArray(shirt.dados,i*4);}shirt.tex.needsUpdate=true;}}
  function reset(){
    raiz.updateMatrixWorld(true);
    const H=J.HEAPF32;
    for(const p of engine.pecas){p.malha.skeleton.update();for(let i=0;i<p.nJ;i++)H.set(p.malha.skeleton.bones[i].matrixWorld.elements,ptr+i*stride);p.mov.SkinVertices(identity,joints.data(),p.nJ,true,engine.jolt.temp);for(let i=0;i<p.P;i++){const k=(p.base>>2)+i*p.passo+p.offVel;H[k]=H[k+1]=H[k+2]=0;}}
    atualizarAbsoluto();
  }
  let active=true;function update(dt){raiz.updateMatrixWorld(true);engine.atualizar(dt,{vento:0,forca:active?1:0});
    atualizarAbsoluto();
    stats.frames++;}function setActive(value){active=value;estado.value=value?1:0;update(1/120);}
  return {engine,groups,render,stats,reset,update,setActive,posicaoRender(mesh,i,target){if(!opcoes.mesmaMalha||!active||!group.parts.includes(mesh))return false;posicaoRenderAmmo(mesh,i,shirt.dados,target);return true;}};
}

export function aplicarRoupaRender(groups){
  const render=[];
  for(const group of groups.filter(g=>g.name!=='corpo')){
    // This GLB already has an external shirt hem and a fitted waistband. The older game's
    // 15 mm inward shader offset would push its waistband through the intact body.
    group.mesh.geometry.attributes.aRoupaDentro.array.fill(0);
    let offset=0;
    for(const part of group.parts){
      for(const key of ['aRoupaI','aRoupaP','aRoupaDentro']){
        const attr=group.mesh.geometry.attributes[key],count=part.geometry.attributes.position.count;
        part.geometry.setAttribute(key,new T.BufferAttribute(attr.array.slice(offset*attr.itemSize,(offset+count)*attr.itemSize),attr.itemSize));
      }
      const original=part.material;part.material=original.clone();part.material.onBeforeCompile=group.mesh.material.onBeforeCompile;part.material.customProgramCacheKey=()=>group.mesh.material.customProgramCacheKey()+'|'+group.name;part.material.needsUpdate=true;
      // Shadow positions must use the same displacement as the visible material.
      const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking});depth.onBeforeCompile=(shader,renderer)=>{group.mesh.material.onBeforeCompile(shader,renderer);shader.vertexShader=shader.vertexShader.replaceAll('normalize(objectNormal)','normalize(normal)');};depth.customProgramCacheKey=()=>group.mesh.material.customProgramCacheKey()+'|depth|'+group.name;part.customDepthMaterial=depth;
      const distance=new T.MeshDistanceMaterial();distance.onBeforeCompile=depth.onBeforeCompile;distance.customProgramCacheKey=()=>group.mesh.material.customProgramCacheKey()+'|distance|'+group.name;part.customDistanceMaterial=distance;
      render.push({mesh:part});offset+=part.geometry.attributes.position.count;
    }
    if(offset!==group.mesh.geometry.attributes.position.count)throw Error('Uma parte da roupa ficou fora da simulação.');
  }
  return render;
}
