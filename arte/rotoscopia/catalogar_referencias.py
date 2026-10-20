#!/usr/bin/env python3
"""Baixa vídeos livres do Commons e prepara folhas de contato com PTS reais.

Uso: python3 arte/rotoscopia/catalogar_referencias.py [ID ...]
Os vídeos ficam em arte/entradas/referencias/catalogo-2026-10-18 (fora do git).
O resolvedor HTTPS é usado só pelo curl desta execução; não altera o DNS do Mac.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.parse import quote

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'arte/entradas/referencias/catalogo-2026-10-18'
DATA = ROOT / 'docs/referencias-movimento-real.json'


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True)


def resolve(host):
    result = run(['curl', '-fsS', '--max-time', '15', '-H',
                  'accept: application/dns-json',
                  f'https://1.1.1.1/dns-query?name={host}&type=A'])
    answer = json.loads(result.stdout)
    return next(item['data'] for item in answer['Answer'] if item['type'] == 1)


def sheet(folder, samples, batch):
    for number, start in enumerate(range(0, len(samples), batch), 1):
        group = samples[start:start+batch]
        canvas = Image.new('RGB', (1280, math.ceil(len(group)/4)*210 + 40), '#eeeeee')
        draw = ImageDraw.Draw(canvas)
        draw.text((12, 10), f'{folder.name} — folha {number} — tempos do arquivo original', fill='black')
        for index, (frame, stamp) in enumerate(group):
            img = Image.open(frame).convert('RGB')
            img.thumbnail((316, 180))
            x, y = (index % 4)*320, (index//4)*210+40
            canvas.paste(img, (x+(320-img.width)//2, y))
            draw.text((x+8, y+183), f'{stamp:07.3f}s', fill='black')
        canvas.save(folder/f'contato-{number:02}.jpg', quality=90)


def process(item, addresses):
    folder = OUT/item['id']
    folder.mkdir(parents=True, exist_ok=True)
    video = folder/'original.webm'
    if item.get('arquivo_local'):
        video = ROOT/item['arquivo_local']
    elif not video.exists():
        name = item['commons_file']
        digest = hashlib.md5(name.encode()).hexdigest()
        url = f'https://upload.wikimedia.org/wikipedia/commons/{digest[0]}/{digest[:2]}/'+quote(name)
        args = ['curl', '-fLsS', '--max-time', '180', '--retry', '0']
        for host, address in addresses.items():
            args += ['--resolve', f'{host}:443:{address}']
        temporary = folder/'download.parcial'
        headers = folder/'download-headers.txt'
        response = subprocess.run(args+['-D', str(headers), url, '-o', str(temporary)], capture_output=True, text=True)
        if response.returncode:
            if re.search(r'HTTP/\S+ 429', headers.read_text() if headers.exists() else ''):
                match = re.search(r'retry-after:\s*(\d+)', headers.read_text(), re.I)
                delay = int(match.group(1)) if match else 600
                (OUT/'rede-retomar-depois.json').write_text(json.dumps({'retomar_timestamp':time.time()+delay,'segundos_solicitados':delay,'id':item['id']}))
                raise RuntimeError(f'HTTP 429: interromper fila e aguardar {delay} s antes de novas requisições.')
            response.check_returncode()
        temporary.rename(video)
    probe = json.loads(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                            '-show_entries', 'format=duration:stream=width,height,avg_frame_rate,r_frame_rate,nb_frames',
                            '-of', 'json', str(video)]).stdout)
    probe['sha256'] = hashlib.sha256(video.read_bytes()).hexdigest()
    probe['arquivo'] = str(video.relative_to(ROOT))
    (folder/'probe.json').write_text(json.dumps(probe, ensure_ascii=False, indent=2)+'\n')
    duration = float(probe['format']['duration'])
    step = 0.5 if duration < 10 else 1 if duration < 30 else 2 if duration < 90 else 5
    frames = folder/'amostras'
    frames.mkdir(exist_ok=True)
    result = run(['ffmpeg', '-hide_banner', '-threads', '2', '-i', str(video),
                  '-vf', f"select='isnan(prev_selected_t)+gte(t-prev_selected_t,{step})',showinfo,scale=320:-2",
                  '-fps_mode', 'vfr', '-q:v', '3', '-y', str(frames/'%04d.jpg')])
    stamps = [float(x) for x in re.findall(r'pts_time:([\d.]+)', result.stderr)]
    samples = list(zip(sorted(frames.glob('*.jpg')), stamps))
    (folder/'amostras.json').write_text(json.dumps(stamps, indent=2)+'\n')
    sheet(folder, samples, 24)
    return {'id': item['id'], 'duration': duration, 'frames': len(samples), 'probe': probe}


def main():
    items = json.loads(DATA.read_text())['videos']
    if len(sys.argv)>1:
        items = [item for item in items if item['id'] in sys.argv[1:]]
    items = [item for item in items if item.get('commons_file') or item.get('arquivo_local')]
    addresses = {host: resolve(host) for host in ['commons.wikimedia.org','upload.wikimedia.org']}
    backoff = OUT/'rede-retomar-depois.json'
    for item in items:
        if backoff.exists() and not (OUT/item['id']/'original.webm').exists() and not item.get('arquivo_local'):
            remaining = json.loads(backoff.read_text())['retomar_timestamp']-time.time()
            if remaining > 0:
                print(json.dumps({'id':item['id'],'aguardar_segundos':math.ceil(remaining)}), flush=True)
                break
        try:
            print(json.dumps(process(item, addresses), ensure_ascii=False), flush=True)
        except Exception as error:
            print(json.dumps({'id':item['id'], 'erro':str(error),
                              'detalhe':getattr(error,'stderr','').strip()}), flush=True)
            if 'HTTP 429' in str(error):
                break


if __name__ == '__main__':
    main()
