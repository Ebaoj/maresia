"""Sondagem: a GPU do Modal tem as bibliotecas gráficas que o Chrome precisa (EGL/Vulkan)?"""
import subprocess
import modal

app = modal.App("maresia-sondar-gpu")
imagem = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("wget", "gnupg", "ca-certificates", "vulkan-tools", "libegl1", "libgl1", "mesa-utils", "xvfb")
    .run_commands(
        "wget -q -O /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb",
        "apt-get update && apt-get install -y /tmp/chrome.deb",
    )
)


@app.function(gpu="L4", image=imagem, timeout=600)
def sondar():
    def roda(c):
        r = subprocess.run(c, shell=True, capture_output=True, text=True)
        return (r.stdout + r.stderr)[-1500:]
    out = {}
    out["nvidia-smi"] = roda("nvidia-smi --query-gpu=name,driver_version --format=csv")
    out["env"] = roda("env | grep -i nvidia")
    out["libs"] = roda("ls /usr/lib/x86_64-linux-gnu/ | grep -iE 'nvidia|EGL_nvidia|GLX_nvidia' | head -30; ls /usr/share/vulkan/icd.d /etc/vulkan/icd.d 2>&1")
    out["vulkan"] = roda("vulkaninfo --summary 2>&1 | head -25")
    pagina = "data:text/html,<canvas id=c></canvas><p id=r></p><script>const g=document.getElementById('c').getContext('webgl2');const e=g&&g.getExtension('WEBGL_debug_renderer_info');document.getElementById('r').textContent='RENDERER='+(g?(e?g.getParameter(e.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)):'sem webgl2')</script>"
    for nome, flags in [("vulkan", "--use-angle=vulkan --enable-features=Vulkan"), ("egl", "--use-angle=gl-egl"), ("padrao", "")]:
        out["chrome_" + nome] = roda(
            f"XDG_RUNTIME_DIR=/tmp timeout 60 xvfb-run -s '-screen 0 1280x720x24' google-chrome --no-sandbox --headless=new {flags} "
            f"--ignore-gpu-blocklist --disable-dev-shm-usage --virtual-time-budget=3000 --dump-dom \"{pagina}\" 2>/dev/null | grep -o 'RENDERER=[^<]*'"
        )
    return out


@app.local_entrypoint()
def main():
    for k, v in sondar.remote().items():
        print(f"===== {k}\n{v}")
