"""Imagem para 3D com o TRELLIS (Microsoft, licença MIT) numa GPU L4 do Modal.

Recebe uma ou mais vistas do personagem e devolve .glb + capturas de frente, perfil e costas.
Uso (sempre pelo ./modal.sh):
    ./modal.sh run trellis3d.py --nome neto-traco --imagens entradas/3d/neto-frente.png
    ./modal.sh run trellis3d.py --nome neto-multi --imagens a.png,b.png,c.png   # várias vistas
Saída em saida/3d/<nome>/.
"""

import io
import time
from pathlib import Path

import modal

CACHE = modal.Volume.from_name("maresia-trellis-cache", create_if_missing=True)

imagem = (
    modal.Image.from_registry("nvidia/cuda:12.1.1-devel-ubuntu22.04", add_python="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0", "build-essential")
    .pip_install("torch==2.4.0", "torchvision==0.19.0", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install(
        "pillow", "imageio", "imageio-ffmpeg", "tqdm", "easydict", "opencv-python-headless", "scipy", "ninja",
        "rembg", "onnxruntime", "trimesh", "open3d", "xatlas", "pyvista", "pymeshfix", "igraph", "transformers",
        "huggingface_hub", "safetensors", "spconv-cu120",
        "git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8",
    )
    .pip_install("xformers==0.0.27.post2", index_url="https://download.pytorch.org/whl/cu121")
    .pip_install("kaolin", find_links="https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.4.0_cu121.html")
    .env({"TORCH_CUDA_ARCH_LIST": "8.9", "FORCE_CUDA": "1"})  # L4 = Ada (sm_89)
    .run_commands(
        "pip install wheel setuptools && git clone --branch v0.3.3 --depth 1 https://github.com/NVlabs/nvdiffrast.git /tmp/nvdiffrast && pip install --no-build-isolation /tmp/nvdiffrast",
        "apt-get update && apt-get install -y clang && git clone https://github.com/autonomousvision/mip-splatting.git /tmp/mip-splatting"
        " && pip install --no-build-isolation /tmp/mip-splatting/submodules/diff-gaussian-rasterization/",
        "git clone --recurse-submodules https://github.com/microsoft/TRELLIS.git /root/TRELLIS",
    )
    .run_commands("apt-get update && apt-get install -y libegl1 libgomp1 libusb-1.0-0 libx11-6 libxext6 libxrender1 libsm6")  # open3d
    .pip_install("transformers==4.46.3")  # versões novas exigem PyTorch >= 2.6
    .env({
        "PYTHONPATH": "/root/TRELLIS", "ATTN_BACKEND": "xformers", "SPCONV_ALGO": "native",
        "HF_HOME": "/cache/hf", "TORCH_HOME": "/cache/torch", "U2NET_HOME": "/cache/u2net",
    })
)

app = modal.App("maresia-trellis", image=imagem)


@app.function(timeout=600)
def testar_import():
    """Confere em CPU (barato) se a imagem importa o TRELLIS, antes de subir GPU."""
    import open3d, spconv, xformers, kaolin, nvdiffrast, diff_gaussian_rasterization  # noqa: F401
    from trellis.pipelines import TrellisImageTo3DPipeline  # noqa: F401
    print("imports ok")


@app.cls(gpu="L4", volumes={"/cache": CACHE}, timeout=60 * 30, scaledown_window=60, max_containers=3)
class Trellis:
    @modal.enter()
    def carregar(self):
        from trellis.pipelines import TrellisImageTo3DPipeline

        t0 = time.time()
        self.pipeline = TrellisImageTo3DPipeline.from_pretrained("microsoft/TRELLIS-image-large")
        self.pipeline.cuda()
        CACHE.commit()
        print(f"TRELLIS carregado em {time.time() - t0:.0f} s")

    @modal.method()
    def gerar(self, imagens: list[bytes], semente: int = 1, simplificar: float = 0.95, passos: int = 12) -> dict:
        import imageio
        import numpy as np
        from PIL import Image
        from trellis.utils import postprocessing_utils, render_utils

        fotos = [Image.open(io.BytesIO(b)) for b in imagens]
        t0 = time.time()
        params = {"seed": semente, "sparse_structure_sampler_params": {"steps": passos, "cfg_strength": 7.5},
                  "slat_sampler_params": {"steps": passos, "cfg_strength": 3}}
        if len(fotos) == 1:
            saida = self.pipeline.run(fotos[0], **params)
        else:
            saida = self.pipeline.run_multi_image(fotos, **params)
        print(f"gerado em {time.time() - t0:.0f} s")

        # capturas em 4 ângulos fixos (a câmera do TRELLIS olha as costas em yaw 0)
        import torch
        from trellis.utils.render_utils import render_frames, yaw_pitch_r_fov_to_extrinsics_intrinsics
        yaws = [np.pi, np.pi * 1.5, 0.0, np.pi * 0.5]  # frente, perfil, costas, outro perfil
        extr, intr = yaw_pitch_r_fov_to_extrinsics_intrinsics(yaws, [0.15] * 4, 2, 40)
        capturas = {}
        for tipo, amostra, canal in (("cor", saida["gaussian"][0], "color"), ("normal", saida["mesh"][0], "normal")):
            quadros = render_frames(amostra, extr, intr, {"resolution": 512, "bg_color": (1, 1, 1)})[canal]
            buf = io.BytesIO()
            imageio.imwrite(buf, np.concatenate(quadros, axis=1), format="png")
            capturas[tipo] = buf.getvalue()

        glb = postprocessing_utils.to_glb(saida["gaussian"][0], saida["mesh"][0], simplify=simplificar, texture_size=2048)
        buf = io.BytesIO()
        glb.export(buf, file_type="glb")
        return {"glb": buf.getvalue(), **capturas}


@app.local_entrypoint()
def main(nome: str, imagens: str, semente: int = 1, simplificar: float = 0.95, passos: int = 12):
    base = Path(__file__).parent
    dados = [(base / c).read_bytes() for c in imagens.split(",")]
    t0 = time.time()
    r = Trellis().gerar.remote(dados, semente, simplificar, passos)
    pasta = base / "saida" / "3d" / nome
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / f"{nome}.glb").write_bytes(r["glb"])
    (pasta / "capturas-cor.png").write_bytes(r["cor"])
    (pasta / "capturas-normal.png").write_bytes(r["normal"])
    (pasta / "entrada.txt").write_text(f"imagens={imagens} semente={semente} simplificar={simplificar} passos={passos}\n")
    print(f"{nome}: pronto em {time.time() - t0:.0f} s, {pasta}")
