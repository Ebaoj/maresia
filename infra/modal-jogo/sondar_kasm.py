"""Sonda o KasmVNC 1.5 (vídeo H.264 pela NVENC) numa L4 do Modal: instala, lista o que o contêiner
expõe da placa (dri, bibliotecas de vídeo) e tenta codificar com a NVENC pelo ffmpeg.

Uso (de arte/): ./modal.sh run ../infra/modal-jogo/sondar_kasm.py
"""
import subprocess

import modal

app = modal.App("maresia-sondar-kasm")
KASM = "https://github.com/kasmtech/KasmVNC/releases/download/v1.5.0/kasmvncserver_bookworm_1.5.0_amd64.deb"
imagem = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("wget", "ca-certificates", "ffmpeg", "curl", "x11-utils")
    .run_commands(f"wget -q -O /tmp/kasm.deb {KASM} && apt-get update && apt-get install -y /tmp/kasm.deb")
)


@app.function(gpu="L4", image=imagem, timeout=600)
def sondar() -> str:
    cmds = [
        "kasmvncpasswd --help 2>&1 | head -30",
        "printf 'senha123\\nsenha123\\n' | kasmvncpasswd -u joabe -w /tmp/kpw 2>&1; cat /tmp/kpw | cut -c1-20",
        "(Xvnc :1 -geometry 1280x720 -depth 24 -websocketPort 6901 -httpd /usr/share/kasmvnc/www -sslOnly 0 "
        "-interface 127.0.0.1 -SecurityTypes None -KasmPasswordFile /tmp/kpw -FrameRate 60 -videoCodec h264_nvenc "
        "-Log '*:stderr:30' > /tmp/xvnc.log 2>&1 &) ; sleep 4; "
        "curl -s -o /dev/null -w 'sem senha %{http_code}\\n' http://127.0.0.1:6901/ ; "
        "curl -s -o /dev/null -w 'com senha %{http_code}\\n' -u joabe:senha123 http://127.0.0.1:6901/ ; "
        "DISPLAY=:1 xdpyinfo 2>&1 | grep dimensions; tail -30 /tmp/xvnc.log",
        "nvidia-smi --query-gpu=name,driver_version --format=csv",
        "ls -l /dev/dri 2>&1; ls /dev | grep -i nvidia",
        "ldconfig -p | grep -iE 'nvidia-encode|nvcuvid|libcuda' ; find / -name 'libnvidia-encode*' 2>/dev/null | head",
        "echo $NVIDIA_DRIVER_CAPABILITIES",
        "ffmpeg -hide_banner -encoders 2>/dev/null | grep -iE 'nvenc|libx264'",
        "ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=1280x720:rate=60 -t 5 -c:v h264_nvenc -preset p1 -f null - && echo NVENC_OK",
        "ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=1280x720:rate=60 -t 5 -c:v libx264 -preset ultrafast -tune zerolatency -f null - -benchmark 2>&1 | tail -2",
        "Xvnc -version 2>&1 | head -3",
        "Xvnc -help 2>&1 | grep -iE 'video|codec|frame|websocket|httpd|ssl|basicauth|interface|security|password|hw3d|drinode|threads|quality' | head -60",
        "ls /usr/share/kasmvnc/www | head",
    ]
    saida = []
    for c in cmds:
        r = subprocess.run(c, shell=True, capture_output=True, text=True, timeout=120)
        saida.append(f"$ {c}\n{r.stdout}{r.stderr}")
    return "\n".join(saida)


@app.local_entrypoint()
def main():
    print(sondar.remote())
