// O filtro de quadrinho. Passes, em ordem:
//   1. cena: cor + profundidade (quão longe está cada pixel)
//      (o canal alfa da cor guarda o "peso" do objeto: personagem e gente têm traço mais forte;
//       as normais são reconstruídas da profundidade, sem desenhar a cena de novo)
//   3. oclusão (SSAO) em meia resolução: escurece cantos e o pé dos objetos
//   4. brilho (bloom) em um quarto da resolução: lâmpadas, janelas e sol estouram
//   5. tela: junta tudo com névoa em camadas, sombra fria, retícula, hachura,
//      nanquim, cor descasada, papel, grão, linhas de velocidade e vinheta.

import * as THREE from 'three'
import { criarAleatorio } from '../utils.js'

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

const COMUM = /* glsl */ `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
vec3 posVista(sampler2D prof, mat4 projInv, vec2 uv) {
  float d = texture2D(prof, uv).x;
  vec4 v = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}`

const fragOclusao = /* glsl */ `
uniform sampler2D tProf; uniform mat4 uProj; uniform mat4 uProjInv; uniform vec2 uTexel; uniform mat4 uCamMundo;
uniform float uRaio; uniform vec3 uKernel[12];
varying vec2 vUv;
${COMUM}
void main() {
  float d = texture2D(tProf, vUv).x;
  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }
  vec3 p = posVista(tProf, uProjInv, vUv);
  // normal pela profundidade dos vizinhos. O passo é de 2 pixels da profundidade (1 pixel desta
  // passada em meia resolução): com 1 pixel o vizinho às vezes era o mesmo pixel e a normal
  // virava lixo em fileiras inteiras (as riscas). De cada lado, usa o vizinho com menor salto.
  vec2 dx = vec2(uTexel.x * 2.0, 0.0);
  vec2 dy = vec2(0.0, uTexel.y * 2.0);
  vec3 pr = posVista(tProf, uProjInv, vUv + dx) - p;
  vec3 pl = p - posVista(tProf, uProjInv, vUv - dx);
  vec3 pu = posVista(tProf, uProjInv, vUv + dy) - p;
  vec3 pd = p - posVista(tProf, uProjInv, vUv - dy);
  vec3 ddx = abs(pr.z) < abs(pl.z) ? pr : pl;
  vec3 ddy = abs(pu.z) < abs(pd.z) ? pu : pd;
  vec3 n = normalize(cross(ddx, ddy));
  // ruído preso ao mundo (não à tela): não escorrega quando a câmera mexe
  vec3 pm = (uCamMundo * vec4(p, 1.0)).xyz;
  float a = hash(floor(pm.xz * 24.0) + floor(pm.y * 24.0) * 17.0) * 6.2831;
  vec3 r = vec3(cos(a), sin(a), 0.0);
  vec3 t = normalize(r - n * dot(r, n));
  mat3 tbn = mat3(t, cross(n, t), n);
  float raio = uRaio * (1.0 + -p.z * 0.015);
  float oc = 0.0;
  for (int i = 0; i < 12; i++) {
    // parte um pouco acima da superfície: evita o chão se auto-sombrear
    vec3 s = p + n * 0.08 * raio + tbn * uKernel[i] * raio;
    vec4 o = uProj * vec4(s, 1.0);
    vec2 suv = o.xy / o.w * 0.5 + 0.5;
    float zc = posVista(tProf, uProjInv, suv).z;
    float alcance = smoothstep(0.0, 1.0, raio / max(abs(p.z - zc), 1e-3));
    oc += step(s.z + 0.06 * raio + 0.012 * -p.z, zc) * alcance;
  }
  // superfície vista de raspão (chão longe): a normal reconstruída erra e vira riscas; some aos poucos
  float frontal = abs(dot(n, normalize(-p)));
  float ao = 1.0 - (oc / 12.0) * smoothstep(0.12, 0.35, frontal);
  gl_FragColor = vec4(ao, ao, ao, 1.0);
}`

const fragClaro = /* glsl */ `
uniform sampler2D tCor; uniform float uLimiar;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tCor, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(uLimiar, uLimiar + 0.6, l), 1.0);
}`

const fragDesfoque = /* glsl */ `
uniform sampler2D tFonte; uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(tFonte, vUv).rgb * 0.227;
  s += texture2D(tFonte, vUv + uDir * 1.38).rgb * 0.316;
  s += texture2D(tFonte, vUv - uDir * 1.38).rgb * 0.316;
  s += texture2D(tFonte, vUv + uDir * 3.23).rgb * 0.07;
  s += texture2D(tFonte, vUv - uDir * 3.23).rgb * 0.07;
  gl_FragColor = vec4(s, 1.0);
}`

const fragTela = /* glsl */ `
uniform sampler2D tCor; uniform sampler2D tProf; uniform sampler2D tOclusao; uniform sampler2D tBrilho; uniform sampler2D tLuz;
uniform float uModo; uniform float uLimLuzPontos; uniform float uIntPontosLuz; uniform vec3 uCorPontoLuz;
uniform float uLimHachuraLuz; uniform float uHachuraAO; uniform float uHachuraCruzada; uniform float uBloomPontos; uniform float uNoite; uniform float uDistReticula;
uniform vec2 uRes; uniform float uPR; uniform float uTempo; uniform float uNear; uniform float uFar;
uniform mat4 uProjInv; uniform mat4 uCamMundo;
uniform float uEspLinha; uniform float uLimProf; uniform float uLimNormal; uniform float uDistLinha; uniform float uTremor;
uniform vec3 uCorTinta; uniform float uIntTinta; uniform float uPesoCenario;
uniform float uAberracao; uniform float uDesalinho;
uniform float uTamPonto; uniform float uLimRet; uniform float uIntRet; uniform vec3 uCorRet; uniform float uTintaRet;
uniform float uHachura; uniform float uEspHachura; uniform float uLimHachura;
uniform float uSaturacao; uniform float uExposicao; uniform float uGrao; uniform float uPapel; uniform float uVinheta;
uniform float uDesfoque; uniform float uFoco; uniform float uVelocidade;
uniform float uOclusao; uniform float uBrilho; uniform vec2 uDesloc;
uniform vec3 uNevoaCor; uniform float uNevoaDens; uniform float uNevoaQueda; uniform float uMaresia;
uniform vec3 uCorSombra; uniform float uTomSombra; uniform vec3 uCorLuz; uniform float uTomLuz;
uniform float uArcane; uniform float uArcLinha; uniform vec3 uSolTela; uniform float uFlare; uniform vec3 uCorFlare; uniform float uArcContraste; uniform float uArcExposicao;
uniform float uMemoria; uniform vec3 uMemPapel; uniform vec3 uMemTinta; uniform vec3 uMemAnil; uniform vec3 uMemUrucum; uniform vec3 uMemOcre;
varying vec2 vUv;
${COMUM}

float distancia(vec2 uv) {
  float d = texture2D(tProf, uv).x;
  return -(uNear * uFar) / ((uFar - uNear) * d - uFar);
}
vec3 paraSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// retícula de impressão: uma grade de pontos girada; o ponto cresce com a cobertura de tinta
float pontoGrade(vec2 p, float ang, float tam, float cobertura) {
  float c = cos(ang), s = sin(ang);
  vec2 g = mat2(c, -s, s, c) * p / tam;
  float d = length(fract(g) - 0.5);
  float r = 0.7 * sqrt(clamp(cobertura, 0.0, 1.0));
  float aa = clamp(fwidth(d), 0.01, 0.1);
  return (1.0 - smoothstep(r - aa, r + aa, d)) * step(0.002, cobertura);
}
vec3 paraHSV(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
float distMatiz(float a, float b) { float d = abs(a - b); return min(d, 1.0 - d); }
vec3 corDescasada(vec2 uv) {
  vec2 d = uv - 0.5;
  vec2 off = d * dot(d, d) * uAberracao * 4.0;
  vec2 reg = vec2(uDesalinho, -uDesalinho * 0.6) * uPR / uRes;
  vec2 u = uv + reg;
  return vec3(texture2D(tCor, u + off).r, texture2D(tCor, u).g, texture2D(tCor, u - off).b);
}

void main() {
  vec2 uv = vUv;
  vec2 px = gl_FragCoord.xy / uPR;
  float dc = distancia(uv);
  float ceu = step(uFar * 0.9, dc);

  // 1. cor, aberração e fundo desfocado
  vec3 cor = corDescasada(uv);
  if (uDesfoque > 0.0) {
    float k = smoothstep(uFoco, uFoco * 4.0, dc) * uDesfoque;
    if (k > 0.02) {
      vec2 passo = k * 4.0 * uPR / uRes;
      vec3 soma = cor;
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.785398;
        soma += corDescasada(uv + vec2(cos(a), sin(a)) * passo);
      }
      cor = soma / 9.0;
    }
  }

  // 2. oclusão nos cantos (borrada com 5 amostras)
  vec2 to = 3.0 / uRes;
  float ao = texture2D(tOclusao, uv).r * 0.4;
  ao += texture2D(tOclusao, uv + vec2(to.x, 0.0)).r * 0.15;
  ao += texture2D(tOclusao, uv - vec2(to.x, 0.0)).r * 0.15;
  ao += texture2D(tOclusao, uv + vec2(0.0, to.y)).r * 0.15;
  ao += texture2D(tOclusao, uv - vec2(0.0, to.y)).r * 0.15;
  cor *= mix(1.0, ao, uOclusao * (1.0 - ceu));

  // 3. névoa em camadas: mais densa embaixo, perto do mar
  if (ceu < 0.5) {
    vec3 pv = posVista(tProf, uProjInv, uv);
    vec3 pm = (uCamMundo * vec4(pv, 1.0)).xyz;
    float nev = (1.0 - exp(-length(pv) * uNevoaDens)) * exp(-max(pm.y, 0.0) * uNevoaQueda);
    cor = mix(cor, uNevoaCor, clamp(nev, 0.0, 1.0));
    // maresia: a partir de ~20 m a cor perde saturação e contraste e clareia para a névoa
    // (perspectiva atmosférica: o fundo vira silhueta clara, a frente guarda a cor)
    float km = 1.0 - exp(-max(length(pv) - 20.0, 0.0) * uMaresia);
    float Lc = dot(cor, vec3(0.299, 0.587, 0.114));
    cor = mix(cor, vec3(Lc), km * 0.6);
    cor = mix(cor, uNevoaCor, km * 0.3);
  }

  // grade de pontos: acompanha o giro da câmera, para não escorregar sobre o mundo
  mat2 gira = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  vec2 pg = px + uDesloc;
  vec2 grade = gira * pg / uTamPonto;
  float dPonto = length(fract(grade) - 0.5);
  float aa = clamp(fwidth(dPonto), 0.01, 0.08); // borda do ponto suavizada pelo tamanho do pixel

  // 4. brilho das luzes: feito de pontos que crescem com a intensidade (ou halo liso)
  // o céu e as nuvens não viram bola de brilho (só luzes e reflexos perto)
  vec3 bri = texture2D(tBrilho, uv).rgb * uBrilho * (1.0 - smoothstep(250.0, 450.0, dc));
  // Arcane: contra o sol a figura fica escura e só a borda brilha; o halo do sol não lava o que está perto
  if (uArcane > 0.5) bri *= mix(0.12, 1.0, smoothstep(10.0, 60.0, dc));
  float bl = max(bri.r, max(bri.g, bri.b));
  // brilho fraco não vira ponto (senão o resto do halo suja a tela inteira)
  float rB = 0.62 * sqrt(smoothstep(0.05, 0.6, bl));
  float pB = 1.0 - smoothstep(rB - aa, rB + aa, dPonto);
  cor += bri * mix(1.0, pB * 2.2, uBloomPontos);

  cor = paraSRGB(cor * uExposicao);
  if (uArcane > 0.5) {
    // gradação (visual Arcane): menos lavado, sombras mais fundas; curva em S na luminância, o matiz fica
    float Lg = dot(cor, vec3(0.299, 0.587, 0.114));
    float Ln = clamp((Lg * uArcExposicao - 0.5) * uArcContraste + 0.5, 0.0, 1.0);
    Ln = mix(Ln, Ln * Ln * (3.0 - 2.0 * Ln), 0.35);
    cor *= Ln / max(Lg, 1e-3);
  }
  float L = dot(cor, vec3(0.299, 0.587, 0.114));

  // 5. sombra fria e luz quente
  cor *= mix(vec3(1.0), uCorSombra * 1.6, uTomSombra * (1.0 - smoothstep(0.05, 0.55, L)));
  cor = mix(cor, cor * uCorLuz * 1.2, uTomLuz * smoothstep(0.55, 1.0, L));
  L = dot(cor, vec3(0.299, 0.587, 0.114));

  float tremorH = ruido((px + uDesloc) * 0.05 + uTempo * 2.0) * 0.6;
  if (uArcane > 0.5) {
    // visual Arcane: sem retícula nem hachura (as faixas de luz são pintadas no material, materiais.js)
  } else if (uModo > 0.5) {
    // LUZ COMO MÁSCARA (como no Aranhaverso e no Hi-Fi Rush): quem decide é a luz que chega
    // na superfície, não a cor final. Asfalto escuro no sol não ganha hachura; parede branca
    // na sombra ganha.
    // longe, superfície pequena + padrão de tamanho fixo na tela = cintilação; some aos poucos
    float pertoR = 1.0 - smoothstep(uDistReticula * 0.45, uDistReticula, dc);
    vec4 luzT = texture2D(tLuz, uv);
    float lr = luzT.r;
    float emis = luzT.g;

    // 6. pontos na luz: onde a luz é forte e onde algo brilha (janela, poste, reflexo)
    // à noite a luz da lua não vira ponto; só o que brilha (janela, poste)
    float forte = clamp(smoothstep(uLimLuzPontos - 0.15, uLimLuzPontos + 0.3, lr) * (1.0 - 0.85 * uNoite) + emis * 0.6, 0.0, 1.0) * (1.0 - ceu) * pertoR;
    float rL = 0.45 * sqrt(forte);
    float pL = 1.0 - smoothstep(rL - aa, rL + aa, dPonto);
    cor = mix(cor, mix(cor, uCorPontoLuz, 0.75), pL * uIntPontosLuz);

    // 7. hachura na sombra: pela luz recebida e pelos cantos (a oclusão vira traço, não cinza)
    float sombraL = 1.0 - smoothstep(uLimHachuraLuz - 0.14, uLimHachuraLuz + 0.04, lr);
    // a oclusão é ruidosa a média distância: lá ela ligava e desligava a hachura (padrão "mexendo")
    float sombraAO = smoothstep(0.08, 0.35, (1.0 - ao) * uHachuraAO) * (1.0 - smoothstep(20.0, 45.0, dc));
    float s = max(sombraL, sombraAO) * (1.0 - ceu) * pertoR;
    // hachura cruzada só no quase breu (debaixo de toldo, beco, fundo de varanda)
    float funda = (1.0 - smoothstep(uLimHachuraLuz * 0.12, uLimHachuraLuz * 0.28, lr)) * (1.0 - ceu) * pertoR;
    float larg = mix(0.05, 0.14, s);
    float h1 = abs(fract((pg.x - pg.y) / uEspHachura + tremorH) - 0.5);
    float aaH = clamp(fwidth(h1), 0.005, 0.08);
    float l1 = 1.0 - smoothstep(larg - aaH, larg + aaH, h1);
    float h2 = abs(fract((pg.x + pg.y) / (uEspHachura * 1.3) + tremorH) - 0.5);
    float l2 = 1.0 - smoothstep(larg - aaH, larg + aaH, h2);
    cor = mix(cor, uCorTinta, l1 * s * uHachura);
    cor = mix(cor, uCorTinta, l2 * funda * uHachura * uHachuraCruzada);
  } else {
    // modo antigo: retícula escurece a sombra, decidida pela luminância da cor final
    float sombra = (1.0 - smoothstep(uLimRet - 0.18, uLimRet + 0.04, L)) * (1.0 - ceu * 0.85);
    float raio = 0.62 * sqrt(sombra);
    float ponto = 1.0 - smoothstep(raio - aa, raio + aa, dPonto);
    cor = mix(cor, mix(cor * 0.5, uCorRet, uTintaRet), ponto * sombra * uIntRet);
    float h = abs(fract((pg.x - pg.y) / uEspHachura + tremorH) - 0.5);
    float linhaH = 1.0 - smoothstep(0.06, 0.14, h);
    float fundo = (1.0 - smoothstep(uLimHachura - 0.08, uLimHachura, L)) * (1.0 - ceu);
    cor = mix(cor, uCorTinta, linhaH * fundo * uHachura);
  }

  // 8. nanquim: mais grosso perto, fino longe, forte no personagem, leve no cenário
  // alfa 1 = cenário, ~0,85 = gente, ~0,5 = personagem
  float alfa = texture2D(tCor, uv).a;
  float peso = alfa < 0.7 ? 1.0 : (alfa < 0.95 ? 0.8 : 0.45);
  float escala = mix(1.0, 0.45, smoothstep(6.0, 90.0, dc)) * mix(1.0, 1.35, step(0.9, peso));
  vec2 tremor = (vec2(ruido(px / 23.0 + uTempo * 5.3), ruido(px / 23.0 + 9.1 + uTempo * 5.3)) - 0.5) * uTremor * uPR / uRes;
  // amostras presas ao centro do pixel e a um número inteiro de pixels: com deslocamento
  // fracionado, o vizinho da esquerda e o da direita arredondavam para distâncias diferentes
  // e o chão liso ganhava "dobras" no desenho do ruído do tremor (manchas escuras ao longe)
  vec2 uvE = (floor((uv + tremor) * uRes) + 0.5) / uRes;
  vec2 o = max(1.0, floor(uEspLinha * escala * uPR + 0.5)) / uRes;
  float d0 = distancia(uvE);
  float dl = distancia(uvE - vec2(o.x, 0.0));
  float dr = distancia(uvE + vec2(o.x, 0.0));
  float dd = distancia(uvE - vec2(0.0, o.y));
  float du = distancia(uvE + vec2(0.0, o.y));
  float lap = abs(dl + dr - 2.0 * d0) + abs(du + dd - 2.0 * d0);
  float bordaP = smoothstep(uLimProf, uLimProf * 2.0, lap / max(d0, 0.001));
  // dobra (quina de prédio, degrau): a inclinação da profundidade muda de um lado para o outro
  // medida no inverso da distância: num plano ele varia em linha reta na tela, então chão visto
  // de raspão dá zero (na distância direta ele curva e virava manchas escuras ao longe)
  float w0 = 1.0 / d0, wl = 1.0 / dl, wr = 1.0 / dr, wd = 1.0 / dd, wu = 1.0 / du;
  float gx = abs((wr - w0) - (w0 - wl)) / max(abs(wr - wl), 0.02 * w0);
  float gy = abs((wu - w0) - (w0 - wd)) / max(abs(wu - wd), 0.02 * w0);
  float bordaN = smoothstep(uLimNormal, uLimNormal + 0.4, max(gx, gy)) * 0.8;
  float dmin = min(d0, min(min(dl, dr), min(du, dd)));
  float alcance = mix(uDistLinha, uDistLinha * 3.0, step(0.9, peso));
  float perto = 1.0 - smoothstep(alcance * 0.5, alcance, dmin);
  float forca = mix(uPesoCenario, 1.0, smoothstep(0.3, 1.0, peso));
  float borda = max(bordaP, bordaN) * perto * forca;
  if (uArcane > 0.5) {
    // Arcane quase não tem linha: só a silhueta, fina, na cor do próprio objeto escurecida (nunca preta);
    // as linhas de dentro (pálpebra, vinco, costura) moram na pintura
    vec3 tintaLocal = cor * vec3(0.32, 0.3, 0.38);
    cor = mix(cor, tintaLocal, bordaP * perto * forca * uArcLinha);
  } else {
    cor = mix(cor, uCorTinta, borda * uIntTinta);
  }

  // 9. saturação, papel e grão
  float Lm = dot(cor, vec3(0.299, 0.587, 0.114));
  cor = mix(vec3(Lm), cor, uSaturacao);

  // MEMÓRIA (1881): a cena vira página de jornal ilustrado, em cinco tintas sobre papel.
  // Cada tinta tem sua grade de pontos girada; a cor decide qual tinta cai e quanto.
  if (uMemoria > 0.001) {
    vec3 hsv = paraHSV(clamp(cor, 0.0, 1.0));
    // a memória é clara: papel aparecendo; só cor saturada de verdade ganha tinta colorida
    float Lp = pow(dot(cor, vec3(0.299, 0.587, 0.114)), 0.75);
    float k = smoothstep(0.22, 0.75, hsv.y) * smoothstep(0.05, 0.35, hsv.z) * 0.85;
    float wR = 1.0 - smoothstep(0.02, 0.06, distMatiz(hsv.x, 0.0));
    float wY = 1.0 - smoothstep(0.05, 0.16, distMatiz(hsv.x, 0.11));
    float wB = 1.0 - smoothstep(0.1, 0.25, distMatiz(hsv.x, 0.58));
    float wG = 1.0 - smoothstep(0.08, 0.2, distMatiz(hsv.x, 0.33)); // verde = ocre + anil
    wY = max(wY, wG * 0.75);
    wB = max(wB, wG * 0.8);
    float tamM = uTamPonto * 1.5;
    vec3 imp = uMemPapel;
    imp *= mix(vec3(1.0), uMemOcre, pontoGrade(pg, 0.0, tamM, wY * k * 0.55));
    imp *= mix(vec3(1.0), uMemUrucum, pontoGrade(pg + vec2(1.3, 0.7), 0.26, tamM, wR * k));
    imp *= mix(vec3(1.0), uMemAnil, pontoGrade(pg + vec2(0.4, 1.9), 1.31, tamM, wB * k));
    float escuro = smoothstep(0.3, 0.95, 1.0 - Lp);
    imp *= mix(vec3(1.0), uMemTinta, pontoGrade(pg, 0.785, tamM * 0.85, escuro * escuro * 0.95));
    cor = mix(cor, imp, uMemoria);
  }
  cor *= 1.0 - uPapel * (ruido(px * 0.35) * 0.6 + ruido(px * 0.04) * 0.4);
  cor += (hash(floor(px) + fract(uTempo * 7.13) * 91.7) - 0.5) * uGrao;

  // 10. linhas de velocidade quando corre
  vec2 dv = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float rv = length(dv);
  if (uVelocidade > 0.01) {
    float a = atan(dv.y, dv.x);
    float raia = step(0.8, ruido(vec2(a * 38.0, uTempo * 9.0)));
    cor = mix(cor, vec3(1.0), raia * smoothstep(0.38, 0.75, rv) * uVelocidade * 0.55);
  }

  // 11. reflexo de lente (lens flare): olhando para o sol, a lente faz uma faixa horizontal atravessando
  // o sol (anamórfica, de cinema), um brilho em volta dele, fantasmas coloridos na linha do sol ao centro
  // e um anel. Só com o sol à vista: some quando algo tapa o sol (profundidade em volta dele)
  if (uFlare > 0.001 && uSolTela.z > 0.5) {
    vec2 sp = uSolTela.xy;
    float vis = 0.0;
    for (int i = -2; i <= 2; i++) for (int k = -2; k <= 2; k++) {
      vec2 q = sp + vec2(float(i), float(k)) * 0.007;
      vis += (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) ? step(uFar * 0.9, distancia(q)) : 0.0;
    }
    vis /= 25.0;
    if (vis > 0.0) {
      float asp = uRes.x / uRes.y;
      vec2 dc2 = vec2(0.5) - sp; // do sol para o centro
      vec3 fl = vec3(0.0);
      // fantasmas: discos de tamanhos e tons diferentes ao longo da linha (e além do centro)
      for (int g = 0; g < 6; g++) {
        float fg = float(g);
        float t = 0.35 + fg * 0.33 + fg * fg * 0.03;
        float tam = 0.025 + 0.03 * fract(fg * 0.618 + 0.3) + (g == 3 ? 0.05 : 0.0);
        vec3 tom = mix(vec3(0.55, 0.85, 1.0), vec3(1.0, 0.65, 0.35), fract(fg * 0.37));
        float r = length((uv - (sp + dc2 * t)) * vec2(asp, 1.0));
        float disco = smoothstep(tam, tam * 0.55, r) * (0.06 + 0.05 * fract(fg * 0.71));
        float aro = smoothstep(tam * 0.12, 0.0, abs(r - tam)) * 0.05; // borda mais marcada, como íris
        fl += tom * (disco + aro);
      }
      // anel grande em volta do centro, com borda de arco-íris
      float rc = length((uv - 0.5) * vec2(asp, 1.0));
      float anel = smoothstep(0.03, 0.0, abs(rc - 0.42)) * 0.05;
      fl += anel * mix(vec3(1.0, 0.5, 0.3), vec3(0.4, 0.7, 1.0), smoothstep(0.39, 0.45, rc));
      // faixa anamórfica e brilho no sol
      float dx = abs(uv.x - sp.x) * asp, dy = abs(uv.y - sp.y);
      float faixa = exp(-dy * 160.0) * exp(-dx * 1.8) * 0.45;
      float rs = length((uv - sp) * vec2(asp, 1.0));
      float brilhoS = exp(-rs * 7.0) * 0.3;
      fl += uCorFlare * (faixa + brilhoS) + uCorFlare * fl * 0.6;
      cor += fl * vis * uFlare;
    }
  }

  // 11. vinheta
  cor *= 1.0 - uVinheta * smoothstep(0.45, 1.05, rv);
  gl_FragColor = vec4(clamp(cor, 0.0, 1.0), 1.0);
}`

const SEPIA = new THREE.Vector3(0x3b / 255, 0x2a / 255, 0x22 / 255)

// Cor em hexadecimal para vec3 no espaço sRGB (o fim do filtro trabalha em sRGB).
function srgb(hex, alvo) {
  const n = parseInt(hex.replace('#', ''), 16)
  return alvo.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function gerarKernel() {
  const k = []
  const rnd = criarAleatorio(12)
  for (let i = 0; i < 12; i++) {
    const v = new THREE.Vector3(rnd.entre(-1, 1), rnd.entre(-1, 1), rnd.entre(0.15, 1)).normalize()
    const s = i / 12
    v.multiplyScalar(0.15 + 0.85 * s * s)
    k.push(v)
  }
  return k
}

export class Aranhaverso {
  constructor(renderer, cena, camera, cfg, globais) {
    this.renderer = renderer
    this.cena = cena
    this.camera = camera
    this.cfg = cfg
    this.globais = globais
    this.velocidade = 0
    this.sinalGiro = -1 // medido: a grade precisa andar ao contrário do ponto na tela

    const prof = new THREE.DepthTexture(1, 1)
    prof.type = THREE.FloatType
    const meia = { type: THREE.HalfFloatType, depthBuffer: false }
    // duas imagens de uma vez: [0] cor, [1] luz recebida (escrita por cada material em gLuz)
    this.rtCor = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: prof, count: 2 })
    this.rtOclusao = new THREE.WebGLRenderTarget(1, 1, meia)
    this.rtBrilhoA = new THREE.WebGLRenderTarget(1, 1, meia)
    this.rtBrilhoB = new THREE.WebGLRenderTarget(1, 1, meia)
    this.corFundo = new THREE.Color(0, 0, 0)

    const v3 = () => ({ value: new THREE.Vector3() })
    this.uOclusao = {
      tProf: { value: prof }, uTexel: { value: new THREE.Vector2(1, 1) },
      uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uCamMundo: { value: new THREE.Matrix4() },
      uRaio: { value: 1.4 }, uKernel: { value: gerarKernel() },
    }
    this.uClaro = { tCor: { value: this.rtCor.textures[0] }, uLimiar: { value: 1.0 } }
    this.uDesfoque = { tFonte: { value: null }, uDir: { value: new THREE.Vector2() } }
    this.uTela = {
      tCor: { value: this.rtCor.textures[0] }, tProf: { value: prof }, tLuz: { value: this.rtCor.textures[1] },
      tOclusao: { value: this.rtOclusao.texture }, tBrilho: { value: this.rtBrilhoA.texture },
      uRes: { value: new THREE.Vector2(1, 1) }, uPR: { value: 1 }, uTempo: { value: 0 },
      uNear: { value: camera.near }, uFar: { value: camera.far },
      uProjInv: { value: new THREE.Matrix4() }, uCamMundo: { value: new THREE.Matrix4() },
      uEspLinha: { value: 1 }, uLimProf: { value: 0.07 }, uLimNormal: { value: 0.3 }, uDistLinha: { value: 160 }, uTremor: { value: 1 },
      uCorTinta: v3(), uIntTinta: { value: 1 }, uPesoCenario: { value: 0.55 },
      uAberracao: { value: 0 }, uDesalinho: { value: 0 },
      uTamPonto: { value: 6 }, uLimRet: { value: 0.45 }, uIntRet: { value: 1 }, uCorRet: v3(), uTintaRet: { value: 0.3 },
      uHachura: { value: 0.5 }, uEspHachura: { value: 5 }, uLimHachura: { value: 0.2 },
      uSaturacao: { value: 1.2 }, uExposicao: { value: 1 }, uGrao: { value: 0.05 }, uPapel: { value: 0.05 }, uVinheta: { value: 0.3 },
      uDesfoque: { value: 0.5 }, uFoco: { value: 140 }, uVelocidade: { value: 0 },
      uOclusao: { value: 0.8 }, uBrilho: { value: 0.6 }, uDesloc: { value: new THREE.Vector2() },
      uModo: { value: 1 }, uLimLuzPontos: { value: 0.95 }, uIntPontosLuz: { value: 0.5 }, uCorPontoLuz: v3(),
      uLimHachuraLuz: { value: 0.45 }, uHachuraAO: { value: 1 }, uHachuraCruzada: { value: 0.7 }, uBloomPontos: { value: 0.85 }, uNoite: { value: 0 }, uDistReticula: { value: 200 },
      uNevoaCor: { value: new THREE.Color() }, uNevoaDens: { value: 0.002 }, uNevoaQueda: { value: 0.05 }, uMaresia: { value: 0.006 },
      uMemoria: { value: 0 }, uMemPapel: v3(), uMemTinta: v3(), uMemAnil: v3(), uMemUrucum: v3(), uMemOcre: v3(),
      uCorSombra: v3(), uTomSombra: { value: 0.3 }, uCorLuz: v3(), uTomLuz: { value: 0.2 },
      uSolTela: { value: new THREE.Vector3() }, uFlare: { value: 0 }, uCorFlare: { value: new THREE.Color(1, 0.8, 0.6) },
      uArcane: { value: 0 }, uArcLinha: { value: 0.7 }, uArcContraste: { value: 1.15 }, uArcExposicao: { value: 0.94 },
    }

    const shader = (frag, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag, depthTest: false, depthWrite: false })
    this.matOclusao = shader(fragOclusao, this.uOclusao)
    this.matClaro = shader(fragClaro, this.uClaro)
    this.matDesfoque = shader(fragDesfoque, this.uDesfoque)
    this.matTela = shader(fragTela, this.uTela)
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.matTela)
    this.quad.frustumCulled = false
    this.cenaTela = new THREE.Scene()
    this.cenaTela.add(this.quad)
    this.camTela = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  }

  // Mantido para compatibilidade: não há mais passe de normais.
  coletarExcecoes() {}

  tamanho(largura, altura, pixelRatio) {
    const w = Math.max(1, Math.floor(largura * pixelRatio))
    const h = Math.max(1, Math.floor(altura * pixelRatio))
    this.rtCor.setSize(w, h)
    this.uOclusao.uTexel.value.set(1 / w, 1 / h)
    this.rtOclusao.setSize(Math.ceil(w / 2), Math.ceil(h / 2))
    this.rtBrilhoA.setSize(Math.ceil(w / 4), Math.ceil(h / 4))
    this.rtBrilhoB.setSize(Math.ceil(w / 4), Math.ceil(h / 4))
    this.uTela.uRes.value.set(w, h)
    this.uTela.uPR.value = pixelRatio
    this.tamBrilho = new THREE.Vector2(1 / Math.ceil(w / 4), 1 / Math.ceil(h / 4))
  }

  passo(material, alvo) {
    this.quad.material = material
    this.renderer.setRenderTarget(alvo)
    this.renderer.render(this.cenaTela, this.camTela)
  }

  render(tempo, velocidadeJogador) {
    this.atualizar(tempo, velocidadeJogador)
    this.desenhar()
  }

  // Todos os valores do filtro e dos globais do visual (Arcane, pincel), a partir do cfg. O modo webgpu
  // (aranhaverso-gpu.js) chama só esta parte e desenha com os mesmos objetos de uniform.
  atualizar(tempo, velocidadeJogador) {
    const e = this.cfg.estilo
    const u = this.uTela
    const r = this.renderer
    const cam = this.camera

    // visual Arcane (docs/pesquisa-arcane.md): o pintor de luz mora nos materiais; aqui saem a retícula,
    // a hachura, a aberração e o traço tremido, e o bloom vira halo liso
    const arc = e.visual === 'arcane'
    u.uArcane.value = arc ? 1 : 0
    u.uArcLinha.value = e.arcLinha
    u.uArcContraste.value = e.arcContraste
    u.uArcExposicao.value = e.arcExposicao
    const gl = this.globais
    gl.uArcane.value = arc ? 1 : 0
    gl.uArcLim.value.set(e.arcSombra, e.arcLuz)
    gl.uArcSuave.value = e.arcSuave
    gl.uArcPincel.value = e.arcPincel
    gl.uArcCorSombra.value.set(e.arcCorSombra)
    gl.uArcNiveis.value.set(e.arcNivelSombra, e.arcNivelMeio, e.arcNivelLuz)
    gl.uTexForca.value = e.arcTextura
    // sombra suave no visual Arcane: com a borda pintada dura, o PCF comum virava degraus (cara de baixa
    // resolução); o soft dá uma linha lisa. Trocar o tipo pede recompilar os materiais
    const tipoSombra = arc ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap
    if (this.renderer.shadowMap.type !== tipoSombra) {
      this.renderer.shadowMap.type = tipoSombra
      this.cena.traverse((o) => { if (o.material) for (const mt of [].concat(o.material)) mt.needsUpdate = true })
    }
    gl.uArcRim.value = arc ? e.arcRecorte : 0
    gl.uArcCeu.value = e.arcCeu
    // sol na tela, para o reflexo de lente: só quando está na frente da câmera
    {
      const dirS = this.globais.uSolDir.value
      const frenteCam = new THREE.Vector3()
      cam.getWorldDirection(frenteCam)
      const ps = cam.position.clone().addScaledVector(dirS, 1500).project(cam)
      const naFrente = dirS.dot(frenteCam) > 0.05 && Math.abs(ps.x) < 1.3 && Math.abs(ps.y) < 1.3
      u.uSolTela.value.set((ps.x + 1) / 2, (ps.y + 1) / 2, naFrente ? 1 : 0)
      // mais forte com o sol baixo (fim de tarde, manhã); nada à noite
      const baixo = 1 - THREE.MathUtils.smoothstep(dirS.y, 0.25, 0.75)
      const deDia = THREE.MathUtils.smoothstep(dirS.y, -0.02, 0.06) * (1 - this.globais.uNoite.value)
      u.uFlare.value = (e.reflexoLente ?? 0) * deDia * (0.45 + 0.55 * baixo)
      u.uCorFlare.value.copy(this.globais.uSolCor.value)
    }
    u.uTempo.value = Math.floor(tempo * e.fpsTraco) / e.fpsTraco
    u.uNear.value = cam.near
    u.uFar.value = cam.far
    u.uProjInv.value.copy(cam.projectionMatrixInverse)
    // quantos pixels a tela anda quando a câmera gira um radiano
    const pxPorRad = (this.uTela.uRes.value.y / this.uTela.uPR.value) / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2))
    const dir = new THREE.Vector3()
    cam.getWorldDirection(dir)
    const yaw = Math.atan2(dir.x, dir.z)
    const pitch = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1))
    if (this.yawAnterior !== undefined) {
      let dy = yaw - this.yawAnterior
      if (dy > Math.PI) dy -= Math.PI * 2
      if (dy < -Math.PI) dy += Math.PI * 2
      u.uDesloc.value.x += dy * pxPorRad * this.sinalGiro
      u.uDesloc.value.y += (pitch - this.pitchAnterior) * pxPorRad
    }
    this.yawAnterior = yaw
    this.pitchAnterior = pitch
    u.uCamMundo.value.copy(cam.matrixWorld)
    u.uEspLinha.value = e.espessuraLinha
    u.uLimProf.value = e.limiarProfundidade
    u.uLimNormal.value = e.limiarNormal
    u.uDistLinha.value = e.distanciaLinha
    u.uTremor.value = arc ? 0 : e.tremorLinha
    srgb(e.corTinta, u.uCorTinta.value)
    u.uCorTinta.value.lerp(SEPIA, e.memoria) // na memória o traço é sépia, a tinta do jornal
    u.uIntTinta.value = e.intensidadeTinta
    u.uPesoCenario.value = e.pesoCenario
    u.uAberracao.value = arc ? 0 : e.aberracao
    u.uDesalinho.value = (arc ? 0 : e.desalinho) + (3.2 - (arc ? 0 : e.desalinho)) * e.memoria // impressão antiga sai do registro
    u.uTamPonto.value = e.tamanhoPonto
    u.uLimRet.value = e.limiarReticula
    u.uIntRet.value = e.intensidadeReticula
    srgb(e.corReticula, u.uCorRet.value)
    u.uTintaRet.value = e.tintaReticula
    u.uHachura.value = e.hachura
    u.uEspHachura.value = e.espacoHachura
    u.uLimHachura.value = e.limiarHachura
    u.uSaturacao.value = arc ? e.arcSaturacao : e.saturacao
    u.uExposicao.value = e.exposicao
    u.uGrao.value = arc ? e.arcGrao : e.grao
    u.uPapel.value = (arc ? 0.02 : e.papel) + (0.2 - (arc ? 0.02 : e.papel)) * e.memoria
    u.uVinheta.value = e.vinheta
    u.uDesfoque.value = e.desfoqueFundo
    u.uFoco.value = e.focoDistancia
    u.uOclusao.value = e.oclusao
    u.uBrilho.value = e.brilho
    u.uModo.value = e.pontosNaLuz ? 1 : 0
    u.uLimLuzPontos.value = e.limiarLuzPontos
    u.uIntPontosLuz.value = e.intensidadePontosLuz
    srgb(e.corPontoLuz, u.uCorPontoLuz.value)
    u.uLimHachuraLuz.value = e.limiarHachuraLuz
    u.uHachuraAO.value = e.hachuraOclusao
    u.uHachuraCruzada.value = e.hachuraCruzada
    u.uBloomPontos.value = arc ? 0 : e.brilhoEmPontos
    u.uNoite.value = this.globais.uNoite.value
    u.uDistReticula.value = e.distanciaReticula
    u.uNevoaCor.value.copy(this.globais.uNevoaCor.value)
    u.uNevoaDens.value = e.nevoaDensidade * (arc ? e.arcAr : 1)
    u.uNevoaQueda.value = e.nevoaQueda
    u.uMaresia.value = e.maresia * (arc ? e.arcAr : 1)
    // época: 0 = 1932 (presente), 1 = 1881 (memória impressa)
    const mem = e.memoria
    u.uMemoria.value = mem
    srgb('#eadbb8', u.uMemPapel.value)
    srgb('#3b2a22', u.uMemTinta.value)
    srgb('#34507a', u.uMemAnil.value)
    srgb('#a8432e', u.uMemUrucum.value)
    srgb('#c08a3e', u.uMemOcre.value)
    srgb(e.corSombra, u.uCorSombra.value)
    u.uTomSombra.value = arc ? e.tomSombra * 0.4 : e.tomSombra
    srgb(e.corLuz, u.uCorLuz.value)
    u.uTomLuz.value = arc ? e.tomLuz * 0.5 : e.tomLuz
    // linhas de velocidade a partir de ~70% da corrida (o corpo novo corre a 4,5 m/s; o antigo a 9)
    const pj = this.cfg.personagem
    const ini = pj.corpoNovo ? pj.corridaNova * 0.7 : 6
    const faixa = pj.corpoNovo ? pj.corridaNova * 0.3 : 3
    const alvoVel = e.linhasVelocidade && !arc ? Math.min(1, Math.max(0, (velocidadeJogador - ini) / faixa)) : 0
    this.velocidade += (alvoVel - this.velocidade) * 0.1
    u.uVelocidade.value = this.velocidade
    this.globais.uPincel.value = e.pincel
    this.globais.uPincelEscala.value = e.pincelEscala
  }

  desenhar() {
    const e = this.cfg.estilo
    const r = this.renderer
    const cam = this.camera

    // 1. cena (sombra recalculada em todo quadro: quadro alternado deixava a sombra travada)
    r.shadowMap.needsUpdate = true
    r.setRenderTarget(this.rtCor)
    r.setClearColor(this.corFundo, 1)
    r.clear()
    r.render(this.cena, cam)

    // 3. oclusão
    if (e.oclusao > 0) {
      this.uOclusao.uProj.value.copy(cam.projectionMatrix)
      this.uOclusao.uProjInv.value.copy(cam.projectionMatrixInverse)
      this.uOclusao.uCamMundo.value.copy(cam.matrixWorld)
      this.uOclusao.uRaio.value = e.raioOclusao
      this.passo(this.matOclusao, this.rtOclusao)
    }

    // 4. brilho: separa o que é muito claro e borra em duas direções
    this.uClaro.uLimiar.value = e.limiarBrilho
    this.passo(this.matClaro, this.rtBrilhoA)
    for (let i = 0; i < 2; i++) {
      this.uDesfoque.tFonte.value = this.rtBrilhoA.texture
      this.uDesfoque.uDir.value.set(this.tamBrilho.x * (1 + i), 0)
      this.passo(this.matDesfoque, this.rtBrilhoB)
      this.uDesfoque.tFonte.value = this.rtBrilhoB.texture
      this.uDesfoque.uDir.value.set(0, this.tamBrilho.y * (1 + i))
      this.passo(this.matDesfoque, this.rtBrilhoA)
    }

    // 5. tela
    this.passo(this.matTela, null)
  }
}
