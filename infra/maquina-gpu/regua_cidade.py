# KAN-73: régua da cidade de estresse na g4dn. Reprova (sai com 1) se algum trecho do passeio ficar abaixo de
# 80 FPS ou se a abertura (até o primeiro quadro) passar de 15 s, na mediana das rodadas. Tem de ser vista
# reprovando numa cidade grande demais (ex.: 60000 casas), senão não prova nada.
# Roda DENTRO da máquina, depois de ./maquina.sh enviar:
#   python3 /tmp/regua_cidade.py CASAS [rodadas] [sufixo da url]
# Ex.: python3 /tmp/regua_cidade.py 15000 3 '&preparado=1&terreno=b'
import json, sys, time, statistics, urllib.request, websocket

FPS_MIN = 80
ABERTURA_MAX_MS = 15000
CASAS = int(sys.argv[1])
RODADAS = int(sys.argv[2]) if len(sys.argv) > 2 else 3
EXTRA = sys.argv[3] if len(sys.argv) > 3 else '&preparado=1&terreno=b'

alvos = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
pag = next(a for a in alvos if a.get("type") == "page")
ws = websocket.create_connection(pag["webSocketDebuggerUrl"], timeout=30, suppress_origin=True, max_size=None)
n = [0]
def cmd(m, **p):
    n[0] += 1; ws.send(json.dumps({"id": n[0], "method": m, "params": p}))
    while True:
        r = json.loads(ws.recv())
        if r.get("method") in ("Inspector.targetCrashed", "Inspector.detached"):
            raise RuntimeError("o processo da bancada foi encerrado pelo navegador")
        if r.get("id") == n[0]: return r.get("result", {})
def js(e):
    return cmd("Runtime.evaluate", expression=e, awaitPromise=True, returnByValue=True).get("result", {}).get("value")

resultados = []
for rodada in range(RODADAS):
    cmd("Page.navigate", url=f"http://localhost:5195/bancada-cidade.html?casas={CASAS}&segundos=10{EXTRA}")
    time.sleep(3)
    r = None
    prazo = time.monotonic() + 120
    while time.monotonic() < prazo:
        try: r = js("window.__resultado || null")
        except Exception as e:
            r = {"erro": str(e)}
            break
        if r: break
        time.sleep(1)
    if not r or r.get("erro") or not r.get("trechos"):
        print("REPROVA: a bancada não terminou", json.dumps(r, ensure_ascii=False)[:600], flush=True)
        sys.exit(1)
    if r.get("casas") != CASAS:
        print(f"REPROVA: pediu {CASAS} casas, a bancada gerou {r.get('casas')}", flush=True)
        sys.exit(1)
    resultados.append(r)
    print("rodada", rodada + 1, json.dumps({k: r[k] for k in ("casas", "copias", "msPrimeiroQuadro", "trechos")}, ensure_ascii=False), flush=True)

falhas = []
abertura = statistics.median(r["msPrimeiroQuadro"] for r in resultados)
if abertura > ABERTURA_MAX_MS: falhas.append(f"abertura {abertura / 1000:.1f} s > {ABERTURA_MAX_MS / 1000:.0f} s")
for r in resultados:
    vg = r.get("vg")
    if not isinstance(vg, dict) or "estourou" not in vg:
        falhas.append("as estatísticas de capacidade da geometria virtual não foram lidas")
    elif vg["estourou"]:
        falhas.append("a geometria virtual excedeu a capacidade de desenho")
for trecho in resultados[0]["trechos"]:
    for r in resultados:
        geo = r["trechos"][trecho].get("geometria", {})
        if "estourou" not in geo:
            falhas.append(f"{trecho}: capacidade não medida")
        elif geo["estourou"]:
            falhas.append(f"{trecho}: geometria excedeu a capacidade de desenho")
    fps = statistics.median(r["trechos"][trecho]["fps"] for r in resultados)
    print(f"  {trecho}: {fps:.0f} FPS", flush=True)
    if fps < FPS_MIN: falhas.append(f"{trecho} {fps:.0f} FPS < {FPS_MIN}")
erros = js("(window.__shadersQuebrados || []).slice(0, 3)")
if erros: falhas.append(f"shader quebrado: {erros}")
print(f"abertura {abertura / 1000:.1f} s; {CASAS} casas", flush=True)
if falhas:
    print("REPROVA: " + "; ".join(falhas), flush=True)
    sys.exit(1)
print("PASSA", flush=True)
