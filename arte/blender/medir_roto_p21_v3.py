"""Medições do estudo visual; lê estudo-v3.blend, sem novo render."""
import bpy,json,math
import numpy as np
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21-v3'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'estudo-v3.blend'))
s=bpy.context.scene;arm=next(o for o in s.objects if o.type=='ARMATURE');meshes=[o for o in s.objects if o.type=='MESH' and o.name.startswith('neto')]
rest={};edges={}
for o in meshes:
 c=np.empty(len(o.data.vertices)*3,dtype=np.float32);o.data.vertices.foreach_get('co',c);c=c.reshape(-1,3)
 e=np.array([list(e.vertices) for e in o.data.edges],dtype=int);edges[o.name]=e;rest[o.name]=np.linalg.norm(c[e[:,0]]-c[e[:,1]],axis=1)
report=[];proj=[];minz=1e9
boat=bpy.data.objects['barco-contato'];hull=bpy.data.objects['casco']
depth=-min(v.co.z for v in hull.data.vertices)
levels=np.array([[-3.6,.55],[-2,.68],[-.6,.55],[0,.27]])
adj=json.loads((OUT/'ajustes.json').read_text());times=adj['quadros'];t0=adj['inicio_original_s']
for i,r in enumerate(times):
 f=i+1;s.frame_set(math.floor(f),subframe=f%1);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();counts={};frame_min=1e9;inside_total=0;boat_depth=0
 for o in meshes:
  ev=o.evaluated_get(dg);me=ev.to_mesh();co=np.empty(len(me.vertices)*3,dtype=np.float32);me.vertices.foreach_get('co',co);co=co.reshape(-1,3)
  ed=edges[o.name];rat=np.linalg.norm(co[ed[:,0]]-co[ed[:,1]],axis=1)/np.maximum(rest[o.name],1e-6)
  counts[o.name]={'arestas':len(ed),'fora_05_16':int(np.sum((rat<.5)|(rat>1.6)))}
  M=np.array(ev.matrix_world);wc=co@M[:3,:3].T+M[:3,3];frame_min=min(frame_min,float(wc[:,2].min()));ev.to_mesh_clear()
  inv=np.array(boat.matrix_world.inverted());local=wc@inv[:3,:3].T+inv[:3,3]
  t=-local[:,2]/depth;yy=local[:,1]+.2*t;ww=np.interp(yy,levels[:,0],levels[:,1])*(1-.3*t)
  distances=np.stack([ww-np.abs(local[:,0]),yy+3.6,-yy,-local[:,2],local[:,2]+depth],axis=1)
  interior=distances.min(axis=1);inside=interior>.01
  inside_total+=int(inside.sum());boat_depth=max(boat_depth,float(interior[inside].max()) if inside.any() else 0)
 hip=arm.matrix_world@arm.pose.bones['mixamorig:Hips'].head
 p=world_to_camera_view(s,s.camera,hip-Vector((0,0,r['pelve_modelo_offset_ref_calca_m'])))
 proj.append({'juntas_render_px':{name:[(v:=world_to_camera_view(s,s.camera,arm.matrix_world@arm.pose.bones['mixamorig:'+name].head)).x*900,(1-v.y)*700] for name in ['LeftArm','LeftForeArm','LeftHand','Head','Neck']},'quadro':i+1,'pts_s':r['pts_s'],'referencia_calca_render_px':[p.x*900,(1-p.y)*700]})
 report.append({'quadro':i+1,'min_z_m':frame_min,'vertices_interior_volume_casco_mais_1cm':inside_total,'profundidade_volume_casco_m':boat_depth,'malhas':counts,'total_arestas_fora':sum(x['fora_05_16'] for x in counts.values())});minz=min(minz,frame_min)
worst=max(report,key=lambda x:x['total_arestas_fora'])
(OUT/'medidas.json').write_text(json.dumps({'quadros':len(times),'duracao_s':times[-1]['pts_s']-t0,'min_z_m':minz,'penetracao_maxima_m':max(0,-minz),'total_arestas':sum(len(e) for e in edges.values()),'pior':worst,'nota':'Contagem de deformação é diagnóstico, sem limiar humano aprovado; a referência de 420 arestas do gato não se aplica. Braço distante resolvido por IK na pega, não medido no vídeo. Contactos e alcance em ajustes.json. Dedos em postura estática aproximada; dedos e profundidade não rotoscopados.','quadros_medidos':report},ensure_ascii=False,indent=2))
(OUT/'projecoes.json').write_text(json.dumps(proj,indent=2))
print('P21_MEDIDAS',len(times),'minZ',minz,'pior',worst)
