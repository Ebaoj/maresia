# Fluxo óptico entre as vistas renderizadas da cabeça neutra e da expressão (passo 2 do expressao_fluxo.py).
# Roda num Python com OpenCV (ex.: ~/Projetos/youtube/.venv/bin/python): python fluxo_cv.py PASTA
# Grava fluxo-<ângulo>.npy (H, W, 2) em pixels, da neutra para a expressão, e uma prévia em cor.
import json, os, sys
import cv2
import numpy as np

pasta = sys.argv[1]
vistas = json.load(open(os.path.join(pasta, "vistas.json")))
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_ULTRAFAST + 2)   # MEDIUM
dis.setFinestScale(0)
for ang in vistas["angulos"]:
    a = cv2.imread(os.path.join(pasta, f"neutra-cor-{int(ang)}.png"), cv2.IMREAD_GRAYSCALE)
    b = cv2.imread(os.path.join(pasta, f"expr-cor-{int(ang)}.png"), cv2.IMREAD_GRAYSCALE)
    f = dis.calc(a, b, None)
    np.save(os.path.join(pasta, f"fluxo-{int(ang)}.npy"), f)
    mag, angulo = cv2.cartToPolar(f[..., 0], f[..., 1])
    hsv = np.zeros((*a.shape, 3), np.uint8); hsv[..., 0] = angulo * 90 / np.pi; hsv[..., 1] = 255
    hsv[..., 2] = np.clip(mag * 25, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(pasta, f"fluxo-{int(ang)}.png"), cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR))
    print(f"FLUXO {int(ang)}: médio {mag.mean():.2f} px, p99 {np.percentile(mag, 99):.1f} px")
