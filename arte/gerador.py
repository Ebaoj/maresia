"""ComfyUI no Modal para gerar a arte da Maresia (personagem, conceitos).

Roda o ComfyUI sem interface numa GPU L4 alugada por segundo e devolve as imagens.
Os modelos ficam num volume do Modal (baixados uma vez), nunca no Mac.

Uso (sempre pelo ./modal.sh, que pega as chaves do cofre):
    ./modal.sh run gerador.py::baixar_modelos           # uma vez só
    ./modal.sh run gerador.py --prompt "..." --n 4      # gera e salva em saida/
"""

import json
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

import modal

VOLUME = modal.Volume.from_name("maresia-comfy-modelos", create_if_missing=True)
MODELOS = Path("/modelos")
COMFY = Path("/root/comfy/ComfyUI")

# Z-Image Turbo (Apache 2.0): 8 passos, segue bem o texto do prompt.
REPO = "Comfy-Org/z_image_turbo"
ARQUIVOS = {
    "split_files/diffusion_models/z_image_turbo_bf16.safetensors": "diffusion_models",
    "split_files/text_encoders/qwen_3_4b_fp8_mixed.safetensors": "text_encoders",
    "split_files/vae/ae.safetensors": "vae",
}

imagem = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git")
    .pip_install("comfy-cli==1.22.0", "huggingface_hub==2.2.0")
    .run_commands("comfy --skip-prompt install --fast-deps --nvidia")
)

app = modal.App("maresia-comfy", image=imagem)


@app.function(volumes={MODELOS: VOLUME}, timeout=60 * 30)
def baixar_modelos():
    """Baixa os pesos do Hugging Face para o volume (roda em CPU, sem GPU)."""
    from huggingface_hub import hf_hub_download

    for origem, pasta in ARQUIVOS.items():
        destino = MODELOS / pasta / Path(origem).name
        if destino.exists():
            print(f"já existe: {destino}")
            continue
        destino.parent.mkdir(parents=True, exist_ok=True)
        baixado = hf_hub_download(REPO, origem, local_dir="/tmp/hf")
        shutil.move(baixado, destino)  # /tmp e o volume são discos diferentes
        print(f"baixado: {destino} ({destino.stat().st_size / 1e9:.2f} GB)")
    VOLUME.commit()


@app.cls(gpu="L4", volumes={MODELOS: VOLUME}, timeout=60 * 20, scaledown_window=60, max_containers=4)
class Comfy:
    @modal.enter()
    def ligar(self):
        # aponta as pastas de modelo do ComfyUI para o volume
        for pasta in set(ARQUIVOS.values()):
            alvo = COMFY / "models" / pasta
            for arquivo in (MODELOS / pasta).glob("*.safetensors"):
                link = alvo / arquivo.name
                if not link.exists():
                    link.symlink_to(arquivo)
        self.inicio = time.time()
        processo = subprocess.Popen("comfy launch -- --listen 127.0.0.1 --port 8188", shell=True)
        for _ in range(240):
            if processo.poll() is not None:
                raise RuntimeError("ComfyUI fechou ao iniciar; ver o log acima")
            try:
                urllib.request.urlopen("http://127.0.0.1:8188/system_stats", timeout=2)
                print(f"ComfyUI pronto em {time.time() - self.inicio:.0f} s")
                return
            except Exception:
                time.sleep(1)
        raise RuntimeError("ComfyUI não subiu em 4 minutos")

    @modal.method()
    def gerar(self, fluxo: dict, entradas: dict | None = None) -> list[bytes]:
        for nome, dados in (entradas or {}).items():  # imagens de referência para imagem-para-imagem
            (COMFY / "input" / nome).write_bytes(dados)
        corpo = json.dumps({"prompt": fluxo}).encode()
        pedido = urllib.request.Request("http://127.0.0.1:8188/prompt", corpo, {"Content-Type": "application/json"})
        id_pedido = json.load(urllib.request.urlopen(pedido))["prompt_id"]
        t0 = time.time()
        while True:
            historico = json.load(urllib.request.urlopen(f"http://127.0.0.1:8188/history/{id_pedido}"))
            if id_pedido in historico:
                break
            time.sleep(0.5)
        estado = historico[id_pedido].get("status", {})
        if estado.get("status_str") == "error":
            raise RuntimeError(json.dumps(estado.get("messages"), ensure_ascii=False)[:2000])
        print(f"gerado em {time.time() - t0:.1f} s")
        imagens = []
        for saida in historico[id_pedido]["outputs"].values():
            for img in saida.get("images", []):
                imagens.append((COMFY / "output" / img.get("subfolder", "") / img["filename"]).read_bytes())
        return imagens


def fluxo_z_image(prompt: str, largura: int, altura: int, semente: int, lote: int,
                  referencia: str | None = None, forca: float = 1.0, mascara: str | None = None) -> dict:
    """Fluxo padrão do Z-Image Turbo no ComfyUI, no formato da API.
    Com `referencia`, parte dessa imagem: `forca` 1,0 ignora a imagem; 0,5 mantém forma e cores.
    Com `mascara` (branco = refazer), só a área branca muda; o resto volta idêntico à referência."""
    fluxo = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "lumina2"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["5", 0]}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": largura, "height": altura, "batch_size": lote}},
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
                "seed": semente, "steps": 9, "cfg": 1.0, "sampler_name": "res_multistep",
                "scheduler": "simple", "denoise": 1.0,
            },
        },
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "maresia"}},
    }
    if referencia:
        fluxo["11"] = {"class_type": "LoadImage", "inputs": {"image": referencia}}
        fluxo["12"] = {"class_type": "ImageScale", "inputs": {"image": ["11", 0], "upscale_method": "lanczos", "width": largura, "height": altura, "crop": "center"}}
        fluxo["13"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["12", 0], "vae": ["3", 0]}}
        fluxo["14"] = {"class_type": "RepeatLatentBatch", "inputs": {"samples": ["13", 0], "amount": lote}}
        fluxo["8"]["inputs"]["latent_image"] = ["14", 0]
        fluxo["8"]["inputs"]["denoise"] = forca
    if referencia and mascara:
        fluxo["15"] = {"class_type": "LoadImageMask", "inputs": {"image": mascara, "channel": "red"}}
        fluxo["16"] = {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["14", 0], "mask": ["15", 0]}}
        fluxo["8"]["inputs"]["latent_image"] = ["16", 0]
        fluxo["17"] = {"class_type": "ImageCompositeMasked", "inputs": {"destination": ["12", 0], "source": ["9", 0], "x": 0, "y": 0, "resize_source": False, "mask": ["15", 0]}}
        fluxo["10"]["inputs"]["images"] = ["17", 0]
    return fluxo


@app.local_entrypoint()
def main(prompt: str, n: int = 4, largura: int = 1024, altura: int = 1024, semente: int = 1, nome: str = "teste"):
    pasta = Path(__file__).parent / "saida" / nome
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "prompt.txt").write_text(f"{prompt}\n\nsemente={semente} {largura}x{altura} n={n}\n")
    t0 = time.time()
    imagens = Comfy().gerar.remote(fluxo_z_image(prompt, largura, altura, semente, n))
    for i, dados in enumerate(imagens, 1):
        (pasta / f"{nome}-{i}.png").write_bytes(dados)
    print(f"{len(imagens)} imagens em {pasta} ({time.time() - t0:.0f} s de ponta a ponta)")


@app.local_entrypoint()
def rodada(arquivo: str, largura: int = 1536, altura: int = 1024):
    """Gera várias direções em paralelo (até 4 máquinas). O JSON é uma lista de
    {"nome", "prompt", "semente", "n"}; cada uma vai para saida/<nome>/."""
    pedidos = json.loads(Path(arquivo).read_text())
    t0 = time.time()
    fluxos, entradas = [], []
    for p in pedidos:
        arquivos = {k: p[k] for k in ("referencia", "mascara") if p.get(k)}  # caminhos relativos a arte/
        nomes = {k: f"{k}-{Path(v).name}" for k, v in arquivos.items()}
        fluxos.append(fluxo_z_image(p["prompt"], largura, altura, p["semente"], p["n"],
                                    nomes.get("referencia"), p.get("forca", 1.0), nomes.get("mascara")))
        entradas.append({nomes[k]: (Path(__file__).parent / v).read_bytes() for k, v in arquivos.items()} or None)
    # cada pedido numa máquina própria (até 4 em paralelo): o tempo da rodada vira o do pedido mais longo
    for p, imagens in zip(pedidos, list(Comfy().gerar.map(fluxos, entradas))):  # list: consome o map inteiro (evita aviso aclose)
        pasta = Path(__file__).parent / "saida" / p["nome"]
        pasta.mkdir(parents=True, exist_ok=True)
        (pasta / "prompt.txt").write_text(f"{p['prompt']}\n\nsemente={p['semente']} {largura}x{altura} n={p['n']} referencia={p.get('referencia')} forca={p.get('forca', 1.0)}\n")
        for i, dados in enumerate(imagens, 1):
            (pasta / f"{pasta.name}-{i}.png").write_bytes(dados)
        print(f"{p['nome']}: {len(imagens)} imagens ({time.time() - t0:.0f} s)")
