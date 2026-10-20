// Todos os corpos abaixo entram no MESMO PhysicsSystem usado pelo pano.
export function criarRigidosJolt(jolt){
 const {J,corpos}=jolt,items=[],v=new J.Vec3(0,0,0),p=new J.RVec3(0,0,0),q=new J.Quat(0,0,0,1);
 function criar(shape,position,{massa=0,atrito=.7,restituicao=0,cinematico=false,camada=cinematico?4:massa?3:5}={}){
  p.Set(...position);const cs=new J.BodyCreationSettings(shape,p,q,cinematico?J.EMotionType_Kinematic:massa?J.EMotionType_Dynamic:J.EMotionType_Static,camada);
  cs.mFriction=atrito;cs.mRestitution=restituicao;cs.mLinearDamping=0;cs.mAngularDamping=0;
  if(massa){cs.mOverrideMassProperties=J.EOverrideMassProperties_CalculateInertia;cs.mMassPropertiesOverride.mMass=massa;cs.mMotionQuality=J.EMotionQuality_LinearCast;}
  const body=corpos.CreateBody(cs);J.destroy(cs);corpos.AddBody(body.GetID(),J.EActivation_Activate);
  const item={body,massa,position:[...position]};items.push(item);return item;
 }
 return {
  items,
  esfera(r,pos,opt){return criar(new J.SphereShape(r),pos,opt);},
  caixa(half,pos,opt){v.Set(...half);return criar(new J.BoxShape(v,0),pos,opt);},
  capsula(half,r,pos,opt){return criar(new J.CapsuleShape(half,r),pos,opt);},
  terreno(geo){
   const tris=new J.TriangleList(),pos=geo.attributes.position,ix=geo.index.array,vs=[new J.Vec3(),new J.Vec3(),new J.Vec3()];
   for(let i=0;i<ix.length;i+=3){for(let k=0;k<3;k++)vs[k].Set(pos.getX(ix[i+k]),pos.getY(ix[i+k]),pos.getZ(ix[i+k]));const t=new J.Triangle(...vs);tris.push_back(t);J.destroy(t);}
   const settings=new J.MeshShapeSettings(tris),result=settings.Create();if(result.HasError())throw Error(result.GetError().c_str());
   const body=criar(result.Get(),[0,0,0],{camada:5,atrito:.8});J.destroy(result);J.destroy(settings);J.destroy(tris);vs.forEach(x=>J.destroy(x));return body;
  },
  mover(item,pos,dt,teleporte=false){p.Set(...pos);if(teleporte)corpos.SetPositionAndRotation(item.body.GetID(),p,q,J.EActivation_Activate);else corpos.MoveKinematic(item.body.GetID(),p,q,dt);},
  impulso(item,imp){v.Set(...imp);corpos.AddImpulse(item.body.GetID(),v);},
  velocidade(item){const x=item.body.GetLinearVelocity();return [x.GetX(),x.GetY(),x.GetZ()];},
  amortecer(item,fator){const a=item.body.GetAngularVelocity();v.Set(a.GetX()*fator,a.GetY()*fator,a.GetZ()*fator);corpos.SetAngularVelocity(item.body.GetID(),v);},
  ler(item,mesh){const x=item.body.GetPosition(),r=item.body.GetRotation();mesh.position.set(x.GetX(),x.GetY(),x.GetZ());mesh.quaternion.set(r.GetX(),r.GetY(),r.GetZ(),r.GetW());},
  reset(item){p.Set(...item.position);corpos.SetPositionAndRotation(item.body.GetID(),p,q,J.EActivation_Activate);v.Set(0,0,0);corpos.SetLinearAndAngularVelocity(item.body.GetID(),v,v);},
  passo(dt){jolt.passo(dt);},
 };
}
