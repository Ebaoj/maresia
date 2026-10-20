"""Malhas costuradas v6: gola anatômica, transições suaves e folga estável na cintura; topologia regular, sem reconstrução volumétrica de roupa gerada."""
import bpy,bmesh,math,os,json,sys,numpy as np
from mathutils import Vector
from mathutils.kdtree import KDTree
S=bpy.context.scene;rig=next(o for o in S.objects if o.type=='ARMATURE')
ROOT=os.environ.get('MARESIA_RAIZ','/Users/joabecornelio/Projetos/maresia')
if '--' not in sys.argv:raise RuntimeError('Uso: Blender -b MODELO.blend --python roupas_costuradas_v5.py -- PREFIXO_SAIDA')
PREFIXO=os.path.abspath(sys.argv[sys.argv.index('--')+1]);os.makedirs(os.path.dirname(PREFIXO),exist_ok=True)
B=lambda n:rig.matrix_world@rig.data.bones['mixamorig:'+n].head_local
cx=B('Hips').x;cy=.009
# Original full body supplies weights even where the dressed game's body was masked.
with bpy.data.libraries.load(ROOT+'/arte/saida/3d/neto-v5/neto-v5-rascunho.blend',link=False) as (a,b):b.objects=['neto']
donor=b.objects[0];S.collection.objects.link(donor);donor.hide_render=True
KD=KDTree(len(donor.data.vertices));donornames={g.index:g.name for g in donor.vertex_groups}
for i,v in enumerate(donor.data.vertices):KD.insert(donor.matrix_world@v.co,i)
KD.balance()
for name in ('neto-camisa','neto-calca'):
 o=bpy.data.objects.get(name)
 if o:bpy.data.objects.remove(o,do_unlink=True)

def material(name,path):
 m=bpy.data.materials.new(name);m.use_nodes=True;nt=m.node_tree;bs=nt.nodes.get('Principled BSDF');im=bpy.data.images.load(path,check_existing=True)
 if im.size[0]>2048:im.scale(2048,2048)
 im.pack();tex=nt.nodes.new('ShaderNodeTexImage');tex.image=im;nt.links.new(tex.outputs['Color'],bs.inputs['Base Color']);bs.inputs['Roughness'].default_value=.92;bs.inputs['Specular IOR Level'].default_value=.12
 return m
SH=[material('camisa-'+s,ROOT+'/arte/entradas/3d/neto-v5-camisa2/camisa-'+s+'.png') for s in ('frente','costas')]
PA=[material('calca-'+s,ROOT+'/arte/entradas/3d/neto-v4/v2/calca-'+s+'.png') for s in ('frente','costas')]

def mesh(name,verts,faces,mats):
 me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update();o=bpy.data.objects.new(name,me);S.collection.objects.link(o)
 for m in mats:me.materials.append(m)
 bm=bmesh.new();bm.from_mesh(me);bmesh.ops.remove_doubles(bm,verts=list(bm.verts),dist=1e-6);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(me);bm.free();me.update();return o

def boundaries(ob):
 bm=bmesh.new();bm.from_mesh(ob.data);bm.verts.ensure_lookup_table();edges={e for e in bm.edges if e.is_boundary};loops=[]
 while edges:
  e=edges.pop();start=e.verts[0];v=e.verts[1];loop=[start.index,v.index]
  while v!=start:
   candidates=[q for q in v.link_edges if q in edges]
   if not candidates:break
   q=candidates[0];edges.remove(q);v=q.other_vert(v)
   if v!=start:loop.append(v.index)
  loops.append(loop)
 bm.free();return loops

# ----- shirt: torso, neckline, two real armholes, sleeves lofted from the armhole edge -----
N=32;vs=[];fs=[]
rings=[(.80,.169,.125),(.815,.170,.125),(.84,.168,.122),(.92,.156,.114),(.98,.150,.106),(1.035,.147,.099),(1.08,.146,.096),(1.135,.15,.090),(1.19,.15,.083),(1.225,.151,.076),(1.218,.061,.062),(1.2185,.053,.057),(1.217,.0515,.0555)]
neck_start=len(rings)-3
for r,(z,rx,ry) in enumerate(rings):
 for j in range(N):
  a=2*math.pi*j/N;zz=z
  if r==neck_start-1:zz=z-.022*max(0,-math.sin(a))**2-.006*max(0,math.sin(a))**2
  if r>=neck_start:zz=z-.026*max(0,-math.sin(a))**2
  fold=1+(.012*math.sin(5*a+z*18)+.006*math.sin(11*a-z*15))*(1 if r<neck_start-1 else .2)
  center_y=.027 if r==neck_start else (.030 if r>neck_start else cy)
  vs.append((cx+rx*math.cos(a)*fold,center_y+ry*math.sin(a)*fold,zz))
for r in range(len(rings)-1):
 for j in range(N):
  # Open an actual armhole on either side of the upper torso.
  in_side=(j>=28 or j<4) or 12<=j<20
  if rings[r][0]>=1.079 and r<neck_start-1 and in_side:continue
  fs.append((r*N+j,r*N+(j+1)%N,(r+1)*N+(j+1)%N,(r+1)*N+j))
shirt=mesh('neto-camisa',vs,fs,SH);loops=boundaries(shirt);vs=[v.co[:] for v in shirt.data.vertices];fs=[tuple(p.vertices) for p in shirt.data.polygons]
for loop in loops:
 P=np.array([vs[i] for i in loop]);center=P.mean(0)
 if abs(center[0]-cx)<.075 or center[2]<1.10:continue
 side=1 if center[0]>cx else -1;prev=loop
 # Angle of each sewn vertex around the arm axis; no disconnected caps or inner fabric.
 span=np.maximum(np.ptp(P,axis=0)*.5,1e-4)
 phis=[math.atan2((vs[i][2]-center[2])/span[2],(vs[i][1]-center[1])/span[1]) for i in loop]
 arm=B('LeftArm' if side>0 else 'RightArm')
 specs=[(.18,.066,.062),(.22,.062,.057),(.28,.060,.054),(.335,.057,.052),(.348,.059,.054),(.353,.059,.054)]
 for ax,ry,rz in specs:
  cur=[]
  for k,phi in enumerate(phis):
   ruffle=1+.018*math.sin(5*phi+ax*28)
   cur.append(len(vs));vs.append((cx+side*ax,arm.y+ry*math.cos(phi)*ruffle,arm.z+rz*math.sin(phi)*ruffle))
  for k in range(len(loop)):fs.append((prev[k],prev[(k+1)%len(loop)],cur[(k+1)%len(loop)],cur[k]))
  prev=cur
bpy.data.objects.remove(shirt,do_unlink=True);shirt=mesh('neto-camisa',vs,fs,SH)

# ----- trousers: two leg tubes sewn together at a shared crotch seam; single upper waistband -----
N=32;vs=[];fs=[];tops={};legpositions=[]
levels=[(.218,.058,.061),(.224,.065,.067),(.241,.066,.068),(.257,.065,.067),(.268,.058,.060),(.32,.063,.066),(.40,.067,.073),(.465,.069,.073),(.53,.073,.080),(.61,.078,.087),(.665,.080,.09)]
for side in (1,-1):
 prev=None
 for z,rx,ry in levels:
  cur=[];xc=cx+side*(.078+.006*max(0,min(1,(z-.45)/.20)));yc=.015-.012*max(0,min(1,(z-.32)/.30))
  for j in range(N):
   a=2*math.pi*j/N;fold=1+.025*math.sin(5*a+z*20)+.010*math.sin(9*a-z*22)
   cur.append(len(vs));vs.append((xc+rx*math.cos(a)*fold,yc+ry*math.sin(a)*fold,z+.0015*math.sin(4*a+z*15)))
  if prev:
   for j in range(N):fs.append((prev[j],prev[(j+1)%N],cur[(j+1)%N],cur[j]))
  prev=cur
 # Half the upper leg ring becomes the common center seam; the other half meets the waist tube.
 cur=[]
 for j in range(N):
  a=2*math.pi*j/N;outer=side*math.cos(a)>=-1e-8
  x=cx+.158*math.cos(a) if outer else cx
  z=.755 if outer else .685+.070*math.sin(a)**2
  cur.append(len(vs));vs.append((x,cy+.099*math.sin(a),z))
 for j in range(N):fs.append((prev[j],prev[(j+1)%N],cur[(j+1)%N],cur[j]))
 tops[side]=cur
prev=[tops[1 if math.cos(2*math.pi*j/N)>=-1e-8 else -1][j] for j in range(N)]
for z,rx,ry in ((.785,.153,.103),(.835,.141,.105),(.87,.132,.098),(.884,.133,.099),(.890,.132,.098)):
 cur=[]
 for j in range(N):
  a=2*math.pi*j/N;fold=1+.009*math.sin(10*a)
  cur.append(len(vs));vs.append((cx+rx*math.cos(a)*fold,cy+ry*math.sin(a)*fold,z))
 for j in range(N):fs.append((prev[j],prev[(j+1)%N],cur[(j+1)%N],cur[j]))
 prev=cur
pants=mesh('neto-calca',vs,fs,PA)

def uv_and_subdivide(o,typ):
 # Assign front/back paintings before smoothing; the two sides meet at the side seams.
 uv=o.data.uv_layers.new(name='UVMap')
 for p in o.data.polygons:
  p.material_index=0 if p.center.y<cy else 1
  for li in p.loop_indices:
   q=o.data.vertices[o.data.loops[li].vertex_index].co;x=q.x-cx;z=q.z
   if typ=='shirt':
    t=max(0,min(1,(abs(x)-.15)/.06));t=t*t*(3-2*t)
    ub=.5+x/.18*.15;us=.5+(1 if x>=0 else -1)*(.19+(abs(x)-.18)/.173*.22)
    vb=.054+(z-.80)/.435*.858;vsl=.72+(z-B('LeftArm').z)*1.65
    u=ub*(1-t)+us*t;v=vb*(1-t)+vsl*t
   else:
    v=.16+(z-.218)/(.890-.218)*.745
    if z<.755:
     positive=x>=0;sg=1 if positive else -1
     lc=float(np.interp(z,[.218,.40,.53,.665,.755],[.24,.28,.32,.365,.40]));lc=1-lc if positive else lc
     half=float(np.interp(z,[.218,.40,.53,.665,.755],[.12,.13,.13,.115,.10]))
     xc=sg*(.078+.006*max(0,min(1,(z-.45)/.20)))
     rr=float(np.interp(z,[.218,.40,.53,.665,.755],[.066,.067,.073,.080,.084]))
     u=lc+max(-1,min(1,(x-xc)/rr))*half
    else:u=.5+x/.158*.18
   if p.material_index:u=1-u
   uv.data[li].uv=(max(.005,min(.995,u)),max(.005,min(.995,v)))
 for q in S.objects:q.select_set(q==o)
 bpy.context.view_layer.objects.active=o
 sub=o.modifiers.new('Tecido contínuo','SUBSURF');sub.levels=2;sub.render_levels=2
 bpy.ops.object.modifier_apply(modifier=sub.name)
 # Clean thin fabric; only a sewn cuff/neck/hem boundary is solidified.
 so=o.modifiers.new('Espessura do tecido','SOLIDIFY');so.thickness=.0012;so.offset=-1;so.use_even_offset=False
 bpy.ops.object.modifier_apply(modifier=so.name)
 for p in o.data.polygons:p.use_smooth=True

uv_and_subdivide(shirt,'shirt');uv_and_subdivide(pants,'pants')

def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
for o in (shirt,pants):
 groups={};o.vertex_groups.clear()
 def setweights(i,w):
  w=sorted([(k,v) for k,v in w.items() if v>1e-5],key=lambda q:-q[1])[:4];total=sum(v for _,v in w)
  for n,val in w:
   if n not in groups:groups[n]=o.vertex_groups.new(name='mixamorig:'+n)
   groups[n].add([i],val/total,'REPLACE')
 for v in o.data.vertices:
  q=v.co;w={}
  if o==shirt:
   for _,ix,d in KD.find_n(q,12):
    fact=1/max(d,.004)**2
    for g in donor.data.vertices[ix].groups:
     n=donornames[g.group].replace('mixamorig:','')
     if n in ('Head','Neck'):n='Spine2'
     w[n]=w.get(n,0)+g.weight*fact
  else:
   z=q.z;hips=smooth((z-.68)/.12);upper=smooth((z-(B('LeftLeg').z-.065))/.13)
   left=smooth((q.x-cx+.035)/.07)
   w={'Hips':hips}
   for side,f in (('Left',left),('Right',1-left)):
    w[side+'UpLeg']=(1-hips)*upper*f;w[side+'Leg']=(1-hips)*(1-upper)*f
  setweights(v.index,w)
 o.parent=rig;o.matrix_parent_inverse=rig.matrix_world.inverted();arm=o.modifiers.new('Armature','ARMATURE');arm.object=rig

# Continuous shoulder/neck weights: adjacent cloth vertices share a gradual blend of bones.
# The hem and the waistband both follow Hips. Leg influences on a loose shirt pulled its hem through the trousers.
def soften_shirt(ob):
    names={g.index:g.name.replace('mixamorig:','') for g in ob.vertex_groups}
    weights=[{names[g.group]:g.weight for g in v.groups} for v in ob.data.vertices]
    adjacent=[[] for _ in ob.data.vertices]
    for e in ob.data.edges:
        a,b=e.vertices;adjacent[a].append(b);adjacent[b].append(a)
    for _ in range(8):
        nxt=[]
        for i,w in enumerate(weights):
            if not adjacent[i]:nxt.append(w.copy());continue
            d={n:x*.55 for n,x in w.items()}
            for j in adjacent[i]:
                for n,x in weights[j].items():d[n]=d.get(n,0)+.45*x/len(adjacent[i])
            nxt.append(d)
        weights=nxt
    for v,w in zip(ob.data.vertices,weights):
        fixed={}
        for n,x in w.items():
            if any(k in n for k in ('UpLeg','Leg','Foot','Toe')):n='Hips'
            if n in ('Head','Neck'):n='Spine2'
            fixed[n]=fixed.get(n,0)+x
        q=v.co
        hem=smooth((.980-q.z)/.075)
        fixed={n:x*(1-hem) for n,x in fixed.items()};fixed['Hips']=fixed.get('Hips',0)+hem
        radial=math.hypot((q.x-cx)/.085,(q.y-.030)/.078)
        collar=.12*smooth((q.z-1.16)/.035)*(1-smooth((radial-.8)/.5))
        fixed={n:x*(1-collar) for n,x in fixed.items()};fixed['Neck']=collar
        weights[v.index]=fixed
    saved=[sorted(w.items(),key=lambda q:-q[1])[:4] for w in weights]
    ob.vertex_groups.clear();groups={}
    for i,w in enumerate(saved):
        total=sum(x for _,x in w)
        for n,x in w:
            if x<1e-6:continue
            if n not in groups:groups[n]=ob.vertex_groups.new(name='mixamorig:'+n)
            groups[n].add([i],x/total,'REPLACE')
soften_shirt(shirt)

bpy.data.objects.remove(donor,do_unlink=True)
for o in (shirt,pants):
 bm=bmesh.new();bm.from_mesh(o.data);print('TOPOLOGIA',o.name,'v',len(bm.verts),'faces',len(bm.faces),'abertas',sum(e.is_boundary for e in bm.edges),'nao_manifold',sum(not e.is_manifold for e in bm.edges),flush=True);bm.free()

# Texturas de tecido contínuo
S=bpy.context.scene;rig=next(o for o in S.objects if o.type=='ARMATURE');cx=(rig.matrix_world@rig.data.bones['mixamorig:Hips'].head_local).x
arm=rig.matrix_world@rig.data.bones['mixamorig:LeftArm'].head_local
for name in ('neto-camisa','neto-calca'):
 o=bpy.data.objects[name];uv=o.data.uv_layers.active
 for p in o.data.polygons:
  p.material_index=0 if p.center.y<.009 else 1
  for li in p.loop_indices:
   q=o.data.vertices[o.data.loops[li].vertex_index].co;x=q.x-cx;z=q.z
   if name=='neto-camisa':
    t=max(0,min(1,(abs(x)-.15)/.06));t=t*t*(3-2*t)
    ub=.40+.20*max(0,min(1,(x+.18)/.36));vb=.20+(z-.80)/.435*.53
    phi=math.atan2(z-arm.z,q.y-arm.y);us=.40+.20*(math.sin(phi)*.5+.5);vs=.25+max(0,min(1,(abs(x)-.15)/.203))*.45
    u=ub*(1-t)+us*t;v=vb*(1-t)+vs*t
   else:
    a=math.atan2(q.y-.009,abs(x)-.08);u=.27+.14*(a+math.pi)/(2*math.pi);v=.42+(z-.218)/.672*.20
   uv.data[li].uv=(u,v)
# Retain the tint baked into the body; enforce the same four influences in Blender and glTF after all modifiers.
for o in S.objects:
 if o.type!='MESH' or o.parent!=rig:continue
 for v in o.data.vertices:
  w=sorted([(g.group,g.weight) for g in v.groups if g.weight>1e-7],key=lambda q:-q[1])[:4];total=sum(wi for _,wi in w)
  for gi in [g.group for g in v.groups]:o.vertex_groups[gi].remove([v.index])
  for gi,wi in w:o.vertex_groups[gi].add([v.index],wi/total,'REPLACE')
bpy.data.orphans_purge(do_recursive=True)
for im in bpy.data.images:
 if im.size[0]>2048:im.scale(2048,2048)
 if im.size[0]>0:im.pack()

# O corpo coberto não atravessa a roupa
S=bpy.context.scene;rig=next(o for o in S.objects if o.type=='ARMATURE');body=next(o for o in S.objects if o.type=='MESH' and o.parent==rig and 'camisa' not in o.name and 'calca' not in o.name)
names={g.index:g.name.replace('mixamorig:','') for g in body.vertex_groups};covered={'Hips','Spine','Spine1','Spine2','LeftUpLeg','RightUpLeg','LeftLeg','RightLeg','LeftFoot','RightFoot'}
vids=set()
for v in body.data.vertices:
 p=body.matrix_world@v.co;inside=sum(g.weight for g in v.groups if names[g.group] in covered)
 if inside>.65 and ((.23<p.z<.89 and abs(p.x)<.19) or (.80<p.z<1.18 and abs(p.x)<.15)):vids.add(v.index)
bm=bmesh.new();bm.from_mesh(body.data);bm.verts.ensure_lookup_table();kill=[f for f in bm.faces if all(v.index in vids for v in f.verts)];bmesh.ops.delete(bm,geom=kill,context='FACES');bm.to_mesh(body.data);bm.free();print('MASCARA INTERIOR',len(kill),flush=True)

# Remover tecido da regata original que aparece junto à gola
S=bpy.context.scene;rig=next(o for o in S.objects if o.type=='ARMATURE');body=next(o for o in S.objects if o.type=='MESH' and o.parent==rig and 'camisa' not in o.name and 'calca' not in o.name)
images={}
for mi,m in enumerate(body.data.materials):
 bs=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED');im=bs.inputs['Base Color'].links[0].from_node.image
 a=np.empty(len(im.pixels),dtype=np.float32);im.pixels.foreach_get(a);images[mi]=(a.reshape(im.size[1],im.size[0],4),im.size[:])
uv=body.data.uv_layers.active.data;remove=[];sample=[]
for p in body.data.polygons:
 q=body.matrix_world@p.center
 if not (1.14<q.z<1.26 and abs(q.x)<.22):continue
 a,size=images[p.material_index];u,v=np.mean([uv[i].uv[:] for i in p.loop_indices],axis=0);r,g,b,_=a[int((v%1)*(size[1]-1)),int((u%1)*(size[0]-1))]
 # The original torso/bust carries a beige tank top. Remove its actual cloth triangles, preserving brown neck skin.
 if g>.27 and b>.15 and r/(g+1e-6)<1.65:remove.append(p.index);sample.append([q.x,q.y,q.z,float(r),float(g),float(b)])
bm=bmesh.new();bm.from_mesh(body.data);bm.faces.ensure_lookup_table();bmesh.ops.delete(bm,geom=[bm.faces[i] for i in remove],context='FACES');bm.to_mesh(body.data);bm.free()
print('REGATA ANTIGA REMOVIDA',len(remove),'faces',flush=True)

# Restos do ombro ficam inteiramente sob a camisa
S=bpy.context.scene;rig=next(o for o in S.objects if o.type=='ARMATURE');body=next(o for o in S.objects if o.type=='MESH' and o.parent==rig and 'camisa' not in o.name and 'calca' not in o.name);cx=(rig.matrix_world@rig.data.bones['mixamorig:Hips'].head_local).x
bm=bmesh.new();bm.from_mesh(body.data);kill=[]
for f in bm.faces:
 q=body.matrix_world@f.calc_center_median()
 if 1.165<q.z<1.255 and .056<abs(q.x-cx)<.22:kill.append(f)
bmesh.ops.delete(bm,geom=kill,context='FACES');bm.to_mesh(body.data);bm.free();print('INTERIOR OMBROS',len(kill),flush=True)

for o in S.objects:o.select_set(o==rig or (o.type=='MESH' and o.parent==rig and not o.hide_render))
bpy.context.view_layer.objects.active=rig
bpy.ops.wm.save_as_mainfile(filepath=PREFIXO+'.blend',compress=True)
bpy.ops.export_scene.gltf(filepath=PREFIXO+'.glb',export_format='GLB',use_selection=True,export_animations=False,export_image_format='JPEG',export_jpeg_quality=90,export_all_influences=False)
print('ROUPAS COSTURADAS EXPORTADAS',PREFIXO,flush=True)
