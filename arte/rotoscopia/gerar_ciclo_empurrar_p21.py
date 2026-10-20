"""Ciclo completo de empurrar (2 passos, 48 quadros), SINTÉTICO e PROVISÓRIO. Exceção à regra da rotoscopia:
só vale até haver vídeo real de um empurrar contínuo. Leia arte/finais/ciclo-empurrar-p21-sintetico/README.md.
Gera marcas 2D no mesmo formato do marcas.json do P21 (rev.2); os números vêm do trecho P21 (proporções do
corpo, passo, tempo de pé no ar e no chão). Uso: python3 arte/rotoscopia/gerar_ciclo_empurrar_p21.py"""
import json,math
from pathlib import Path
OUT=Path(__file__).resolve().parents[2]/'arte/finais/ciclo-empurrar-p21-sintetico';OUT.mkdir(parents=True,exist_ok=True)
N=48;V=2.0;GROUND=578.0;H0X=973.0
REL=dict(topo=(-84.6,-132.9),borda_cabeca=(-62.3,-116.1),ombro=(-47.3,-111.8),cotovelo=(-67.6,-92.1),punho=(-101.8,-113.2),mao=(-111.5,-128.0))
L1,L2=55.0,57.7
ANK=(21.0,-18.0)          # tornozelo - ponta, pé plano
LAND=-20.0;LIFT=36.0      # ponta - quadril (px) na aterrissagem / saída
SWING=20;ARC=14.0;HEEL=14.0
def mj(u):u=max(0.,min(1.,u));return u**3*(10-15*u+6*u*u)
def hip(t):return H0X-V*t,456.0-3.0*math.cos(2*math.pi*(t-10)/24)
def foot(t,s0):
    k=math.floor((t-s0)/N);t0=s0+N*k;tau=t-t0
    xl=hip(t0)[0]+LIFT;xd=hip(t0+SWING)[0]+LAND
    if tau<SWING:
        u=tau/SWING;x=xl+(xd-xl)*mj(u);arc=ARC*math.sin(math.pi*u)
    else:x=xd;arc=0.0
    if tau>=40:heel=HEEL*mj((tau-40)/8)
    elif tau<10:heel=HEEL*(1-mj(tau/10))
    else:heel=0.0
    return (x,GROUND-arc),(x+ANK[0],GROUND-arc+ANK[1]-heel)
def knee(h,a):
    dx,dy=a[0]-h[0],a[1]-h[1];d=math.hypot(dx,dy);d=min(d,L1+L2-1e-3)
    ux,uy=dx/math.hypot(dx,dy),dy/math.hypot(dx,dy)
    along=(L1*L1-L2*L2+d*d)/(2*d);hh=math.sqrt(max(0,L1*L1-along*along))
    px,py=-uy,ux
    if px>0:px,py=-px,-py          # dobra para a frente (esquerda na imagem)
    return h[0]+ux*along+px*hh,h[1]+uy*along+py*hh
quadros=[]
for t in range(N):
    h=hip(t);p={'referencia_calca':[round(h[0],3),round(h[1],3)]}
    for k,(dx,dy) in REL.items():p[k]=[round(h[0]+dx,3),round(h[1]+dy,3)]
    for suf,s0 in (('longe',0),('perto',24)):
        toe,ank=foot(t,s0);kn=knee(h,ank)
        p['ponta_'+suf]=[round(toe[0],3),round(toe[1],3)];p['tornozelo_'+suf]=[round(ank[0],3),round(ank[1],3)];p['joelho_'+suf]=[round(kn[0],3),round(kn[1],3)]
    quadros.append({'quadro':t+1,'pts_s':t/25,'pontos':p,'apoio':{'Left':not(24<=t<44),'Right':t>=20},'rastreio':'sintetico','tipo_ponto':'sintetico','observacao':''})
json.dump({'referencia':'P21-ciclo-sintetico','revisao':2,'estado':'ciclo sintetico derivado do P21','quadros':quadros,'inicio_original_s':0,'fim_original_s':N/25},open(OUT/'marcas-sinteticas.json','w'),ensure_ascii=False,indent=1)
# conferência rápida de continuidade: último quadro + 1 passo == primeiro quadro deslocado
a=quadros[0]['pontos'];t=N;h=hip(t)
print("emenda: quadril x esperado %.1f, quadril quadro1 - 96 = %.1f"%(h[0],a['referencia_calca'][0]-V*N))
for suf,s0 in (('longe',0),('perto',24)):
    print(suf,"ponta t=48:",[round(v,1) for v in foot(48,s0)[0]],"ponta t=0 deslocada:",[round(a['ponta_'+suf][0]-V*N,1),round(a['ponta_'+suf][1],1)])
