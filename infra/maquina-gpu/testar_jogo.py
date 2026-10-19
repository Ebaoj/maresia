"""Suíte completa compartilhada com o Modal, no Chrome já aberto da máquina AWS.

Uso dentro da máquina: python3 infra/maquina-gpu/testar_jogo.py [--saida /tmp/m1-regressao.json]
O Vite e o Chrome devem estar ativos nas portas locais 5195 e 9222. Usa configuração limpa,
viewport 1280x720 e captura de console desde antes do carregamento. Não liga/desliga a EC2.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

RAIZ = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / 'infra/modal-jogo'))
from cdp import Cdp, esperar_pronto
from regressao import ORDEM, executar


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--saida', default='/tmp/m1-regressao.json')
    args = parser.parse_args()
    cdp = Cdp()
    relatorio = {'ambiente': 'AWS, substituição do Modal neste fechamento M1', 'resultados': {}}
    try:
        cdp('Page.enable')
        cdp('Page.navigate', url='about:blank')
        time.sleep(1)
        cdp('Runtime.enable')
        cdp('Log.enable')
        cdp('Emulation.setDeviceMetricsOverride', width=1280, height=720, deviceScaleFactor=1, mobile=False)
        cdp('Storage.clearDataForOrigin', origin='http://localhost:5195', storageTypes='all')
        cdp.eventos.clear()
        cdp('Page.navigate', url='http://localhost:5195/')
        esperar_pronto(cdp)
        if not cdp.js('!!(window.maresia?.jogador?.animador && window.__primeiroQuadroMs)'):
            raise RuntimeError('O jogo não terminou de abrir com jogador animado e primeiro quadro.')
        relatorio['chrome'] = cdp('Browser.getVersion')
        relatorio['gpu'] = subprocess.check_output(['nvidia-smi', '--query-gpu=name,driver_version', '--format=csv,noheader'], text=True).strip()
        relatorio['tela'] = cdp.js('({largura:innerWidth, altura:innerHeight, pixelRatio:devicePixelRatio})')
        relatorio['fontes'] = {str(p.relative_to(RAIZ)): hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in sorted((RAIZ / 'src').rglob('*.js'))}
        for nome in ['testes/jogo/cenarios.js', 'infra/modal-jogo/regressao.py', 'infra/modal-jogo/cdp.py',
                     'infra/maquina-gpu/testar_jogo.py', 'package-lock.json']:
            relatorio['fontes'][nome] = hashlib.sha256((RAIZ / nome).read_bytes()).hexdigest()
        def progresso(nome, res):
            print(f"{'PASSOU' if res and res.get('ok') else 'FALHOU'}  {nome}  {(res or {}).get('motivo', '')}", flush=True)
            relatorio['resultados'][nome] = res
            Path(args.saida).write_text(json.dumps(relatorio, ensure_ascii=False, indent=2) + '\n')
        relatorio['resultados'] = executar(cdp, ORDEM, progresso=progresso)
    except Exception as e:
        relatorio['erro'] = str(e)
        relatorio['avisos'] = cdp.avisos()
        print('FALHOU: ' + str(e), flush=True)
    finally:
        Path(args.saida).write_text(json.dumps(relatorio, ensure_ascii=False, indent=2) + '\n')
        cdp.ws.close()
    resultados = relatorio['resultados']
    falhas = sum(not (r and r.get('ok')) for r in resultados.values())
    print(f"{len(resultados) - falhas} de {len(resultados)} passaram; relatório: {args.saida}", flush=True)
    return int(bool(relatorio.get('erro') or falhas or len(resultados) != len(ORDEM) + 1))


if __name__ == '__main__':
    sys.exit(main())
