"""Mede o rosto do desenho aprovado (cabeça de frente e de perfil) em unidades de E = distância olho-queixo.
Saída: ajuste/alvo.json, usado pelo ajuste automático do MakeHuman."""
import json
import numpy as np
from PIL import Image

def mascara(caminho):
    a = np.array(Image.open(caminho).convert("RGB")).astype(int)
    return np.abs(a - a[5, 5]).sum(-1) > 45

# ---- frente: pupilas (450,450) e (608,450), queixo y=672 ----
f = mascara("entradas/3d/cabeca-final-frente.png")
OLHO_Y, QUEIXO_Y, CX = 450, 672, 529
E = QUEIXO_Y - OLHO_Y
frente = {"interocular": (608 - 450) / E, "nariz_largura": 88 / E, "boca_largura": 96 / E, "larguras": {}}
for h in (0.70, 0.80, 0.90, 0.97):
    y = int(OLHO_Y + h * E); xs = np.nonzero(f[y])[0]
    frente["larguras"][f"{h:.2f}"] = (xs.max() - xs.min()) / 2 / E
# ---- perfil (virado para a direita): olho y=445, queixo y=665; contorno da frente por linha ----
p = mascara("entradas/3d/cabeca-final-perfil.png")
OLHO_Y, QUEIXO_Y = 445, 665
E = QUEIXO_Y - OLHO_Y
def frente_x(y): return np.nonzero(p[y])[0].max()
ref = frente_x(int(OLHO_Y - 0.18 * E))  # testa/sobrancelha
perfil = {}
for h in np.arange(0.0, 1.01, 0.05):
    perfil[f"{h:.2f}"] = (frente_x(int(OLHO_Y + h * E)) - ref) / E
json.dump({"frente": frente, "perfil": perfil}, open("ajuste/alvo.json", "w"), indent=1)
print(json.dumps({"frente": frente, "perfil": perfil}, indent=1))
