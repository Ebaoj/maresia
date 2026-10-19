# KAN-71: por que a three-virtual-geometry não desenha na g4dn? Abre a bancada no modo vg com poucos objetos, junta
# as mensagens do console (erros de validação do WebGPU) e os recursos e limites da placa.
import json, time, urllib.request, websocket
alvos = json.load(urllib.request.urlopen("http://127.0.0.1:9222/json", timeout=5))
pag = next(a for a in alvos if a.get("type") == "page")
ws = websocket.create_connection(pag["webSocketDebuggerUrl"], timeout=180, suppress_origin=True, max_size=None)
n = [0]; eventos = []
def cmd(m, **p):
    n[0] += 1; ws.send(json.dumps({"id": n[0], "method": m, "params": p}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == n[0]: return r.get("result", {})
        if r.get("method") in ("Runtime.consoleAPICalled", "Log.entryAdded", "Runtime.exceptionThrown"): eventos.append(r)
def js(e):
    return cmd("Runtime.evaluate", expression=e, awaitPromise=True, returnByValue=True).get("result", {}).get("value")
cmd("Runtime.enable"); cmd("Log.enable")
cmd("Page.navigate", url="http://localhost:5195/bancada-motor.html?modo=vg&n=2000")
for _ in range(90):
    time.sleep(1)
    try:
        if js("!!window.__resultado"): break
    except Exception: pass
print("resultado", json.dumps(js("window.__resultado"), ensure_ascii=False)[:1500], flush=True)
print("placa", json.dumps(js("""(async () => { const a = await navigator.gpu.requestAdapter(); const i = a.info || {};
  return { vendor: i.vendor, arquitetura: i.architecture, descricao: i.description, recursos: [...a.features].sort(),
    limites: Object.fromEntries(['maxStorageBuffersPerShaderStage','maxStorageBufferBindingSize','maxComputeWorkgroupStorageSize','maxComputeInvocationsPerWorkgroup','maxBufferSize','maxColorAttachmentBytesPerSample','maxStorageTexturesPerShaderStage'].map(k => [k, a.limits[k]])) } })()"""), ensure_ascii=False), flush=True)
time.sleep(2)
try: cmd("Runtime.evaluate", expression="1")
except Exception: pass
vistos = set()
for e in eventos:
    p = e.get("params", {})
    if e["method"] == "Runtime.consoleAPICalled":
        txt = p.get("type", "") + " " + " ".join(str(a.get("value", a.get("description", "")))[:400] for a in p.get("args", []))
    elif e["method"] == "Log.entryAdded":
        txt = p["entry"].get("level", "") + " " + p["entry"].get("text", "")[:400]
    else:
        txt = "exceção " + json.dumps(p.get("exceptionDetails", {}))[:400]
    chave = txt[:160]
    if chave in vistos: continue
    vistos.add(chave)
    if any(k in txt.lower() for k in ("error", "erro", "warn", "invalid", "exce")):
        print("console", txt.replace("\n", " | ")[:600], flush=True)
print("fim", len(eventos), "mensagens", flush=True)
