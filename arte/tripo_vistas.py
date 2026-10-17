# Tripo pela API com várias vistas (frente e costas), para a peça não sair com as costas inventadas.
# Uso (chave do cofre):
#   source ~/.config/talvium-vault/api.sh; TRIPO_API_KEY=$(secret-get tripo_api_key) \
#     .venv/bin/python tripo_vistas.py FRENTE.png COSTAS.png PASTA_SAIDA
#   TRIPO_VERSAO (P2-20260801)
import asyncio, os, sys
from tripo3d import TripoClient, TaskStatus


async def main():
    frente, costas, saida = sys.argv[1:4]
    versao = os.environ.get("TRIPO_VERSAO", "P2-20260801")
    async with TripoClient() as c:
        print("saldo antes:", (await c.get_balance()).balance)
        tid = await c.multiview_to_model(images=[frente, None, costas, None], model_version=versao, texture=True, pbr=False,
                                         texture_quality="detailed", geometry_quality="detailed")
        print("tarefa:", tid, versao)
        t = await c.wait_for_task(tid, verbose=True)
        if t.status != TaskStatus.SUCCESS: sys.exit(f"tarefa {tid} terminou como {t.status}")
        os.makedirs(saida, exist_ok=True)
        for tipo, caminho in (await c.download_task_models(t, saida)).items():
            if caminho: print(f"{tipo}: {caminho}")
        print("saldo depois:", (await c.get_balance()).balance)

asyncio.run(main())
