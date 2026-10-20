# Auto-rig do Tripo (esqueleto no padrão Mixamo, com dedos) sobre um modelo já gerado na API.
# Uso: source ~/.config/talvium-vault/api.sh; TRIPO_API_KEY=$(secret-get tripo_api_key) \
#        .venv/bin/python tripo_rigar.py TASK_ID_DO_MODELO PASTA_SAIDA
import asyncio, os, sys
from tripo3d import TripoClient, TaskStatus

async def main():
    tid, saida = sys.argv[1], sys.argv[2]
    async with TripoClient() as c:
        print("saldo antes:", (await c.get_balance()).balance)
        chk = await c.check_riggable(original_model_task_id=tid)
        t = await c.wait_for_task(chk, verbose=False)
        print("riggable:", t.status, getattr(t, "output", None))
        r = await c.rig_model(original_model_task_id=tid, model_version=os.environ.get("TRIPO_VERSAO_RIG", "v3.0-20260909"), out_format="glb", rig_type="biped", spec="mixamo")
        print("rig:", r)
        t = await c.wait_for_task(r, verbose=True)
        if t.status != TaskStatus.SUCCESS: sys.exit(f"rig terminou como {t.status}")
        os.makedirs(saida, exist_ok=True)
        for tipo, caminho in (await c.download_task_models(t, saida)).items():
            if caminho: print(f"{tipo}: {caminho}")
        print("saldo depois:", (await c.get_balance()).balance)

asyncio.run(main())
