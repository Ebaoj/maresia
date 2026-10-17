"""Torna uma textura gerada contínua (sem emenda ao repetir) e salva no tamanho do jogo.

Como: em cada direção, a imagem deslocada pela metade já emenda nas bordas, mas ganha uma emenda no
meio; a original é contínua no meio e quebra nas bordas. Mistura as duas: perto da borda vale a
deslocada, no meio vale a original. Pintura aguenta bem a transição (vira só mais pincelada).

Uso: python3 costurar.py entrada.png saida.jpg [tamanho] [corte do topo]
"""
import sys

from PIL import Image
import numpy as np


def _rampa(n):
    """0 no meio, 1 na borda, subindo suave a partir de 40% do caminho."""
    t = np.abs(np.arange(n) - (n - 1) / 2) / ((n - 1) / 2)
    x = np.clip((t - 0.4) / 0.6, 0, 1)
    return x * x * (3 - 2 * x)


def costurar(img: Image.Image) -> Image.Image:
    # uma direção de cada vez: com as duas juntas, a emenda da deslocada aparecia no meio das bordas
    a = np.asarray(img.convert("RGB"), dtype=np.float32)
    h, w, _ = a.shape
    mx = _rampa(w)[None, :, None]
    a = np.roll(a, w // 2, axis=1) * mx + a * (1 - mx)
    my = _rampa(h)[:, None, None]
    a = np.roll(a, h // 2, axis=0) * my + a * (1 - my)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def normalizar(img: Image.Image) -> Image.Image:
    """Média 0,5 em cada canal: no jogo a textura vira detalhe que multiplica a cor do material
    (média 1 no shader), sem trocar a paleta."""
    a = np.asarray(img, dtype=np.float32)
    a = a * (127.5 / a.reshape(-1, 3).mean(axis=0))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


if __name__ == "__main__":
    # python3 costurar.py entrada.png saida.jpg [tamanho] [corte do topo, 0 a 1: guarda só essa fração de cima]
    entrada, saida = sys.argv[1], sys.argv[2]
    tam = int(sys.argv[3]) if len(sys.argv) > 3 else 512
    img = Image.open(entrada).convert("RGB")
    if len(sys.argv) > 4:
        frac = float(sys.argv[4])
        lado = int(img.height * frac)
        img = img.crop(((img.width - lado) // 2, 0, (img.width - lado) // 2 + lado, lado))
    t = normalizar(costurar(img).resize((tam, tam), Image.LANCZOS))
    t.save(saida, quality=90)
    # prova: 2x2 lado a lado, para ver se a emenda some
    prova = Image.new("RGB", (tam * 2, tam * 2))
    for i in range(2):
        for j in range(2):
            prova.paste(t, (i * tam, j * tam))
    prova.save(saida.rsplit(".", 1)[0] + "-prova-2x2.jpg", quality=80)
