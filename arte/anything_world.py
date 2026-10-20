# Anything World: rig + animação automáticos de um modelo (ex.: o gato) pela API REST (/animate, 10 créditos).
# A chave vem de AW_API_KEY no ambiente (nunca em arquivo). Uso:
#   AW_API_KEY=... .venv/bin/python anything_world.py MODELO.glb TIPO NOME PASTA_SAIDA
#   ex.: ... anything_world.py finais/gato-meshy/modelo-2k.glb cat frajola finais/gato-anythingworld
# Retoma sem pagar de novo: se PASTA_SAIDA/tarefa.json já tem model_id, só consulta e baixa.
import json, os, sys, time, requests

API = "https://api.anything.world"
CHAVE = os.environ["AW_API_KEY"]
MODELO, TIPO, NOME, SAIDA = sys.argv[1:5]
os.makedirs(SAIDA, exist_ok=True)
ARQ = os.path.join(SAIDA, "tarefa.json")
FIM = {"thumbnails_generation_finished", "formats_conversion_finished", "migrate_animation_finished"}

tarefa = json.load(open(ARQ)) if os.path.exists(ARQ) else {}
if "model_id" not in tarefa:
    with open(MODELO, "rb") as f:
        r = requests.post(f"{API}/animate", timeout=500,
                          data={"key": CHAVE, "model_name": NOME, "model_type": TIPO, "symmetry": "true",
                                "auto_rotate": "true", "auto_classify": "false", "platform": "python"},
                          files=[("files", (os.path.basename(MODELO), f, "model/gltf-binary"))])
    print("envio:", r.status_code, r.text[:300])
    r.raise_for_status()
    tarefa = r.json() if isinstance(r.json(), dict) else r.json()[0]
    json.dump(tarefa, open(ARQ, "w"), indent=1)
mid = tarefa["model_id"]
print("model_id:", mid)

inicio = time.time()
while True:
    r = requests.get(f"{API}/user-processed-model", params={"key": CHAVE, "id": mid}, timeout=120)
    j = r.json()
    j = j[0] if isinstance(j, list) and j else j
    etapa = j.get("stage") if isinstance(j, dict) else None
    print(f"  {int(time.time() - inicio)}s etapa={etapa} http={r.status_code}", flush=True)
    if etapa in FIM or (r.status_code == 200 and isinstance(j, dict) and "model" in j and etapa is None):
        break
    if etapa and ("error" in etapa or "fail" in etapa):
        sys.exit(f"falhou: {json.dumps(j)[:500]}")
    if time.time() - inicio > 3600:
        sys.exit("passou de 1 hora sem terminar")
    time.sleep(20)

json.dump(j, open(os.path.join(SAIDA, "resultado.json"), "w"), indent=1)
# baixa todo arquivo .glb/.fbx/.gif que vier no resultado
urls = {}
def coletar(x, caminho=""):
    if isinstance(x, dict):
        for k, v in x.items(): coletar(v, f"{caminho}.{k}" if caminho else k)
    elif isinstance(x, list):
        for i, v in enumerate(x): coletar(v, f"{caminho}[{i}]")
    elif isinstance(x, str) and x.startswith("http") and any(x.split("?")[0].endswith(e) for e in (".glb", ".gltf", ".fbx", ".gif", ".mp4", ".png")):
        urls[caminho] = x
coletar(j)
for caminho, u in urls.items():
    nome = caminho.replace(".", "_").replace("[", "_").replace("]", "") + os.path.splitext(u.split("?")[0])[1]
    with requests.get(u, stream=True, timeout=300) as d:
        d.raise_for_status()
        with open(os.path.join(SAIDA, nome), "wb") as f:
            for c in d.iter_content(65536): f.write(c)
    print("baixado", nome)
