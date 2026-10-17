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

from cdp import mudar_config, subir_jogo
from jogo import imagem

app = modal.App("maresia-testes")
imagem_testes = imagem.add_local_python_source("jogo", "cdp")

ORDEM = ["semErros", "pesParados", "poseCongelada", "meiaVolta", "meiaVoltaRapida", "meiaVoltaInterrompida", "sentarLevantar",
         "modoWebgpu"]
# cenários que recarregam a página com outra configuração: rodam aqui, em Python, e por último
CENARIOS_PYTHON = {}


# KAN-67 (motor F1): com desempenho.renderizador = 'webgpu', o jogo abre no WebGPURenderer, no backend
# WebGPU de verdade (não no reserva WebGL2), desenha quadros e não quebra shader. Volta para webgl no fim.
def modo_webgpu(cdp):
    mudar_config(cdp, {"desempenho": {"renderizador": "webgpu"}})
    try:
        r = cdp.js("""(async () => {
          const m = window.maresia
          if (!m || !m.renderer) return { erro: 'o jogo não abriu' }
          const r = m.renderer
          let q = 0, vivo = true
          const f = () => { if (!vivo) return; q++; requestAnimationFrame(f) }
          requestAnimationFrame(f)
          await new Promise((res) => setTimeout(res, 3000))
          vivo = false
          const backend = r.backend ? (r.backend.isWebGPUBackend ? 'webgpu' : r.backend.isWebGLBackend ? 'webgl2-reserva' : '?') : 'webgl (renderer antigo)'
          return { webgpuRenderer: !!r.isWebGPURenderer, backend, quadros3s: q, temGpu: !!navigator.gpu, faltaPortar: window.__faltaPortar || null,
                   shadersQuebrados: (window.__shadersQuebrados || []).length }
        })()""")
    except Exception as e:
        r = {"erro": str(e)[:300]}
    ok = bool(r) and not r.get("erro") and r.get("webgpuRenderer") and r.get("backend") == "webgpu" and (r.get("quadros3s") or 0) > 30 \
        and (r.get("shadersQuebrados") or 0) == 0
    mudar_config(cdp, {"desempenho": {"renderizador": "webgl"}})
    return {"ok": ok, "medidas": r, "motivo": "" if ok else "o modo webgpu não abriu no WebGPU de verdade"}


CENARIOS_PYTHON["modoWebgpu"] = modo_webgpu
# avisos de console que reprovam (regras do CLAUDE.md do projeto); os outros só aparecem no relatório
AVISOS_QUE_REPROVAM = ("sem saída de luz", "não compilaram", "Congelado e movido")


@app.function(gpu="L4", image=imagem_testes, timeout=20 * 60, cpu=4, memory=8192)
def rodar(cenarios: list) -> dict:
    cdp = subir_jogo(ouvir_desde_o_inicio=True)
    resultados = {}
    for nome in cenarios:
        if nome in CENARIOS_PYTHON:
            resultados[nome] = CENARIOS_PYTHON[nome](cdp)
            continue
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
