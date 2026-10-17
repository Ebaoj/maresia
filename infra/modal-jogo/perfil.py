"""Onde o Maresia gasta o tempo de cada quadro, medido numa L4 do Modal (sem pesar o Mac).

Sobe o jogo como a sessão (jogo.py: tela virtual, Chrome no Vulkan, sem trava de vsync), e em cada cenário
(parado, andando, correndo) grava 10 s com o perfilador de CPU do Chrome. Devolve as funções que mais gastam
tempo próprio na thread principal, o tempo por arquivo, a coleta de lixo, e os números do renderer do three
(draw calls, triângulos, programas).

Uso (de arte/): ./modal.sh run ../infra/modal-jogo/perfil.py::main       (inventário da cena: ::inventario)
Saída completa em infra/modal-jogo/testes/perfil.json (fora do git).
"""
import json
import subprocess
import time
from collections import defaultdict
from pathlib import Path

import modal

from jogo import _bg, _chrome, imagem

app = modal.App("maresia-perfil")
# o jogo.py vai junto para dentro do contêiner (o Modal não leva módulos locais sozinho)
imagem_perfil = imagem.add_local_python_source("jogo")

CENARIOS = {
    "parado": {},
    "andando": {"frente": True, "girarEsq": True},
    "correndo": {"frente": True, "girarEsq": True, "correr": True},
}


class Cdp:
    """Conversa com a página do jogo pela porta de depuração do Chrome (só dentro do contêiner)."""

    def __init__(self):
        import urllib.request

        import websocket
        alvos = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
        pagina = next(a for a in alvos if a.get("type") == "page" and "5195" in a.get("url", ""))
        self.ws = websocket.create_connection(pagina["webSocketDebuggerUrl"], timeout=120, suppress_origin=True,
                                              max_size=None)
        self.n = 0

    def __call__(self, metodo, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": metodo, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.n:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m.get("result", {})

    def js(self, expressao):
        r = self("Runtime.evaluate", expression=expressao, awaitPromise=True, returnByValue=True)
        return r["result"].get("value")


def _resumir(perfil):
    """Tempo próprio (ms) por função e por arquivo, a partir das amostras do perfilador."""
    nos = {n["id"]: n for n in perfil["nodes"]}
    proprio = defaultdict(float)
    for no_id, dt in zip(perfil["samples"], perfil["timeDeltas"]):
        proprio[no_id] += dt / 1000
    total = sum(proprio.values())
    por_funcao, por_arquivo = defaultdict(float), defaultdict(float)
    for no_id, ms in proprio.items():
        cf = nos[no_id]["callFrame"]
        arquivo = cf["url"].split("/")[-1].split("?")[0] or cf["url"] or "(nativo)"
        nome = cf["functionName"] or "(anônima)"
        por_funcao[f"{nome}  {arquivo}:{cf['lineNumber'] + 1}"] += ms
        por_arquivo[arquivo if cf["url"] else nome] += ms

    def topo(d, n):
        return [(k, round(v, 1), round(100 * v / total, 1)) for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:n]]

    return {"total_ms": round(total), "funcoes": topo(por_funcao, 40), "arquivos": topo(por_arquivo, 25)}


def _subir_jogo():
    subprocess.run("rm -rf /tmp/jogo && cp -r /jogo-fonte /tmp/jogo && ln -s /deps/node_modules /tmp/jogo/node_modules", shell=True, check=True)
    _bg("Xvfb :1 -screen 0 1280x720x24 -nolisten tcp")
    _bg("cd /tmp/jogo && npx vite --port 5195 --strictPort --host 127.0.0.1 > /tmp/vite.log 2>&1")
    for _ in range(60):
        if subprocess.run("curl -sf http://127.0.0.1:5195/ > /dev/null", shell=True).returncode == 0:
            break
        time.sleep(1)
    _chrome(1280, 720)
    time.sleep(50)  # carregar o mundo e compilar os shaders
    return Cdp()


@app.function(gpu="L4", image=imagem_perfil, timeout=30 * 60, cpu=4, memory=8192)
def perfilar() -> dict:
    cdp = _subir_jogo()
    cdp("Profiler.enable")
    cdp("Profiler.setSamplingInterval", interval=250)  # microssegundos
    saida = {}
    for nome, teclas in CENARIOS.items():
        cdp.js("for (const k in maresia.teclas) maresia.teclas[k] = false;" +
               "".join(f"maresia.teclas.{k} = {json.dumps(v)};" for k, v in teclas.items()))
        time.sleep(3)
        # contagem do renderer somada no período (o three zera a cada render(), e o jogo faz várias passadas
        # por quadro) e quadros de tela contados por requestAnimationFrame
        cdp.js("""(() => { const r = maresia.renderer; r.info.autoReset = false; r.info.reset(); window.__q = 0; window.__f0 = r.info.render.frame;
            if (!window.__contando) { window.__contando = true; const f = () => { window.__q++; requestAnimationFrame(f) }; requestAnimationFrame(f) } })()""")
        cdp("Profiler.start")
        time.sleep(10)
        perfil = cdp("Profiler.stop")["profile"]
        info = cdp.js("""(() => { const r = maresia.renderer.info; let objetos = 0, malhas = 0, ossos = 0;
            maresia.cena.traverse(o => { objetos++; if (o.isMesh) malhas++; if (o.isSkinnedMesh) ossos += o.skeleton.bones.length });
            const q = Math.max(1, window.__q);
            const v = { quadros: window.__q, renders_por_quadro: Math.round((r.render.frame - window.__f0) / q * 10) / 10,
                     chamadas_por_quadro: Math.round(r.render.calls / q), triangulos_por_quadro: Math.round(r.render.triangles / q),
                     programas: r.programs.length, geometrias: r.memory.geometries, texturas: r.memory.textures,
                     objetos, malhas, ossos, msQuadro: Math.round(maresia.estatistica.msQuadro * 10) / 10 };
            r.autoReset = true; r.reset(); return v })()""")
        info["fps"] = round(info["quadros"] / 10, 1)
        saida[nome] = {"render": info, **_resumir(perfil)}
    cdp.js("for (const k in maresia.teclas) maresia.teclas[k] = false")
    return saida


# Inventário da cena: objetos por tipo e nome, quantos recalculam a matriz todo quadro, e as chamadas de
# desenho por objeto em cada passada (M = imagem, S = sombra), média de 30 quadros parado
INVENTARIO_JS = """(async () => {
  const cena = maresia.cena, r = maresia.renderer
  const tipos = {}, malhas = {}
  let auto = 0, autoMundo = 0
  cena.traverse(o => {
    tipos[o.type] = (tipos[o.type] || 0) + 1
    if (o.matrixAutoUpdate) auto++
    if (o.matrixWorldAutoUpdate) autoMundo++
    if (o.isMesh || o.isPoints || o.isLine) {
      const k = (o.name || (o.parent && o.parent.name) || '(sem nome)') + (o.isInstancedMesh ? ' [inst]' : '')
      malhas[k] = (malhas[k] || 0) + 1
    }
  })
  const sm = r.shadowMap, origSombra = sm.render, origDesenho = r.renderBufferDirect
  let emSombra = false
  const desenhos = {}
  sm.render = function (...a) { emSombra = true; try { return origSombra.apply(this, a) } finally { emSombra = false } }
  r.renderBufferDirect = function (cam, sc, geo, mat, obj, grupo) {
    const k = (emSombra ? 'S ' : 'M ') + (obj.name || (obj.parent && obj.parent.name) || obj.type)
    desenhos[k] = (desenhos[k] || 0) + 1
    return origDesenho.call(this, cam, sc, geo, mat, obj, grupo)
  }
  let q = 0
  await new Promise(res => { const f = () => { if (++q >= 30) res(); else requestAnimationFrame(f) }; requestAnimationFrame(f) })
  sm.render = origSombra; r.renderBufferDirect = origDesenho
  const ord = (d, n, div = 1) => Object.entries(d).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [k, Math.round(v / div * 10) / 10])
  let totM = 0, totS = 0
  for (const [k, v] of Object.entries(desenhos)) { if (k.startsWith('S ')) totS += v; else totM += v }
  return { tipos, auto, autoMundo, malhas: ord(malhas, 40), desenhos_por_quadro: ord(desenhos, 60, q),
           total_imagem: Math.round(totM / q), total_sombra: Math.round(totS / q) }
})()"""


@app.function(gpu="L4", image=imagem_perfil, timeout=30 * 60, cpu=4, memory=8192)
def inventariar() -> dict:
    cdp = _subir_jogo()
    return cdp.js(INVENTARIO_JS)


@app.local_entrypoint()
def inventario():
    r = inventariar.remote()
    pasta = Path(__file__).parent / "testes"
    pasta.mkdir(exist_ok=True)
    (pasta / "inventario.json").write_text(json.dumps(r, ensure_ascii=False, indent=1))
    print(json.dumps({k: r[k] for k in ("tipos", "auto", "autoMundo", "total_imagem", "total_sombra")}, ensure_ascii=False))
    print("malhas:", r["malhas"])
    print("desenhos por quadro:")
    for k, v in r["desenhos_por_quadro"]:
        print(f"  {v:7}  {k}")


# A/B na mesma máquina (rodadas diferentes caem em servidores diferentes e variam 10+ FPS): alterna
# ligado/desligado 3 vezes em cada cenário, 6 s cada, e mede FPS e a fatia de algumas funções
@app.function(gpu="L4", image=imagem_perfil, timeout=30 * 60, cpu=4, memory=8192)
def ab(js_ligar: str, js_desligar: str, funcoes: list) -> dict:
    cdp = _subir_jogo()
    cdp("Profiler.enable")
    cdp("Profiler.setSamplingInterval", interval=250)
    cdp.js("if (!window.__contando) { window.__contando = true; window.__q = 0; const f = () => { window.__q++; requestAnimationFrame(f) }; requestAnimationFrame(f) }")
    saida = {}
    for cenario in ("parado", "andando"):
        teclas = CENARIOS[cenario]
        cdp.js("for (const k in maresia.teclas) maresia.teclas[k] = false;" +
               "".join(f"maresia.teclas.{k} = {json.dumps(v)};" for k, v in teclas.items()))
        res = {"ligado": [], "desligado": []}
        for rodada in range(6):
            modo = "ligado" if rodada % 2 == 0 else "desligado"
            cdp.js(js_ligar if modo == "ligado" else js_desligar)
            time.sleep(2)
            q0 = cdp.js("window.__q")
            cdp("Profiler.start")
            time.sleep(6)
            perfil = cdp("Profiler.stop")["profile"]
            fps = round((cdp.js("window.__q") - q0) / 6, 1)
            r = _resumir(perfil)
            fatia = round(sum(pct for k, ms, pct in r["funcoes"] if k.startswith(tuple(funcoes))), 1)
            res[modo].append({"fps": fps, "fatia": fatia})
        saida[cenario] = res
    return saida


@app.local_entrypoint()
def congelamento():
    r = ab.remote("window.__alternarCongelamento(true)", "window.__alternarCongelamento(false)",
                  ["updateMatrixWorld", "multiplyMatrices", "compose", "updateMatrix "])
    for cen, res in r.items():
        for modo, lista in res.items():
            fps = [x["fps"] for x in lista]
            print(f"{cen:8s} {modo:9s} fps {fps} média {sum(fps) / len(fps):.1f} | fatia matriz {[x['fatia'] for x in lista]}")


@app.local_entrypoint()
def main():
    r = perfilar.remote()
    pasta = Path(__file__).parent / "testes"
    pasta.mkdir(exist_ok=True)
    (pasta / "perfil.json").write_text(json.dumps(r, ensure_ascii=False, indent=1))
    for nome, c in r.items():
        print(f"\n===== {nome}: {c['render']}")
        print("  por arquivo (ms em 10 s, %):")
        for k, ms, pct in c["arquivos"][:15]:
            print(f"    {pct:5.1f}%  {ms:7.1f}  {k}")
        print("  funções:")
        for k, ms, pct in c["funcoes"][:20]:
            print(f"    {pct:5.1f}%  {ms:7.1f}  {k}")
