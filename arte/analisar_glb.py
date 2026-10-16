"""Conta triângulos, peças e se a malha é fechada num .glb. Uso: .venv/bin/python analisar_glb.py arquivo.glb"""
import sys
import trimesh

cena = trimesh.load(sys.argv[1], force="scene")
for nome, g in cena.geometry.items():
    g = g.copy(); g.merge_vertices(merge_tex=True, merge_norm=True)  # o glb duplica vértices nas costuras da textura
    pecas = g.split(only_watertight=False)
    fechadas = sum(p.is_watertight for p in pecas)
    ext = g.bounds[1] - g.bounds[0]
    print(f"{nome}: {len(g.faces)} triângulos, {len(g.vertices)} vértices, fechada={g.is_watertight}, "
          f"peças={len(pecas)} (fechadas {fechadas}), tamanho={ext.round(3).tolist()}, "
          f"textura={'sim' if getattr(g.visual, 'material', None) is not None else 'não'}")
    maiores = sorted(pecas, key=lambda p: len(p.faces), reverse=True)[:5]
    print("  maiores peças (triângulos):", [len(p.faces) for p in maiores])
