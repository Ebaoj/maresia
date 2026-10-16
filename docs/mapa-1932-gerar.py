# Proposta de mapa v2: geografia real (lon, lat) comprimida para o jogo, tudo em curvas.
import json, math, sys
geo, saida = sys.argv[1], sys.argv[2]

def pchip(xs, ys):
    n = len(xs); h = [xs[i+1]-xs[i] for i in range(n-1)]; d = [(ys[i+1]-ys[i])/h[i] for i in range(n-1)]
    m = [0.0]*n; m[0] = d[0]; m[-1] = d[-1]
    for i in range(1, n-1):
        m[i] = 0 if d[i-1]*d[i] <= 0 else 3*(h[i-1]+h[i]) / ((2*h[i]+h[i-1])/d[i-1] + (h[i]+2*h[i-1])/d[i])
    def f(x):
        if x <= xs[0]: return ys[0] + m[0]*(x-xs[0])
        if x >= xs[-1]: return ys[-1] + m[-1]*(x-xs[-1])
        i = max(k for k in range(n-1) if xs[k] <= x)
        t = (x-xs[i])/h[i]; t2, t3 = t*t, t*t*t
        return (2*t3-3*t2+1)*ys[i] + (t3-2*t2+t)*h[i]*m[i] + (-2*t3+3*t2)*ys[i+1] + (t3-t2)*h[i]*m[i+1]
    return f
# compressão: ~8x nas pontas, ~3x no centro (lon cresce para leste; lat cresce para norte)
fx = pchip([-38.612, -38.548, -38.535, -38.512, -38.495, -38.4745, -38.452, -38.440], [0, 700, 1000, 1760, 1960, 2180, 2440, 2560])
fy = pchip([-3.688, -3.705, -3.716, -3.736, -3.752, -3.770][::-1], [0, 150, 340, 1000, 1220, 1420][::-1])
def W(lon, lat): return fx(lon), fy(lat)

S = 0.5; OX, OY = 40, 80
def P(p): return f"{OX + p[0]*S:.1f},{OY + p[1]*S:.1f}"
def crom(pts, fechado=False, n=8):
    pts = list(pts); out = []
    if fechado: pts = pts[-1:] + pts + pts[:2]
    else: pts = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(pts)-2):
        p0, p1, p2, p3 = pts[i-1], pts[i], pts[i+1], pts[i+2]
        for k in range(n):
            t = k/n; t2, t3 = t*t, t*t*t
            out.append(tuple(0.5*((2*p1[j]) + (-p0[j]+p2[j])*t + (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t2 + (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t3) for j in range(2)))
    if not fechado: out.append(pts[-2])
    return out
def ondula(pts, amp, freq, sem=0):
    out = []
    for i, (x, y) in enumerate(pts):
        out.append((x, y + amp*math.sin(i*freq + sem) + amp*0.5*math.sin(i*freq*2.7 + sem*1.3)))
    return out
def path(pts, fechado=False): return "M" + " L".join(P(p) for p in pts) + (" Z" if fechado else "")
def blob(cx, cy, rx, ry, sem, n=14, irr=0.22):
    pts = []
    for k in range(n):
        a = 2*math.pi*k/n; r = 1 + irr*math.sin(a*3 + sem) + irr*0.6*math.sin(a*5 + sem*2)
        pts.append((cx + math.cos(a)*rx*r, cy + math.sin(a)*ry*r))
    return crom(pts, True)
L = lambda lon, lat: W(lon, lat)

o = []
o.append('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1290 820" font-family="Georgia, serif">')
o.append('<rect width="100%" height="100%" fill="#efe6d2"/>')
CAB = len(o)
o.append('<rect x="0" y="0" width="1290" height="68" fill="#efe6d2"/>')
o.append('<text x="40" y="34" font-size="22" fill="#3b2a22" font-weight="bold">Maresia: proposta de mapa v2 (Fortaleza de 1932, geografia real comprimida)</text>')
o.append('<text x="40" y="56" font-size="12.5" fill="#5e4636">Pontos dos 10.519 lotes de 1932 em posição real; centro ~3x comprimido, pontas ~8x. Mundo de ~2,4 x 1,4 km. Litoral e rios aproximados (hipótese, a refinar sobre a planta de 1932).</text>')

# litoral (lon, lat) de oeste para leste: hipótese guiada pela borda norte dos lotes de 1932
costa = [(-38.640,-3.682),(-38.612,-3.688),(-38.603,-3.6915),(-38.5995,-3.6945),(-38.597,-3.6930),(-38.591,-3.6955),(-38.584,-3.6985),
         (-38.576,-3.7015),(-38.568,-3.7045),(-38.561,-3.7072),(-38.554,-3.7102),(-38.547,-3.7128),(-38.541,-3.7150),(-38.536,-3.7165),
         (-38.531,-3.7182),(-38.5275,-3.7186),(-38.5262,-3.7172),(-38.5248,-3.7180),(-38.521,-3.7178),(-38.517,-3.7176),(-38.512,-3.7188),
         (-38.506,-3.7200),(-38.499,-3.7212),(-38.492,-3.7216),(-38.486,-3.7208),(-38.481,-3.7186),(-38.4775,-3.7158),(-38.4745,-3.7136),
         (-38.4710,-3.7140),(-38.466,-3.7168),(-38.459,-3.7210),(-38.452,-3.7260),(-38.444,-3.7320),(-38.436,-3.7390)]
cw = ondula(crom([L(*p) for p in costa], n=10), 2.2, 0.9)
mar = cw + [(cw[-1][0]+200, -200), (-200, -200)]
o.append(f'<path d="{path(mar, True)}" fill="#9cc9c4"/>')
o.append(f'<path d="{path(cw)}" fill="none" stroke="#e8d2a6" stroke-width="9" stroke-linejoin="round" transform="translate(0,4)"/>')
o.append(f'<path d="{path(cw)}" fill="none" stroke="#1f5f7a" stroke-width="2"/>')
# recifes ao largo do centro (onde a enseada de 1881 abria)
rec = crom([L(-38.534,-3.7128), L(-38.527,-3.7135), L(-38.520,-3.7140)], n=8)
o.append(f'<path d="{path(rec)}" fill="none" stroke="#6f9a8e" stroke-width="3" stroke-dasharray="2,3"/>')
o.append(f'<text x="{OX+250*S}" y="{OY+50}" font-size="15" fill="#1f5f7a" letter-spacing="8">O C E A N O   A T L Â N T I C O</text>')

# rio Ceará com meandros e mangue
rio = [L(-38.5975,-3.6935), L(-38.6005,-3.700), L(-38.596,-3.707), L(-38.603,-3.714), L(-38.5965,-3.722), L(-38.6045,-3.731), L(-38.598,-3.740), L(-38.606,-3.750), L(-38.600,-3.762), L(-38.605,-3.772)]
rc = crom(rio, n=10)
for w, c in [(22, "#3f8fae"), (2, "#2c6f88")]:
    o.append(f'<path d="{path(rc)}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>')
for i, (x, y) in enumerate(rc[3:40:3]):
    for lado in (-1, 1):
        o.append(f'<circle cx="{OX+(x+lado*(22+8*math.sin(i)))*S:.1f}" cy="{OY+y*S:.1f}" r="{5+2*math.sin(i*1.7):.1f}" fill="#2f5a34"/>')
# Pajeú
paj = crom([L(-38.512,-3.746), L(-38.5165,-3.740), L(-38.5185,-3.734), L(-38.5215,-3.729), L(-38.5235,-3.7245), L(-38.5255,-3.7212), L(-38.527,-3.7192)], n=10)
o.append(f'<path d="{path(ondula(paj, 4, 0.7))}" fill="none" stroke="#3f8fae" stroke-width="4" stroke-linecap="round"/>')
# lagoas (hipótese de posição, conferir na planta)
for nome, lon, lat, rx, ry, sem in [("Poço da Draga",-38.5278,-3.7196,45,18,1),("Lagoa Porangabussu",-38.5465,-3.7455,70,45,2),("Lagoa do Tauape",-38.5225,-3.7505,55,40,3),("Açude João Lopes",-38.5565,-3.7275,45,16,4)]:
    x, y = L(lon, lat)
    o.append(f'<path d="{path(blob(x, y, rx, ry, sem), True)}" fill="#6faec0" stroke="#1f5f7a" stroke-width="1.4"/>')
# dunas
import random; rnd = random.Random(7)
for _ in range(16):
    x = rnd.uniform(1900, 2350); y = rnd.uniform(560, 1100)
    o.append(f'<path d="M{OX+x*S:.1f},{OY+y*S:.1f} q15,-12 30,0 t30,0" fill="none" stroke="#c9963f" stroke-width="2.2" opacity="0.8"/>')
for _ in range(8):
    x = rnd.uniform(1820, 1990); y = rnd.uniform(560, 900)
    o.append(f'<path d="M{OX+x*S:.1f},{OY+y*S:.1f} q12,-10 24,0 t24,0" fill="none" stroke="#c9963f" stroke-width="2" opacity="0.7"/>')
# carnaubal na várzea do rio
for _ in range(26):
    x = rnd.uniform(90, 330); y = rnd.uniform(600, 1250)
    o.append(f'<text x="{OX+x*S:.1f}" y="{OY+y*S:.1f}" font-size="11" fill="#55704f">✶</text>')

# lotes de 1932 em posição real
d = json.load(open(geo))
for f in d['features']:
    xs = []; ys = []
    for poly in f['geometry']['coordinates']:
        for ring in poly:
            for a, b in ring: xs.append(a); ys.append(b)
    lon, lat = sum(xs)/len(xs), sum(ys)/len(ys)
    if lat < -3.79: continue
    x, y = L(lon, lat)
    o.append(f'<circle cx="{OX+x*S:.1f}" cy="{OY+y*S:.1f}" r="0.95" fill="#8a6a50" opacity="0.55"/>')
# vilas de pescadores fora dos lotes (Pirambu, Praia do Peixe, Mucuripe): casas de palha
for lon0, lon1, n in [(-38.570, -38.547, 26), (-38.5235, -38.511, 18), (-38.484, -38.474, 14)]:
    for k in range(n):
        lon = lon0 + (lon1-lon0)*k/n
        # logo atrás da costa
        base = min(costa, key=lambda p: abs(p[0]-lon))[1]
        x, y = L(lon, base - 0.0012 - 0.0008*((k*7) % 3))
        o.append(f'<rect x="{OX+x*S-1.6:.1f}" y="{OY+y*S-1.6:.1f}" width="3.2" height="3.2" fill="#c8a86a" stroke="#8a6a50" stroke-width="0.4"/>')

# trem (curvas)
def trilho(pts):
    c = crom([L(*p) for p in pts], n=10)
    o.append(f'<path d="{path(c)}" fill="none" stroke="#3b2a22" stroke-width="3" stroke-linejoin="round"/>')
    o.append(f'<path d="{path(c)}" fill="none" stroke="#efe6d2" stroke-width="1.3" stroke-dasharray="4,5"/>')
trilho([(-38.5355,-3.7245),(-38.541,-3.7225),(-38.549,-3.7185),(-38.558,-3.7165),(-38.566,-3.7150),(-38.574,-3.7110),(-38.585,-3.7080)])
trilho([(-38.541,-3.7225),(-38.5455,-3.7280),(-38.5485,-3.7350),(-38.5505,-3.745),(-38.553,-3.760),(-38.556,-3.772)])
trilho([(-38.5355,-3.7245),(-38.532,-3.7205),(-38.528,-3.7195),(-38.5258,-3.7185)])
# Ponte Metálica e Ponte dos Ingleses
for (lon, lat0, lat1, cor, das) in [(-38.5258,-3.7185,-3.7158,"#5e5046",""),(-38.5195,-3.7176,-3.7152,"#7a6a5c","6,4")]:
    a, b = L(lon, lat0), L(lon, lat1)
    o.append(f'<line x1="{OX+a[0]*S:.1f}" y1="{OY+a[1]*S:.1f}" x2="{OX+b[0]*S:.1f}" y2="{OY+b[1]*S:.1f}" stroke="{cor}" stroke-width="5" stroke-dasharray="{das}"/>')
# bondes saindo da Praça do Ferreira (curvas suaves)
pf = L(-38.5268,-3.7276)
for lon, lat, curva in [(-38.5185,-3.7195,30),(-38.519,-3.7245,-20),(-38.537,-3.742,25),(-38.556,-3.737,-30),(-38.545,-3.7215,20),(-38.522,-3.738,-25)]:
    b = L(lon, lat); mx, my = (pf[0]+b[0])/2, (pf[1]+b[1])/2
    o.append(f'<path d="M{P(pf)} Q{OX+(mx+curva)*S:.1f},{OY+(my-curva)*S:.1f} {P(b)}" fill="none" stroke="#a8432e" stroke-width="1.5" stroke-dasharray="2,4"/>')
# jangadas
for lon in [-38.522,-38.520,-38.518,-38.516,-38.514,-38.4815,-38.4795,-38.4835,-38.566,-38.560]:
    base = min(costa, key=lambda p: abs(p[0]-lon))[1]
    x, y = L(lon, base - 0.0004)
    o.append(f'<path d="M{OX+x*S:.1f},{OY+y*S:.1f} l4,-13 l5,13 z" fill="#e7d8bd" stroke="#3b2a22" stroke-width="0.7"/>')
# campos de 1932 e lugares
for lon, lat, rx, ry in [(-38.5625,-3.7135,55,35),(-38.5485,-3.7345,30,22)]:
    x, y = L(lon, lat)
    o.append(f'<path d="{path(blob(x, y, rx, ry, 5, irr=0.08), True)}" fill="none" stroke="#3b2a22" stroke-width="1.4" stroke-dasharray="1,3"/>')
lugares = [
    (-38.5268,-3.7276,"Praça do Ferreira"),(-38.5303,-3.7216,"Passeio Público"),(-38.5245,-3.7228,"Forte"),(-38.5262,-3.7236,"Sé"),
    (-38.5322,-3.7219,"Santa Casa"),(-38.5265,-3.7252,"Pça. dos Leões / Rosário"),(-38.5300,-3.7258,"Mercado de Ferro"),(-38.5315,-3.7305,"Theatro"),
    (-38.5355,-3.7245,"Estação Central"),(-38.5410,-3.7210,"Cemitério S. João Batista"),(-38.5278,-3.7196,"Poço da Draga"),
    (-38.5258,-3.7158,"Ponte Metálica"),(-38.5195,-3.7152,"Ponte dos Ingleses (parada)"),(-38.5185,-3.7192,"Vila Morena"),(-38.5205,-3.7240,"Seminário da Prainha"),
    (-38.4775,-3.7160,"Farol"),(-38.5660,-3.7150,"Oficinas da Rede"),(-38.5625,-3.7125,"Campo do Urubu"),(-38.5485,-3.7345,"Campo Otávio Bonfim"),
    (-38.5465,-3.7455,"Lagoa Porangabussu"),(-38.5225,-3.7505,"Lagoa do Tauape"),(-38.5565,-3.7275,"Açude João Lopes"),(-38.5980,-3.6950,"Barra do Ceará"),
]
for lon, lat, t in lugares:
    x, y = L(lon, lat)
    o.append(f'<circle cx="{OX+x*S:.1f}" cy="{OY+y*S:.1f}" r="2.4" fill="#3b2a22"/><text x="{OX+x*S+4:.1f}" y="{OY+y*S-3:.1f}" font-size="9" fill="#3b2a22">{t}</text>')
for lon, lat in [(-38.5160,-3.7190),(-38.4800,-3.7200)]:
    x, y = L(lon, lat)
    o.append(f'<text x="{OX+x*S-6:.1f}" y="{OY+y*S+5:.1f}" font-size="14" fill="#c2412d">★</text>')
# zonas: só rótulos (sem caixas)
for t, lon, lat in [("A · Barra do Ceará e o rio",-38.5935,-3.7265),("B · Pirambu e Campo do Urubu",-38.566,-3.7085),("C · Jacarecanga e Moura Brasil",-38.546,-3.7195),
                    ("D · Centro",-38.533,-3.7335),("E · Poço da Draga e Ponte Metálica",-38.5345,-3.7140),("F · Praia de Iracema (Praia do Peixe)",-38.516,-3.7140),
                    ("G · Prainha, Outeiro e Aldeota",-38.508,-3.733),("H · Mucuripe",-38.481,-3.7105),("I · Alagadiço, Benfica e lagoas",-38.556,-3.754)]:
    x, y = L(lon, lat)
    o.append(f'<text x="{OX+x*S:.1f}" y="{OY+y*S:.1f}" font-size="12" fill="#c2412d" font-weight="bold" opacity="0.9">{t}</text>')
# escala (no centro e nas pontas a escala muda) e legenda
o.append(f'<line x1="{OX}" y1="{OY+1450*S}" x2="{OX+200*S}" y2="{OY+1450*S}" stroke="#3b2a22" stroke-width="3"/><text x="{OX}" y="{OY+1450*S+15}" font-size="10.5" fill="#3b2a22">200 m no jogo</text>')
leg = [("#8a6a50","· lotes ocupados em 1932 (posição real)"),("#c8a86a","▪ casas de palha das vilas de pescadores (hipótese)"),("#3b2a22","trem e ramal da Alfândega"),("#a8432e","bondes saindo da Praça do Ferreira"),("#c2412d","★ casa do avô: duas opções (narrativa)")]
for k, (c, t) in enumerate(leg):
    o.append(f'<text x="{OX+150}" y="{OY+1450*S-56+k*14}" font-size="10.5" fill="{c}">{t}</text>')
cab = [x for x in o if x.startswith('<rect x="0" y="0"') or x.startswith('<text x="40"')]
o = [x for x in o if x not in cab] + cab
o.append('</svg>')
open(saida, 'w').write("\n".join(o))
print("ok", len(o))
