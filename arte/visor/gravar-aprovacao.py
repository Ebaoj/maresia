"""Grava o vídeo de aprovação da roupa (roupa por esqueleto) na página arte/visor/neto-aprovacao.html.

uso: python3 arte/visor/gravar-aprovacao.py [ROTULO] [SEGUNDOS_POR_MOVIMENTO] [FPS]

A gravação do Playwright (screencast) deixava uma faixa cinza no rodapé do vídeo,
por isso o vídeo é montado a partir de quadros capturados um a um: a página expõe
window.aprovacao.capturar(passo, dt), que avança a animação por um passo fixo.
Sai com o .mp4 e o .webm em arte/visor/aprovacao/.
"""
import json, os, shutil, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

RAIZ = Path(__file__).resolve().parents[2]
D = Path(__file__).resolve().parent
ROTULO = sys.argv[1] if len(sys.argv) > 1 else 'aprovacao'
SEGUNDOS = float(sys.argv[2]) if len(sys.argv) > 2 else 5
FPS = int(sys.argv[3]) if len(sys.argv) > 3 else 25
PORT = 5197
SAIDA = D / 'aprovacao'
SAIDA.mkdir(exist_ok=True)
QUADROS = Path('/tmp/aprovacao-quadros')

env = {**os.environ, 'PATH': os.environ['PATH'] + ':/opt/homebrew/bin:/usr/local/bin'}
srv = subprocess.Popen(['npm', 'run', 'dev', '--', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'],
                       cwd=RAIZ, stdout=open(SAIDA / 'vite.log', 'w'), stderr=subprocess.STDOUT, env=env)
res = {'rotulo': ROTULO, 'fps': FPS, 'segmentos': 0, 'quadros': 0, 'erros': []}
try:
    for _ in range(90):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/arte/visor/neto-aprovacao.html', timeout=2)
            break
        except Exception:
            time.sleep(1)
    if QUADROS.exists():
        shutil.rmtree(QUADROS)
    QUADROS.mkdir(parents=True)
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome', headless=True,
                              args=['--use-angle=metal', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
                                    '--disable-background-timer-throttling'])
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        pg = ctx.new_page()
        pg.on('console', lambda m: res['erros'].append(f'{m.text} [{m.location.get("url", "")}]') if m.type == 'error' else None)
        pg.on('pageerror', lambda e: res['erros'].append(str(e)))
        pg.goto(f'http://127.0.0.1:{PORT}/arte/visor/neto-aprovacao.html?captura=1', wait_until='load')
        pg.wait_for_function('window.aprovacao && window.aprovacao.pronto', timeout=90000)
        segmentos = pg.evaluate('window.aprovacao.segmentos')
        res['segmentos'] = segmentos
        por_passo = max(1, int(round(SEGUNDOS * FPS)))
        total = segmentos * por_passo
        dt = 1.0 / FPS
        for i in range(total):
            pg.evaluate(f'window.aprovacao.capturar({i // por_passo}, {dt})')
            pg.screenshot(path=str(QUADROS / f'f{i:05d}.png'))
            if i % 50 == 0:
                print(f'{i}/{total}', flush=True)
        res['quadros'] = total
        ctx.close()
        b.close()
    for codec, extra in (('mp4', ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow']),
                         ('webm', ['-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', '-crf', '32', '-b:v', '0', '-deadline', 'good', '-cpu-used', '4'])):
        destino = SAIDA / f'{ROTULO}.{codec}'
        subprocess.run(['ffmpeg', '-y', '-framerate', str(FPS), '-i', str(QUADROS / 'f%05d.png'), *extra, str(destino)],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        res[codec] = str(destino)
finally:
    srv.terminate()
    if QUADROS.exists():
        shutil.rmtree(QUADROS, ignore_errors=True)

res['erros'] = [e for e in res['erros'] if 'favicon' not in e and '404' not in e]
print(json.dumps(res, ensure_ascii=False, indent=1))
