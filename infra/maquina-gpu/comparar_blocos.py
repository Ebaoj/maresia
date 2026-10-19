# WebGL contra WebGPU na máquina com placa de vídeo (g4dn), alternados 3 vezes no mesmo Chrome (KAN-67 R3, KAN-68 R7).
# Roda DENTRO da máquina, depois de ./maquina.sh enviar (o Chrome dela abre com --remote-debugging-port=9222):
#   scp -i ~/.ssh/maresia-gpu.pem comparar_renderizadores.py ubuntu@IP:/tmp/ && ssh ... python3 /tmp/comparar_renderizadores.py
# Para cada renderizador e rodada: tempo até o primeiro quadro desenhado, FPS parado e andando (8 s cada),
# chamadas de desenho por quadro, ms de CPU por quadro andando e CPU do processo da placa. Saída em /tmp/ab-aws.json.
import json, subprocess, time, urllib.request, websocket
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
    const chamadas = r.info.render.calls ?? r.info.render.drawCalls ?? 0
    const v = { fps: Math.round(q / 8 * 10) / 10, chamadas: Math.round(chamadas / Math.max(1, q)) }
    r.info.autoReset = true; r.info.reset()
    return v
  }
  const parado = await medir({})
  const andando = await medir({ frente: true, girarEsq: true })
  for (const k in m.teclas) m.teclas[k] = false
  return { parado, andando, backend: r.isWebGPURenderer ? (r.backend.isWebGPUBackend ? 'webgpu' : 'webgl2-reserva') : 'webgl' }
})()"""
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
def pronto():
    # espera o primeiro quadro desenhado de verdade (no WebGPU a montagem dos shaders leva de 10 a 25 s); medir
    # antes disso mistura a montagem com o FPS
    for _ in range(240):
        try:
            if js("!!(window.maresia && maresia.jogador && maresia.jogador.animador && window.__primeiroQuadroMs)"): break
        except Exception: pass
        time.sleep(1)
    time.sleep(5)
def modo(r, extra=None, depois=None):
    ext = json.dumps(extra or {})
    js("(() => { const K = 'maresia.config.v8'; const v = JSON.parse(localStorage.getItem(K) || '{}'); const d = v.desempenho || {}; delete d.tamBloco; delete d.tamBlocoMax; delete d.copiasMinBloco; v.desempenho = Object.assign(d, { renderizador: '%s' }, %s); localStorage.setItem(K, JSON.stringify(v)) })()" % (r, ext))
    cmd("Page.navigate", url="http://localhost:5195/")
    time.sleep(3); pronto()
    if depois: js(depois)
def cpu_gpu():
    pid = subprocess.run("pgrep -f 'type=gpu-process' | head -1", shell=True, capture_output=True, text=True).stdout.strip()
    r = subprocess.run(f"top -b -n 2 -d 3 -p {pid} | awk '/^top -/{{n++}} n==2 && $1=={pid} {{print $9}}'", shell=True, capture_output=True, text=True).stdout.strip()
    try: return float(r.split()[-1].replace(",", "."))
    except Exception: return None
def ms_cpu():
    cmd("Profiler.enable"); cmd("Profiler.setSamplingInterval", interval=500)
    js("for (const k in maresia.teclas) maresia.teclas[k] = false; maresia.teclas.frente = true; maresia.teclas.girarEsq = true; window.__q = 0; window.__qv = true; (function f() { if (!window.__qv) return; window.__q++; requestAnimationFrame(f) })()")
    time.sleep(1); q0 = js("window.__q"); cmd("Profiler.start"); time.sleep(5)
    perfil = cmd("Profiler.stop")["profile"]; q = js("window.__q") - q0
    js("window.__qv = false; for (const k in maresia.teclas) maresia.teclas[k] = false")
    nos = {x["id"]: x["callFrame"]["functionName"] for x in perfil["nodes"]}
    ocupado = sum(dt for no, dt in zip(perfil["samples"], perfil["timeDeltas"]) if nos.get(no) not in ("(idle)", "(program)")) / 1000
    return round(ocupado / max(1, q), 2)
ESCONDER = "(() => { let n = 0; maresia.cena.traverse(o => { if (o.isInstancedMesh && o.visible && o.name !== 'grama') { o.visible = false; n++ } }); return n })()"
VARIANTES = [("webgl", "webgl", {}, None), ("webgpu-192", "webgpu", {}, None), ("webgpu-768", "webgpu", {"tamBloco": 768, "tamBlocoMax": 1536}, None), ("webgpu-semcopias", "webgpu", {}, ESCONDER)]
saida = {v[0]: [] for v in VARIANTES}
for rodada in range(2):
    for nome, r, extra, depois in VARIANTES:
        modo(r, extra, depois)
        m = js(MEDIR_JS)
        m["primeiroQuadroMs"] = js("window.__primeiroQuadroMs"); m["msCpuPorQuadro"] = ms_cpu(); m["cpuProcessoGpu"] = cpu_gpu()
        saida[nome].append(m); print(nome, rodada + 1, json.dumps(m, ensure_ascii=False), flush=True)
modo("webgl")
json.dump(saida, open("/tmp/ab-blocos.json", "w"), ensure_ascii=False, indent=1)
