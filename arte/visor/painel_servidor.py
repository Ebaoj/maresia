"""Painel do personagem (MPFB) sem Blender na mão: a página manda os deslizantes, este servidor roda o
Blender por trás e devolve as imagens e o modelo. Só escuta em 127.0.0.1.

Uso: .venv/bin/python visor/painel_servidor.py   (abre em http://127.0.0.1:5198/visor/painel.html)
"""
import json
import subprocess
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ARTE = Path(__file__).resolve().parent.parent
BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
SAIDA = ARTE / "saida" / "3d" / "painel"
TRAVA = threading.Lock()

# deslizante (-100..100 ou 0..100) -> alvos do MakeHuman (o lado positivo usa "incr", o negativo "decr")
PARES = {
    "rosto_largura": ["head-scale-horiz"],
    "rosto_gordura": ["head-fat"],
    "macas": ["l-cheek-bones", "r-cheek-bones"],
    "bochechas": ["l-cheek-volume", "r-cheek-volume"],
    "nariz_largura": ["nose-width1", "nose-width2", "nose-width3", "nose-flaring"],
    "nariz_comprimento": ["nose-scale-vert"],
    "olhos_tamanho": ["l-eye-scale", "r-eye-scale"],
    "labios": ["mouth-lowerlip-volume", "mouth-upperlip-volume"],
    "boca_largura": ["mouth-scale-horiz"],
    "queixo_largura": ["chin-width"],
    "queixo_altura": ["chin-height"],
    "testa": ["forehead-scale-vert"],
    "olheiras": ["l-eye-bag", "r-eye-bag"],
}


def montar_parametros(v):
    anos = float(v.get("idade", 15))
    idade = 0.1875 + (anos - 11) / 14 * 0.3125 if anos <= 25 else 0.5
    soma = sum(float(v.get(k, 0)) for k in ("indigena", "africana", "europeia")) or 1
    macros = {
        "gender": 1.0, "age": round(idade, 4),
        "muscle": 0.3 + float(v.get("musculo", 60)) / 100 * 0.5,
        "weight": 0.2 + float(v.get("peso", 35)) / 100 * 0.45,
        "proportions": 0.65, "height": 0.5, "cupsize": 0.5, "firmness": 0.5,
        "race": {"asian": float(v.get("indigena", 45)) / soma, "african": float(v.get("africana", 32)) / soma,
                 "caucasian": float(v.get("europeia", 23)) / soma},
    }
    rosto = {}
    for chave, alvos in PARES.items():
        x = float(v.get(chave, 0)) / 100
        for alvo in alvos:
            rosto[f"{alvo}-{'incr' if x >= 0 else 'decr'}"] = abs(x)
    rosto["head-square"] = float(v.get("quadrado", 40)) / 100
    puxado = float(v.get("olhos_puxados", 50)) / 100
    for lado in ("l", "r"):
        if puxado >= 0:
            rosto[f"{lado}-eye-height2-decr"] = puxado
            rosto[f"{lado}-eye-epicanthus-in"] = puxado * 0.8
        else:
            rosto[f"{lado}-eye-height2-incr"] = -puxado
    sob = float(v.get("sobrancelhas", 30)) / 100
    rosto["eyebrows-trans-down" if sob >= 0 else "eyebrows-trans-up"] = abs(sob)
    return {"macros": macros, "rosto": rosto}


class Painel(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kw):
        super().__init__(*args, directory=str(ARTE), **kw)

    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path in ("/", "/index.html"):  # a raiz abre o painel direto
            self.send_response(302); self.send_header("Location", "/visor/painel.html"); self.end_headers()
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/gerar":
            self.send_error(404)
            return
        corpo = json.loads(self.rfile.read(int(self.headers["Content-Length"])) or b"{}")
        variante = "projetado" if corpo.get("rosto_desenhado", True) else "ativos"
        with TRAVA:  # um Blender por vez
            SAIDA.mkdir(parents=True, exist_ok=True)
            (SAIDA / "valores.json").write_text(json.dumps(corpo, ensure_ascii=False, indent=1))
            params = SAIDA / "params.json"
            params.write_text(json.dumps(montar_parametros(corpo), indent=1))
            t0 = time.time()
            r = subprocess.run([BLENDER, "-b", "--python", str(ARTE / "blender" / "neto_mpfb.py"), "--",
                                str(SAIDA), variante, str(ARTE / "entradas" / "3d" / "rosto-recorte.png"), str(params)],
                               capture_output=True, text=True, timeout=600)
            ok = "PRONTO" in r.stdout
            if ok:  # junta os três closes do rosto numa imagem só
                v = variante
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(SAIDA / f"{v}-rosto-frente.png"),
                                "-i", str(SAIDA / f"{v}-rosto-34.png"), "-i", str(SAIDA / f"{v}-rosto-perfil.png"),
                                "-filter_complex", "hstack=3", str(SAIDA / f"rosto-{v}.jpg")])
        resposta = {"ok": ok, "segundos": round(time.time() - t0), "variante": variante, "carimbo": int(time.time()),
                    "erro": "" if ok else (r.stdout + r.stderr)[-1500:]}
        dados = json.dumps(resposta).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dados)))
        self.end_headers()
        self.wfile.write(dados)


if __name__ == "__main__":
    print("painel em http://127.0.0.1:5198/visor/painel.html")
    ThreadingHTTPServer(("127.0.0.1", 5198), Painel).serve_forever()
