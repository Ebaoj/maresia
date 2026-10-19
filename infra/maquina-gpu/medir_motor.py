# KAN-71: bancada do motor na g4dn. Blocos (jeito atual) contra three-virtual-geometry, alternados, com 20 e 60 mil
# objetos, e o teste de sombra dos dois. Roda DENTRO da máquina, depois de ./maquina.sh enviar:
#   scp medir_motor.py ubuntu@IP:/tmp/ && ssh ... python3 /tmp/medir_motor.py
import json, sys, time, urllib.request, websocket
# argumento opcional: sufixo da URL (ex.: '&laco=timeout' com o Chrome sem limite de quadros)
EXTRA = sys.argv[1] if len(sys.argv) > 1 else ''
alvos = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
pag = next(a for a in alvos if a.get("type") == "page")
ws = websocket.create_connection(pag["webSocketDebuggerUrl"], timeout=180, suppress_origin=True, max_size=None)
n = [0]
def cmd(m, **p):
    n[0] += 1; ws.send(json.dumps({"id": n[0], "method": m, "params": p}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == n[0]: return r.get("result", {})
def js(e):
    return cmd("Runtime.evaluate", expression=e, awaitPromise=True, returnByValue=True).get("result", {}).get("value")
def abrir(url, espera=180):
    cmd("Page.navigate", url=url); time.sleep(3)
    for _ in range(espera):
        try:
            r = js("window.__resultado || null")
        except Exception:
            r = None
        if r: return r
        time.sleep(1)
    return {"erro": f"sem resultado em {espera} s", "url": url}
for modo in ("blocos", "vg"):
    print("sombra", modo, json.dumps(abrir(f"http://localhost:5195/bancada-sombra.html?modo={modo}")), flush=True)
for rodada in range(1):
    for qtd in (20000, 60000):
        for modo in ("blocos", "vg"):
            r = abrir(f"http://localhost:5195/bancada-motor.html?modo={modo}&n={qtd}{EXTRA}")
            print("motor", rodada + 1, json.dumps(r, ensure_ascii=False), flush=True)
