import bpy,sys,os,json,numpy as np
from mathutils.bvhtree import BVHTree
from mathutils import Vector
sys.path.insert(0,'/Users/joabecornelio/Projetos/maresia/arte/blender')
from retarget_mixamo import preparar
S=bpy.context.scene;rig=next(o for o in S.objects if o.type=='ARMATURE');shirt=bpy.data.objects['neto-camisa'];pants=bpy.data.objects['neto-calca']
cx=(rig.matrix_world@rig.data.bones['mixamorig:Hips'].head_local).x
shirt.data.calc_loop_triangles();tri=[]
for t in shirt.data.loop_triangles:
 p=shirt.data.polygons[t.polygon_index];q=p.center
 if q.z<1.035 and p.normal.x*(q.x-cx)+p.normal.y*(q.y-.009)>0:tri.append(tuple(t.vertices))
ids=[v.index for v in pants.data.vertices if .805<v.co.z<.891]
report={'criterio':'Calça dentro da superfície externa da camisa na faixa de cintura; sinal positivo = atravessamento em mm','vertices_calca':len(ids),'animacoes':{}}
for motion in ('andar','correr','olhando'):
 ap,f0,f1=preparar(S,rig,'/Users/joabecornelio/Projetos/maresia/public/animacoes/mixamo/'+motion+'.fbx');worst=-1e9;badframes=[];worstframe=None;minimum=1e9
 for f in range(f0,f1+1):
  ap(f);dg=bpy.context.evaluated_depsgraph_get();se=shirt.evaluated_get(dg);pe=pants.evaluated_get(dg);sm=se.to_mesh();pm=pe.to_mesh()
  points=[se.matrix_world@v.co for v in sm.vertices];bvh=BVHTree.FromPolygons(points,tri,all_triangles=True);hi=-1e9;outside=0
  for i in ids:
   p=pe.matrix_world@pm.vertices[i].co;near,normal,ix,dist=bvh.find_nearest(p)
   signed=(p-near).dot(normal);hi=max(hi,signed)
   if signed>.0005:outside+=1
  if hi>worst:worst=hi;worstframe=f
  if outside:badframes.append({'quadro':f,'vertices_fora':outside,'max_mm':round(hi*1000,3)})
  se.to_mesh_clear();pe.to_mesh_clear()
 report['animacoes'][motion]={'quadros':f1-f0+1,'maior_sinal_mm':round(worst*1000,3),'pior_quadro':worstframe,'quadros_com_atravessamento':badframes}
 print(motion,'max mm',worst*1000,'quadros com passagem',len(badframes),flush=True)
out=sys.argv[sys.argv.index('--')+1];open(out,'w').write(json.dumps(report,indent=2));print('MEDICAO',out,flush=True)

assert not any(v["quadros_com_atravessamento"] for v in report["animacoes"].values()), "A calça atravessa a camisa"
assert all(v["maior_sinal_mm"] <= -3 for v in report["animacoes"].values()), "Folga na cintura abaixo de 3 mm"
