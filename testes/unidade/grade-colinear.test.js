import { describe, it, expect } from 'vitest';
import { ll, ANGULO_GRADE } from '../../src/mundo/fortaleza1932.js';
import lotes from '../../src/mundo/mapa1932-lotes.json';

// A grade de Herbster: as ruas do centro de 1932 correm a 107,8 graus de azimute
// (lés-sudeste; ANGULO_GRADE guarda o complemento, 72,19).
//
// Corrigido em 21/10/2026: este teste nasceu (06f9525) medindo a reta de azimute
// ANGULO_GRADE (72,5, lés-nordeste), o espelho da rua de verdade, e por isso
// prendia o defeito do eixo do quadro da grade em vez da correção. Na planta, a
// menos de 600 m da praça, há 12,6 km de testada a 107,5 graus, 3,0 km a 17,5 e
// só ~0,5 km perto de 72,5. A tolerância não mudou; mudou a direção medida, que
// agora é a da rua (azimute 180 - ANGULO_GRADE).
// A compressao do mapa e separavel (em u, ao longo da rua, e em v, de
// travessia), e por isso uma reta da grade continua reta no jogo: a rua nao
// torce e as ruas nao abrem leque.
//
// Antes (a compressao separavel em lon/lat) a rua da grade virava curva: o
// angulo mudava de 0,4 grau na praca para 52 graus no oeste, e a barriga da
// rua chegava a 16 un. Este teste e o que prende a correcao.
//
// As ruas medidas sao de verdade: linhas na direcao da grade, em pontos
// diferentes da cidade, e as direcoes das testadas longas da propria planta
// de 1932.

const M_LON = 111320 * Math.cos((-3.7275 * Math.PI) / 180);
const M_LAT = 110574;

// o quanto uma polilinha se afasta da reta entre as suas pontas (a barriga)
function barriga(pontos) {
  const [a, b] = [pontos[0], pontos[pontos.length - 1]];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return 0;
  let max = 0;
  for (const p of pontos) {
    const d = Math.abs((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / len;
    if (d > max) max = d;
  }
  return max;
}

// o angulo da reta entre as pontas, em graus
function angulo(pontos) {
  const [a, b] = [pontos[0], pontos[pontos.length - 1]];
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
}

// uma reta de verdade (em lon/lat) que passa por um ponto, na direcao da grade
function linhaDaGrade(lon, lat, comprimento = 400, passo = 20) {
  // a rua lés-sudeste: azimute 180 - ANGULO_GRADE
  const ux = Math.sin(Math.PI - ANGULO_GRADE);
  const uy = Math.cos(Math.PI - ANGULO_GRADE);
  const n = Math.round(comprimento / passo);
  const pontos = [];
  for (let i = -Math.floor(n / 2); i <= Math.floor(n / 2); i++) {
    pontos.push(ll(lon + (i * passo * ux) / M_LON, lat + (i * passo * uy) / M_LAT));
  }
  return pontos;
}

describe('a grade de Herbster no jogo', () => {
  it('a rua da grade continua reta, em qualquer ponto do mapa', () => {
    // varios lugares: a praca, o Centro, o bairro, a praia, a barra e o oeste
    const lugares = [
      ['a praca', -38.5276, -3.7275],
      ['o Centro', -38.5250, -3.7240],
      ['o bairro', -38.5485, -3.7345],
      ['a praia', -38.5150, -3.7180],
      ['a barra', -38.5900, -3.6980],
      ['o oeste', -38.6000, -3.7300],
    ];
    for (const [nome, lon, lat] of lugares) {
      const pontos = linhaDaGrade(lon, lat);
      // a barriga: a rua nao pode curvar (0,5 un de folga no mundo todo)
      expect(barriga(pontos), `barriga da rua em ${nome}`).toBeLessThan(0.5);
      // e o angulo e o da grade: +17,8 graus no jogo (o z do jogo cresce para o sul: a rua desce para lés-sudeste)
      expect(Math.abs(angulo(pontos) - (90 - (ANGULO_GRADE * 180) / Math.PI)), `angulo da rua em ${nome}`).toBeLessThan(0.5);
    }
  });

  it('as testadas longas da planta de 1932 nao torcem no jogo', () => {
    // as frentes mais longas do dado oficial, na direcao da grade: a reta que
    // prolonga a testada (400 m) tem de continuar reta depois de mapeada
    const frentes = lotes.fachadas
      .map((f) => ({
        f,
        comp: Math.hypot((f[3] - f[1]) * M_LON, (f[4] - f[2]) * M_LAT),
        ang: Math.atan2((f[3] - f[1]) * M_LON, (f[4] - f[2]) * M_LAT),
      }))
      .filter((o) => o.comp > 40)
      .sort((a, b) => b.comp - a.comp);
    // as que correm na direcao da grade (as ruas da cidade)
    const daGrade = frentes.filter((o) => {
      const dif = Math.abs(((o.ang - (Math.PI - ANGULO_GRADE) + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      return dif < 0.06; // uns 3,4 graus
    });
    expect(daGrade.length).toBeGreaterThan(5);
    for (const { f } of daGrade) {
      const lon = (f[1] + f[3]) / 2;
      const lat = (f[2] + f[4]) / 2;
      const pontos = linhaDaGrade(lon, lat);
      expect(barriga(pontos), `barriga na testada ${lon},${lat}`).toBeLessThan(0.5);
    }
  });
});
