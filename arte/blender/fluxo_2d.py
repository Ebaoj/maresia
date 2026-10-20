# Fluxo da expressão tirado das IMAGENS 2D (neutra x expressão, editadas pelo Codex a partir da mesma imagem, então
# só a expressão muda) e levado para a câmera do render 3D da cabeça neutra. Passo 2 alternativo do expressao_fluxo.py
# (o fluxo entre duas gerações do Meshy trazia mudança de rosto junto). Roda num Python com OpenCV:
#   python fluxo_2d.py PASTA ANG=NEUTRA.png,EXPRESSAO.png [ANG=...]
# PASTA tem os renders neutra-cor-<ANG>.png do passo 1. Grava fluxo-<ANG>.npy (deslocamento em pixels do render)
# e alinhamento-<ANG>.jpg (render sobreposto à imagem) para conferir.
import os, sys
import cv2
import numpy as np

pasta = sys.argv[1]


def mascara_render(rgba): return rgba[..., 3] > 127


def mascara_imagem(bgr):
    fundo = np.median(np.concatenate([bgr[:20].reshape(-1, 3), bgr[:, :20].reshape(-1, 3), bgr[:, -20:].reshape(-1, 3)]), axis=0)
    return np.linalg.norm(bgr.astype(float) - fundo, axis=2) > 25


def caixa(m):
    ys, xs = np.nonzero(m); return xs.min(), xs.max(), ys.min(), ys.max()


for arg in sys.argv[2:]:
    ang, par = arg.split("="); neutra, expr = par.split(",")
    r = cv2.imread(os.path.join(pasta, f"neutra-cor-{ang}.png"), cv2.IMREAD_UNCHANGED)
    a = cv2.imread(neutra); b = cv2.imread(expr)
    mr, ma = mascara_render(r), mascara_imagem(a)
    # palpite inicial pela caixa da silhueta (escala uniforme pela altura) e ajuste fino por ECC em cinza
    x0, x1, y0, y1 = caixa(mr); X0, X1, Y0, Y1 = caixa(ma)
    s = (Y1 - Y0) / (y1 - y0); tx = (X0 + X1) / 2 - s * (x0 + x1) / 2; ty = Y0 - s * y0
    M = np.array([[s, 0, tx], [0, s, ty]], np.float32)            # render -> imagem
    fundo = np.median(a[:20].reshape(-1, 3), axis=0)
    rc = (r[..., :3] * (r[..., 3:] / 255.0) + fundo * (1 - r[..., 3:] / 255.0)).astype(np.uint8)
    alvo = cv2.GaussianBlur(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), (0, 0), 2).astype(np.float32)
    src = cv2.GaussianBlur(cv2.cvtColor(rc, cv2.COLOR_BGR2GRAY), (0, 0), 2).astype(np.float32)
    # ajuste por pontos casados (SIFT): a pintura do Meshy veio da própria imagem, então os detalhes coincidem
    sift = cv2.SIFT_create(4000)
    k1, d1 = sift.detectAndCompute(cv2.cvtColor(rc, cv2.COLOR_BGR2GRAY), mr.astype(np.uint8) * 255)
    k2, d2 = sift.detectAndCompute(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), ma.astype(np.uint8) * 255)
    bons = [m for m, n in cv2.BFMatcher().knnMatch(d1, d2, k=2) if m.distance < 0.75 * n.distance]
    if len(bons) >= 12:
        p1 = np.float32([k1[m.queryIdx].pt for m in bons]); p2 = np.float32([k2[m.trainIdx].pt for m in bons])
        Ms, inl = cv2.estimateAffinePartial2D(p1, p2, method=cv2.RANSAC, ransacReprojThreshold=4.0, maxIters=5000)
        if Ms is not None and inl.sum() >= 12:
            M = Ms.astype(np.float32)
            erro = np.linalg.norm((p1[inl[:, 0] == 1] @ M[:, :2].T + M[:, 2]) - p2[inl[:, 0] == 1], axis=1)
            print(f"ALINHAMENTO {ang}: SIFT {int(inl.sum())}/{len(bons)} pontos, erro mediano {np.median(erro):.1f} px")
        else: print(f"ALINHAMENTO {ang}: SIFT sem consenso, fica a caixa")
    else: print(f"ALINHAMENTO {ang}: poucos pontos ({len(bons)}), fica a caixa")
    arq_p = os.path.join(pasta, f"pontos-{ang}.json")
    if os.path.exists(arq_p):   # pontos marcados à mão (olhos, narinas, boca): afim por mínimos quadrados
        import json
        pp = json.load(open(arq_p)); p1 = np.float32(pp["render"]); p2 = np.float32(pp["imagem"])
        M, _ = cv2.estimateAffine2D(p1, p2, method=cv2.LMEDS)
        erro = np.linalg.norm(p1 @ M[:, :2].T + M[:, 2] - p2, axis=1)
        print(f"ALINHAMENTO {ang}: {len(p1)} pontos à mão, erro máximo {erro.max():.1f} px"); M = M.astype(np.float32)
    # fluxo entre as imagens 2D
    dis = cv2.DISOpticalFlow_create(2); dis.setFinestScale(0)
    F = dis.calc(cv2.cvtColor(a, cv2.COLOR_BGR2GRAY), cv2.cvtColor(b, cv2.COLOR_BGR2GRAY), None)
    # para cada pixel do render: q = M p ; q' = q + F(q) ; p' = M^-1 q' ; desloc = p' - p
    H, W = r.shape[:2]; ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    qx = M[0, 0] * xs + M[0, 1] * ys + M[0, 2]; qy = M[1, 0] * xs + M[1, 1] * ys + M[1, 2]
    f = cv2.remap(F, qx, qy, cv2.INTER_LINEAR, borderValue=0)
    Mi = cv2.invertAffineTransform(M)
    qx2, qy2 = qx + f[..., 0], qy + f[..., 1]
    px2 = Mi[0, 0] * qx2 + Mi[0, 1] * qy2 + Mi[0, 2]; py2 = Mi[1, 0] * qx2 + Mi[1, 1] * qy2 + Mi[1, 2]
    desloc = np.stack([px2 - xs, py2 - ys], axis=2) * mr[..., None]
    np.save(os.path.join(pasta, f"fluxo-{ang}.npy"), desloc.astype(np.float32))
    sobre = cv2.addWeighted(cv2.warpAffine(rc, M, (a.shape[1], a.shape[0])), 0.5, a, 0.5, 0)
    cv2.imwrite(os.path.join(pasta, f"alinhamento-{ang}.jpg"), sobre)
    mag = np.linalg.norm(desloc, axis=2)
    print(f"FLUXO {ang}: escala {np.sqrt(abs(np.linalg.det(M[:, :2]))):.3f}, deslocamento p99 {np.percentile(mag[mr], 99):.1f} px do render")
