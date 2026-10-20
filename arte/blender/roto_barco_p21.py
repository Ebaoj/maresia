"""P21: 39 quadros rastreados e revistos, IK e contatos com barco/chão.
Blender -b --python arte/blender/roto_barco_p21.py -- prever|render
"""
import bpy,math,json,sys
import numpy as np
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from bpy_extras import anim_utils
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21'
D=json.loads((OUT/'marcas.json').read_text());Q=D['quadros'];PREVIEW=sys.argv[-1]!='render'
if D.get('revisao',1)>=2:raise SystemExit('Retarget antigo usa quadril/orelha não observados. Calibrar para as marcas da revisão 2 antes de gerar outra animação.')
s=bpy.context.scene;s.render.fps=25
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'arte/finais/neto-vestido.glb'))
a=next(o for o in s.objects if o.type=='ARMATURE');a.animation_data_clear();W=a.matrix_world.copy();Wi=W.inverted();P=a.pose.bones
meshes=[o for o in s.objects if o.type=='MESH' and o.name.startswith('neto')]
for o in list(s.objects):
 if o.type=='MESH' and o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
for b in P:b.rotation_mode='QUATERNION';b.matrix_basis.identity()
bpy.context.view_layer.update();rest={b.name:(W@b.head,W@b.tail,(W@b.matrix).to_3x3()) for b in P}
H0=rest['mixamorig:Hips'][0].copy();SCALE=170.;THETA=math.radians(24);ELEV=math.radians(8)
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
def solve(upper,lower,target,desired_joint,kind):
 h=head(upper);l1=(rest['mixamorig:'+upper][1]-rest['mixamorig:'+upper][0]).length;l2=(rest['mixamorig:'+lower][1]-rest['mixamorig:'+lower][0]).length
 v=target-h;distance=v.length
 if distance>l1+l2:reach_clamps.append({'quadro':s.frame_current,'osso':upper,'excesso_m':distance-l1-l2})
 d=max(abs(l1-l2)+1e-5,min(distance,l1+l2-1e-5));u=v.normalized();target=h+u*d
 along=(l1*l1+d*d-l2*l2)/(2*d);radius=math.sqrt(max(0,l1*l1-along*along));center=h+u*along
 b1=u.cross(Vector((1,0,0)))
 if b1.length<.01:b1=u.cross(Vector((0,0,1)))
 b1.normalize();b2=u.cross(b1).normalized();best=None
 for angle in np.linspace(-math.pi,math.pi,181):
  joint=center+radius*(b1*math.cos(float(angle))+b2*math.sin(float(angle)))
  e=np.linalg.norm(project(joint-desired_joint))**2
  if kind=='leg':e+=20*(joint.x-h.x)**2
  else:
   # Anatomical branch: near elbow outward, far elbow toward its side.
   side=1 if upper.startswith('Left') else -1
   e+=.12*max(0,-side*(joint.x-h.x))**2
  if best is None or e<best[0]:best=(e,joint)
 joint=best[1];orient(upper,joint-h);orient(lower,target-joint)
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
for i,q in enumerate(Q):
 f=i+1;s.frame_set(f)
 for b in P:b.matrix_basis.identity()
 update();p={k:(Vector(v) if v else None) for k,v in q['pontos'].items()};h=p['quadril'];st=p['ombro'];el=p['cotovelo'];wr=p['punho'];ma=p['mao']
 support={'Left':i<32,'Right':i<5 or i>=20}
 ground=(p['ponta_perto'].y if support['Left'] and p['ponta_perto'] else p['ponta_longe'].y)
 root=Vector((H0.x,(h.x-Q[0]['pontos']['quadril'][0])/(SCALE*R.y),(ground-h.y)/SCALE-.02))
 setroot(root);orient('Hips',sag(st.x-h.x-5,st.y-h.y));orient('Neck',sag(p['orelha'].x-st.x,p['orelha'].y-st.y))
 topvec=p['topo']-p['orelha'];pitch=math.atan2(-topvec.x,-topvec.y*R.y);orient('Head',Matrix.Rotation(pitch,3,'X')@(rest['mixamorig:Head'][1]-rest['mixamorig:Head'][0]))
 reach=[];ankles={};knee_targets={}
 for side,suffix in [('Left','perto'),('Right','longe')]:
  an=p['tornozelo_'+suffix];kn=p['joelho_'+suffix];toe=p['ponta_'+suffix];target=root+sag(an.x-h.x,an.y-h.y);target.x=head(side+'UpLeg').x;kt=root+sag(kn.x-h.x,kn.y-h.y);kt.x=target.x
  ankles[side]=target;knee_targets[side]=kt;err,_=solve(side+'UpLeg',side+'Leg',target,kt,'leg');reach.append(err);foot(side,an,toe)
 # Anchor the actual forefoot skin vertex at support; preserve the source's toe-off.
 for side in ['Left','Right']:
  if not support[side]:anchors.pop(side,None);foot_vertices.pop(side,None)
  elif side not in anchors:
   co=skin();idx=min(contact_ids[side],key=lambda j:co[j].z);foot_vertices[side]=idx;v=co[idx].copy();v.z=0;anchors[side]=v
 for _ in range(5):
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
 for b in P:b.keyframe_insert('location',frame=f,group=b.name);b.keyframe_insert('rotation_quaternion',frame=f,group=b.name)
 co=skin();contacts={side:Vector(((co[idx]-anchors[side]).x,(co[idx]-anchors[side]).y,0)).length for side,idx in foot_vertices.items()}
 finalreach=[]
 for up,lo,targ in [('LeftUpLeg','LeftLeg',ankles['Left']),('RightUpLeg','RightLeg',ankles['Right']),('LeftArm','LeftForeArm',near_arm_target),('RightArm','RightForeArm',far)]:
  length=sum((rest['mixamorig:'+n][1]-rest['mixamorig:'+n][0]).length for n in [up,lo]);finalreach.append(max(0,(targ-head(up)).length-length))
 metrics.append({'alcance_excedido_final_m':max(finalreach),'quadro':f,'pts_s':q['pts_s'],'alcance_excedido_m':max(reach),'erro_contatos_m':contacts,'min_z_m':min(v.z for v in co),'residuo_cotovelo_m':res,'quadril_m':list(root),'contato_mao_m':list(palmPoint)})
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
bpy.ops.export_scene.gltf(filepath=str(OUT/'neto-empurrar.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True,export_image_format='JPEG')
for ob in s.objects:
 if ob.type=='MESH' or ob==boat:ob.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'cena-empurrar.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True,export_image_format='JPEG')
(OUT/'ajustes.json').write_text(json.dumps({'inicio_original_s':Q[0]['pts_s'],'fim_original_s':Q[-1]['pts_s'],'fps':25,'quadros':metrics,'escala_px_m':SCALE,'alcance_limitado':reach_clamps,'nota':'Braço distante e dedos aproximados. Cabeça orientada pela silhueta observada. Contatos nos pés e pega presos por IK.'},ensure_ascii=False,indent=2))
# Studio render, CPU (headless GPU is unavailable on this machine).
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='chao';floor.data.materials.append(material('areia',(.24,.20,.14)))
s.world=bpy.data.worlds.new('ceu-estudo');s.world.use_nodes=True;s.world.node_tree.nodes['Background'].inputs[0].default_value=(.33,.39,.42,1);s.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,loc,power,size in [('principal',(3,-3,5),650,5),('preenchimento',(-3,2,4),350,4)]:
 o=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));s.collection.objects.link(o);o.location=loc;o.data.energy=power;o.data.size=size;o.rotation_euler=(Vector((0,-.5,.8))-o.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('camera',bpy.data.cameras.new('camera'));s.collection.objects.link(cam);s.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=3.0
center=Vector((0,-.47,.78));cam.location=center+C*6;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler()
s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=16;s.cycles.use_denoising=True;s.render.threads_mode='FIXED';s.render.threads=6;s.render.resolution_x=900;s.render.resolution_y=700;s.render.resolution_percentage=100;s.render.image_settings.file_format='PNG';s.view_settings.view_transform='AgX'
(OUT/'render').mkdir(exist_ok=True)
for f in ([] if sys.argv[-1]=='medir' else ([1,20,39] if PREVIEW else range(1,len(Q)+1))):
 s.frame_set(f);s.render.filepath=str(OUT/'render'/f'q{f:04d}.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'estudo.blend'))
print('P21_PRONTO',len(Q),'MAX_REACH',max(m['alcance_excedido_m'] for m in metrics),'MINZ',min(m['min_z_m'] for m in metrics),'MAX_CONTACT',max(v for m in metrics for v in m['erro_contatos_m'].values()))
