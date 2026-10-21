import { describe, it, expect } from 'vitest';
import {
  ll, llInverso, LIMITES, FATOR_PRACA, K_PRACA_X, K_PRACA_Z,
  esticamento, metrosPorUn, geoDe,
} from '../../src/mundo/fortaleza1932.js';
import { CENTRO, CONTORNO } from '../../src/mundo/praca1932.js';
import { CAMPO_URUBU } from '../../src/mundo/mapa1932.js';
import dados from '../../src/mundo/praca1932.json';

// A Praca do Ferreira em tamanho real (1:1) e o resto do mapa comprimido: decisao do
// Joabe (21/10/2026). A descompressao local acontece na transformacao lon/lat -> jogo
// (src/mundo/fortaleza1932.js): um perfil suave multiplica a derivada da compressao no
// miolo da praca, e a integracao comeca no oeste (para o x) e no norte (para o z), para
// o resto do mapa nao mudar de lugar.
//
// Desde 22/10/2026 a compressao acontece no QUADRO DA GRADE (u ao longo da rua, v de
// travessia), e nao em lon/lat: e isso que mantem as ruas da grade de Herbster retas
// no jogo. As rampas da descompressao sao faixas ao longo de u e de v.
//
// Estes testes prendem tres coisas:
//   1. a praca esta em 1:1 (a area no jogo e a area real, dentro de uma tolerancia
//      declarada) e a transformacao nao dobra (e estritamente crescente);
//   2. o que esta fora da regiao descomprimida nao se mexeu - o Campo do Urubu
//      continua no mesmo lugar de verdade (lon/lat), que e como ele e ancorado;
//   3. a praca e o miolo sao coerentes com a compressao do resto (a escala local vale
//      1 unidade por metro no miolo e segue mudando devagar ate a compressao de sempre).

const METRO_POR_GRAU_LAT = 110574;
const METRO_POR_GRAU_LON = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

// a area de um poligono (shoelace)
function area(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

describe('escala: a Praça do Ferreira em tamanho real', () => {
  it('a área da praça no jogo bate com a área real (tolerância de 2%)', () => {
    // a mesma mancha, em coordenada de jogo e em metros de verdade
    const noJogo = CONTORNO;
    const mPorLon = METRO_POR_GRAU_LON(dados.centro[1]);
    const real = dados.contorno.map(([lon, lat]) => [
      (lon - dados.centro[0]) * mPorLon,
      (lat - dados.centro[1]) * METRO_POR_GRAU_LAT,
    ]);
    const areaJogo = area(noJogo);
    const areaReal = area(real);
    // a area real da mancha e 7.376 m2 (docs/mapa-1932.md): o mesmo poligono, na
    // mesma projecao, tem de dar a mesma area no jogo
    expect(areaReal).toBeGreaterThan(7000);
    expect(areaReal).toBeLessThan(7800);
    const erro = Math.abs(areaJogo / areaReal - 1);
    expect(erro, `área do jogo ${areaJogo.toFixed(0)} un2 x área real ${areaReal.toFixed(0)} m2`).toBeLessThan(0.02);
  });

  it('a escala local da praça é 1:1 (uma unidade de jogo por metro)', () => {
    // o miolo da praca: a escala da compressao base, vezes o fator de descompressao
    expect(FATOR_PRACA).toBeGreaterThan(2.7);
    expect(FATOR_PRACA).toBeLessThan(2.8);
    for (const [x, z] of [[CENTRO[0], CENTRO[1]]]) {
      expect(metrosPorUn(x, z)).toBeCloseTo(1, 2);
    }
    // e a praca inteira, dentro de 2%: a escala varia pouco no miolo
    for (const [x, z] of CONTORNO) {
      const m = metrosPorUn(x, z);
      expect(m, `escala em ${x.toFixed(1)},${z.toFixed(1)}`).toBeGreaterThan(0.98);
      expect(m).toBeLessThan(1.02);
    }
  });

  it('a transformação é monótona: nenhuma dobra, nenhum vinco', () => {
    // o x cresce com a longitude e o z cresce com o sul (a latitude cai)
    const lonA = -38.612;
    const lonB = -38.44;
    const latA = -3.688;
    const latB = -3.77;
    const N = 2000;
    let xAnt = -Infinity;
    for (let i = 0; i <= N; i++) {
      const lon = lonA + ((lonB - lonA) * i) / N;
      const x = ll(lon, -3.7275)[0];
      expect(x, `x em ${lon}`).toBeGreaterThan(xAnt);
      xAnt = x;
    }
    let zAnt = -Infinity;
    for (let i = 0; i <= N; i++) {
      const lat = latA + ((latB - latA) * i) / N;
      const z = ll(-38.5275, lat)[1];
      expect(z, `z em ${lat}`).toBeGreaterThan(zAnt);
      zAnt = z;
    }
    // e a volta (llInverso) tambem e crescente
    let xVolta = -Infinity;
    for (let i = 0; i <= N; i++) {
      const x = LIMITES.x0 + ((LIMITES.x1 - LIMITES.x0) * i) / N;
      const lon = llInverso(x, 0)[0];
      expect(lon).toBeGreaterThan(xVolta);
      xVolta = lon;
    }
  });

  it('o Campo do Urubu continua no mesmo lugar de verdade', () => {
    // o campo e a oeste e ao norte da praca, fora da regiao descomprimida: a
    // compressao de sempre, no mesmo lugar de verdade. A ancoragem e por
    // lon/lat (o dado vem em lon/lat e passa pela transformacao), e nao por
    // coordenada de jogo: com a compressao no quadro da grade, o x do jogo do
    // campo mudou, mas o campo continua no mesmo ponto da cidade de verdade.
    const [lonCentro, latCentro] = llInverso(
      (Math.min(...CAMPO_URUBU.poligono.map((p) => p[0])) + Math.max(...CAMPO_URUBU.poligono.map((p) => p[0]))) / 2,
      (Math.min(...CAMPO_URUBU.poligono.map((p) => p[1])) + Math.max(...CAMPO_URUBU.poligono.map((p) => p[1]))) / 2,
    );
    expect(lonCentro).toBeCloseTo(-38.57, 2);
    expect(latCentro).toBeCloseTo(-3.7176, 2);
    // e o esticamento ali e 1: fora da praca, a compressao e a de sempre
    expect(esticamento(-38.57, -3.7176)).toBeCloseTo(1, 6);
  });

  it('a descompressão é local: a compressão do resto do mapa continua', () => {
    // no oeste e no norte (o Urubu, a barra), a escala e a de sempre: o mapa
    // esta uns 9 vezes mais comprimido que a praca
    const longe = metrosPorUn(...ll(-38.57, -3.7176));
    expect(longe).toBeLessThan(14);
    expect(longe).toBeGreaterThan(5);
    // e a rampa e suave: o esticamento cai devagar, sem degrau. A rampa e uma
    // faixa ao longo de u (a direcao da rua da grade); para o fator de v ja
    // estar fora, o ponto caminha 600 m de travessia (a rampa de v tem 420 m).
    let anterior = esticamento(...geoDe(0, 600));
    expect(anterior).toBeCloseTo(Math.sqrt(K_PRACA_X), 6);
    for (let i = 1; i <= 40; i++) {
      const [lon, lat] = geoDe((0.004 * 111092 * i) / 40, 600);
      const e = esticamento(lon, lat);
      expect(e).toBeLessThanOrEqual(anterior + 1e-9);
      expect(anterior - e).toBeLessThan(0.2); // sem degrau
      anterior = e;
    }
    expect(anterior).toBeCloseTo(1, 6);
  });

  it('o fator de descompressão é o inverso da escala da compressão no centro', () => {
    // K_X e K_Z sao os inversos da escala base da compressao no centro da praca:
    // o miolo fica em 1:1 por construcao, e nao por numero redondo
    expect(K_PRACA_X).toBeGreaterThan(2.7);
    expect(K_PRACA_X).toBeLessThan(2.8);
    expect(K_PRACA_Z).toBeGreaterThan(2.7);
    expect(K_PRACA_Z).toBeLessThan(2.8);
    expect(FATOR_PRACA).toBeCloseTo(Math.sqrt(K_PRACA_X * K_PRACA_Z), 9);
  });
});
