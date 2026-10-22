import { describe, it, expect } from 'vitest';
import {
  BONDES, TRILHOS, CAMPO_URUBU, LUGARES, BAIRROS, FAVELA_1932,
  comprimento, dentroDoCampo, llInverso, pontoParaPixel, JANELA,
} from '../../src/mundo/mapa1932.js';
import { ll } from '../../src/mundo/fortaleza1932.js';
import { LIMITES } from '../../src/mundo/mapa.js';
import dados from '../../src/mundo/mapa1932-dados.json';

describe('dados do mapa de 1932', () => {
  // Regressão: as dez linhas da Light têm nome e distância de 1918. O traço é uma reta
  // entre âncoras (o jogo é ~3,4 vezes menor que a cidade), então não pode ser comparado
  // com a rota real; o que tem de bater é o dado, e o traço tem de ficar no mundo.
  it('as linhas de bonde trazem o nome e a distância de 1918', () => {
    const esperadas = {
      'Estação': 2450, 'Via-Férrea': 930, Praia: 1530, Mororó: 1100, Matadouro: 4200,
      Alagadiço: 5440, Benfica: 2630, Outeiro: 2500, 'Fernandes Vieira': 1800,
    };
    expect(BONDES).toHaveLength(9);
    for (const bonde of BONDES) {
      expect(esperadas[bonde.nome], bonde.nome).toBe(bonde.distancia);
      expect(bonde.esquematico, bonde.nome).toBe(true);
      expect(bonde.traco.length, bonde.nome).toBeGreaterThanOrEqual(2);
      for (const [x, z] of bonde.traco) {
        expect(Number.isFinite(x), bonde.nome).toBe(true);
        expect(Number.isFinite(z), bonde.nome).toBe(true);
      }
    }
  });

  it('todo bonde sai da Praça do Ferreira', () => {
    const [px, pz] = ll(-38.5276, -3.7275);
    for (const bonde of BONDES) {
      const primeiro = bonde.traco[0];
      expect(Math.hypot(primeiro[0] - px, primeiro[1] - pz)).toBeLessThan(40);
    }
  });

  it('o Campo do Urubu fica dentro do mundo jogável', () => {
    for (const ponto of CAMPO_URUBU.poligono) {
      expect(ponto[0]).toBeGreaterThan(LIMITES.x0);
      expect(ponto[0]).toBeLessThan(LIMITES.x1);
      expect(ponto[1]).toBeGreaterThan(LIMITES.z0);
      expect(ponto[1]).toBeLessThan(LIMITES.z1);
    }
    expect(CAMPO_URUBU.tarefas).toHaveLength(20);
    expect(CAMPO_URUBU.galpoes).toHaveLength(4);
    expect(CAMPO_URUBU.construcoes.map((c) => c.nome)).toEqual(['cozinha', 'posto medico', 'capela']);
  });

  it('o centro do campo está dentro do próprio campo', () => {
    const xs = CAMPO_URUBU.poligono.map((p) => p[0]);
    const zs = CAMPO_URUBU.poligono.map((p) => p[1]);
    const centro = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
    expect(dentroDoCampo(centro[0], centro[1])).toBe(true);
    expect(dentroDoCampo(LIMITES.x1 - 10, LIMITES.z1 - 10)).toBe(false);
  });

  it('os lugares convertem para números finitos dentro do mundo', () => {
    for (const [chave, lugar] of Object.entries(LUGARES)) {
      expect(Number.isFinite(lugar.ponto[0]), chave).toBe(true);
      expect(Number.isFinite(lugar.ponto[1]), chave).toBe(true);
    }
    // o lugar vem do dado: a estacao fica onde a fonte diz
    expect(LUGARES.estacao.ponto[0]).toBeCloseTo(ll(dados.lugares.estacao.lon, dados.lugares.estacao.lat)[0], 6);
    expect(LUGARES.estacao.ponto[1]).toBeCloseTo(ll(dados.lugares.estacao.lon, dados.lugares.estacao.lat)[1], 6);
    // a favela vem do proprio dado: comparar com o mesmo valor, sem arredondar a mao
    expect(FAVELA_1932.ponto[0]).toBeCloseTo(ll(dados.favela1932.lon, dados.favela1932.lat)[0], 6);
    expect(FAVELA_1932.ponto[1]).toBeCloseTo(ll(dados.favela1932.lon, dados.favela1932.lat)[1], 6);
    expect(BAIRROS.length).toBeGreaterThan(10);
  });

  // Regressão: o raster do uso dos lotes só serve se o ponto do jogo achar o pixel certo.
  it('o inverso da compressão devolve o ponto de origem', () => {
    // pontos de dentro do mapa (a caixa do mundo e o mapa girado: o canto da
    // caixa fica fora do mapa de verdade)
    for (const ponto of [ll(-38.5276, -3.7275), ll(-38.57, -3.7176), ll(-38.495, -3.725)]) {
      const [lon, lat] = llInverso(ponto[0], ponto[1]);
      const [x, z] = ll(lon, lat);
      expect(x).toBeCloseTo(ponto[0], 1);
      expect(z).toBeCloseTo(ponto[1], 1);
    }
  });

  it('o pixel do raster fica dentro da janela da malha', () => {
    const [px, py] = pontoParaPixel(...ll(-38.53, -3.72));
    expect(px).toBeGreaterThanOrEqual(0);
    expect(px).toBeLessThanOrEqual(JANELA.pixels[0]);
    expect(py).toBeGreaterThanOrEqual(0);
    expect(py).toBeLessThanOrEqual(JANELA.pixels[1]);
  });

  it('o trilho do Urubu sai da Estação Central e chega ao campo', () => {
    const ramal = TRILHOS.find((t) => t.nome.includes('Urubu'));
    expect(ramal).toBeTruthy();
    const [ex, ez] = ll(-38.5302, -3.7219);
    expect(Math.hypot(ramal.traco[0][0] - ex, ramal.traco[0][1] - ez)).toBeLessThan(60);
    const fim = ramal.traco[ramal.traco.length - 1];
    // O fim do ramal chega à cerca do campo. Até 21/10/2026 a medida era "a menos de 700 unidades do
    // primeiro canto da cerca", num campo comprimido ~9 vezes; com o campo em tamanho real (decisão do
    // Joabe) o canto ficou a 1,2 km e a medida passa a ser a distância até a cerca, em metros de
    // verdade (medida: 59 m), que é mais exigente.
    const p = CAMPO_URUBU.poligono;
    let perto = Infinity;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [x1, z1] = p[j];
      const [x2, z2] = p[i];
      const dx = x2 - x1;
      const dz = z2 - z1;
      const t = Math.max(0, Math.min(1, ((fim[0] - x1) * dx + (fim[1] - z1) * dz) / (dx * dx + dz * dz)));
      perto = Math.min(perto, Math.hypot(fim[0] - (x1 + t * dx), fim[1] - (z1 + t * dz)));
    }
    expect(perto).toBeLessThan(100);
  });
});
