"""Compara mudanças angulares de quadro entre os estudos P21 v2/v3, sem render."""
import bpy,json,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21-v3'
NAMES=['LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot','LeftArm','LeftForeArm','RightArm','RightForeArm']
def measure(path):
 bpy.ops.wm.open_mainfile(filepath=str(path));scene=bpy.context.scene;arm=next(o for o in scene.objects if o.type=='ARMATURE');prev={};result={n:(0,1) for n in NAMES}
 for frame in range(1,40):
  scene.frame_set(frame)
  for name in NAMES:
   q=arm.pose.bones['mixamorig:'+name].matrix.to_quaternion().normalized()
   if name in prev:
    angle=math.degrees(2*math.acos(min(1,abs(q.dot(prev[name])))))
    if angle>result[name][0]:result[name]=(angle,frame)
   prev[name]=q.copy()
 return result
old=measure(ROOT/'arte/finais/rotoscopia-p21/estudo-v2.blend');new=measure(OUT/'estudo-v3.blend')
result={name:{'v2_max_graus':old[name][0],'v2_quadro':old[name][1],'v3_max_graus':new[name][0],'v3_quadro':new[name][1]} for name in NAMES}
(OUT/'continuidade.json').write_text(json.dumps({'metodo':'Diferença angular menor entre quaternions mundiais consecutivos, sem emenda. Diagnóstico de continuidade, não prova de fidelidade à referência.','ossos':result},ensure_ascii=False,indent=2)+'\n')
print('CONTINUIDADE_P21',json.dumps(result))
