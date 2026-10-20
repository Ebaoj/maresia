"""Postura estática aproximada das mãos: o registro mostra mãos compactas.
Dedos individuais não são legíveis. Esta etapa NÃO é rotoscopia de dedos.
"""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p07'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'estudo.blend'))
s=bpy.context.scene;a=next(o for o in s.objects if o.type=='ARMATURE');W=a.matrix_world;Wi=W.inverted();P=a.pose.bones
D=json.loads((OUT/'ajustes.json').read_text());times=D['quadros_ajustados'];preview=sys.argv[-1]=='prever'
for i,row in enumerate(times):
 f=1+(row['pts_s']-D['inicio_original_s'])*30;s.frame_set(math.floor(f),subframe=f%1);bpy.context.view_layer.update()
 for side in ['Right','Left']:
  hand=P['mixamorig:'+side+'Hand'];axis=(W@hand.tail-W@hand.head).normalized()
  # Palm normal in the original T pose: front of the body, -Y.
  restR=(W@hand.bone.matrix_local).to_3x3();localPalm=restR.inverted()@Vector((0,-1,0))
  n=(W@hand.matrix).to_3x3()@localPalm;n=(n-axis*n.dot(axis)).normalized()
  want=Vector((1,0,0)) if side=='Right' else Vector((-1,0,0));want=(want-axis*want.dot(axis)).normalized()
  roll=math.atan2(axis.dot(n.cross(want)),n.dot(want));h=W@hand.head
  hand.matrix=Wi@Matrix.Translation(h)@Matrix.Rotation(roll,4,axis)@Matrix.Translation(-h)@W@hand.matrix
  hand.keyframe_insert('rotation_quaternion',frame=f,group=hand.name)
  bpy.context.view_layer.update()
  for finger in ['Index','Middle','Ring','Pinky']:
   for segment,angle in [(1,35),(2,55),(3,40)]:
    b=P[f'mixamorig:{side}Hand{finger}{segment}'];r=(W@b.bone.matrix_local).to_3x3()
    length=(W.to_3x3()@(b.bone.tail_local-b.bone.head_local)).normalized()
    curl=length.cross(Vector((0,-1,0))).normalized();local=r.inverted()@curl
    b.rotation_mode='QUATERNION';b.rotation_quaternion=Quaternion(local,math.radians(angle));b.keyframe_insert('rotation_quaternion',frame=f,group=b.name)
 s.frame_set(math.floor(f),subframe=f%1);bpy.context.view_layer.update()
# Keep interpolation linear for all new keys.
from bpy_extras import anim_utils
cb=anim_utils.action_get_channelbag_for_slot(a.animation_data.action,a.animation_data.action_slot)
for fc in cb.fcurves:
 for k in fc.keyframe_points:k.interpolation='LINEAR'
bpy.ops.object.select_all(action='DESELECT');a.select_set(True)
for o in s.objects:
 if o.type=='MESH' and o.name.startswith('neto'):o.select_set(True)
bpy.context.view_layer.objects.active=a
bpy.ops.export_scene.gltf(filepath=str(OUT/'neto-corrida-p07.glb'),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIVE_ACTIONS',export_frame_range=True,export_image_format='JPEG')
for i in ([0] if preview else range(len(times))):
 row=times[i];f=1+(row['pts_s']-D['inicio_original_s'])*30;s.frame_set(math.floor(f),subframe=f%1);bpy.context.view_layer.update();hip=W@P['mixamorig:Hips'].head
 target=Vector((0,hip.y,.8));s.camera.location=Vector((-5,hip.y-.3,1.10));s.camera.rotation_euler=(target-s.camera.location).to_track_quat('-Z','Y').to_euler()
 s.objects['principal'].location.y=hip.y-3;s.objects['recorte'].location.y=hip.y+1
 s.render.filepath=str(OUT/'render'/f'q{i+1:04d}.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'estudo.blend'))
print('P07_MAOS_APROXIMADAS')
