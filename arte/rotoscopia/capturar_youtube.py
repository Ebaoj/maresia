#!/usr/bin/env python3
"""Captura quadros pelo player público do YouTube; não salva vídeo.

Uso: python3 arte/rotoscopia/capturar_youtube.py VIDEO_ID SEGUNDOS...
O proxy temporário resolve DNS via HTTPS só para este navegador. Não altera o Mac.
"""
import functools
import json
from pathlib import Path
import select
import socket
import socketserver
import sys
import threading
from playwright.sync_api import sync_playwright
from catalogar_referencias import OUT, resolve, sheet

@functools.lru_cache(maxsize=128)
def address(host):
    return resolve(host)

class Tunnel(socketserver.BaseRequestHandler):
    def handle(self):
        remote = None
        try:
            data = b''
            while b'\r\n\r\n' not in data and len(data) < 32768:
                chunk = self.request.recv(4096)
                if not chunk: return
                data += chunk
            method,target,_ = data.split(b'\r\n',1)[0].decode().split(' ',2)
            if method != 'CONNECT': return
            host,port = target.rsplit(':',1)
            if int(port) != 443: return
            remote = socket.create_connection((address(host),443),timeout=20)
            self.request.sendall(b'HTTP/1.1 200 Connection Established\r\n\r\n')
            while True:
                readable,_,_ = select.select([self.request,remote],[],[],45)
                if not readable: break
                for source in readable:
                    chunk = source.recv(65536)
                    if not chunk: return
                    (remote if source is self.request else self.request).sendall(chunk)
        except Exception as error:
            print(json.dumps({'proxy_host':locals().get('host','?'),'erro':str(error)}),flush=True)
            return
        finally:
            if remote: remote.close()

class Proxy(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

ident = sys.argv[1]
times = [float(v) for v in sys.argv[2:]] or [0,30,60]
platform = 'vimeo' if ident.startswith('vimeo:') else 'youtube'
ident = ident.split(':')[-1]
url = 'https://player.vimeo.com/video/'+ident if platform=='vimeo' else 'https://www.youtube.com/watch?v='+ident
folder = OUT/platform/ident
folder.mkdir(parents=True,exist_ok=True)
proxy = Proxy(('127.0.0.1',0),Tunnel)
threading.Thread(target=proxy.serve_forever,daemon=True).start()
frames = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True,proxy={'server':f'http://127.0.0.1:{proxy.server_address[1]}'},
        args=['--single-process','--in-process-gpu','--no-sandbox','--disable-gpu','--disable-quic'])
    page = browser.new_page(viewport={'width':1920,'height':1080},locale='en-US')
    try:
        print('Abrindo player '+ident,flush=True)
        page.goto(url,wait_until='domcontentloaded',timeout=45000)
        page.wait_for_timeout(3000)
        print(json.dumps({'pagina':page.title(),'texto':page.locator('body').inner_text()[:1000]}),flush=True)
        page.screenshot(path=str(folder/'pagina.png'))
        if 'unusual traffic' in page.locator('body').inner_text().lower():
            (folder/'bloqueio.json').write_text(json.dumps({'motivo':'player bloqueado por verificação de tráfego automatizado','quadros_de_conteudo_obtidos':0}))
            raise RuntimeError('YouTube exige verificação de tráfego. Interrompido sem contornar a verificação; manter vídeo sem score.')
        for label in ['Reject all','Accept all']:
            button = page.get_by_role('button',name=label,exact=True)
            if button.count():
                button.first.click()
                break
        page.locator('video').first.wait_for(timeout=30000)
        state = page.evaluate('''() => ({title:document.title,
          playability:window.ytInitialPlayerResponse?.playabilityStatus,
          video:[...document.querySelectorAll('video')].map(v=>({time:v.currentTime,ready:v.readyState,duration:v.duration}))})''')
        (folder/'pagina.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(state,ensure_ascii=False),flush=True)
        page.evaluate('''() => {let v=document.querySelector('video');v.muted=true;v.play().catch(()=>{});}''')
        try:
            page.wait_for_function('document.querySelector("video").readyState >= 2',timeout=45000)
        except Exception:
            page.screenshot(path=str(folder/'erro-player.png'))
            print(page.locator('body').inner_text()[:1400],flush=True)
            raise
        page.add_style_tag(content='video {position:fixed!important;left:0!important;top:0!important;width:1920px!important;height:1080px!important;z-index:2147483647!important;object-fit:contain!important;background:black!important;}')
        for target in times:
            page.evaluate('(t)=>{let v=document.querySelector("video");v.pause();v.currentTime=t;}',target)
            page.wait_for_function('(t)=>{let v=document.querySelector("video");return !v.seeking && v.readyState>=2 && Math.abs(v.currentTime-t)<0.15;}',arg=target,timeout=45000)
            page.wait_for_timeout(150)
            state = page.locator('video').first.evaluate('(v)=>({tempo_s:v.currentTime,largura:v.videoWidth,altura:v.videoHeight,ready:v.readyState})')
            path = folder/f'q{target:010.3f}.png'
            page.locator('video').first.screenshot(path=str(path),timeout=15000)
            frames.append((path,state['tempo_s']))
            print(json.dumps({'arquivo':str(path),**state}),flush=True)
        (folder/'quadros.json').write_text(json.dumps([{'arquivo':str(path.name),'tempo_s':t} for path,t in frames],ensure_ascii=False,indent=2)+'\n')
        sheet(folder,frames,24)
    finally:
        browser.close()
        proxy.shutdown()
