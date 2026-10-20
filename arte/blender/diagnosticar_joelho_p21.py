"""Exporta poses e mede a flexão do joelho direito nas revisões 3/4, sem render."""
import bpy,json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21-v4'
report={}
for rev in [3,4]:
 folder=ROOT/f'arte/finais/rotoscopia-p21-v{rev}';bpy.ops.wm.open_mainfile(filepath=str(folder/f'estudo-v{rev}.blend'))
 scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');poses=[];rows=[]
 for frame in range(1,40):
  scene.frame_set(frame);row={}
  for bone in arm.pose.bones:
   row[bone.name.split(':')[-1]]={'head':list(arm.matrix_world@bone.head),'tail':list(arm.matrix_world@bone.tail),'rot':list(bone.matrix.to_quaternion())}
  h=Vector(row['RightUpLeg']['head']);k=Vector(row['RightLeg']['head']);ankle=Vector(row['RightFoot']['head']);axis=(ankle-h).normalized();center=h+axis*(k-h).dot(axis);pole=Vector((0,-1,0));pole-=axis*pole.dot(axis);pole.normalize()
  rows.append({'quadro':frame,'frente_m':(k-center).dot(pole),'desvio_lateral_m':k.x-center.x});poses.append(row)
 (OUT/f'poses-v{rev}.json').write_text(json.dumps(poses)+'\n')
 report[f'v{rev}']={'quadros_flexao_invertida':sum(r['frente_m']<0 for r in rows),'max_desvio_lateral_m':max(abs(r['desvio_lateral_m']) for r in rows),'quadros':rows}
(OUT/'joelho-diagnostico.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('JOELHO_P21',[(key,value['quadros_flexao_invertida'],value['max_desvio_lateral_m']) for key,value in report.items()])
