"""Medições do estudo visual; lê estudo.blend, sem novo render."""
import bpy,json,math
import numpy as np
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p07'
bpy.ops.wm.open_mainfile(filepath=str(OUT/'estudo.blend'))
s=bpy.context.scene;arm=next(o for o in s.objects if o.type=='ARMATURE');meshes=[o for o in s.objects if o.type=='MESH' and o.name.startswith('neto')]
rest={};edges={}
for o in meshes:
 c=np.empty(len(o.data.vertices)*3,dtype=np.float32);o.data.vertices.foreach_get('co',c);c=c.reshape(-1,3)
 e=np.array([list(e.vertices) for e in o.data.edges],dtype=int);edges[o.name]=e;rest[o.name]=np.linalg.norm(c[e[:,0]]-c[e[:,1]],axis=1)
report=[];proj=[];minz=1e9
adj=json.loads((OUT/'ajustes.json').read_text());times=adj['quadros_ajustados'];t0=adj['inicio_original_s']
for i,r in enumerate(times):
 f=1+(r['pts_s']-t0)*30;s.frame_set(math.floor(f),subframe=f%1);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();counts={};frame_min=1e9
 for o in meshes:
  ev=o.evaluated_get(dg);me=ev.to_mesh();co=np.empty(len(me.vertices)*3,dtype=np.float32);me.vertices.foreach_get('co',co);co=co.reshape(-1,3)
  ed=edges[o.name];rat=np.linalg.norm(co[ed[:,0]]-co[ed[:,1]],axis=1)/np.maximum(rest[o.name],1e-6)
  counts[o.name]={'arestas':len(ed),'fora_05_16':int(np.sum((rat<.5)|(rat>1.6)))}
  M=np.array(ev.matrix_world);wc=co@M[:3,:3].T+M[:3,3];frame_min=min(frame_min,float(wc[:,2].min()));ev.to_mesh_clear()
 hip=arm.matrix_world@arm.pose.bones['mixamorig:Hips'].head
 target=Vector((0,hip.y,.80));s.camera.location=Vector((-5,hip.y-.30,1.10));s.camera.rotation_euler=(target-s.camera.location).to_track_quat('-Z','Y').to_euler();bpy.context.view_layer.update()
 p=world_to_camera_view(s,s.camera,hip)
 proj.append({'quadro':i+1,'pts_s':r['pts_s'],'quadril_render_px':[p.x*600,(1-p.y)*600]})
 report.append({'quadro':i+1,'min_z_m':frame_min,'malhas':counts,'total_arestas_fora':sum(x['fora_05_16'] for x in counts.values())});minz=min(minz,frame_min)
worst=max(report,key=lambda x:x['total_arestas_fora'])
(OUT/'medidas.json').write_text(json.dumps({'quadros':len(times),'duracao_s':adj['duracao_s'],'min_z_m':minz,'penetracao_maxima_m':max(0,-minz),'total_arestas':sum(len(e) for e in edges.values()),'pior':worst,'nota':'Contagem de deformação é diagnóstico, sem limiar humano aprovado; a referência de 420 arestas do gato não se aplica. Cotovelo distante resolvido por IK, não medido no vídeo. Dedos em postura estática aproximada; dedos e profundidade não rotoscopados.','quadros_medidos':report},ensure_ascii=False,indent=2))
(OUT/'projecoes.json').write_text(json.dumps(proj,indent=2))
print('P07_MEDIDAS',len(times),'minZ',minz,'pior',worst)
