# Tripo pela API em dois passos, para modelo EM PARTES e texturizado (a API não aceita os dois de uma vez):
#   1) imagem -> modelo em partes sem textura;  2) textura sobre esse modelo.
# Uso (chave do cofre, como o tripo.sh):
#   source ~/.config/talvium-vault/api.sh; TRIPO_API_KEY=$(secret-get tripo_api_key) \
#     .venv/bin/python tripo_partes.py IMAGEM PASTA_SAIDA
# Retomar a textura de um modelo já gerado:  ... tripo_partes.py --textura TASK_ID PASTA_SAIDA
import asyncio, os, sys
from tripo3d import TripoClient, TaskStatus


async def esperar(c, tid, rotulo):
    t = await c.wait_for_task(tid, verbose=True)
    if t.status != TaskStatus.SUCCESS: sys.exit(f"{rotulo} {tid} terminou como {t.status}")
    return t


async def main():
    a = sys.argv[1:]
    async with TripoClient() as c:
        print("saldo antes:", (await c.get_balance()).balance)
        if a[0] == "--textura":
            base, saida = a[1], a[2]
        else:
            imagem, saida = a[0], a[1]
            VERSAO = os.environ.get("TRIPO_VERSAO", "P2-20260801")   # o padrão do SDK (v2.5) é bem pior
            try:   # o modelo novo talvez aceite partes e textura juntas (P2 aceita, mas devolve uma peça só)
                if os.environ.get("TRIPO_DOIS_PASSOS"): raise RuntimeError("dois passos pedidos")
                base = await c.image_to_model(image=imagem, model_version=VERSAO, generate_parts=True, texture=True, pbr=False,
                                              texture_quality="detailed", geometry_quality="detailed")
                print("partes+textura num pedido só:", base); t = await esperar(c, base, "modelo")
                os.makedirs(saida, exist_ok=True)
                for tipo, caminho in (await c.download_task_models(t, saida)).items():
                    if caminho: print(f"{tipo}: {caminho}")
                print("saldo depois:", (await c.get_balance()).balance); return
            except Exception as e:
                print("não aceitou partes+textura juntas:", str(e)[:200])
            base = await c.image_to_model(image=imagem, model_version=VERSAO, generate_parts=True, texture=False, pbr=False,
                                          geometry_quality="detailed")
            print("partes:", base, "(retomar a textura com --textura", base, saida + ")")
            await esperar(c, base, "partes")
        tx = await c.texture_model(original_model_task_id=base, texture=True, pbr=False, texture_quality="detailed",
                                   model_version=os.environ.get("TRIPO_VERSAO_TEXTURA", "P2-20260801"))
        print("textura:", tx)
        t = await esperar(c, tx, "textura")
        os.makedirs(saida, exist_ok=True)
        for tipo, caminho in (await c.download_task_models(t, saida)).items():
            if caminho: print(f"{tipo}: {caminho}")
        print("saldo depois:", (await c.get_balance()).balance)

asyncio.run(main())
