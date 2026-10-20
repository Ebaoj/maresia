import * as T from 'three';
import { MeshBVH } from 'three-mesh-bvh';
const canonical=n=>n.replace(/[^a-z0-9]/gi,'').toLowerCase();
const p=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),n=new T.Vector3(),delta=new T.Vector3(),bary=new T.Vector3();
const hit={point:new T.Vector3()};const tri=new T.Triangle();
function geom(data){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);return g;}
function skin(data,bones){
 const matrices=data.bones.map(name=>{const bone=bones.get(canonical(name));if(!bone)throw Error('Osso ausente: '+name);return bone;});
 return {data,matrices,rest:Float32Array.from(data.positions),target:new Float32Array(data.positions.length),update(){
  const mats=this.matrices.map(b=>new T.Matrix4().multiplyMatrices(b.bone.matrixWorld,b.inverse));
  for(let i=0;i<this.rest.length/3;i++){p.fromArray(this.rest,i*3);a.set(0,0,0);for(let k=0;k<4;k++){const w=data.weights[i*4+k];if(w){b.copy(p).applyMatrix4(mats[data.joints[i*4+k]]);a.addScaledVector(b,w);}}a.toArray(this.target,i*3);}
 }};
}
class Surface{
 constructor(data){this.geometry=geom(data);this.bvh=new MeshBVH(this.geometry,{targetLeafSize:8});this.index=this.geometry.index.array;this.pos=this.geometry.attributes.position.array;

 }
 update(pos){this.pos.set(pos);this.bvh.refit();}
 nearest(point,max=.15){const r=this.bvh.closestPointToPoint(point,hit,0,max);return r?r.faceIndex:-1;}
 contactAt(point,face,margin=.004){
  if(face<0)return 0;const k=face*3;tri.a.fromArray(this.pos,this.index[k]*3);tri.b.fromArray(this.pos,this.index[k+1]*3);tri.c.fromArray(this.pos,this.index[k+2]*3);tri.getNormal(n);tri.closestPointToPoint(point,a);delta.subVectors(point,a);if(delta.lengthSq()>.0144)return 0;const signed=delta.dot(n);if(signed>=margin)return 0;point.addScaledVector(n,margin-signed);return margin-signed;
 }
 contact(point,margin=.004,max=.09){
  const r=this.bvh.closestPointToPoint(point,hit,0,max);if(!r)return 0;
  const k=r.faceIndex*3;a.fromArray(this.pos,this.index[k]*3);b.fromArray(this.pos,this.index[k+1]*3);c.fromArray(this.pos,this.index[k+2]*3);
  T.Triangle.getNormal(a,b,c,n);delta.subVectors(point,r.point);const signed=delta.dot(n);
  if(signed>=margin)return 0;
  point.addScaledVector(n,margin-signed);return margin-signed;
 }
}
class BodyVolumes{
 constructor(bones){
  const bone=name=>[...bones.entries()].find(([k])=>k.endsWith(name.toLowerCase()))[1];
  const at=name=>bone(name).bone.getWorldPosition(new T.Vector3());const cx=at('Hips').x;
  const pt=(name,xyz)=>({bind:bone(name),rest:xyz?new T.Vector3(...xyz):at(name),current:new T.Vector3()});
  this.caps=[];const add=(an,ap,bn,bp,ru,rv,end,ru1=ru,rv1=rv)=>this.caps.push({a:pt(an,ap),b:pt(bn,bp),ru,rv,end,ru1,rv1,axis:new T.Vector3(),u:new T.Vector3(),v:new T.Vector3()});
  add('Hips',[cx-.05,.815,-.014],'Hips',[cx+.05,.815,-.014],.073,.089,.066);
  add('Hips',[cx,.86,-.008],'Spine1',[cx,.99,-.008],.103,.091,.045,.098,.087);
  add('Spine1',[cx,.98,-.008],'Spine2',[cx,1.135,-.012],.100,.087,.040,.113,.092);
  add('RightShoulder',[cx-.12,1.19,-.032],'LeftShoulder',[cx+.12,1.19,-.032],.033,.064,.041);
  add('Neck',null,'Head',null,.043,.045,.025,.035,.039);
  for(const side of ['Left','Right']){
   add(side+'Arm',null,side+'ForeArm',null,.039,.043,.03,.037,.036);
   add(side+'ForeArm',null,side+'Hand',null,.037,.037,.025,.026,.028);
   add(side+'UpLeg',null,side+'Leg',null,.065,.080,.045,.055,.062);
   add(side+'Leg',null,side+'Foot',null,.049,.062,.035,.033,.037);
  }
  this.update();
 }
 update(){for(const cap of this.caps){for(const q of [cap.a,cap.b])q.current.copy(q.rest).applyMatrix4(new T.Matrix4().multiplyMatrices(q.bind.bone.matrixWorld,q.bind.inverse));cap.axis.subVectors(cap.b.current,cap.a.current);cap.length=cap.axis.length();cap.axis.normalize();const forward=new T.Vector3(0,0,1).transformDirection(new T.Matrix4().multiplyMatrices(cap.a.bind.bone.matrixWorld,cap.a.bind.inverse));cap.u.crossVectors(cap.axis,forward).normalize();cap.v.crossVectors(cap.axis,cap.u).normalize();}}
 nearest(){return 0;}
 contactAt(point,face,margin){return this.contact(point,margin);}
 inside(point,margin){for(const cap of this.caps){const x=point.x-cap.a.current.x,y=point.y-cap.a.current.y,z=point.z-cap.a.current.z;const t0=x*cap.axis.x+y*cap.axis.y+z*cap.axis.z,t=Math.max(0,Math.min(cap.length,t0)),f=t/(cap.length||1);const u=(x*cap.u.x+y*cap.u.y+z*cap.u.z)/(cap.ru*(1-f)+cap.ru1*f+margin),v=(x*cap.v.x+y*cap.v.y+z*cap.v.z)/(cap.rv*(1-f)+cap.rv1*f+margin),a=(t0-t)/(cap.end+margin);if(u*u*u*u+v*v*v*v+a*a*a*a<.99999)return true;}return false;}
 contact(point,margin=.004){let moved=0;
  for(let iteration=0;iteration<8;iteration++){const before=moved;for(const cap of this.caps){
   const x=point.x-cap.a.current.x,y=point.y-cap.a.current.y,z=point.z-cap.a.current.z;
   const t0=x*cap.axis.x+y*cap.axis.y+z*cap.axis.z,t=Math.max(0,Math.min(cap.length,t0));
   if(Math.abs(t0-t)>cap.end+margin)continue;
   const u=x*cap.u.x+y*cap.u.y+z*cap.u.z,v=x*cap.v.x+y*cap.v.y+z*cap.v.z,ax=t0-t,f=t/(cap.length||1);
   const ru=cap.ru*(1-f)+cap.ru1*f+margin,rv=cap.rv*(1-f)+cap.rv1*f+margin,re=cap.end+margin;
   if(Math.abs(u)>ru||Math.abs(v)>rv)continue;
   const su=u*u/(ru*ru),sv=v*v/(rv*rv),sa=ax*ax/(re*re);const d=Math.sqrt(Math.sqrt(su*su+sv*sv+sa*sa));
   if(d>=1||d<1e-8)continue;
   const scale=1/d-1;point.x+=scale*(cap.u.x*u+cap.v.x*v+cap.axis.x*ax);point.y+=scale*(cap.u.y*u+cap.v.y*v+cap.axis.y*ax);point.z+=scale*(cap.u.z*u+cap.v.z*v+cap.axis.z*ax);moved+=Math.min(ru,rv,re)*(1-d);
  }if(moved===before)break;}
  if(this.inside(point,margin)){
   const origin=point.clone(),candidate=new T.Vector3();let best=null,bestDistance=.15;
   for(const d of [[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]]){
    let hi=.005;for(;hi<bestDistance;hi+=.005){candidate.set(origin.x+d[0]*hi,origin.y+d[1]*hi,origin.z+d[2]*hi);if(!this.inside(candidate,margin)){let lo=hi-.005;for(let k=0;k<7;k++){const mid=(lo+hi)/2;candidate.set(origin.x+d[0]*mid,origin.y+d[1]*mid,origin.z+d[2]*mid);if(this.inside(candidate,margin))lo=mid;else hi=mid;}bestDistance=hi;best=new T.Vector3(origin.x+d[0]*(hi+.0001),origin.y+d[1]*(hi+.0001),origin.z+d[2]*(hi+.0001));break;}}
   }if(best)point.copy(best);
  }return moved;
 }
}

class Cloth{
 constructor(data,bones,kind){
  this.data=data;this.skin=skin(data,bones);this.rest=this.skin.rest;this.target=this.skin.target;this.pos=this.rest.slice();this.old=this.rest.slice();this.priorTarget=this.rest.slice();this.kind=kind;this.edges=[];this.bends=[];
  const edges=new Map();
  for(let i=0;i<data.indices.length;i+=3){const tri=data.indices.slice(i,i+3);for(let j=0;j<3;j++){const x=tri[j],y=tri[(j+1)%3],opp=tri[(j+2)%3],key=x<y?x+':'+y:y+':'+x;
   if(edges.has(key))this.bends.push([edges.get(key)[2],opp]);else edges.set(key,[x,y,opp]);
  }}
  this.edges=[...edges.values()].map(e=>e.slice(0,2));
  for(const list of [this.edges,this.bends])for(const e of list)e.push(p.fromArray(this.rest,e[0]*3).distanceTo(a.fromArray(this.rest,e[1]*3)));
  this.anchor=new Float32Array(this.pos.length/3);
  for(let i=0;i<this.anchor.length;i++){const x=this.rest[i*3],y=this.rest[i*3+1];this.anchor[i]=kind==='pants'?(y>.80?.85:.012):(y>1.15&&Math.abs(x)<.17?.4:.012);}
  this.surface=new Surface(data);this.contacts=new Int32Array(this.anchor.length);this.underContacts=new Int32Array(this.anchor.length);this.maxContact=0;
 }
 reset(){this.skin.update();this.pos.set(this.target);this.old.set(this.target);this.priorTarget.set(this.target);}
 prepare(){this.skin.update();
  for(let i=0;i<this.pos.length;i++){const shift=this.target[i]-this.priorTarget[i];this.pos[i]+=shift;this.old[i]+=shift;this.priorTarget[i]=this.target[i];}}
 distances(list,stiffness){for(const [i,j,length] of list){const x=i*3,y=j*3;let dx=this.pos[y]-this.pos[x],dy=this.pos[y+1]-this.pos[x+1],dz=this.pos[y+2]-this.pos[x+2];const d=Math.hypot(dx,dy,dz);if(d<1e-9)continue;const f=(d-length)/d*.5*stiffness;dx*=f;dy*=f;dz*=f;this.pos[x]+=dx;this.pos[x+1]+=dy;this.pos[x+2]+=dz;this.pos[y]-=dx;this.pos[y+1]-=dy;this.pos[y+2]-=dz;}}
 step(dt,body,under){
  for(let i=0;i<this.pos.length;i++){const v=(this.pos[i]-this.old[i])*.88;this.old[i]=this.pos[i];this.pos[i]+=v;if(i%3===1)this.pos[i]-=9.81*dt*dt;}
  for(let iter=0;iter<3;iter++){
   for(let i=0;i<this.anchor.length;i++){const f=this.anchor[i];for(let k=0;k<3;k++){const j=i*3+k;this.pos[j]+=(this.target[j]-this.pos[j])*f;}}
   this.distances(this.edges,.88);this.distances(this.bends,.16);
   for(let i=0;i<this.anchor.length;i++){p.fromArray(this.pos,i*3);body.contactAt(p,this.contacts[i],.006);if(under&&this.rest[i*3+1]<1.035)under.contactAt(p,this.underContacts[i],.005);p.toArray(this.pos,i*3);}
  }
 }
}
export function criarTecidoFisico(root,data){
 root.updateMatrixWorld(true);const bones=new Map();let skeleton;
 root.traverse(o=>{if(o.isSkinnedMesh&&!skeleton)skeleton=o.skeleton;});
 skeleton.bones.forEach((bone,i)=>bones.set(canonical(bone.name),{bone,inverse:skeleton.boneInverses[i]}));
 const body=new BodyVolumes(bones);
 const pants=new Cloth(data['neto-calca'],bones,'pants'),shirt=new Cloth(data['neto-camisa'],bones,'shirt');
 const render=[];
 root.traverse(o=>{
  if(!o.isSkinnedMesh||!(/camisa|calca/.test(o.name)||o.material?.some?.(m=>/camisa|calca/.test(m.name))))return;
  const cloth=/calca/.test(o.name)||o.material?.some?.(m=>/calca/.test(m.name))?pants:shirt;
  const original=o.geometry.attributes.position.array.slice();const source=o.geometry.clone();
  // Displacement is interpolated from the simulated surface; normal animation still supplies pose and detail.
  const map=new Int32Array(original.length),bc=new Float32Array(original.length),contacts=new Int32Array(original.length/3);
  for(let i=0;i<original.length/3;i++){
   p.fromArray(original,i*3);contacts[i]=body.nearest(p);const h=cloth.surface.bvh.closestPointToPoint(p,hit);const k=h.faceIndex*3;const idx=cloth.surface.index;
   a.fromArray(cloth.rest,idx[k]*3);b.fromArray(cloth.rest,idx[k+1]*3);c.fromArray(cloth.rest,idx[k+2]*3);T.Triangle.getBarycoord(h.point,a,b,c,bary);
   for(let j=0;j<3;j++)map[i*3+j]=idx[k+j];bary.toArray(bc,i*3);
  }
  const mesh=new T.Mesh(source,o.material);mesh.name=o.name+'-fisica';mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;o.parent.add(mesh);o.visible=false;
  render.push({o,mesh,cloth,original,map,bc,contacts});
 });
 let initialized=false;const stats={frames:0,bodyVertices:data.neto.originalVertices,bodyFaces:data.neto.originalFaces,particles:pants.anchor.length+shirt.anchor.length,physicsMs:0,renderMs:0};
 function reset(){initialized=false;}
 function update(dt){
  const started=performance.now();root.updateMatrixWorld(true);skeleton.update();body.update();
  if(!initialized){pants.reset();shirt.reset();initialized=true;}
  pants.prepare();shirt.prepare();
  for(const cloth of [pants,shirt])for(let i=0;i<cloth.anchor.length;i++){p.fromArray(cloth.pos,i*3);cloth.contacts[i]=body.nearest(p);}
  pants.surface.update(pants.pos);
  for(let i=0;i<shirt.anchor.length;i++){p.fromArray(shirt.pos,i*3);shirt.underContacts[i]=shirt.rest[i*3+1]<1.035?pants.surface.nearest(p,.08):-1;}
  const steps=Math.max(1,Math.min(6,Math.ceil(dt/(1/60))));const h=Math.min(dt,.05)/steps;
  for(let s=0;s<steps;s++){pants.step(h,body,null);pants.surface.update(pants.pos);shirt.step(h,body,pants.surface);}
  shirt.surface.update(shirt.pos);stats.physicsMs=performance.now()-started;const rendering=performance.now();
  for(const {o,mesh,cloth,original,map,bc,contacts} of render){
   const pos=mesh.geometry.attributes.position;
   const matrices=o.skeleton.bones.map((_,i)=>new T.Matrix4().multiplyMatrices(o.bindMatrixInverse,new T.Matrix4().fromArray(o.skeleton.boneMatrices,i*16)).multiply(o.bindMatrix).elements);
   const joints=o.geometry.attributes.skinIndex.array,weights=o.geometry.attributes.skinWeight.array;
   for(let i=0;i<pos.count;i++){
    const x=original[i*3],y=original[i*3+1],z=original[i*3+2];p.set(0,0,0);
    for(let k=0;k<4;k++){const w=weights[i*4+k];if(!w)continue;const m=matrices[joints[i*4+k]];p.x+=(m[0]*x+m[4]*y+m[8]*z+m[12])*w;p.y+=(m[1]*x+m[5]*y+m[9]*z+m[13])*w;p.z+=(m[2]*x+m[6]*y+m[10]*z+m[14])*w;}
    for(let j=0;j<3;j++){const k=map[i*3+j]*3,w=bc[i*3+j];p.x+=(cloth.pos[k]-cloth.target[k])*w;p.y+=(cloth.pos[k+1]-cloth.target[k+1])*w;p.z+=(cloth.pos[k+2]-cloth.target[k+2])*w;}
    // Enforce contact on the rendered cloth as well, including interpolation between simulation nodes.
    if(cloth===shirt&&original[i*3+1]<1.035){const k=map[i*3];pants.surface.contactAt(p,shirt.underContacts[k],.004);}body.contact(p,.003);pos.setXYZ(i,p.x,p.y,p.z);
   }
   pos.needsUpdate=true;mesh.geometry.computeVertexNormals();
  }
  stats.frames++;stats.renderMs=performance.now()-rendering;
 }
 return {update,reset,stats,body,pants,shirt,render};
}
