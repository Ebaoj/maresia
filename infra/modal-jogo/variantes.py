"""Variantes do jogo na mesma L4 do Modal: troca a configuração salva, recarrega a página e mede ou grava.

  ab        A/B de desempenho entre configurações, alternadas na mesma máquina (rodadas diferentes caem em
            servidores diferentes e variam 10+ FPS): FPS parado e andando, e chamadas de desenho por quadro
  modelos   grava o mesmo roteiro (parado, andando, correndo, meia-volta, câmera em volta) com cada modelo
            do jogador e devolve um vídeo de cada, para comparar lado a lado

Uso (de arte/):
    ./modal.sh run ../infra/modal-jogo/variantes.py::bloco
    ./modal.sh run ../infra/modal-jogo/variantes.py::modelos
Vídeos em infra/modal-jogo/testes/ (fora do git).
"""
import json
import subprocess
import time
from pathlib import Path

import modal

from cdp import mudar_config, subir_jogo
from jogo import imagem

app = modal.App("maresia-variantes")
imagem_var = imagem.add_local_python_source("jogo", "cdp")

MEDIR_JS = """(async () => {
  const m = window.maresia, r = m.renderer
  const medir = async (teclas) => {
    for (const k in m.teclas) m.teclas[k] = false
    Object.assign(m.teclas, teclas)
    await new Promise(res => setTimeout(res, 2000))
    r.info.autoReset = false; r.info.reset()
    let q = 0, vivo = true
    const f = () => { if (!vivo) return; q++; requestAnimationFrame(f) }
    requestAnimationFrame(f)
    await new Promise(res => setTimeout(res, 8000))
    vivo = false
    const v = { fps: Math.round(q / 8 * 10) / 10, chamadas: Math.round(r.info.render.calls / Math.max(1, q)) }
    r.info.autoReset = true; r.info.reset()
    return v
  }
  const parado = await medir({})
  const andando = await medir({ frente: true, girarEsq: true })
  for (const k in m.teclas) m.teclas[k] = false
  return { parado, andando }
})()"""


@app.function(gpu="L4", image=imagem_var, timeout=40 * 60, cpu=4, memory=8192)
def ab(variantes: dict, rodadas: int = 3) -> dict:
    cdp = subir_jogo()
    saida = {nome: [] for nome in variantes}
    for _ in range(rodadas):
        for nome, mudancas in variantes.items():
            mudar_config(cdp, mudancas)
            saida[nome].append(cdp.js(MEDIR_JS))
    return saida


ROTEIRO = """(t, m) => {
  const k = m.teclas
  for (const c in k) k[c] = false
  if (t >= 1.5 && t < 4.5) k.frente = true
  if (t >= 4.5 && t < 7.5) { k.frente = true; k.correr = true }
  if (t >= 7.5 && t < 9) k.tras = true
  if (t >= 9.5) k.girarEsq = true
}"""


@app.function(gpu="L4", image=imagem_var, timeout=40 * 60, cpu=4, memory=8192)
def gravar_modelos(modelos: list, segundos: float = 12) -> dict:
    cdp = subir_jogo()
    videos = {}
    for modelo in modelos:
        mudar_config(cdp, {"personagem": {"modeloJogador": modelo}})
        time.sleep(4)
        cdp.js(f"window.maresia.gravar({{ nome: '{modelo}', segundos: {segundos}, fps: 30, roteiro: {ROTEIRO} }})")
        pasta = f"/tmp/jogo/docs/capturas/video/{modelo}"
        saida = f"/tmp/{modelo}.mp4"
        subprocess.run(f"ffmpeg -y -loglevel error -framerate 30 -i {pasta}/q%04d.jpg -vf scale=640:-2 -c:v libx264 "
                       f"-pix_fmt yuv420p {saida}", shell=True, check=True)
        videos[modelo] = Path(saida).read_bytes()
    return videos


@app.local_entrypoint()
def bloco():
    variantes = {f"bloco-{t}": {"desempenho": {"tamBloco": t}} for t in (96, 192, 384)}
    r = ab.remote(variantes)
    for nome, lista in r.items():
        fp = [x["parado"]["fps"] for x in lista]
        fa = [x["andando"]["fps"] for x in lista]
        cp = [x["parado"]["chamadas"] for x in lista]
        print(f"{nome:10s} parado fps {fp} média {sum(fp) / len(fp):.1f} chamadas {cp} | andando fps {fa} média {sum(fa) / len(fa):.1f}")


@app.local_entrypoint()
def modelos(lista: str = "neto-tripo-partes,neto-tripo-p2,neto-vestido"):
    r = gravar_modelos.remote(lista.split(","))
    pasta = Path(__file__).parent / "testes"
    pasta.mkdir(exist_ok=True)
    for nome, dados in r.items():
        (pasta / f"modelo-{nome}.mp4").write_bytes(dados)
        print("gravado", pasta / f"modelo-{nome}.mp4")
