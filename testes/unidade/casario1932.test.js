import { describe, it, expect } from 'vitest';
import { FACHADAS, RUAS, USO, comprimentoRua, pontoNaRua } from '../../src/mundo/casario1932.js';
import { ll, llInverso, metrosPorUn } from '../../src/mundo/fortaleza1932.js';
import { LIMITES } from '../../src/mundo/mapa.js';

// A cidade de 1932 saiu da camada oficial "Evolucao Urbana 1932" da Prefeitura de
// Fortaleza: 10.519 lotes, e cada um com a aresta que dava para a rua. Estes testes
// prendem as regressões dessa extracao - se o dado ou o motor mudarem de lugar, a
// cidade sai do lugar.
describe('a cidade de 1932', () => {
  it('a inversa da compressão devolve o ponto de origem', () => {
    for (const [lon, lat] of [[-38.5276, -3.7275], [-38.57, -3.7176], [-38.495, -3.725]]) {
      const [x, z] = ll(lon, lat);
      const [voltaLon, voltaLat] = llInverso(x, z);
      expect(voltaLon).toBeCloseTo(lon, 6);
      expect(voltaLat).toBeCloseTo(lat, 6);
    }
  });

  it('tem milhares de casas, todas dentro do mundo jogavel', { timeout: 60000 }, () => {
    expect(FACHADAS.length).toBeGreaterThan(3000);
    for (const f of FACHADAS) {
      expect(Number.isFinite(f.x), 'x').toBe(true);
      expect(Number.isFinite(f.z), 'z').toBe(true);
      expect(f.x).toBeGreaterThan(LIMITES.x0);
      expect(f.x).toBeLessThan(LIMITES.x1);
      expect(f.z).toBeGreaterThan(LIMITES.z0);
      expect(f.z).toBeLessThan(LIMITES.z1);
    }
  });

  // Regressão: a fachada e a medida da frente do lote. A planta de 1932 tem
  // desde o sobrado de 4 m (o quarto de criado) ate o quarteirao comercial de
  // 45 m; a casa nasce com a largura de verdade (a testada longa e partida em
  // casas encostadas), e o lote estreito se junta com o vizinho da mesma rua
  // quando o vizinho existe. As medidas sao em METROS DE VERDADE: a escala do
  // jogo muda tanto que um numero de unidades nao diz nada.
  it('as casas tem a largura da frente de 1932', { timeout: 60000 }, () => {
    // a medida de verdade: a casa guarda a largura e a profundidade em metros
    // de verdade (a do jogo depende da escala local, que aperta um eixo mais
    // que o outro)
    const larguras = FACHADAS.map((f) => f.largura).sort((a, b) => a - b);
    for (const f of FACHADAS) {
      expect(f.largura, 'largura').toBeGreaterThan(0.4);
      expect(f.largura, 'largura').toBeLessThanOrEqual(26.1);
      expect(f.prof, 'profundidade').toBeGreaterThan(1);
      expect(f.prof, 'profundidade').toBeLessThan(40.1);
      // e no jogo a casa continua dentro de um retangulo finito
      expect(Number.isFinite(f.w)).toBe(true);
      expect(f.w, 'largura no jogo').toBeGreaterThan(0.05);
      expect(f.d, 'profundidade no jogo').toBeGreaterThan(0.05);
      expect(metrosPorUn(f.x, f.z)).toBeGreaterThan(0);
    }
    // a casa comum: a frente mediana da planta tem 13,7 m
    expect(larguras[Math.floor(larguras.length / 2)]).toBeGreaterThan(3);
    // o quarto de criado e excecao, nao a regra
    expect(larguras.filter((w) => w < 3).length / larguras.length).toBeLessThan(0.3);
    // e o lote minimo da planta (1 m) e rarissimo
    expect(larguras.filter((w) => w < 2.4).length / larguras.length).toBeLessThan(0.02);
    // a casa comum tem a largura que o painel manda (10 m)
    expect(larguras[Math.floor(larguras.length / 2)]).toBeGreaterThan(6);
    expect(larguras[Math.floor(larguras.length / 2)]).toBeLessThan(13);
  });

  it('a favela de 1932 esta onde a planta registra', () => {
    const favela = FACHADAS.filter((f) => f.uso === USO.Favela);
    expect(favela.length).toBeGreaterThan(0);
    const [fx, fz] = ll(-38.52612, -3.72959);
    for (const f of favela) {
      expect(Math.hypot(f.x - fx, f.z - fz)).toBeLessThan(25);
    }
  });

  it('as ruas sao as frentes dos lotes, e elas tocam na cidade', () => {
    expect(RUAS.length).toBeGreaterThan(500);
    let total = 0;
    for (const rua of RUAS) {
      expect(rua.pontos.length).toBeGreaterThanOrEqual(2);
      expect(rua.normais.length).toBe(rua.pontos.length);
      total += comprimentoRua(rua);
    }
    // a rede viaria de 1932 tem dezenas de kilometros de frente
    expect(total).toBeGreaterThan(3000);
    // a rua e um caminho: as frentes encostam, e a rede tem trechos longos
    const longas = RUAS.filter((r) => comprimentoRua(r) > 30);
    expect(longas.length).toBeGreaterThan(100);
  });

  it('andar pela rua devolve o mesmo ponto de onde se saiu', () => {
    const rua = RUAS.find((r) => comprimentoRua(r) > 40);
    const comp = comprimentoRua(rua);
    const [x, z] = pontoNaRua(rua, comp / 2);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
    const [x0, z0] = pontoNaRua(rua, 0);
    expect(Math.hypot(x - x0, z - z0)).toBeLessThan(comp);
  });
});
