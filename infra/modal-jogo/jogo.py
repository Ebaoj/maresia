"""Maresia rodando numa GPU do Modal (L4), com a tela transmitida para o navegador do Mac.

Enquanto a cota de GPU da AWS não sai (infra/maquina-gpu), este é o teste grátis (crédito mensal do
Modal). O Chrome desenha o WebGL na L4 pelo Vulkan (o modo que a sondagem de 17/10/2026 mostrou usando
a placa; os outros caíam no processador) numa tela virtual, e a tela vai para o navegador do Mac por um
túnel do Modal. Dois servidores de tela:
  kasm   (padrão) KasmVNC 1.5: a tela vira vídeo H.264 codificado pela própria L4 (NVENC)
  novnc  x11vnc + noVNC: a tela vai em pedaços de imagem comprimidos no processador (o primeiro teste)
Limites: o túnel do Modal é só TCP e as máquinas ficam nos EUA (atraso no controle).

Uso (de arte/, que tem o cliente do Modal com as chaves do cofre):
    ./modal.sh run ../infra/modal-jogo/jogo.py::main                     abre a sessão (até 1 h) e o navegador
    ./modal.sh run ../infra/modal-jogo/jogo.py::main --servidor novnc    o servidor antigo, para comparar
    ./modal.sh app stop ID                                               encerra antes (ID aparece no terminal)
A senha da sessão é gerada aqui no Mac e vai só no link que abre no navegador. Durante a sessão, o
terminal mostra a cada 20 s o FPS do jogo medido dentro do servidor e o processador gasto na transmissão.
"""
import asyncio
import base64
import json
import secrets
import subprocess
import threading
import time
import urllib.parse
import webbrowser
from pathlib import Path

import modal

# o projeto maresia (no Mac); dentro do contêiner o arquivo fica em /root e a raiz não é usada
_aqui = Path(__file__).resolve()
RAIZ = _aqui.parents[2] if len(_aqui.parents) > 2 else Path('/')
app = modal.App("maresia-jogo")
estado = modal.Dict.from_name("maresia-jogo-estado", create_if_missing=True)

FORA = ["node_modules", ".git", "docs/capturas", "arte/saida", "arte/entradas", "arte/.venv", "arte/blender",
        "arte/visor", "arte/ajuste", "infra", "**/*.blend", "**/*.blend1"]
KASM = "https://github.com/kasmtech/KasmVNC/releases/download/v1.5.0/kasmvncserver_bookworm_1.5.0_amd64.deb"
PORTA = {"kasm": 6900, "novnc": 6080}  # a porta que o túnel do Modal expõe
KASM_DENTRO = 6901  # o KasmVNC, só dentro do contêiner

imagem = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("wget", "gnupg", "ca-certificates", "curl", "xvfb", "x11vnc", "novnc", "python3-websockify",
                 "libvulkan1", "fonts-dejavu-core", "x11-apps", "imagemagick", "ffmpeg", "procps")
    .run_commands(
        "wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb",
        "apt-get update && apt-get install -y /tmp/chrome.deb",
        "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs",
        f"wget -q -O /tmp/kasm.deb {KASM} && apt-get install -y /tmp/kasm.deb",
    )
    .pip_install("websocket-client==1.8.0")
    # dependências instaladas uma vez (só mudam com o package-lock); o projeto entra na hora de rodar
    .add_local_file(RAIZ / "package.json", "/deps/package.json", copy=True)
    .add_local_file(RAIZ / "package-lock.json", "/deps/package-lock.json", copy=True)
    .run_commands("cd /deps && npm ci --silent")
    .add_local_dir(RAIZ, "/jogo-fonte", ignore=FORA)
)


def _bg(c):
    return subprocess.Popen(c, shell=True)


def _tela_kasm(senha, largura, altura):
    # Vídeo H.264 pela NVENC da L4. -drinode 0: sem /dev/dri no contêiner, o KasmVNC não acha a placa
    # sozinho; para a NVENC esse valor vai direto ao CUDA como número da placa (EncoderProbe.cpp da v1.5.0).
    # O cliente web do KasmVNC só entra por usuário e senha do navegador (ignora a senha de VNC), e o Chrome
    # bloqueia link com usuário e senha embutidos: o KasmVNC fica só dentro do contêiner e o _porteiro, na
    # frente dele, troca a chave do link por um cookie e entrega a autenticação.
    subprocess.run(f"printf '%s\\n%s\\n' '{senha}' '{senha}' | kasmvncpasswd -u joabe -w /tmp/kasm-senha > /dev/null",
                   shell=True, check=True)
    _bg(f"Xvnc :1 -geometry {largura}x{altura} -depth 24 -websocketPort {KASM_DENTRO} -interface 127.0.0.1 "
        f"-httpd /usr/share/kasmvnc/www -sslOnly 0 -SecurityTypes None -KasmPasswordFile /tmp/kasm-senha "
        f"-FrameRate 60 -videoCodec h264_nvenc,h264 -drinode 0 -VideoQualityCRFCQP 23 -GroupOfPicture 30 "
        f"-Log '*:stderr:30' > /tmp/xvnc.log 2>&1")
    threading.Thread(target=lambda: asyncio.run(_porteiro(senha)), daemon=True).start()


async def _porteiro(senha):
    """Na porta do túnel: /?chave=SENHA grava um cookie e redireciona; com o cookie, repassa ao KasmVNC com a
    autenticação básica; sem ele, 403. Escuta só IPv4 (o túnel do Modal entra pelo IPv4 do contêiner)."""
    basica = base64.b64encode(f"joabe:{senha}".encode()).decode()

    async def passar(de, para):
        try:
            while dado := await de.read(65536):
                para.write(dado)
                await para.drain()
        except (ConnectionError, asyncio.IncompleteReadError):
            pass
        finally:
            para.close()

    async def atender(r, w):
        try:
            cab = (await r.readuntil(b"\r\n\r\n")).decode("latin-1").split("\r\n")[:-2]
        except (asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError):
            w.close()
            return
        pedido, linhas = cab[0], cab[1:]
        partes = urllib.parse.urlsplit(pedido.split(" ")[1] if " " in pedido else "/")
        params = urllib.parse.parse_qsl(partes.query)
        # Lax e não Strict: o link chega de fora (o navegador abre a partir do terminal) e o Strict não mandaria
        # o cookie na navegação seguinte
        if ("chave", senha) in params:
            resto = urllib.parse.urlencode([(k, v) for k, v in params if k != "chave"])
            w.write((f"HTTP/1.1 302 Found\r\nSet-Cookie: maresia={senha}; Path=/; Secure; HttpOnly; SameSite=Lax\r\n"
                     f"Location: {partes.path}?{resto}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").encode())
            await w.drain()
            w.close()
            return
        if not any(l.lower().startswith("cookie:") and f"maresia={senha}" in l for l in linhas):
            w.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            await w.drain()
            w.close()
            return
        websocket = any(l.lower().startswith("upgrade:") for l in linhas)
        # uma conexão por pedido (fora o websocket), para cada pedido passar por aqui e levar a autenticação
        tirar = ("authorization:",) if websocket else ("authorization:", "connection:", "keep-alive:")
        linhas = [l for l in linhas if not l.lower().startswith(tirar)] + [f"Authorization: Basic {basica}"]
        if not websocket:
            linhas.append("Connection: close")
        dr, dw = await asyncio.open_connection("127.0.0.1", KASM_DENTRO)
        dw.write(("\r\n".join([pedido, *linhas]) + "\r\n\r\n").encode("latin-1"))
        await asyncio.gather(passar(r, dw), passar(dr, w))

    servidor = await asyncio.start_server(atender, "0.0.0.0", PORTA["kasm"])
    async with servidor:
        await servidor.serve_forever()


def _tela_novnc(senha, largura, altura):
    _bg(f"Xvfb :1 -screen 0 {largura}x{altura}x24 -nolisten tcp")
    subprocess.run(f"x11vnc -storepasswd '{senha}' /tmp/senha-vnc > /dev/null 2>&1", shell=True, check=True)


def _chrome(largura, altura):
    # Vulkan sozinho deixava o canvas branco (a superfície Vulkan não apresenta na tela virtual); sem a
    # superfície, o WebGL segue na L4 e a composição também (teste de 17/10/2026). Sem a trava de vsync e de
    # taxa de quadros, o jogo sobe de ~34 para ~44-54 FPS no servidor (comparar_chrome, 17/10/2026).
    # Tradutor desligado pelas preferências (a opção de linha de comando não escondia o balão).
    # A porta de depuração só escuta dentro do contêiner; serve para medir o FPS do jogo.
    Path("/tmp/chrome/Default").mkdir(parents=True, exist_ok=True)
    Path("/tmp/chrome/Default/Preferences").write_text(json.dumps({"translate": {"enabled": False}}))
    _bg(f"DISPLAY=:1 XDG_RUNTIME_DIR=/tmp google-chrome --no-sandbox --use-angle=vulkan --enable-features=Vulkan "
        f"--disable-vulkan-surface --disable-gpu-vsync --disable-frame-rate-limit --disable-features=Translate "
        f"--lang=pt-BR --ignore-gpu-blocklist --disable-dev-shm-usage --no-first-run --no-default-browser-check "
        f"--kiosk --remote-debugging-port=9222 --window-size={largura},{altura} --window-position=0,0 "
        f"--user-data-dir=/tmp/chrome http://127.0.0.1:5195/ > /tmp/chrome.log 2>&1")


def _fps_jogo():
    """Quadros por segundo do jogo dentro do servidor (requestAnimationFrame por 3 s, pela depuração do Chrome)."""
    import urllib.request

    import websocket
    alvos = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
    pagina = next(a for a in alvos if a.get("type") == "page" and "5195" in a.get("url", ""))
    ws = websocket.create_connection(pagina["webSocketDebuggerUrl"], timeout=10, suppress_origin=True)
    js = ("new Promise(r=>{let n=0;const t0=performance.now();const f=()=>{n++;const t=performance.now()-t0;"
          "if(t<3000)requestAnimationFrame(f);else r(Math.round(n*10000/t)/10)};requestAnimationFrame(f)})")
    ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                        "params": {"expression": js, "awaitPromise": True, "returnByValue": True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == 1:
            ws.close()
            return m["result"]["result"].get("value")


def _cpu_transmissao():
    """Processador por programa (100 = um núcleo inteiro), medido em 3 s."""
    r = subprocess.run("top -b -n 2 -d 3 -w 200 | awk '/^top -/{n++} n==2' | grep -E 'Xvnc|x11vnc|websockify|chrome' "
                       "| awk '{c[$12]+=$9} END {for (k in c) printf \"%s %.0f%% \", k, c[k]}'",
                       shell=True, capture_output=True, text=True)
    return r.stdout.strip()


def _medir(chave, parar):
    while not parar.is_set():
        try:
            estado[f"medida-{chave}"] = {"fps_jogo": _fps_jogo(), "cpu": _cpu_transmissao(), "t": time.time()}
        except Exception as e:  # o jogo ainda carregando, por exemplo
            estado[f"medida-{chave}"] = {"erro": str(e)[:120], "t": time.time()}
        parar.wait(20)


@app.function(gpu="L4", image=imagem, timeout=60 * 60, cpu=4, memory=8192)
def sessao(senha: str, chave: str, servidor: str = "kasm", largura: int = 1280, altura: int = 720, minutos: int = 58):
    subprocess.run("rm -rf /tmp/jogo && cp -r /jogo-fonte /tmp/jogo && ln -s /deps/node_modules /tmp/jogo/node_modules", shell=True, check=True)
    (_tela_kasm if servidor == "kasm" else _tela_novnc)(senha, largura, altura)
    time.sleep(1)
    _bg("cd /tmp/jogo && npx vite --port 5195 --strictPort --host 127.0.0.1 > /tmp/vite.log 2>&1")
    for _ in range(60):
        if subprocess.run("curl -sf http://127.0.0.1:5195/ > /dev/null", shell=True).returncode == 0:
            break
        time.sleep(1)
    _chrome(largura, altura)
    if servidor == "novnc":
        _bg("x11vnc -display :1 -rfbauth /tmp/senha-vnc -forever -shared -noxdamage -threads -quiet -localhost -rfbport 5900")
        _bg(f"websockify --web /usr/share/novnc {PORTA['novnc']} 127.0.0.1:5900")
    time.sleep(2)
    if servidor == "kasm":
        subprocess.run("grep -iE 'acceleration|encoder' /tmp/xvnc.log | head -5", shell=True)
    parar = threading.Event()
    threading.Thread(target=_medir, args=(chave, parar), daemon=True).start()
    with modal.forward(PORTA[servidor]) as tunel:
        # cada sessão grava o próprio endereço (duas abertas ao mesmo tempo trocavam o link e a senha falhava)
        estado[f"url-{chave}"] = tunel.url
        inicio = time.time()
        while time.time() - inicio < 60 * minutos:
            time.sleep(5)
    parar.set()


def link(servidor, url, senha):
    if servidor == "kasm":
        # a chave vira cookie no _porteiro. video_quality=3 (alta) leva o cliente a 60 quadros por segundo (o
        # padrão, média, trava em 24); kasmvnc_mode_preference=-1029 escolhe o H.264 da NVENC (sozinho, o
        # cliente escolhia o H.264 por software). Teste de 17/10/2026: 4,8 quadros/s no noVNC, 40,8 aqui.
        # resize=scale: a tela do servidor fica em 1280x720 e o navegador só amplia (no padrão, o cliente muda a
        # resolução do servidor para o tamanho da janela, e o jogo desenharia mais pixels)
        return f"{url}/?chave={senha}&video_quality=3&kasmvnc_mode_preference=-1029&resize=scale"
    return f"{url}/vnc.html?autoconnect=true&resize=scale&quality=7&compression=2&password={senha}"


@app.local_entrypoint()
def main(servidor: str = "kasm", abrir: bool = True, minutos: int = 58):
    senha = secrets.token_hex(4)  # 8 caracteres (o VNC só usa 8)
    chave = secrets.token_hex(6)
    chamada = sessao.spawn(senha, chave, servidor, minutos=minutos)
    print(f"ligando a L4 e o jogo ({servidor}; 1 a 3 min na primeira vez)...")
    url = None
    for _ in range(300):
        url = estado.get(f"url-{chave}")
        if url:
            break
        time.sleep(2)
    if not url:
        print("não subiu; veja os logs no painel do Modal")
        return
    if abrir:
        webbrowser.open(link(servidor, url, senha))
    else:
        # para teste automático: o link completo fica num arquivo só do Mac, nunca no terminal
        destino = Path(__file__).parent / "testes" / f"link-{servidor}.txt"
        destino.parent.mkdir(exist_ok=True)
        destino.write_text(link(servidor, url, senha))
    print(f"sessão aberta ({servidor}, {url}). Para encerrar: ./modal.sh app stop {app.app_id}", flush=True)
    vista = None
    while True:
        try:
            chamada.get(timeout=20)
            break
        except TimeoutError:
            m = estado.get(f"medida-{chave}")
            if m and m.get("t") != vista:
                vista = m.get("t")
                print("medida:", {k: v for k, v in m.items() if k != "t"}, flush=True)


# Teste da tela: sobe Xvfb + Vite + Chrome com cada conjunto de opções e devolve um print da tela virtual
# e o fim do log do Chrome (para achar a combinação em que o WebGL na L4 aparece na janela)
@app.function(gpu="L4", image=imagem, timeout=20 * 60, cpu=4, memory=8192)
def testar_tela(variantes: dict) -> dict:
    subprocess.run("rm -rf /tmp/jogo && cp -r /jogo-fonte /tmp/jogo && ln -s /deps/node_modules /tmp/jogo/node_modules", shell=True, check=True)
    subprocess.Popen("Xvfb :1 -screen 0 1280x720x24 -nolisten tcp", shell=True)
    subprocess.Popen("cd /tmp/jogo && npx vite --port 5195 --strictPort --host 127.0.0.1 > /tmp/vite.log 2>&1", shell=True)
    for _ in range(60):
        if subprocess.run("curl -sf http://127.0.0.1:5195/ > /dev/null", shell=True).returncode == 0:
            break
        time.sleep(1)
    saida = {}
    for nome, flags in variantes.items():
        subprocess.run("pkill -f google-chrome; sleep 1; rm -rf /tmp/chrome", shell=True)
        subprocess.Popen(f"DISPLAY=:1 XDG_RUNTIME_DIR=/tmp google-chrome --no-sandbox {flags} --ignore-gpu-blocklist "
                         f"--disable-dev-shm-usage --no-first-run --no-default-browser-check --kiosk --window-size=1280,720 "
                         f"--window-position=0,0 --user-data-dir=/tmp/chrome --enable-logging=stderr --v=0 "
                         f"http://127.0.0.1:5195/ > /tmp/chrome-{nome}.log 2>&1", shell=True)
        time.sleep(40)
        subprocess.run(f"DISPLAY=:1 xwd -root -silent | convert xwd:- -resize 640x360 /tmp/{nome}.png", shell=True)
        log = subprocess.run(f"grep -iE 'vulkan|gpu|webgl|angle|error' /tmp/chrome-{nome}.log | tail -8", shell=True, capture_output=True, text=True).stdout
        saida[nome] = {"png": Path(f"/tmp/{nome}.png").read_bytes() if Path(f"/tmp/{nome}.png").exists() else b"", "log": log}
    return saida


@app.local_entrypoint()
def testar():
    variantes = {
        "vulkan": "--use-angle=vulkan --enable-features=Vulkan",
        "vulkan-sem-superficie": "--use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface",
        "vulkan-sem-composicao": "--use-angle=vulkan --enable-features=Vulkan --disable-gpu-compositing",
        "vulkan-ambos": "--use-angle=vulkan --enable-features=Vulkan,VulkanFromANGLE --disable-vulkan-surface --disable-gpu-compositing",
    }
    pasta = Path(__file__).parent / "testes"
    pasta.mkdir(exist_ok=True)
    for nome, r in testar_tela.remote(variantes).items():
        (pasta / f"{nome}.png").write_bytes(r["png"])
        print(f"===== {nome}\n{r['log']}")


# Comparação de opções do Chrome pelo FPS do jogo dentro do servidor (sem transmissão): cada variante roda
# ~70 s e devolve o FPS medido 3 vezes e a carga das threads mais ocupadas
@app.function(gpu="L4", image=imagem, timeout=30 * 60, cpu=4, memory=8192)
def comparar_chrome(variantes: dict) -> dict:
    subprocess.run("rm -rf /tmp/jogo && cp -r /jogo-fonte /tmp/jogo && ln -s /deps/node_modules /tmp/jogo/node_modules", shell=True, check=True)
    _bg("Xvfb :1 -screen 0 1280x720x24 -nolisten tcp")
    _bg("cd /tmp/jogo && npx vite --port 5195 --strictPort --host 127.0.0.1 > /tmp/vite.log 2>&1")
    for _ in range(60):
        if subprocess.run("curl -sf http://127.0.0.1:5195/ > /dev/null", shell=True).returncode == 0:
            break
        time.sleep(1)
    saida = {}
    for nome, flags in variantes.items():
        subprocess.run("pkill -f google-chrome; sleep 2; rm -rf /tmp/chrome", shell=True)
        _bg(f"DISPLAY=:1 XDG_RUNTIME_DIR=/tmp google-chrome --no-sandbox {flags} --ignore-gpu-blocklist --disable-dev-shm-usage "
            f"--no-first-run --no-default-browser-check --kiosk --remote-debugging-port=9222 --window-size=1280,720 "
            f"--window-position=0,0 --user-data-dir=/tmp/chrome http://127.0.0.1:5195/ > /tmp/chrome-{nome}.log 2>&1")
        time.sleep(45)
        fps = []
        for _ in range(3):
            try:
                fps.append(_fps_jogo())
            except Exception as e:
                fps.append(str(e)[:60])
        threads = subprocess.run("top -b -n 2 -d 3 -H -w 200 | awk '/^top -/{n++} n==2' | sed -n 8,12p | awk '{print $9\"% \"$12}'",
                                 shell=True, capture_output=True, text=True).stdout.split("\n")
        renderer = subprocess.run("grep -ciE 'swiftshader|software' /tmp/chrome-%s.log" % nome, shell=True, capture_output=True, text=True).stdout.strip()
        subprocess.run(f"DISPLAY=:1 xwd -root -silent | convert xwd:- -resize 640x360 /tmp/{nome}.png", shell=True)
        png = Path(f"/tmp/{nome}.png").read_bytes() if Path(f"/tmp/{nome}.png").exists() else b""
        saida[nome] = {"fps": fps, "threads": [t for t in threads if t], "avisos_software": renderer, "png": png}
    return saida


@app.local_entrypoint()
def comparar():
    base = "--use-angle=vulkan --enable-features=Vulkan --disable-vulkan-surface"
    variantes = {
        "atual": base,
        "atual+raster": base + " --enable-gpu-rasterization --enable-zero-copy --disable-gpu-vsync --disable-frame-rate-limit",
        "atual+sem-vsync": base + " --disable-gpu-vsync --disable-frame-rate-limit",
        "atual+thread-gpu": base + " --enable-features=Vulkan,EnableDrDc --enable-gpu-rasterization",
    }
    pasta = Path(__file__).parent / "testes"
    pasta.mkdir(exist_ok=True)
    for nome, r in comparar_chrome.remote(variantes).items():
        (pasta / f"cmp-{nome}.png").write_bytes(r["png"])
        print(f"===== {nome}: fps {r['fps']}  software:{r['avisos_software']}\n   " + "\n   ".join(r["threads"]))
