import { describe, it, expect } from 'vitest';
import {
  ll, llInverso, LIMITES, FATOR_PRACA, K_PRACA_X, K_PRACA_Z,
  esticamento, metrosPorUn, geoDe, escalaJogo,
} from '../../src/mundo/fortaleza1932.js';
import { CENTRO, CONTORNO } from '../../src/mundo/praca1932.js';
import { CAMPO_URUBU } from '../../src/mundo/mapa1932.js';
import dados from '../../src/mundo/praca1932.json';
import dadosMapa from '../../src/mundo/mapa1932-dados.json';

// A Praca do Ferreira em tamanho real (1:1) e o resto do mapa comprimido: decisao do
// Joabe (21/10/2026). A descompressao local acontece na transformacao lon/lat -> jogo
// (src/mundo/fortaleza1932.js): um perfil suave multiplica a derivada da compressao no
// miolo da praca, e a integracao comeca no oeste (para o x) e no norte (para o z), para
// o resto do mapa nao mudar de lugar.
//
// Desde 22/10/2026 a compressao acontece no QUADRO DA GRADE (u ao longo da rua, v de
// travessia), e nao em lon/lat: e isso que mantem as ruas da grade de Herbster retas
// no jogo. As rampas da descompressao eram faixas ao longo de u e de v; desde a v16
// (docs/mapa-1932.md) o mapa e um campo continuo, sem faixas, com o centro historico
// inteiro em 1:1 (testes/unidade/escala-centro.test.js).
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
    // O miolo da praca: a escala da compressao base, vezes o fator de
    // descompressao. O numero mudou de 2,9 para 2,75 porque a compressao
    // agora e lida no quadro da grade: a mesma curva (os mesmos nos), lida
    // 17,5 graus fora do eixo, tem uma inclinacao local um pouco diferente
    // no centro (0,345 un/m no eixo x virou 0,362 un/m no eixo u da grade),
    // e o fator e o inverso dela.
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

  it('o Campo do Urubu continua no mesmo lugar de verdade, e agora em tamanho real', () => {
    // A ancoragem e por lon/lat (o dado vem em lon/lat e passa pela
    // transformacao): cada ponto, mapeado e mapeado de volta, da o lugar de
    // verdade (a transformada e uma volta exata: o erro medido e de milimetros).
    //
    // A afirmacao mudou em 21/10/2026 por decisao do Joabe, e nao para o teste
    // passar: o campo virou o coracao da historia (docs/conceito.md) e passou a
    // ser a segunda zona em tamanho real do mapa, como a Praca do Ferreira. Antes
    // este teste pedia o esticamento 1 (a compressao de sempre, ~9 vezes); agora
    // pede 1 metro por unidade nos DOIS eixos da grade, sem torcer (o campo cai
    // sobre a reta da rua que passa pela praca, e uma descompressao num eixo so
    // esticava o campo 1,65 vez de um lado e nao do outro).
    const real = dadosMapa.campoUrubu;
    const media = (i) => real.poligono.reduce((s, p) => s + p[i], 0) / real.poligono.length;
    const pontos = [
      ['o centro do campo', media(0), media(1)],
      ['a primeira tarefa', real.lugares.tarefas[0].lon, real.lugares.tarefas[0].lat],
      ['o primeiro galpao', real.lugares.galpoes[0].lon, real.lugares.galpoes[0].lat],
      ['a primeira construcao', real.lugares.construcoes[0].lon, real.lugares.construcoes[0].lat],
      ...real.poligono.map(([lon, lat], i) => [`o canto ${i} da cerca`, lon, lat]),
    ];
    for (const [nome, lon, lat] of pontos) {
      const [x, z] = ll(lon, lat);
      const [voltaLon, voltaLat] = llInverso(x, z);
      expect(voltaLon, nome).toBeCloseTo(lon, 4);
      expect(voltaLat, nome).toBeCloseTo(lat, 4);
      // 1 unidade = 1 metro ao longo da rua e de travessia (2% de folga), e o
      // campo nao torce: os dois eixos com a mesma escala (1% de diferenca)
      const e = escalaJogo(x, z);
      expect(Math.abs(e.u), `escala ao longo da rua em ${nome}`).toBeGreaterThan(0.98);
      expect(Math.abs(e.u), `escala ao longo da rua em ${nome}`).toBeLessThan(1.02);
      expect(Math.abs(e.v), `escala de travessia em ${nome}`).toBeGreaterThan(0.98);
      expect(Math.abs(e.v), `escala de travessia em ${nome}`).toBeLessThan(1.02);
      expect(Math.abs(Math.abs(e.u) / Math.abs(e.v) - 1), `distorcao em ${nome}`).toBeLessThan(0.01);
    }
  });

  it('a descompressão é local: a compressão do resto do mapa continua', () => {
    // Longe das duas zonas em tamanho real (o centro histórico e o Campo do Urubu), a escala
    // e a de sempre: na Barra do Ceara o mapa esta 5 a 14 vezes mais comprimido
    // que a praca (metrosPorUn: quantos metros de verdade vale uma unidade).
    // O lugar medido era o Urubu ate 21/10/2026, quando o campo virou zona em
    // tamanho real (decisao do Joabe); a afirmacao e a mesma, num lugar que
    // continua fora das zonas.
    const longe = metrosPorUn(...ll(-38.598, -3.695));
    expect(longe).toBeLessThan(14);
    expect(longe).toBeGreaterThan(5);
    // O esticamento mudou de sentido em 22/10/2026 (o centro histórico inteiro em 1:1, decisao do
    // Joabe, sem as faixas da escala separavel): ele era "quanto a zona esticou a compressao de sempre"
    // (1 fora das faixas) e passou a ser "quantas unidades de jogo vale uma medida ajustada no mundo
    // comprimido de antes" (FATOR_PRACA / metrosPorUn: 2,74 nas zonas, menos que 1 no vazio)
    expect(esticamento(-38.598, -3.695)).toBeCloseTo(FATOR_PRACA / longe, 3);
  });

  it('a rampa é suave: a escala muda sem degrau', () => {
    // A afirmacao mudou em 22/10/2026 (o centro historico inteiro em 1:1, decisao do Joabe): a rampa
    // era uma faixa ao longo de u e outra ao longo de v, e o teste andava pelas duas. Agora a zona do
    // centro e o circulo de 1 km em volta da praca (mais o porto) e a rampa e o campo continuo em volta
    // dela (docs/mapa-1932-escala.py). Andando para fora da borda do circulo, em 8 direcoes, por 1,5 km,
    // a escala local cai sem degrau: a mudanca e de no maximo 0,05 un/m por passo de 11 m (o passo de
    // antes: 40 passos pela faixa de 445 m).
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4;
      let anterior = null;
      for (let i = 0; i <= 135; i++) {
        const r = 1000 + (1500 * i) / 135;
        const [lon, lat] = geoDe(r * Math.cos(ang), r * Math.sin(ang));
        const s = 1 / metrosPorUn(...ll(lon, lat));
        if (anterior !== null) {
          expect(Math.abs(s - anterior), `degrau na direcao ${k}, passo ${i}`).toBeLessThan(0.05);
        }
        anterior = s;
      }
    }
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
