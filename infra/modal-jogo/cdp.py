"""O jogo de pé dentro do contêiner do Modal e a conversa com ele pela depuração do Chrome.

Usado pela medição de desempenho (perfil.py) e pelos testes do jogo rodando (testar_jogo.py).
"""
import json
import subprocess
import time

from jogo import _bg, _chrome


class Cdp:
    """Conversa com a página do jogo pela porta de depuração do Chrome (só dentro do contêiner).
    Guarda em .eventos o que a página avisa sozinha (console, erros), para os testes conferirem."""

    def __init__(self, espera=60):
        import urllib.request

        import websocket
        pagina = None
        for _ in range(espera):
            try:
                alvos = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
                pagina = next((a for a in alvos if a.get("type") == "page" and "5195" in a.get("url", "")), None)
            except OSError:
                pass
            if pagina:
                break
            time.sleep(1)
        self.ws = websocket.create_connection(pagina["webSocketDebuggerUrl"], timeout=180, suppress_origin=True,
                                              max_size=None)
        self.n = 0
        self.eventos = []

    def __call__(self, metodo, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": metodo, "params": params}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get("id") == self.n:
                if "error" in m:
                    raise RuntimeError(m["error"])
                return m.get("result", {})
            if "method" in m:
                self.eventos.append(m)

    def js(self, expressao):
        r = self("Runtime.evaluate", expression=expressao, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description") or r["exceptionDetails"].get("text"))
        return r["result"].get("value")

    def avisos(self):
        """Erros e avisos do console e exceções da página desde a conexão, como texto."""
        saida = []
        for e in self.eventos:
            if e["method"] == "Runtime.consoleAPICalled" and e["params"]["type"] in ("error", "warning"):
                partes = [a.get("value", a.get("description", "")) for a in e["params"]["args"]]
                saida.append(f"{e['params']['type']}: " + " ".join(str(p) for p in partes)[:300])
            elif e["method"] == "Runtime.exceptionThrown":
                d = e["params"]["exceptionDetails"]
                saida.append("exceção: " + str(d.get("exception", {}).get("description") or d.get("text"))[:300])
            elif e["method"] == "Log.entryAdded" and e["params"]["entry"]["level"] in ("error", "warning"):
                ent = e["params"]["entry"]
                saida.append(f"log {ent['level']}: {ent['text'][:200]} {ent.get('url', '')}".strip())
        return saida


def subir_jogo(ouvir_desde_o_inicio=False):
    """Copia o projeto, sobe tela virtual, Vite e Chrome, e espera o jogo terminar de carregar.
    Com ouvir_desde_o_inicio, liga o console antes do carregamento e recarrega a página, para pegar os
    erros do começo também."""
    subprocess.run("rm -rf /tmp/jogo && cp -r /jogo-fonte /tmp/jogo && ln -s /deps/node_modules /tmp/jogo/node_modules", shell=True, check=True)
    _bg("Xvfb :1 -screen 0 1280x720x24 -nolisten tcp")
    _bg("cd /tmp/jogo && npx vite --port 5195 --strictPort --host 127.0.0.1 > /tmp/vite.log 2>&1")
    for _ in range(60):
        if subprocess.run("curl -sf http://127.0.0.1:5195/ > /dev/null", shell=True).returncode == 0:
            break
        time.sleep(1)
    _chrome(1280, 720)
    cdp = Cdp()
    if ouvir_desde_o_inicio:
        cdp("Runtime.enable")
        cdp("Log.enable")
        cdp("Page.reload", ignoreCache=True)
    esperar_pronto(cdp)
    return cdp


def esperar_pronto(cdp):
    """Pronto quando o jogador existe com o corpo animado e já se passaram alguns segundos de jogo."""
    for _ in range(180):
        try:
            if cdp.js("!!(window.maresia && window.maresia.jogador && window.maresia.jogador.animador)"):
                break
        except Exception:  # página recarregando: o contexto some e volta
            pass
        time.sleep(1)
    time.sleep(8)


def mudar_config(cdp, mudancas):
    """Mescla `mudancas` ({secao: {chave: valor}}) na configuração salva do jogo e recarrega a página."""
    js = ("(() => { const K = 'maresia.config.v8'; const v = JSON.parse(localStorage.getItem(K) || '{}'); "
          f"const m = {json.dumps(mudancas)}; for (const s in m) v[s] = Object.assign(v[s] || {{}}, m[s]); "
          "localStorage.setItem(K, JSON.stringify(v)); setTimeout(() => location.reload(), 50); return 1 })()")
    cdp.js(js)
    time.sleep(3)
    esperar_pronto(cdp)
