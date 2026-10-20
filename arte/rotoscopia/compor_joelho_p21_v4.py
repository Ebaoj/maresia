"""Antes/depois do joelho direito do rig, com projeção dos ossos nas imagens."""
import json,math,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'arte/finais/rotoscopia-p21-v4'
OLD=ROOT/'arte/finais/rotoscopia-p21-v3';A=json.loads((OUT/'poses-v3.json').read_text());B=json.loads((OUT/'poses-v4.json').read_text())
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',19);small=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',15)
theta=math.radians(24);e=math.radians(8);R=(-math.sin(theta),math.cos(theta),0);U=(-math.sin(e)*math.cos(theta),-math.sin(e)*math.sin(theta),math.cos(e));center=(0,-.47,.78)
def pixel(v):
 d=[v[i]-center[i] for i in range(3)];return (450+300*sum(x*y for x,y in zip(d,R)),350-300*sum(x*y for x,y in zip(d,U)))
def tile(folder,version,poses,i):
 im=Image.open(folder/f'render-v{version}'/f'q{i+1:04}.png').convert('RGB').resize((900,700));d=ImageDraw.Draw(im)
 coords=[pixel(poses[i][name]['head']) for name in ['RightUpLeg','RightLeg','RightFoot']]
 d.line(coords,fill='#ff659a',width=4)
 for x,y in coords:d.ellipse((x-5,y-5,x+5,y+5),fill='#ff659a',outline='#111a1c',width=1)
 return im.crop((430,330,770,655)).resize((300,287))
frames=[]
for i in range(39):
 im=Image.new('RGB',(600,340),'#151e20');d=ImageDraw.Draw(im);d.text((12,5),'ANTES · revisão 3',font=font,fill='#fff');d.text((312,5),'AGORA · revisão 4',font=font,fill='#fff');im.paste(tile(OLD,3,A,i),(0,32));im.paste(tile(OUT,4,B,i),(300,32));d.text((8,321),f'Joelho direito destacado · 0,5× · quadro {i+1}/39 · corte na repetição',font=small,fill='#a7e1d6');frames.append(im)
frames[0].save(OUT/'joelho-antes-depois.gif',save_all=True,append_images=frames[1:],duration=80,loop=0,optimize=False)
frames[12].save(OUT/'joelho-antes-depois.jpg',quality=95)
folder=OUT/'joelho-quadros';folder.mkdir(exist_ok=True)
for i,im in enumerate(frames):im.save(folder/f'q{i:04}.jpg',quality=92)
subprocess.run(['ffmpeg','-y','-framerate','12.5','-i',str(folder/'q%04d.jpg'),'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'joelho-antes-depois.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
print('JOELHO_P21_V4',39)
