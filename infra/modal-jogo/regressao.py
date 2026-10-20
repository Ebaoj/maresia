"""Mesmos cenários e critérios de regressão, compartilhados por Modal e AWS.

O ambiente prepara o Chrome e entrega um Cdp conectado desde o carregamento.
"""
from cdp import mudar_config

ORDEM = ["semErros", "pesParados", "poseCongelada", "meiaVolta", "meiaVoltaRapida", "meiaVoltaInterrompida", "sentarLevantar",
         "copiasUnicas", "copiasQueCrescem", "sombrasCopias", "pegadasNaAreia", "propriedadeEmJogo", "programasReaproveitados", "semRecompilarParado", "campoDoUrubuVazio", "modoWebgpu"]
# KAN-68: cenários que também rodam com o jogo aberto no WebGPU (dentro de modoWebgpu)
CENARIOS_WEBGPU = ["semErros", "copiasUnicas", "copiasQueCrescem", "sombrasCopias", "pegadasNaAreia", "propriedadeEmJogo", "programasReaproveitados", "semRecompilarParado", "uniformsGlobaisUmaVez", "sombraSemRecalcularChave", "alvosSemLerOQueEscreve"]
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
    motivo = "" if ok else "o modo webgpu não abriu no WebGPU de verdade"
    # R1 do KAN-68: nada pode ficar sem versão no WebGPU (cor de reserva)
    if ok and r.get("faltaPortar"):
        ok = False
        motivo = "peça sem versão no WebGPU: " + ", ".join(f.get("peca", "?") for f in r["faltaPortar"])
    # os mesmos cenários de cópias, sombras e areia, agora no WebGPU (KAN-68)
    if ok:
        r["cenarios"] = {}
        for nome in CENARIOS_WEBGPU:
            try:
                c = cdp.js(f"import('/testes/jogo/cenarios.js').then(m => m.cenarios.{nome}(window.maresia))")
            except Exception as e:
                c = {"ok": False, "motivo": f"o cenário quebrou: {e}"[:300]}
            r["cenarios"][nome] = c
            if not (c or {}).get("ok"):
                ok = False
                motivo = f"no WebGPU, {nome}: {(c or {}).get('motivo', '')}"
    mudar_config(cdp, {"desempenho": {"renderizador": "webgl"}})
    return {"ok": ok, "medidas": r, "motivo": motivo}


CENARIOS_PYTHON["modoWebgpu"] = modo_webgpu
# avisos de console que reprovam (regras do CLAUDE.md do projeto); os outros só aparecem no relatório
AVISOS_QUE_REPROVAM = ("sem saída de luz", "não compilaram", "Congelado e movido")


def executar(cdp, cenarios, progresso=None):
    resultados = {}
    for nome in cenarios:
        if nome in CENARIOS_PYTHON:
            resultados[nome] = CENARIOS_PYTHON[nome](cdp)
            if progresso:
                progresso(nome, resultados[nome])
            continue
        try:
            resultados[nome] = cdp.js(f"import('/testes/jogo/cenarios.js').then(m => m.cenarios.{nome}(window.maresia))")
        except Exception as e:  # o cenário quebrou (ex.: API que não existia no commit antigo)
            resultados[nome] = {"ok": False, "motivo": f"o cenário quebrou: {e}"[:400]}
        if progresso:
            progresso(nome, resultados[nome])
    # o Chrome pede /favicon.ico sozinho; o 404 dele não é do jogo. A fonte do Google Fonts às vezes não
    # carrega dentro do contêiner (ERR_CERT_VERIFIER_CHANGED, rede do Modal, 17/10): também não é do jogo
    externos = ("favicon.ico", "fonts.googleapis.com", "fonts.gstatic.com")
    avisos = [a for a in cdp.avisos() if not any(e in a for e in externos)]
    reprovam = [a for a in avisos if a.startswith(("error", "exceção", "log error")) or any(p in a for p in AVISOS_QUE_REPROVAM)]
    resultados["console"] = {"ok": not reprovam, "medidas": {"reprovam": reprovam[:10], "outros": [a for a in avisos if a not in reprovam][:10]},
                             "motivo": "erro ou aviso proibido no console" if reprovam else ""}
    return resultados
