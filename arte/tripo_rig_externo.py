# Modelo humanoide feito fora do Tripo (ex.: Meshy) -> esqueleto Mixamo do Tripo (65 ossos, com dedos).
# Passos: importa o .glb (grátis), confere se dá para riggar (grátis) e rigga (spec mixamo, 25 créditos).
# Uso: source ~/.config/talvium-vault/api.sh; TRIPO_API_KEY=$(secret-get tripo_api_key) \
#        .venv/bin/python tripo_rig_externo.py MODELO.glb PASTA_SAIDA      TRIPO_VERSAO_RIG (v3.0-20260909)
# Grava os task ids em PASTA_SAIDA/tarefas.json e pula o passo já feito (retoma sem pagar de novo).
import asyncio, json, os, sys
from tripo3d import TripoClient, TaskStatus

ENTRADA, SAIDA = sys.argv[1], sys.argv[2]
os.makedirs(SAIDA, exist_ok=True)
ARQ = os.path.join(SAIDA, "tarefas.json")
ids = json.load(open(ARQ)) if os.path.exists(ARQ) else {}


async def passo(c, nome, criar):
    if nome not in ids:
        ids[nome] = await criar(); json.dump(ids, open(ARQ, "w"), indent=1)
    t = await c.wait_for_task(ids[nome], verbose=False)
    print(f"{nome}: {t.status} (tarefa {ids[nome]}) | saldo {(await c.get_balance()).balance}")
    if t.status != TaskStatus.SUCCESS: sys.exit(f"{nome} falhou: {t}")
    return t


async def main():
    async with TripoClient() as c:
        print("saldo antes:", (await c.get_balance()).balance)
        await passo(c, "importar", lambda: c.import_model(ENTRADA))
        chk = await passo(c, "conferir", lambda: c.check_riggable(original_model_task_id=ids["importar"]))
        print("  conferência:", getattr(chk, "output", chk))
        t = await passo(c, "riggar", lambda: c.rig_model(original_model_task_id=ids["importar"], out_format="glb", rig_type="biped",
                                                          spec="mixamo", model_version=os.environ.get("TRIPO_VERSAO_RIG", "v3.0-20260909")))
        for tipo, arq in (await c.download_task_models(t, SAIDA)).items():
            if arq: print("baixado", tipo, arq)

asyncio.run(main())
