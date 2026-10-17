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
    const chamadas = r.info.render.calls ?? r.info.render.drawCalls ?? 0 // WebGL: calls; WebGPU: drawCalls
    const v = { fps: Math.round(q / 8 * 10) / 10, chamadas: Math.round(chamadas / Math.max(1, q)) }
    r.info.autoReset = true; r.info.reset()
    return v
  }
  const parado = await medir({})
  const andando = await medir({ frente: true, girarEsq: true })
  for (const k in m.teclas) m.teclas[k] = false
  return { parado, andando }
})()"""


def _cpu_gpu_chrome():
    """Processador do processo de GPU do Chrome (100 = um núcleo), medido em 3 s pelo top."""
    pid = subprocess.run("pgrep -f 'type=gpu-process' | head -1", shell=True, capture_output=True, text=True).stdout.strip()
    if not pid:
        return None
    r = subprocess.run(f"top -b -n 2 -d 3 -p {pid} | awk '/^top -/{{n++}} n==2 && $1=={pid} {{print $9}}'", shell=True, capture_output=True, text=True).stdout.strip()
    try:
        return float(r.split()[-1].replace(",", "."))
    except (ValueError, IndexError):
        return None


def _ms_cpu_por_quadro(cdp):
    """Milissegundos da thread principal por quadro (perfilador do Chrome, 5 s andando em círculo)."""
    cdp("Profiler.enable")
    cdp("Profiler.setSamplingInterval", interval=500)
    cdp.js("for (const k in maresia.teclas) maresia.teclas[k] = false; maresia.teclas.frente = true; maresia.teclas.girarEsq = true;"
           "window.__q = 0; window.__qv = true; (function f() { if (!window.__qv) return; window.__q++; requestAnimationFrame(f) })()")
    time.sleep(1)
    q0 = cdp.js("window.__q")
    cdp("Profiler.start")
    time.sleep(5)
    perfil = cdp("Profiler.stop")["profile"]
    q = cdp.js("window.__q") - q0
    cdp.js("window.__qv = false; for (const k in maresia.teclas) maresia.teclas[k] = false")
    nos = {n["id"]: n["callFrame"]["functionName"] for n in perfil["nodes"]}
    ocupado = sum(dt for no, dt in zip(perfil["samples"], perfil["timeDeltas"]) if nos.get(no) not in ("(idle)", "(program)")) / 1000
    return round(ocupado / max(1, q), 2)


@app.function(gpu="L4", image=imagem_var, timeout=40 * 60, cpu=4, memory=8192)
def ab(variantes: dict, rodadas: int = 3, completo: bool = False) -> dict:
    cdp = subir_jogo()
    saida = {nome: [] for nome in variantes}
    for _ in range(rodadas):
        for nome, mudancas in variantes.items():
            mudar_config(cdp, mudancas)
            m = cdp.js(MEDIR_JS)
            if completo:
                m["primeiroQuadroMs"] = cdp.js("window.__primeiroQuadroMs")
                m["msCpuPorQuadro"] = _ms_cpu_por_quadro(cdp)
                m["cpuProcessoGpu"] = _cpu_gpu_chrome()
            saida[nome].append(m)
    return saida


@app.local_entrypoint()
def renderizador(rodadas: int = 3):
    """KAN-67 R3: WebGL contra WebGPU, alternados na mesma L4."""
    r = ab.remote({"webgl": {"desempenho": {"renderizador": "webgl"}}, "webgpu": {"desempenho": {"renderizador": "webgpu"}}},
                  rodadas, True)
    pasta = Path(__file__).parent / "testes"
    pasta.mkdir(exist_ok=True)
    (pasta / "ab-renderizador.json").write_text(json.dumps(r, ensure_ascii=False, indent=1))
    for nome, lista in r.items():
        for i, x in enumerate(lista):
            print(f"{nome:7s} rodada {i + 1}: parado {x['parado']} | andando {x['andando']} | 1º quadro {x.get('primeiroQuadroMs')} ms"
                  f" | CPU/quadro {x.get('msCpuPorQuadro')} ms | processo GPU {x.get('cpuProcessoGpu')}%")


ROTEIRO = """(t, m) => {
  const k = m.teclas
  for (const c in k) k[c] = false
  if (t >= 1.5 && t < 4.5) k.frente = true
  if (t >= 4.5 && t < 7.5) { k.frente = true; k.correr = true }
  if (t >= 7.5 && t < 9) k.tras = true
  if (t >= 9.5) k.girarEsq = true
}"""


# De perto, para ver a roupa: câmera a 1,7 m e mais baixa, meio da manhã com o relógio parado, a câmera dá
# uma volta inteira no menino parado e depois ele anda, corre, vira e para
ROTEIRO_PERTO = """(t, m) => {
  const k = m.teclas
  for (const c in k) k[c] = false
  if (t < 3.6) k.girarEsq = true
  if (t >= 4.5 && t < 7.5) k.frente = true
  if (t >= 7.5 && t < 9.5) { k.frente = true; k.correr = true }
  if (t >= 9.5 && t < 11) k.tras = true
  if (t >= 12) k.girarDir = true
}"""
CONFIG_PERTO = {"camera": {"distancia": 1.7, "altura": 0.85}, "tempo": {"hora": 9.5, "pausado": True}}


@app.function(gpu="L4", image=imagem_var, timeout=40 * 60, cpu=4, memory=8192)
def gravar_modelos(modelos: list, segundos: float = 12, roteiro: str = ROTEIRO, extra: dict = None,
                   largura: int = 640) -> dict:
    cdp = subir_jogo()
    videos = {}
    for modelo in modelos:
        mudar_config(cdp, {"personagem": {"modeloJogador": modelo}, **(extra or {})})
        time.sleep(4)
        cdp.js(f"window.maresia.gravar({{ nome: '{modelo}', segundos: {segundos}, fps: 30, roteiro: {roteiro} }})")
        pasta = f"/tmp/jogo/docs/capturas/video/{modelo}"
        saida = f"/tmp/{modelo}.mp4"
        subprocess.run(f"ffmpeg -y -loglevel error -framerate 30 -i {pasta}/q%04d.jpg -vf scale={largura}:-2 -c:v libx264 "
                       f"-crf 18 -pix_fmt yuv420p {saida}", shell=True, check=True)
        videos[modelo] = Path(saida).read_bytes()
    return videos


# Fotos no mesmo enquadramento (antes e depois de uma mudança de visual): leva o jogador para perto de um
# objeto pelo nome (ou fica no começo), para o relógio numa hora, tira a foto e lista o que está em volta
MIRAR_JS = """(async (alvo, dist, yaw, hora) => {
  const m = window.maresia, T = m.cena.children[0].position.constructor
  m.cfg.tempo.hora = hora; m.cfg.tempo.pausado = true
  let p = null
  if (alvo) {
    m.cena.traverse(o => {
      if (p || !o.name || !o.name.startsWith(alvo)) return
      o.updateWorldMatrix(true, false)
      if (o.isInstancedMesh) { const mt = o.matrixWorld.clone(); const mi = mt.clone(); o.getMatrixAt(0, mi); p = new T().setFromMatrixPosition(mt.multiply(mi)) }
      else { o.geometry.computeBoundingSphere(); p = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld) }
    })
    if (!p) return { erro: 'não achei ' + alvo }
    m.irPara(p.x + Math.sin(yaw) * dist, p.z + Math.cos(yaw) * dist, yaw, hora)
  } else if (yaw !== null) { m.cam.yaw = yaw }
  await new Promise(r => setTimeout(r, 4000))
  const perto = {}
  const c = m.jogador.pos
  m.cena.traverse(o => {
    if (!o.isMesh || !o.visible) return
    o.updateWorldMatrix(true, false)
    const centros = []
    if (o.isInstancedMesh) { const mi = o.matrixWorld.clone(); for (let i = 0; i < Math.min(o.count, 400); i++) { o.getMatrixAt(i, mi); centros.push(new T().setFromMatrixPosition(o.matrixWorld.clone().multiply(mi))) } }
    else { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); centros.push(o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld)) }
    const d = Math.min(...centros.map(q => q.distanceTo(c)))
    if (d < 6) { const k = (o.name || o.type) + (o.material && o.material.color ? ' #' + o.material.color.getHexString() : '') + (o.material && o.material.vertexColors ? ' (cor por vértice)' : ''); perto[k] = Math.round(d * 10) / 10 }
  })
  return { perto }
})"""

LUGARES_PADRAO = [
    {"nome": "inicio", "alvo": None, "dist": 0, "yaw": None, "hora": 9.5},
    {"nome": "fogareiro", "alvo": "fatia-fogareiro", "dist": 2.6, "yaw": 0.6, "hora": 9.5},
    {"nome": "tauacu", "alvo": "fatia-tauacu", "dist": 2.4, "yaw": 2.2, "hora": 9.5},
    {"nome": "peixes", "alvo": "fatia-peixe", "dist": 2.8, "yaw": -0.4, "hora": 9.5},
    {"nome": "fundo", "alvo": None, "dist": 0, "yaw": 2.6, "hora": 9.5},
    {"nome": "fim-de-tarde", "alvo": "fatia-fogareiro", "dist": 3.2, "yaw": 3.4, "hora": 17.1},
]


@app.function(gpu="L4", image=imagem_var, timeout=30 * 60, cpu=4, memory=8192)
def fotos(lugares: list, mudancas: dict = None) -> dict:
    import base64
    cdp = subir_jogo()
    if mudancas:
        mudar_config(cdp, mudancas)
    saida = {}
    for l in lugares:
        info = cdp.js(f"({MIRAR_JS})({json.dumps(l['alvo'])}, {l['dist']}, {json.dumps(l['yaw'])}, {l['hora']})")
        png = base64.b64decode(cdp("Page.captureScreenshot", format="png")["data"])
        saida[l["nome"]] = {"png": png, "info": info}
    return saida


@app.local_entrypoint()
def foto(rotulo: str = "antes", renderizador: str = ""):
    r = fotos.remote(LUGARES_PADRAO, {"desempenho": {"renderizador": renderizador}} if renderizador else None)
    pasta = Path(__file__).parent / "testes" / "fotos"
    pasta.mkdir(parents=True, exist_ok=True)
    for nome, x in r.items():
        (pasta / f"{nome}-{rotulo}.png").write_bytes(x["png"])
        print(nome, json.dumps(x["info"], ensure_ascii=False)[:700])


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
def modelos(lista: str = "neto-tripo-partes,neto-tripo-p2,neto-vestido", perto: bool = False):
    if perto:
        r = gravar_modelos.remote(lista.split(","), segundos=14, roteiro=ROTEIRO_PERTO, extra=CONFIG_PERTO, largura=1280)
    else:
        r = gravar_modelos.remote(lista.split(","))
    pasta = Path(__file__).parent / "testes"
    pasta.mkdir(exist_ok=True)
    for nome, dados in r.items():
        arq = pasta / f"modelo-{nome}{'-perto' if perto else ''}.mp4"
        arq.write_bytes(dados)
        print("gravado", arq)
