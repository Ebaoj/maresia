"""Testes de regressão do jogo rodando, num navegador de verdade numa L4 do Modal.

Sobe o jogo como a sessão (jogo.py), ouve o console desde o carregamento e roda os cenários de
testes/jogo/cenarios.js um depois do outro, na mesma página. Falha se algum cenário falhar, se houver
erro ou exceção no console, ou aviso de material sem gLuz, shader quebrado ou objeto congelado movido.

Uso (de arte/):
    ./modal.sh run ../infra/modal-jogo/testar_jogo.py
    ./modal.sh run ../infra/modal-jogo/testar_jogo.py --cenarios meiaVolta,sentarLevantar
Num commit antigo (para ver o teste falhar antes da correção), com um git worktree em PASTA que tenha
testes/jogo/cenarios.js copiado:
    MARESIA_RAIZ=PASTA ./modal.sh run ../infra/modal-jogo/testar_jogo.py
"""
import json
import sys

import modal

from cdp import subir_jogo
from regressao import ORDEM, executar
from jogo import imagem

app = modal.App("maresia-testes")
imagem_testes = imagem.add_local_python_source("jogo", "cdp", "regressao")


@app.function(gpu="L4", image=imagem_testes, timeout=20 * 60, cpu=4, memory=8192)
def rodar(cenarios: list) -> dict:
    cdp = subir_jogo(ouvir_desde_o_inicio=True)
    return executar(cdp, cenarios)


@app.local_entrypoint()
def main(cenarios: str = ""):
    lista = [c for c in cenarios.split(",") if c] or ORDEM
    r = rodar.remote(lista)
    falhas = 0
    for nome, res in r.items():
        ok = bool(res and res.get("ok"))
        falhas += not ok
        print(f"{'PASSOU' if ok else 'FALHOU'}  {nome}  {res.get('motivo', '') if res else 'sem resposta'}")
        print("        " + json.dumps((res or {}).get("medidas"), ensure_ascii=False)[:900])
    print(f"\n{len(r) - falhas} de {len(r)} passaram")
    if falhas:
        sys.exit(1)
