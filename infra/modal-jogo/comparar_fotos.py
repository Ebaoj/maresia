"""Compara duas pastas de fotos justas (KAN-68 T1): mesmo nome de arquivo, mesmo quadro, renderizadores diferentes
(ou o mesmo renderizador duas vezes, para medir o ruído).

Para cada par sai:
- FLIP médio (NVIDIA ꟻLIP, feito para comparar imagens de renderizadores; 0 = igual, 1 = tudo diferente)
- SSIM (1 = igual) e diferença média absoluta (0 a 255)
- fração de pixels com FLIP acima de 0,1 (onde dá para notar a diferença) e acima de 0,3 (diferença forte)
- o mapa de diferença do FLIP (magma) em <saida>/<nome>-flip.png

Uso (precisa de numpy, pillow, scikit-image e flip-evaluator):
  python comparar_fotos.py PASTA_REFERENCIA PASTA_TESTE [--saida PASTA] [--json ARQ] [--regua]

Com --regua, reprova (código de saída 1) se algum quadro de 1932 passar da régua do KAN-68 (17/10/2026):
FLIP de até 0,05 por quadro, até 3% de pixels com diferença forte por quadro e FLIP médio de até 0,03. Os quadros
de 1881 ficam fora: o efeito de memória vai ser refeito (decisão do Joabe, 17/10).
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def carregar(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) / 255.0


def comparar(ref, teste):
    import flip_evaluator as flip
    from skimage.metrics import structural_similarity

    mapa, media, _ = flip.evaluate(ref, teste, "LDR", applyMagma=False)
    mapa = np.asarray(mapa, dtype=np.float32)
    if mapa.ndim == 3:
        mapa = mapa[..., 0]
    ssim = structural_similarity(ref, teste, channel_axis=2, data_range=1.0)
    return {
        "flip": round(float(media), 4),
        "ssim": round(float(ssim), 4),
        "dif_media": round(float(np.abs(ref - teste).mean() * 255), 2),
        "px_notavel": round(float((mapa > 0.1).mean()), 4),
        "px_forte": round(float((mapa > 0.3).mean()), 4),
    }, mapa


def magma(mapa):
    # mapa de cor simples (preto -> roxo -> laranja -> amarelo), sem matplotlib
    pontos = np.array([[0, 0, 4], [81, 18, 124], [183, 55, 121], [252, 137, 97], [252, 253, 191]], dtype=np.float32)
    x = np.clip(mapa, 0, 1) * (len(pontos) - 1)
    i = np.clip(np.floor(x).astype(int), 0, len(pontos) - 2)
    f = (x - i)[..., None]
    return (pontos[i] * (1 - f) + pontos[i + 1] * f).astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("referencia")
    ap.add_argument("teste")
    ap.add_argument("--saida", default=None)
    ap.add_argument("--json", default=None)
    ap.add_argument("--regua", action="store_true")
    a = ap.parse_args()
    ref_dir, teste_dir = Path(a.referencia), Path(a.teste)
    saida = Path(a.saida) if a.saida else None
    if saida:
        saida.mkdir(parents=True, exist_ok=True)
    resultado = {}
    for p in sorted(ref_dir.glob("*.png")):
        q = teste_dir / p.name
        if not q.exists():
            resultado[p.stem] = {"erro": "sem par"}
            continue
        m, mapa = comparar(carregar(p), carregar(q))
        resultado[p.stem] = m
        if saida:
            Image.fromarray(magma(mapa)).save(saida / f"{p.stem}-flip.png")
        print(f"{p.stem:28s} flip {m['flip']:.4f}  ssim {m['ssim']:.4f}  dif {m['dif_media']:6.2f}  notável {m['px_notavel']:.3f}  forte {m['px_forte']:.3f}")
    if a.json:
        Path(a.json).write_text(json.dumps(resultado, indent=1, ensure_ascii=False))
    if a.regua:
        sys.exit(0 if conferir_regua(resultado) else 1)


REGUA = {"flip_quadro": 0.05, "forte_quadro": 0.03, "flip_medio": 0.03, "epoca": "1932"}


def conferir_regua(resultado):
    quadros = {k: v for k, v in resultado.items() if k.endswith(REGUA["epoca"])}
    if not quadros:
        print("régua: nenhum quadro de", REGUA["epoca"])
        return False
    ruins = []
    for k, v in quadros.items():
        if "erro" in v:
            ruins.append(f"{k}: {v['erro']}")
        elif v["flip"] > REGUA["flip_quadro"] or v["px_forte"] > REGUA["forte_quadro"]:
            ruins.append(f"{k}: flip {v['flip']} forte {v['px_forte']}")
    validos = [v["flip"] for v in quadros.values() if "flip" in v]
    medio = sum(validos) / max(1, len(validos))
    if medio > REGUA["flip_medio"]:
        ruins.append(f"FLIP médio {medio:.4f}")
    print(f"régua ({len(quadros)} quadros de {REGUA['epoca']}, FLIP médio {medio:.4f}):", "PASSOU" if not ruins else "REPROVOU")
    for r in ruins:
        print("  ", r)
    return not ruins


if __name__ == "__main__":
    main()
