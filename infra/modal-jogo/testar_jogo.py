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
from jogo import imagem

app = modal.App("maresia-testes")
imagem_testes = imagem.add_local_python_source("jogo", "cdp")

ORDEM = ["semErros", "pesParados", "meiaVolta", "meiaVoltaRapida", "sentarLevantar"]
# avisos de console que reprovam (regras do CLAUDE.md do projeto); os outros só aparecem no relatório
AVISOS_QUE_REPROVAM = ("sem saída de luz", "não compilaram", "Congelado e movido")


@app.function(gpu="L4", image=imagem_testes, timeout=20 * 60, cpu=4, memory=8192)
def rodar(cenarios: list) -> dict:
    cdp = subir_jogo(ouvir_desde_o_inicio=True)
    resultados = {}
    for nome in cenarios:
        try:
            resultados[nome] = cdp.js(f"import('/testes/jogo/cenarios.js').then(m => m.cenarios.{nome}(window.maresia))")
        except Exception as e:  # o cenário quebrou (ex.: API que não existia no commit antigo)
            resultados[nome] = {"ok": False, "motivo": f"o cenário quebrou: {e}"[:400]}
    # o Chrome pede /favicon.ico sozinho; o 404 dele não é do jogo
    avisos = [a for a in cdp.avisos() if "favicon.ico" not in a]
    reprovam = [a for a in avisos if a.startswith(("error", "exceção", "log error")) or any(p in a for p in AVISOS_QUE_REPROVAM)]
    resultados["console"] = {"ok": not reprovam, "medidas": {"reprovam": reprovam[:10], "outros": [a for a in avisos if a not in reprovam][:10]},
                             "motivo": "erro ou aviso proibido no console" if reprovam else ""}
    return resultados


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
