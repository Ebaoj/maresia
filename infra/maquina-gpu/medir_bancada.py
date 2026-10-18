# Bancada do KAN-70 na máquina com placa (g4dn): roda /bancada.html em cada modo, duas vezes, no Chrome da máquina
# (a janela fica na área de trabalho do DCV, então o requestAnimationFrame funciona e o FPS vale).
# Roda DENTRO da máquina, depois de ./maquina.sh enviar:
#   scp -i ~/.ssh/maresia-gpu.pem medir_bancada.py ubuntu@IP:/tmp/ && ssh ... python3 /tmp/medir_bancada.py
import json, sys, time, urllib.request, websocket

MODOS = sys.argv[1:] or ["webgl", "webgpu", "pacote", "webgpu&mrt=1", "pacote&mrt=1"]
alvos = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
pag = next(a for a in alvos if a.get("type") == "page")
ws = websocket.create_connection(pag["webSocketDebuggerUrl"], timeout=120, suppress_origin=True, max_size=None)
n = [0]


def cmd(m, **p):
    n[0] += 1
    ws.send(json.dumps({"id": n[0], "method": m, "params": p}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == n[0]:
            return r.get("result", {})


def js(e):
    return cmd("Runtime.evaluate", expression=e, awaitPromise=True, returnByValue=True).get("result", {}).get("value")


saida = []
for rodada in range(2):
    for modo in MODOS:
        cmd("Page.navigate", url=f"http://localhost:5195/bancada.html?modo={modo}")
        time.sleep(3)
        r = None
        for _ in range(120):
            try:
                r = js("window.__resultado || null")
            except Exception:
                r = None
            if r:
                break
            time.sleep(1)
        r = r or {"erro": "sem resultado em 120 s", "modo": modo}
        r["rodada"] = rodada + 1
        saida.append(r)
        print(json.dumps(r, ensure_ascii=False), flush=True)
json.dump(saida, open("/tmp/bancada.json", "w"), ensure_ascii=False, indent=1)
