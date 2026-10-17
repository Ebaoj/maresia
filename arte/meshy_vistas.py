# Meshy pela API: várias vistas da mesma peça (a primeira é a frente) -> modelo 3D texturizado.
# Uso (chave do cofre):
#   source ~/.config/talvium-vault/api.sh; MESHY_API_KEY=$(secret-get api_meshy) \
#     python3 meshy_vistas.py PASTA_SAIDA FRENTE.png [LADO.png COSTAS.png ...]
#   MESHY_MODELO (meshy-7.1)  MESHY_GEOMETRIA (2k)  MESHY_TEXTURA (8k)  MESHY_PBR (1)  MESHY_POSE ("" | a-pose | t-pose)
#   MESHY_FACES (vazio = malha crua; ex.: 30000 = o Meshy já entrega remalhada em quads com esse total)
import base64, json, os, sys, time, urllib.request

API = "https://api.meshy.ai/openapi/v1"
CHAVE = os.environ["MESHY_API_KEY"]


def pedir(metodo, caminho, corpo=None):
    req = urllib.request.Request(API + caminho, method=metodo, data=json.dumps(corpo).encode() if corpo else None,
                                 headers={"Authorization": f"Bearer {CHAVE}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read() or b"{}")


def uri(arq):
    tipo = "png" if arq.lower().endswith(".png") else "jpeg"
    return f"data:image/{tipo};base64," + base64.b64encode(open(arq, "rb").read()).decode()


saida, imagens = sys.argv[1], sys.argv[2:]
print("saldo antes:", pedir("GET", "/balance")["balance"])
corpo = {
    "image_urls": [uri(a) for a in imagens],
    "ai_model": os.environ.get("MESHY_MODELO", "meshy-7.1"),
    "geometry_resolution": os.environ.get("MESHY_GEOMETRIA", "2k"),
    "should_texture": True,
    "texture_resolution": os.environ.get("MESHY_TEXTURA", "8k"),
    "enable_pbr": os.environ.get("MESHY_PBR", "1") == "1",
    "remove_lighting": True,         # tira sombra e brilho embutidos da cor
    "image_enhancement": False,      # mantém o estilo da imagem como está
    "should_remesh": bool(os.environ.get("MESHY_FACES")),   # padrão: malha crua em alta; a redução fica para depois
    "pose_mode": os.environ.get("MESHY_POSE", ""),
    "target_formats": ["glb"],
    **({"topology": "quad", "target_polycount": int(os.environ["MESHY_FACES"])} if os.environ.get("MESHY_FACES") else {}),
    "multi_view_thumbnails": True,
}
tid = pedir("POST", "/multi-image-to-3d", corpo)["result"]
print("tarefa:", tid, corpo["ai_model"], corpo["geometry_resolution"], corpo["texture_resolution"])
while True:
    t = pedir("GET", f"/multi-image-to-3d/{tid}")
    if t["status"] in ("SUCCEEDED", "FAILED", "CANCELED"): break
    print(f"  {t['status']} {t.get('progress', 0)}%", flush=True); time.sleep(15)
if t["status"] != "SUCCEEDED": sys.exit(f"terminou como {t['status']}: {t.get('task_error')}")
os.makedirs(saida, exist_ok=True)
json.dump(t, open(os.path.join(saida, "tarefa.json"), "w"), indent=1)
baixar = {"modelo.glb": t["model_urls"].get("glb")}
for k, u in (t.get("thumbnail_urls") or {}).items(): baixar[f"vista-{k}.png"] = u
for k, u in (t.get("texture_urls") or [{}])[0].items() if isinstance(t.get("texture_urls"), list) else (t.get("texture_urls") or {}).items():
    baixar[f"textura-{k}.png"] = u
for nome, u in baixar.items():
    if u: urllib.request.urlretrieve(u, os.path.join(saida, nome)); print("baixado", nome)
print("créditos da tarefa:", t.get("consumed_credits"), "| saldo depois:", pedir("GET", "/balance")["balance"])
