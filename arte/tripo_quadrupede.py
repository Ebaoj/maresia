# Bicho de quatro patas feito fora do Tripo (ex.: Meshy) -> esqueleto quadrúpede e animação de andar do Tripo.
# Passos: importa o .glb, confere se dá para riggar, rigga como quadrúpede, aplica "preset:quadruped:walk".
# Uso (chave do cofre): source ~/.config/talvium-vault/api.sh; TRIPO_API_KEY=$(secret-get tripo_api_key) \
#   .venv/bin/python tripo_quadrupede.py MODELO.glb PASTA_SAIDA
#   TRIPO_RIG_MODELO (v3.0-20260909)
# Grava os task ids em PASTA_SAIDA/tarefas.json e pula o passo que já tiver id (retoma sem pagar de novo).
import asyncio, json, os, sys
from tripo3d import TripoClient, TaskStatus

ENTRADA, SAIDA = sys.argv[1], sys.argv[2]
os.makedirs(SAIDA, exist_ok=True)
ARQ = os.path.join(SAIDA, "tarefas.json")
ids = json.load(open(ARQ)) if os.path.exists(ARQ) else {}


async def passo(c, nome, criar):
    if nome not in ids:
        ids[nome] = await criar()
        json.dump(ids, open(ARQ, "w"), indent=1)
    t = await c.wait_for_task(ids[nome], verbose=True)
    b = await c.get_balance()
    print(f"{nome}: {t.status} (tarefa {ids[nome]}) | saldo {b.balance}")
    if t.status != TaskStatus.SUCCESS:
        sys.exit(f"{nome} falhou: {t}")
    return t


async def main():
    async with TripoClient() as c:
        print("saldo antes:", (await c.get_balance()).balance)
        await passo(c, "importar", lambda: c.import_model(ENTRADA))
        chk = await passo(c, "conferir", lambda: c.rig_check(ids["importar"]))
        print("  conferência:", getattr(chk, "output", chk))
        modelo = os.environ.get("TRIPO_RIG_MODELO", "v3.0-20260909")
        await passo(c, "riggar", lambda: c.rig(ids["importar"], model=modelo, rig_type="quadruped", out_format="glb"))
        t = await passo(c, "andar", lambda: c.retarget(ids["riggar"], animation="preset:quadruped:walk", out_format="glb"))
        for tipo, arq in (await c.download_task_models(t, SAIDA)).items():
            if arq: print("baixado", tipo, arq)

asyncio.run(main())
