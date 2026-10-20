"""Imagem para 3D com o TRELLIS.2 (Microsoft, modelo microsoft/TRELLIS.2-4B, licença MIT) numa GPU do Modal.

O arquivo NÃO se chama trellis2.py de propósito: o container importa o pacote `trellis2` e um script
com o mesmo nome seria importado no lugar dele.

GPU: a geração cabe na L4 (pico 15,9 GB, ~6 min), mas limpar a malha bruta (~46 milhões de faces) no CuMesh
estoura os 24 GB dela. Padrão --gpu A100-40GB. O latente fica salvo no volume: se o pós-processamento falhar,
a próxima chamada com a mesma imagem/semente/tipo só decodifica.

O TRELLIS.2 só aceita UMA imagem por vez (não tem run_multi_image como o v1). Se vierem várias,
usa a primeira e avisa.

Dependências fora do pacote principal (o pipeline.json oficial aponta para modelos com acesso restrito):
  - DINOv3 (condicionamento): facebook/dinov3-vitl16-pretrain-lvd1689m tem aprovação manual da Meta;
    usamos o espelho camenduru/dinov3-vitl16-pretrain-lvd1689m (mesmo tamanho, mesmo config e LICENSE da Meta).
  - Remoção de fundo: briaai/RMBG-2.0 exige token; usamos ZhengPeng7/BiRefNet (MIT, o padrão do próprio código).

Uso (sempre pelo ./modal.sh):
    ./modal.sh run trellis_v2.py::testar_import           # CPU, confere a imagem antes de gastar GPU
    ./modal.sh run trellis_v2.py::testar_import_gpu       # L4 por ~1 min, import completo (flex_gemm exige GPU)
    ./modal.sh run trellis_v2.py::baixar_pesos            # CPU, enche o volume de cache
    ./modal.sh run trellis_v2.py --nome neto-tpose --imagens entradas/3d/tpose-vestido-frente.png
Saída em saida/3d2/<nome>/.
"""

import io
import time
from pathlib import Path

import modal

CACHE = modal.Volume.from_name("maresia-trellis2-cache", create_if_missing=True)
GPU = "L4"

TRELLIS2_SHA = "75fbf0183001ed9876c8dbb35de6b68552ee08bd"
CUMESH_SHA = "12289e1062f0603f2f0d0771b02e1395d247f26f"
FLEXGEMM_SHA = "6dd94a859c26ee8246888502eada3dd8ad85532e"
NVDIFFREC_SHA = "b296927cc7fd01c2ac1087c8065c4d7248f72da4"

DINO = "camenduru/dinov3-vitl16-pretrain-lvd1689m"
REMBG = "ZhengPeng7/BiRefNet"

imagem = (
    modal.Image.from_registry("nvidia/cuda:12.4.1-devel-ubuntu22.04", add_python="3.10")
    .apt_install("git", "libgl1", "libglib2.0-0", "build-essential", "clang", "libjpeg-dev", "libegl1", "libgomp1")
    .pip_install("torch==2.6.0", "torchvision==0.21.0", index_url="https://download.pytorch.org/whl/cu124")
    .pip_install("xformers==0.0.29.post3", index_url="https://download.pytorch.org/whl/cu124")
    .pip_install(
        "pillow", "imageio", "imageio-ffmpeg", "tqdm", "easydict", "opencv-python-headless", "ninja", "trimesh",
        "transformers==4.57.3", "zstandard", "kornia", "timm", "einops", "huggingface_hub", "safetensors", "scipy",
        "wheel", "setuptools",
        "git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8",
    )
    # L4 = sm_89, A10G = sm_86, A100 = sm_80: compila para as três para poder trocar de GPU sem rebuild
    .env({"TORCH_CUDA_ARCH_LIST": "8.0;8.6;8.9", "FORCE_CUDA": "1", "MAX_JOBS": "8"})
    .run_commands(
        "git clone -b v0.4.0 --depth 1 https://github.com/NVlabs/nvdiffrast.git /tmp/ext/nvdiffrast"
        " && pip install --no-build-isolation /tmp/ext/nvdiffrast",
    )
    .run_commands(
        "git clone -b renderutils https://github.com/JeffreyXiang/nvdiffrec.git /tmp/ext/nvdiffrec"
        f" && cd /tmp/ext/nvdiffrec && git checkout {NVDIFFREC_SHA} && pip install --no-build-isolation .",
    )
    .run_commands(
        "git clone https://github.com/JeffreyXiang/CuMesh.git /tmp/ext/CuMesh"
        f" && cd /tmp/ext/CuMesh && git checkout {CUMESH_SHA} && git submodule update --init --recursive"
        " && pip install --no-build-isolation .",
    )
    .run_commands(
        "git clone https://github.com/JeffreyXiang/FlexGEMM.git /tmp/ext/FlexGEMM"
        f" && cd /tmp/ext/FlexGEMM && git checkout {FLEXGEMM_SHA} && git submodule update --init --recursive"
        " && pip install --no-build-isolation .",
    )
    .run_commands(
        "git clone https://github.com/microsoft/TRELLIS.2.git /opt/TRELLIS.2"
        f" && cd /opt/TRELLIS.2 && git checkout {TRELLIS2_SHA} && git submodule update --init --recursive"
        " && pip install --no-build-isolation ./o-voxel",
    )
    # OpenCV 5 não lê .exr (imread devolve None); 4.12 é a versão do Space oficial. Camada no fim para não recompilar.
    .pip_install("opencv-python-headless==4.12.0.88")
    .env({
        "PYTHONPATH": "/opt/TRELLIS.2", "ATTN_BACKEND": "xformers", "OPENCV_IO_ENABLE_OPENEXR": "1",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True", "HF_HOME": "/cache/hf", "TORCH_HOME": "/cache/torch",
    })
)

app = modal.App("maresia-trellis2", image=imagem)


@app.function(timeout=600)
def testar_import():
    """Confere em CPU (barato) o que dá para importar sem placa. O flex_gemm roda o autotuner do Triton
    já no import e exige driver de GPU, então o import completo fica para testar_import_gpu."""
    import importlib.util
    import torch, xformers, nvdiffrast.torch, cumesh, nvdiffrec_render  # noqa: F401
    from transformers import DINOv3ViTModel  # noqa: F401
    faltando = [m for m in ("flex_gemm", "o_voxel", "trellis2") if importlib.util.find_spec(m) is None]
    assert not faltando, faltando
    import cv2
    assert cv2.imread("/opt/TRELLIS.2/assets/hdri/studio.exr", cv2.IMREAD_UNCHANGED) is not None, "exr ilegível"
    print("torch", torch.__version__, "cuda", torch.version.cuda, "| imports em CPU ok")


@app.function(gpu=GPU, timeout=300)
def testar_import_gpu():
    """Import completo numa função simples (sem @modal.enter, então uma falha não reinicia em loop)."""
    import torch, flex_gemm, o_voxel  # noqa: F401
    import o_voxel.postprocess  # noqa: F401
    from trellis2.pipelines import Trellis2ImageTo3DPipeline  # noqa: F401
    from trellis2.renderers import EnvMap  # noqa: F401
    print(torch.cuda.get_device_name(), "| imports completos ok")


def _config_local() -> str:
    """Baixa os pesos e monta uma pasta com o pipeline.json trocando os dois modelos de acesso restrito."""
    import json, os
    from huggingface_hub import snapshot_download

    pasta = snapshot_download("microsoft/TRELLIS.2-4B", allow_patterns=[
        "pipeline.json", "ckpts/ss_flow_*", "ckpts/slat_flow_*", "ckpts/shape_dec_*", "ckpts/tex_dec_*"])
    snapshot_download(DINO, allow_patterns=["*.json", "*.safetensors", "LICENSE.md"])
    snapshot_download(REMBG)
    from huggingface_hub import hf_hub_download
    for ext in ("json", "safetensors"):
        hf_hub_download("microsoft/TRELLIS-image-large", f"ckpts/ss_dec_conv3d_16l8_fp16.{ext}")

    cfg = json.loads(Path(pasta, "pipeline.json").read_text())
    cfg["args"]["image_cond_model"]["args"]["model_name"] = DINO
    cfg["args"]["rembg_model"]["args"]["model_name"] = REMBG
    local = Path("/tmp/trellis2-4b")
    local.mkdir(exist_ok=True)
    (local / "pipeline.json").write_text(json.dumps(cfg))
    if not (local / "ckpts").exists():
        os.symlink(Path(pasta) / "ckpts", local / "ckpts")
    return str(local)


@app.function(volumes={"/cache": CACHE}, timeout=60 * 40, cpu=2, memory=4096)
def baixar_pesos():
    """Enche o volume em CPU, para não pagar o download com GPU ligada."""
    t0 = time.time()
    _config_local()
    CACHE.commit()
    print(f"pesos no volume em {time.time() - t0:.0f} s")


@app.cls(gpu=GPU, volumes={"/cache": CACHE}, timeout=60 * 30, scaledown_window=60, max_containers=1, memory=40960)
class Trellis2:
    @modal.enter()
    def carregar(self):
        import cv2
        import torch
        from trellis2.pipelines import Trellis2ImageTo3DPipeline
        from trellis2.renderers import EnvMap

        t0 = time.time()
        self.pipeline = Trellis2ImageTo3DPipeline.from_pretrained(_config_local())
        self.pipeline.cuda()
        hdr = cv2.imread("/opt/TRELLIS.2/assets/hdri/studio.exr", cv2.IMREAD_UNCHANGED)
        self.envmap = EnvMap(torch.tensor(cv2.cvtColor(hdr, cv2.COLOR_BGR2RGB), dtype=torch.float32, device="cuda"))
        print(f"TRELLIS.2 carregado em {time.time() - t0:.0f} s; GPU {torch.cuda.get_device_name()}")

    @modal.method()
    def gerar(self, imagens: list[bytes], semente: int = 1, tipo: str = "1024_cascade",
              decimacao: int = 1_000_000, textura: int = 2048) -> dict:
        import imageio
        import numpy as np
        import torch
        import o_voxel
        from PIL import Image
        from trellis2.utils.render_utils import render_frames, yaw_pitch_r_fov_to_extrinsics_intrinsics

        if len(imagens) > 1:
            print(f"AVISO: TRELLIS.2 aceita uma imagem só; usando a primeira de {len(imagens)}")
        import hashlib
        chave = f"{hashlib.sha1(imagens[0]).hexdigest()[:12]}-s{semente}-{tipo}"
        arq_latente = Path("/cache/latentes") / f"{chave}.pt"
        torch.cuda.reset_peak_memory_stats()
        t0 = time.time()
        if arq_latente.exists():  # geração já feita antes (ex.: o pós-processamento falhou): só decodifica
            lat = torch.load(arq_latente, weights_only=False)
            malha = self.pipeline.decode_latent(lat["shape"], lat["tex"], lat["res"])[0]
            print(f"latente reaproveitado ({chave})")
        else:
            foto = Image.open(io.BytesIO(imagens[0]))
            malha, (shape_slat, tex_slat, res) = self.pipeline.run(
                foto, seed=semente, pipeline_type=tipo, return_latent=True)
            malha = malha[0]
            try:
                arq_latente.parent.mkdir(parents=True, exist_ok=True)
                torch.save({"shape": shape_slat, "tex": tex_slat, "res": res}, arq_latente)
                CACHE.commit()
            except Exception as e:  # noqa: BLE001
                print(f"AVISO: não salvou o latente: {e!r}")
            del shape_slat, tex_slat
        t_ger = time.time() - t0
        print(f"gerado em {t_ger:.0f} s, pico de VRAM {torch.cuda.max_memory_allocated() / 2**30:.1f} GB, "
              f"{malha.faces.shape[0]} faces")
        torch.cuda.empty_cache()
        print(f"VRAM em uso antes do glb: {torch.cuda.memory_allocated() / 2**30:.1f} GB")

        # 1) o .glb primeiro (é o entregável); a malha bruta tem dezenas de milhões de faces
        t1 = time.time()
        glb = o_voxel.postprocess.to_glb(
            vertices=malha.vertices, faces=malha.faces, attr_volume=malha.attrs, coords=malha.coords,
            attr_layout=malha.layout, voxel_size=malha.voxel_size, aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
            decimation_target=decimacao, texture_size=textura, remesh=True, remesh_band=1, remesh_project=0,
            verbose=True,
        )
        buf = io.BytesIO()
        glb.export(buf, file_type="glb")
        saida = {"glb": buf.getvalue(), "segundos": t_ger, "gpu": torch.cuda.get_device_name()}
        print(f"glb exportado em {time.time() - t1:.0f} s")
        del glb
        torch.cuda.empty_cache()

        # 2) capturas em 4 ângulos fixos (frente, perfil, costas, outro perfil); falha aqui não perde o glb
        try:
            malha.simplify(16777216)  # limite do nvdiffrast
            yaws = [np.pi, np.pi * 1.5, 0.0, np.pi * 0.5]
            extr, intr = yaw_pitch_r_fov_to_extrinsics_intrinsics(yaws, [0.15] * 4, 2, 40)
            r = render_frames(malha, extr, intr, {"resolution": 512}, envmap=self.envmap)
            for tipo_cap, canal in (("cor", "base_color"), ("normal", "normal"), ("pbr", "shaded")):
                quadros = []
                for i, q in enumerate(r[canal]):
                    a = r["alpha"][i][..., :1].astype(np.float32) / 255 if "alpha" in r else 1.0
                    quadros.append((q.astype(np.float32) * a + 255 * (1 - a)).astype(np.uint8))  # fundo branco
                b = io.BytesIO()
                imageio.imwrite(b, np.concatenate(quadros, axis=1), format="png")
                saida[tipo_cap] = b.getvalue()
        except Exception as e:  # noqa: BLE001
            print(f"AVISO: capturas falharam: {e!r}")
        saida["vram_gb"] = torch.cuda.max_memory_allocated() / 2**30
        return saida


@app.local_entrypoint()
def main(nome: str, imagens: str, semente: int = 1, tipo: str = "1024_cascade",
         decimacao: int = 1_000_000, textura: int = 2048, gpu: str = "A100-40GB"):
    # A geração cabe na L4 (pico 15,9 GB), mas o CuMesh estoura os 24 GB ao limpar a malha bruta
    # de ~46 milhões de faces da 1024_cascade; por isso o padrão é A100-40GB.
    base = Path(__file__).parent
    dados = [(base / c).read_bytes() for c in imagens.split(",")]
    t0 = time.time()
    r = Trellis2.with_options(gpu=gpu)().gerar.remote(dados, semente, tipo, decimacao, textura)
    pasta = base / "saida" / "3d2" / nome
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / f"{nome}.glb").write_bytes(r["glb"])
    for k in ("cor", "normal", "pbr"):
        if k in r:
            (pasta / f"capturas-{k}.png").write_bytes(r[k])
    (pasta / "entrada.txt").write_text(
        f"imagens={imagens} semente={semente} tipo={tipo} decimacao={decimacao} textura={textura}\n"
        f"gpu={r['gpu']} geracao={r['segundos']:.0f}s pico_vram={r['vram_gb']:.1f}GB\n")
    print(f"{nome}: pronto em {time.time() - t0:.0f} s ({r['gpu']}, pico {r['vram_gb']:.1f} GB), {pasta}")
