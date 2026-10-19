# KAN-73: a cidade de estresse na g4dn (Chrome sem limite de quadros, um desenho por quadro do navegador).
# Roda DENTRO da máquina, depois de ./maquina.sh enviar:  python3 /tmp/medir_cidade.py [rodadas] [sufixo da url]
import json, sys, time, base64, urllib.request, websocket
RODADAS = int(sys.argv[1]) if len(sys.argv) > 1 else 2
EXTRA = sys.argv[2] if len(sys.argv) > 2 else ''
alvos = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
pag = next(a for a in alvos if a.get("type") == "page")
ws = websocket.create_connection(pag["webSocketDebuggerUrl"], timeout=600, suppress_origin=True, max_size=None)
n = [0]
def cmd(m, **p):
    n[0] += 1; ws.send(json.dumps({"id": n[0], "method": m, "params": p}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == n[0]: return r.get("result", {})
def js(e):
    return cmd("Runtime.evaluate", expression=e, awaitPromise=True, returnByValue=True).get("result", {}).get("value")
for rodada in range(RODADAS):
    cmd("Page.navigate", url=f"http://localhost:5195/bancada-cidade.html?segundos=10{EXTRA}")
    time.sleep(3)
    r = None
    for _ in range(400):
        try: r = js("window.__resultado || null")
        except Exception: r = None
        if r: break
        time.sleep(1)
    print("cidade", rodada + 1, json.dumps(r, ensure_ascii=False), flush=True)
    if rodada == 0:
        fotos = js("window.__fotos || {}") or {}
        for nome, f in fotos.items():
            open(f"/tmp/cidade-{nome}.jpg", "wb").write(base64.b64decode(f.split(",", 1)[1]))
        print("fotos", list(fotos), flush=True)
    print("erros", json.dumps(js("(window.__shadersQuebrados || []).slice(0, 3)")), flush=True)
