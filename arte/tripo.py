# Tripo pela API (SDK oficial tripo3d 1.x, apiv3): imagem -> modelo 3D (.glb) sem abrir o site.
# Rodar só via arte/tripo.sh, que pega a chave tripo_api_key do cofre.
#   ./tripo.sh saldo
#   ./tripo.sh gerar entradas/jangadeiro.png finais/jangadeiro [--partes] [--modelo v2.5-20250123] [--faces 40000]
#   ./tripo.sh baixar TASK_ID finais/jangadeiro
# Depois: Blender -b --python blender/tripo_rig.py -- finais/jangadeiro/<arquivo>.glb finais/jangadeiro
# Personagem: prefira tripo_partes.py + tripo_rigar.py (fluxo da sessão do 3D). P2 custa ~120 créditos.
# Cada "gerar" gasta crédito da API (separado da assinatura do site): confira o saldo antes.
import argparse, asyncio, os, sys
from tripo3d import TripoClient, TaskStatus


async def saldo(c, a):
    b = await c.get_balance()
    print(f"saldo: {b.balance}  congelado: {b.frozen}")


async def baixar_tarefa(c, task_id, saida):
    t = await c.wait_for_task(task_id, verbose=True)
    if t.status != TaskStatus.SUCCESS:
        sys.exit(f"tarefa {task_id} terminou como {t.status}")
    os.makedirs(saida, exist_ok=True)
    for tipo, caminho in (await c.download_task_models(t, saida)).items():
        if caminho: print(f"{tipo}: {caminho}")


async def gerar(c, a):
    if not os.path.isfile(a.imagem): sys.exit(f"imagem não existe: {a.imagem}")
    task_id = await c.image_to_model(image=a.imagem, model_version=a.modelo, generate_parts=a.partes,
                                     face_limit=a.faces, texture_quality="detailed", geometry_quality="detailed")
    print(f"tarefa: {task_id}  (se cair, retome com: ./tripo.sh baixar {task_id} {a.saida})")
    await baixar_tarefa(c, task_id, a.saida)


async def baixar(c, a):
    await baixar_tarefa(c, a.task_id, a.saida)


p = argparse.ArgumentParser(description="Tripo pela API")
sub = p.add_subparsers(dest="cmd", required=True)
sub.add_parser("saldo")
g = sub.add_parser("gerar")
g.add_argument("imagem"); g.add_argument("saida")
g.add_argument("--partes", action="store_true", help="modelo em partes (corpo, camisa, calça...)")
g.add_argument("--modelo", default="P2-20260801",
               help="versão do Tripo (P2 aprovado em 17/10; o padrão do SDK, v2.5, saiu bem pior)")
g.add_argument("--faces", type=int, help="limite de faces")
b = sub.add_parser("baixar")
b.add_argument("task_id"); b.add_argument("saida")
a = p.parse_args()


async def main():
    async with TripoClient() as c:
        await {"saldo": saldo, "gerar": gerar, "baixar": baixar}[a.cmd](c, a)

asyncio.run(main())
