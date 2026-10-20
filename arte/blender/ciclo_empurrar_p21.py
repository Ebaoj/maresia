"""P21, ciclo completo de empurrar SINTÉTICO e PROVISÓRIO (48 quadros): mesmo solucionador de IK e contatos do
roto_barco_p21_v4.py, mas a marcação vem de arte/rotoscopia/gerar_ciclo_empurrar_p21.py e não de um filme.
Antes: python3 arte/rotoscopia/gerar_ciclo_empurrar_p21.py
Blender -b --python arte/blender/ciclo_empurrar_p21.py -- render   (câmera e luzes acompanham o avanço)
Leia arte/finais/ciclo-empurrar-p21-sintetico/README.md."""
import bpy,math,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from bpy_extras import anim_utils
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/ciclo-empurrar-p21-sintetico'
D=json.loads((OUT/'marcas-sinteticas.json').read_text());Q=D['quadros'];PREVIEW=sys.argv[-1]!='render'
if D.get('revisao')!=2:raise SystemExit('Este retarget requer a marcação revista 2.')
s=bpy.context.scene;s.render.fps=25
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'arte/finais/neto-vestido.glb'))
a=next(o for o in s.objects if o.type=='ARMATURE');a.animation_data_clear();W=a.matrix_world.copy();Wi=W.inverted();P=a.pose.bones
meshes=[o for o in s.objects if o.type=='MESH' and o.name.startswith('neto')]
for o in list(s.objects):
 if o.type=='MESH' and o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
for b in P:b.rotation_mode='QUATERNION';b.matrix_basis.identity()
bpy.context.view_layer.update();rest={b.name:(W@b.head,W@b.tail,(W@b.matrix).to_3x3()) for b in P}
H0=rest['mixamorig:Hips'][0].copy();SCALE=190.;THETA=math.radians(24);ELEV=math.radians(8)
R=Vector((-math.sin(THETA),math.cos(THETA),0));U=Vector((-math.sin(ELEV)*math.cos(THETA),-math.sin(ELEV)*math.sin(THETA),math.cos(ELEV)));C=R.cross(U).normalized()
# Screenshot axes: horizontal right, vertical up. Sagittal reconstruction keeps bone lengths.
def sag(dx,dy,k=SCALE):
 y=dx/(k*R.y);z=(-dy/k-U.y*y)/U.z;return Vector((0,y,z))
def update():bpy.context.view_layer.update()
def head(n):return W@P['mixamorig:'+n].head
def setroot(h):
 b=P['mixamorig:Hips'];m=b.matrix.copy();m.translation=Wi@h;b.matrix=m;update()
def orient(n,v):
 b=P['mixamorig:'+n];h=head(n);rh,rt,rr=rest[b.name];q=(rt-rh).normalized().rotation_difference(v.normalized())
 mat=(q.to_matrix()@rr).to_4x4();mat.translation=h;b.matrix=Wi@mat;update()
def project(v):return np.array([v.dot(R),v.dot(U)])
reach_clamps=[]
joint_previous={}
frame_history={}
ANGLES=np.linspace(-math.pi,math.pi,1441)
def solve(upper,lower,target,desired_joint,kind):
 h=head(upper);l1=(rest['mixamorig:'+upper][1]-rest['mixamorig:'+upper][0]).length;l2=(rest['mixamorig:'+lower][1]-rest['mixamorig:'+lower][0]).length
 v=target-h;distance=v.length
 if distance>l1+l2:reach_clamps.append({'quadro':s.frame_current,'osso':upper,'excesso_m':distance-l1-l2})
 d=max(abs(l1-l2)+1e-5,min(distance,l1+l2-1e-5));u=v.normalized();target=h+u*d
 along=(l1*l1+d*d-l2*l2)/(2*d);radius=math.sqrt(max(0,l1*l1-along*along));center=h+u*along
 b1=u.cross(Vector((1,0,0)))
 if b1.length<.01:b1=u.cross(Vector((0,0,1)))
 b1.normalize();b2=u.cross(b1).normalized();best=None
 points=np.asarray(center)[None,:]+radius*(np.cos(ANGLES)[:,None]*np.asarray(b1)[None,:]+np.sin(ANGLES)[:,None]*np.asarray(b2)[None,:])
 diff=points-np.asarray(desired_joint);errors=(diff@np.asarray(R))**2+(diff@np.asarray(U))**2
 if kind=='leg':
  errors+=.5*(points[:,0]-h.x)**2+20*np.maximum(0,np.abs(points[:,0]-h.x)-.12)**2
  if upper=='RightUpLeg' and radius>1e-6:
   # Anatomical hinge: the right knee bends forward, not behind the hip-ankle line.
   pole=Vector((0,-1,0));pole-=u*pole.dot(u);pole.normalize()
   forward=(points-np.asarray(center))@np.asarray(pole)
   errors[forward<radius*math.cos(math.radians(12))-1e-8]=np.inf
 else:
  side=1 if upper.startswith('Left') else -1;errors+=.12*np.maximum(0,-side*(points[:,0]-h.x))**2
 if upper in frame_history:
  predicted=np.asarray(h+frame_history[upper]);errors+=.8*np.sum((points-predicted)**2,axis=1)
 index=int(np.argmin(errors));joint=Vector(points[index]);joint_previous[upper]=joint-h
 orient(upper,joint-h);orient(lower,target-joint)
 best=(float(errors[index]),joint)
 return max(0,distance-(l1+l2)),math.sqrt(best[0])
def foot(side,ankle,toe):
 if toe is None:toe=ankle+Vector((-12,12))
 d=sag(*(toe-ankle));r=rest['mixamorig:'+side+'Foot'];lat=(r[1]-r[0]).x
 d=d.normalized();d.x=lat/(r[1]-r[0]).length;orient(side+'Foot',d)
def palm(side,d):
 n=side+'Hand';orient(n,d);b=P['mixamorig:'+n];axis=(W@b.tail-W@b.head).normalized()
 lr=rest[b.name][2].inverted()@Vector((0,-1,0));now=(W@b.matrix).to_3x3()@lr;want=Vector((0,-1,0))
 now=(now-axis*now.dot(axis)).normalized();want=(want-axis*want.dot(axis)).normalized();angle=math.atan2(axis.dot(now.cross(want)),now.dot(want));h=head(n)
 b.matrix=Wi@Matrix.Translation(h)@Matrix.Rotation(angle,4,axis)@Matrix.Translation(-h)@W@b.matrix;update()
 for finger in ['Index','Middle','Ring','Pinky']:
  for seg,deg in [(1,10),(2,35),(3,25)]:
   pb=P[f'mixamorig:{side}Hand{finger}{seg}'];rh,rt,rr=rest[pb.name];axisLocal=rr.inverted()@(rt-rh).normalized().cross(Vector((0,-1,0))).normalized();pb.rotation_quaternion=Quaternion(axisLocal,math.radians(deg))
 update()
# Vertex sets for forefoot contacts, rather than ankles sliding over the floor.
body=next(o for o in meshes if o.name=='neto');contact_ids={};all_foot_ids={}
for side in ['Left','Right']:
 groups={g.index for g in body.vertex_groups if g.name in ['mixamorig:'+side+'Foot','mixamorig:'+side+'ToeBase']}
 ids=[v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>.6 and v.co.y<-.07]
 contact_ids[side]=ids
 all_foot_ids[side]=[v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in groups)>.3]

def skin():
 dg=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(dg);me=ev.to_mesh();coords=[ev.matrix_world@v.co for v in me.vertices];ev.to_mesh_clear();return coords

def material(n,col):
 m=bpy.data.materials.new(n);m.diffuse_color=(*col,1);m.use_nodes=True;bs=m.node_tree.nodes['Principled BSDF'];bs.inputs['Base Color'].default_value=(*col,1);bs.inputs['Roughness'].default_value=.9;return m
wood=material('madeira',(.23,.12,.055));yellow=material('ocre',(.64,.39,.09));dark=material('quilha',(.075,.10,.095));rubber=material('rodas',(.055,.05,.045))
boat=bpy.data.objects.new('barco-contato',None);s.collection.objects.link(boat)
# The head of the boat is at local y=0. Interior points extend left in the image.
levels=[(0,.27),(-.6,.55),(-2,.68),(-3.6,.55)];verts=[]
for y,width in levels:verts.extend([(-width,y,0),(width,y,0),(-width*.7,y-.2,-.87),(width*.7,y-.2,-.87)])
faces=[]
for i in range(len(levels)-1):
 j=i*4;k=j+4;faces.extend([(j,j+2,k+2,k),(j+1,k+1,k+3,j+3),(j+2,j+3,k+3,k+2)])
faces.extend([(0,1,3,2),(12,14,15,13)])
me=bpy.data.meshes.new('casco-estudo');me.from_pydata(verts,[],faces);me.update();hull=bpy.data.objects.new('casco',me);s.collection.objects.link(hull);hull.parent=boat;hull.data.materials.append(yellow);bev=hull.modifiers.new('borda','BEVEL');bev.width=.015;bev.segments=2
# Rails and cart, both are rigid objects; no invented human actions are added.
def bar(n,p,q,r,mat,parent):
 mid=(Vector(p)+Vector(q))/2;v=Vector(q)-Vector(p);bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=v.length,location=mid);o=bpy.context.object;o.name=n;o.rotation_euler=v.to_track_quat('Z','Y').to_euler();o.data.materials.append(mat);o.parent=parent;return o
for sign in [-1,1]:
 for (y,w),(yy,ww) in zip(levels,levels[1:]):bar('borda-madeira',(sign*w,y,.005),(sign*ww,yy,.005),.035,wood,boat)
bar('pega-na-proa',(-.27,0,.005),(.27,0,.005),.035,wood,boat)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-1.5,-.92));cart=bpy.context.object;cart.name='carreta';cart.scale=(.72,1.5,.035);cart.data.materials.append(wood);cart.parent=boat
wheels=[]
for yy in [-.7,-2.5]:
 for xx in [-.62,.62]:
  bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.19,depth=.075,location=(xx,yy,-.76));o=bpy.context.object;o.name='roda';o.rotation_euler.y=math.pi/2;o.data.materials.append(rubber);o.parent=boat;wheels.append(o)
# Bake poses. Distant arm is constrained to the same rail; explicitly approximate.
anchors={};foot_vertices={};metrics=[];boat0=None;railZ=None
# Missing observations stay null in marcas.json. Only the rig uses a named approximation.
required=['joelho_perto','joelho_longe','tornozelo_perto','tornozelo_longe','ponta_perto','ponta_longe']
def model_point(i,k):
 if Q[i]['pontos'].get(k) is not None:return Vector(Q[i]['pontos'][k])
 if k.startswith('ponta_'):
  ankle_key=k.replace('ponta_','tornozelo_');valid=[j for j in range(len(Q)) if Q[j]['pontos'].get(k) is not None and Q[j]['pontos'].get(ankle_key) is not None]
  before=[j for j in valid if j<i];after=[j for j in valid if j>i];aa=before[-1] if before else after[0];bb=after[0] if after else aa
  va=Vector(Q[aa]['pontos'][k])-Vector(Q[aa]['pontos'][ankle_key]);vb=Vector(Q[bb]['pontos'][k])-Vector(Q[bb]['pontos'][ankle_key]);weight=0 if aa==bb else (i-aa)/(bb-aa)
  return model_point(i,ankle_key)+va.lerp(vb,weight)
 valid=[j for j in range(len(Q)) if Q[j]['pontos'].get(k) is not None];before=[j for j in valid if j<i];after=[j for j in valid if j>i];a0=before[-1] if before else after[0];b0=after[0] if after else a0
 va=Vector(Q[a0]['pontos'][k])-Vector(Q[a0]['pontos']['referencia_calca']);vb=Vector(Q[b0]['pontos'][k])-Vector(Q[b0]['pontos']['referencia_calca']);w=0 if a0==b0 else (i-a0)/(b0-a0)
 return Vector(Q[i]['pontos']['referencia_calca'])+va.lerp(vb,w)
quaternion_previous={}
initial_axis=Vector(Q[0]['pontos']['topo'])-Vector(Q[0]['pontos']['borda_cabeca']);initial_pitch=math.atan2(-initial_axis.x,-initial_axis.y*R.y)
for i,q in enumerate(Q):
 f=i+1;s.frame_set(f);frame_history={k:v.copy() for k,v in joint_previous.items()}
 for b in P:b.matrix_basis.identity()
 update();p={k:(Vector(v) if v else None) for k,v in q['pontos'].items()}
 for k in required:p[k]=model_point(i,k)
 h=p['referencia_calca'];st=p['ombro'];el=p['cotovelo'];wr=p['punho'];ma=p['mao']
 support=q['apoio']
 ground=(p['ponta_perto'].y if support['Left'] and p['ponta_perto'] else p['ponta_longe'].y)
 root=Vector((H0.x,(h.x-Q[0]['pontos']['referencia_calca'][0])/(SCALE*R.y),(ground-h.y)/SCALE+.10))
 setroot(root);orient('Hips',sag(st.x-h.x-5,st.y-h.y));orient('Neck',sag(p['topo'].x-st.x,p['topo'].y-st.y))
 topvec=p['topo']-p['borda_cabeca'];pitch=math.radians(60)+math.atan2(-topvec.x,-topvec.y*R.y)-initial_pitch;orient('Head',Matrix.Rotation(pitch,3,'X')@(rest['mixamorig:Head'][1]-rest['mixamorig:Head'][0]))
 reach=[];ankles={};knee_targets={}
 for side,suffix in [('Left','perto'),('Right','longe')]:
  an=p['tornozelo_'+suffix];kn=p['joelho_'+suffix];toe=p['ponta_'+suffix];target=root-Vector((0,0,.10))+sag(an.x-h.x,an.y-h.y);target.x=head(side+'UpLeg').x;kt=root-Vector((0,0,.10))+sag(kn.x-h.x,kn.y-h.y);kt.x=target.x
  ankles[side]=target;knee_targets[side]=kt;err,_=solve(side+'UpLeg',side+'Leg',target,kt,'leg');reach.append(err);foot(side,an,toe)
 # Anchor the actual forefoot skin vertex at support; preserve the source's toe-off.
 for side in ['Left','Right']:
  if not support[side]:anchors.pop(side,None);foot_vertices.pop(side,None)
  elif side not in anchors:
   co=skin();idx=min(contact_ids[side],key=lambda j:co[j].z);foot_vertices[side]=idx;v=co[idx].copy();v.z=0;anchors[side]=v
 for _ in range(12):
  # Keep the pelvis within the reachable height of both ankle targets.
  ceiling=root.z
  for side in ['Left','Right']:
   hh=head(side+'UpLeg');length=sum((rest['mixamorig:'+n][1]-rest['mixamorig:'+n][0]).length for n in [side+'UpLeg',side+'Leg'])-.002
   dv=ankles[side]-hh;horizontal=dv.x*dv.x+dv.y*dv.y
   ceiling=min(ceiling,ankles[side].z+math.sqrt(max(0,length*length-horizontal))-(hh.z-root.z))
  if ceiling<root.z-1e-6:
   root.z=ceiling;setroot(root)
   for side in ['Left','Right']:
    solve(side+'UpLeg',side+'Leg',ankles[side],knee_targets[side],'leg');suffix='perto' if side=='Left' else 'longe';foot(side,p['tornozelo_'+suffix],p['ponta_'+suffix])
  co=skin()
  for side in ['Left','Right']:
   minimum=min(co[j].z for j in all_foot_ids[side]);delta=Vector((0,0,0))
   if side in anchors:
    delta=anchors[side]-co[foot_vertices[side]];delta.z=-minimum
   elif minimum<0:delta.z=-minimum
   if delta.length>1e-7:
    ankles[side]+=delta;err,_=solve(side+'UpLeg',side+'Leg',ankles[side],knee_targets[side],'leg');reach.append(err);suffix='perto' if side=='Left' else 'longe';foot(side,p['tornozelo_'+suffix],p['ponta_'+suffix])
 # Visible arm: observed endpoint + elbow projection select the analytic IK branch.
 hd=sag(*(ma-wr)).normalized();sh=head('LeftArm');rel=(wr-st)/SCALE;target=sh+R*rel.x-U*rel.y;target+=C*((.25-target.x)/C.x)
 if railZ is not None:target.z=railZ+.015-hd.z*.07
 desired=sh+R*((el.x-st.x)/SCALE)-U*((el.y-st.y)/SCALE)
 near_arm_target=target.copy();armerr,res=solve('LeftArm','LeftForeArm',target,desired,'arm');reach.append(armerr);hd=sag(*(ma-wr)).normalized();palm('Left',hd)
 wrist=head('LeftHand');palmPoint=wrist+hd*.07
 if boat0 is None:boat0=palmPoint.copy();railZ=palmPoint.z-.015
 # Prop follows observed hand, so the grip cannot drift away from it.
 boat.location=palmPoint-Vector((.25,0,0));boat.location.z=railZ
 for wh in wheels:
  wh.location.z=.19-railZ;wh.rotation_mode='QUATERNION';wh.rotation_quaternion=Quaternion((1,0,0),-(boat.location.y-boat0.y)/.19)@Quaternion((0,1,0),math.pi/2);wh.keyframe_insert('rotation_quaternion',frame=f)
 far=wrist.copy();far.x=-.25;fsh=head('RightArm');farDesired=fsh+Vector((-.18,-.12,-.12));err,_=solve('RightArm','RightForeArm',far,farDesired,'arm');reach.append(err);palm('Right',hd)
 boat.keyframe_insert('location',frame=f)
 for b in P:
  rotation=b.rotation_quaternion.copy()
  if b.name in quaternion_previous and rotation.dot(quaternion_previous[b.name])<0:rotation.negate();b.rotation_quaternion=rotation
  quaternion_previous[b.name]=rotation.copy();b.keyframe_insert('location',frame=f,group=b.name);b.keyframe_insert('rotation_quaternion',frame=f,group=b.name)
 co=skin();contacts={side:Vector(((co[idx]-anchors[side]).x,(co[idx]-anchors[side]).y,0)).length for side,idx in foot_vertices.items()}
 finalreach=[]
 for up,lo,targ in [('LeftUpLeg','LeftLeg',ankles['Left']),('RightUpLeg','RightLeg',ankles['Right']),('LeftArm','LeftForeArm',near_arm_target),('RightArm','RightForeArm',far)]:
  length=sum((rest['mixamorig:'+n][1]-rest['mixamorig:'+n][0]).length for n in [up,lo]);finalreach.append(max(0,(targ-head(up)).length-length))
 right_h=head('RightUpLeg');right_k=head('RightLeg');right_a=head('RightFoot');right_axis=(right_a-right_h).normalized();right_center=right_h+right_axis*(right_k-right_h).dot(right_axis);right_pole=Vector((0,-1,0));right_pole-=right_axis*right_pole.dot(right_axis);right_pole.normalize()
 metrics.append({'joelho_direito_frente_m':(right_k-right_center).dot(right_pole),'joelho_direito_desvio_lateral_m':right_k.x-right_center.x,'marcacao_revisao':2,'pontos_ocultos_inferidos_no_rig':[k for k in required if q['pontos'].get(k) is None],'pelve_modelo_offset_ref_calca_m':root.z-(ground-h.y)/SCALE,'alcance_excedido_final_m':max(finalreach),'quadro':f,'pts_s':q['pts_s'],'alcance_excedido_m':max(reach),'erro_contatos_m':contacts,'min_z_m':min(v.z for v in co),'residuo_cotovelo_m':res,'quadril_m':list(root),'contato_mao_m':list(palmPoint)})
# Match the rigid cart to its fixed deck height, with wheels resting on the floor.
for v in hull.data.vertices:
 if v.co.z<-.1:v.co.z=-(railZ-.43)
cart.location.z=.38-railZ
act=a.animation_data.action;act.name='P21_empurrar_barco_rotoscopia'
for obj in [a,boat,*wheels]:
 ad=obj.animation_data
 if ad and ad.action:
  cb=anim_utils.action_get_channelbag_for_slot(ad.action,ad.action_slot)
  for fc in cb.fcurves:
   for k in fc.keyframe_points:k.interpolation='LINEAR'
s.frame_start=1;s.frame_end=len(Q)
bpy.ops.object.select_all(action='DESELECT');a.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=a
bpy.ops.export_scene.gltf(filepath=str(OUT/'neto-empurrar-ciclo.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True,export_image_format='JPEG')
for ob in s.objects:
 if ob.type=='MESH' or ob==boat:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'cena-empurrar-ciclo.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True,export_image_format='JPEG')
(OUT/'ajustes.json').write_text(json.dumps({'inicio_original_s':Q[0]['pts_s'],'fim_original_s':Q[-1]['pts_s'],'fps':25,'quadros':metrics,'escala_px_m':SCALE,'alcance_limitado':reach_clamps,'marcacao_revisao':2,'nota':'Feição da calça guia deslocamento; pelve é estimada pelo rig, não observada. Ausências têm interpolações apenas no modelo identificadas por quadro. Rotação inicial da cabeça calibrada; orelha/nariz ocultos não foram usados. Braço distante e dedos aproximados. Cabeça orientada pela silhueta observada. Contatos nos pés e pega presos por IK.'},ensure_ascii=False,indent=2))
# Studio render, CPU (headless GPU is unavailable on this machine).
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='chao';floor.data.materials.append(material('areia',(.24,.20,.14)))
s.world=bpy.data.worlds.new('ceu-estudo');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.33,.39,.42,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,loc,power,size in [('principal',(3,-3,5),650,5),('preenchimento',(-3,2,4),350,4)]:
 o=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));s.collection.objects.link(o);o.location=loc;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,-.5,.8))-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('camera',bpy.data.cameras.new('camera'));s.collection.objects.link(cam);s.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=3.0
center=Vector((0,-.47,.78));cam.location=center+C*6;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=4 if sys.argv[-1]=='rascunho' else 6;s.cycles.use_denoising=True;s.render.threads_mode='FIXED';s.render.threads=6;s.render.resolution_x=900;s.render.resolution_y=700;s.render.resolution_percentage=50 if sys.argv[-1]=='rascunho' else 100;s.render.image_settings.file_format='PNG';s.view_settings.view_transform='AgX'

# --- Ciclo sintético: câmera/luzes acompanham o avanço; listras no chão a cada ciclo ---
VW=2.0/(SCALE*R.y);CICLO=len(Q)*VW
stripe=material('marca',(.10,.08,.06))
for i in range(-40,41):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-i*CICLO,.002));o=bpy.context.object;o.name='marca';o.scale=(40,.035,.004);o.data.materials.append(stripe)
cam0=cam.location.copy();lights=[(o,o.location.copy()) for o in s.objects if o.type=='LIGHT']
(OUT/'render').mkdir(exist_ok=True)
for f in range(1,len(Q)+1):
 off=Vector((0,-VW*(f-1),0));cam.location=cam0+off
 for o,l0 in lights:o.location=l0+off
 s.frame_set(f);s.render.filepath=str(OUT/'render'/f'q{f:04d}.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'ciclo.blend'))
print('CICLO_PRONTO',len(Q),'MAX_REACH',max(m['alcance_excedido_m'] for m in metrics),'MINZ',min(m['min_z_m'] for m in metrics),'MAX_CONTACT',max(v for m in metrics for v in m['erro_contatos_m'].values()),'CLAMPS',len(reach_clamps))
