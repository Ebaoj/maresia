"""Estudo de rotoscopia P07. 15 poses manuais, 57 quadros, sem ciclo artificial.
Blender -b --python arte/blender/roto_corrida_p07.py -- [prever|render]
"""
import bpy,sys,json,math,os
from pathlib import Path
from mathutils import Vector, Matrix
from bpy_extras import anim_utils
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'arte/finais/rotoscopia-p07';OUT.mkdir(exist_ok=True)
D=json.loads((OUT/'marcas.json').read_text()); Q=D['quadros']; START=Q[0]['pts_s']; END=Q[-1]['pts_s']
MODE=sys.argv[-1] if '--' in sys.argv else 'prever'
scene=bpy.context.scene;scene.render.fps=30
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'arte/finais/neto-vestido.glb'))
arm=next(o for o in scene.objects if o.type=='ARMATURE');arm.animation_data_clear()
PB=arm.pose.bones; W=arm.matrix_world.copy();Wi=W.inverted(); meshes=[o for o in scene.objects if o.type=='MESH' and o.parent==arm]
# Only actual character meshes, excluding importer extras.
meshes=[o for o in scene.objects if o.type=='MESH' and o.name.startswith('neto')]
for o in list(scene.objects):
 if o.type=='MESH' and o not in meshes:bpy.data.objects.remove(o,do_unlink=True)
for b in PB:b.rotation_mode='QUATERNION';b.matrix_basis.identity()
bpy.context.view_layer.update()
restH=W@PB['mixamorig:Hips'].head
rest={b.name:(W@b.head,W@b.tail) for b in PB}
SCALE=145.0
keys=Q[0]['pontos'].keys()
def point(t,k):
 valid=[q for q in Q if q['pontos'].get(k) is not None]
 if not valid:return None
 # Interpolate tracked positions relative to torso, so missing distant wrist follows the runner.
 if k=='punho_longe':
  vs=[(q['pts_s'],Vector(q['pontos'][k])-Vector(q['pontos']['quadril'])) for q in valid]
 else:vs=[(q['pts_s'],Vector(q['pontos'][k])) for q in valid]
 if t<=vs[0][0]:v=vs[0][1]
 elif t>=vs[-1][0]:v=vs[-1][1]
 else:
  for (a,p),(b,q) in zip(vs,vs[1:]):
   if a<=t<=b:v=p.lerp(q,(t-a)/(b-a));break
 return v+point(t,'quadril') if k=='punho_longe' else v

def direction(a,b):
 v=b-a
 return Vector((0,-v.x,-v.y)).normalized()
def aim(name,d):
 b=PB['mixamorig:'+name]; bpy.context.view_layer.update()
 h=W@b.head;tail=W@b.tail;cur=tail-h
 if cur.length<1e-7:return
 rot=cur.normalized().rotation_difference(d.normalized()).to_matrix().to_4x4()
 b.matrix=Wi@Matrix.Translation(h)@rot@Matrix.Translation(-h)@W@b.matrix
 bpy.context.view_layer.update()

def move_root(delta):
 b=PB['mixamorig:Hips'];m=b.matrix.copy();m.translation+=Wi.to_3x3()@delta;b.matrix=m;bpy.context.view_layer.update()

def leg(side,h,k,a,toe):
 # Two-segment planar fit: preserve observed knee angle with the rig's segment lengths.
 # End target equals sum of the two observed segment directions at model lengths.
 # Analytic IK is then the same bend branch; no scaling or bone translation.
 d1=direction(h,k);d2=direction(k,a)
 aim(side+'UpLeg',d1);aim(side+'Leg',d2)
 # Foot references use ankle→shoe tip. This is not the Foot bone vector (ankle→ball).
 # Match its sagittal inclination while retaining the rig's toe-out component.
 b=PB['mixamorig:'+side+'Foot'];v=direction(a,toe)
 lateral=(rest[b.name][1]-rest[b.name][0]).x
 length=(rest[b.name][1]-rest[b.name][0]).length
 aim(side+'Foot',Vector((lateral/length,v.y*0.96,v.z*0.96)).normalized())

# Ground contacts are detected from low ankles and foot speed; one contact per support phase.
# Root fitting uses a line for slight image height/perspective drift, not a new pose.
alltimes=json.loads((ROOT/'arte/entradas/referencias/catalogo-2026-10-18/P07/corrida-jogging/tempos-quadros.json').read_text())
TIMES=[r for r in alltimes if START-0.001<=r['tempo_original_s']<=END+0.001]
contact=None; locked=None; prevfoot={}; metrics=[]
for i,row in enumerate(TIMES):
 t=row['tempo_original_s'];f=1+(t-START)*30
 scene.frame_set(math.floor(f),subframe=f%1)
 for b in PB:b.matrix_basis.identity()
 bpy.context.view_layer.update()
 h=point(t,'quadril');s=point(t,'ombro');n=point(t,'pescoco');p=point(t,'topo')
 ztrend=Q[0]['pontos']['quadril'][1]+(Q[-1]['pontos']['quadril'][1]-Q[0]['pontos']['quadril'][1])*(t-START)/(END-START)
 move_root(Vector((0,-(h.x-Q[0]['pontos']['quadril'][0])/SCALE, (ztrend-h.y)/SCALE+0.06)))
 aim('Hips',direction(h,s))
 face=direction(point(t,'orelha'),point(t,'nariz'));faceR=Vector((0,-1,0)).rotation_difference(face);aim('Head',faceR@(rest['mixamorig:Head'][1]-rest['mixamorig:Head'][0]))
 for side,suff in [('Right','perto'),('Left','longe')]:
  leg(side,h,point(t,'joelho_'+suff),point(t,'tornozelo_'+suff),point(t,'ponta_'+suff))
 # Near arm entirely from visible shoulder, elbow, wrist.
 e=point(t,'cotovelo');w=point(t,'punho')
 aim('RightArm',direction(s,e));aim('RightForeArm',direction(e,w))
 # Far elbow is never supplied as an observation. Solve the rig from observed wrist
 # with the bend branch and elbow-plane from the nearest visible near-side elbow.
 fw=point(t,'punho_longe');shoulder=W@PB['mixamorig:LeftArm'].head
 l1=(rest['mixamorig:LeftArm'][1]-rest['mixamorig:LeftArm'][0]).length
 l2=(rest['mixamorig:LeftForeArm'][1]-rest['mixamorig:LeftForeArm'][0]).length
 target=Vector((shoulder.x,shoulder.y-(fw.x-s.x)/SCALE,shoulder.z-(fw.y-s.y)/SCALE))
 v=target-shoulder;dist=max(abs(l1-l2)+0.001,min(v.length,l1+l2-0.001));u=v.normalized()
 c=(l1*l1+dist*dist-l2*l2)/(2*dist);perp=Vector((0,-u.z,u.y))
 if perp.z>0:perp=-perp
 elbow=shoulder+u*c+perp*math.sqrt(max(0,l1*l1-c*c))
 aim('LeftArm',elbow-shoulder);aim('LeftForeArm',target-elbow)
 # Keep hands at the observed forearm direction; no invented finger animation.
 for side in ['Left','Right']:
  aim(side+'Hand',(W@PB['mixamorig:'+side+'ForeArm'].tail)-(W@PB['mixamorig:'+side+'ForeArm'].head))
 # Inspect actual skin, then remove floor penetration by a common root displacement.
 dg=bpy.context.evaluated_depsgraph_get();lowest=1e9
 for obj in meshes:
  ev=obj.evaluated_get(dg);me=ev.to_mesh();lowest=min(lowest,min((ev.matrix_world@v.co).z for v in me.vertices));ev.to_mesh_clear()
 # Fit skin sole to the measured shoe-ground gap, using the local upper envelope
 # of annotated toes (source camera has a slight elevated view).
 nearby=[max(point(tt,'ponta_perto').y,point(tt,'ponta_longe').y) for tt in [max(START,min(END,t+dt)) for dt in [-.18,-.12,-.06,0,.06,.12,.18]]]
 floor_px=max(nearby);sole_px=max(point(t,'ponta_perto').y,point(t,'ponta_longe').y)
 desired_gap=max(0,(floor_px-sole_px)/SCALE)
 move_root(Vector((0,0,desired_gap-lowest)))
 feet={side:W@PB['mixamorig:'+side+'Foot'].head for side in ['Left','Right']}
 low=min(feet,key=lambda side:feet[side].z)
 # Toe/heel anatomy differs from shoes; contact height tolerance is 9 cm.
 supported=feet[low].z<0.14
 if supported:
  if contact!=low:contact=low;locked=feet[low].copy()
  else:move_root(Vector((0,locked.y-feet[low].y,0)))
 else:contact=None;locked=None
 for b in PB:
  b.keyframe_insert(data_path='location',frame=f,group=b.name)
  b.keyframe_insert(data_path='rotation_quaternion',frame=f,group=b.name)
 metrics.append({'quadro':i+1,'pts_s':t,'contato':contact,'correcao_penetracao_m':max(0,-lowest),'ajuste_vertical_m':desired_gap-lowest,'altura_sola_m':desired_gap})
act=arm.animation_data.action;act.name='P07_corrida_rotoscopia_estudo'
cb=anim_utils.action_get_channelbag_for_slot(act,arm.animation_data.action_slot)
for fc in cb.fcurves:
 for k in fc.keyframe_points:k.interpolation='LINEAR'
# Export only the character and baked action.
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True)
for o in meshes:o.select_set(True)
bpy.context.view_layer.objects.active=arm
scene.frame_start=1;scene.frame_end=round(1+(END-START)*30)
bpy.ops.export_scene.gltf(filepath=str(OUT/'neto-corrida-p07.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True,export_image_format='JPEG')
(OUT/'ajustes.json').write_text(json.dumps({'inicio_original_s':START,'fim_original_s':END,'duracao_s':END-START,'quadros':len(TIMES),'poses_manuais':len(Q),'escala_px_m':SCALE,'quadros_ajustados':metrics},indent=2))
# Neutral studio, game model materials, finite source clip (not looped).
def mat(name,col):
 m=bpy.data.materials.new(name);m.diffuse_color=(*col,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*col,1);bs.inputs['Roughness'].default_value=.9
 return m
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='chao-estudo';floor.data.materials.append(mat('areia-estudo',(.16,.19,.19)))
for yi in range(-12,3):
 bpy.ops.mesh.primitive_cube_add(size=1,location=(0,yi,.001));o=bpy.context.object;o.scale=(2.4,.006,.001);o.data.materials.append(mat('linha'+str(yi),(.25,.29,.28)))
scene.world=bpy.data.worlds.new('estudio');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.28,.32,.35,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
for name,loc,power,size in [('principal',(-3,-3,5),650,5),('recorte',(2,1,4),400,4)]:
 l=bpy.data.objects.new(name,bpy.data.lights.new(name,'AREA'));scene.collection.objects.link(l);l.location=loc;l.data.energy=power;l.data.shape='DISK';l.data.size=size;l.rotation_euler=(Vector((0,0,.8))-l.location).to_track_quat('-Z','Y').to_euler()
cam=bpy.data.objects.new('camera',bpy.data.cameras.new('camera'));scene.collection.objects.link(cam);scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.1
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=16;scene.cycles.use_denoising=True;scene.render.threads_mode='FIXED';scene.render.threads=6;scene.render.resolution_x=600;scene.render.resolution_y=600;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.view_settings.view_transform='AgX'
scene.render.film_transparent=False
if hasattr(scene.eevee,'taa_render_samples'):scene.eevee.taa_render_samples=24
frames=range(len(TIMES)) if MODE=='render' else [0,16,32,48]
(OUT/'render').mkdir(exist_ok=True)
for i in frames:
 t=TIMES[i]['tempo_original_s'];f=1+(t-START)*30;scene.frame_set(math.floor(f),subframe=f%1);bpy.context.view_layer.update()
 center=W@PB['mixamorig:Hips'].head
 scene.objects['principal'].location.y=center.y-3;scene.objects['recorte'].location.y=center.y+1
 target=Vector((0,center.y,.80));cam.location=Vector((-5,center.y-.30,1.10));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler()
 scene.render.filepath=str(OUT/'render'/f'q{i+1:04d}.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'estudo.blend'))
print('P07_PRONTO',len(TIMES),END-START)
