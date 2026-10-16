// Mar (e rio) num plano só, na altura zero.
// A cor vem da profundidade, lida do mapa de alturas: raso = turquesa, fundo = azul.
// Espuma e ondas são faixas chapadas que andam em direção à praia.

import * as THREE from 'three'
import { globais } from '../globais.js'
import { linhaCosta, rioX } from './mapa.js'
import { SAIDA_LUZ } from '../materiais.js'

const vert = /* glsl */ `
varying vec3 vMundo;
void main() {
  vec4 m = modelMatrix * vec4(position, 1.0);
  vMundo = m.xyz;
  gl_Position = projectionMatrix * viewMatrix * m;
}`

const frag = /* glsl */ `
uniform sampler2D tAltura; uniform vec4 uMapa; uniform vec2 uMapaTam;
uniform float uTempo; uniform vec3 uCorFundo; uniform vec3 uCorRaso; uniform vec3 uCorEspuma;
uniform vec3 uSolDir; uniform vec3 uSolCor; uniform vec3 uAmbiente; uniform float uNoite; uniform float uOndas;
uniform float uRio; uniform float uCostaRio;
uniform sampler2D tOnda; uniform vec2 uToqueCentro; uniform float uToqueArea;
uniform vec3 uNevoaCor; uniform float uNevoaPerto; uniform float uNevoaLonge;
varying vec3 vMundo;
${SAIDA_LUZ}

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ruido(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 uv = ((vMundo.xz - uMapa.xy) / uMapa.z + 0.5) / uMapaTam;
  float dentro = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float alt = mix(-14.0, texture2D(tAltura, uv).r, dentro);
  float prof = max(0.0, -alt);

  float raso = 1.0 - smoothstep(0.0, 7.0, prof);
  vec3 cor = mix(uCorFundo, uCorRaso, raso);

  // ondas chapadas (duas manchas de ruído andando)
  float n = ruido(vMundo.xz * 0.045 + vec2(uTempo * 0.05, uTempo * 0.03));
  float n2 = ruido(vMundo.xz * 0.11 - vec2(uTempo * 0.08, 0.0));
  float faixa = step(0.62, fract(n * 2.0 + n2 * 0.6 + uTempo * 0.04));
  cor = mix(cor, cor * 1.18 + 0.03, faixa * 0.6 * uOndas);

  // rio: água mais verde e mais escura que o mar
  float rio = uRio * step(1.0, vMundo.z - uCostaRio) * (1.0 - step(60.0, abs(vMundo.x - 10.0))) * dentro;
  cor = mix(cor, mix(uCorFundo, vec3(0.05, 0.42, 0.36), 0.7), rio * 0.75);

  // linhas de espuma chegando na praia, em traços quebrados como pincel
  float chegando = fract(prof * 0.55 - uTempo * 0.25 + n * 0.4);
  float tracejado = step(0.38, ruido(vMundo.xz * vec2(0.18, 0.5) + vec2(uTempo * 0.1, 0.0)));
  float espuma = step(chegando, 0.05) * tracejado * (1.0 - smoothstep(1.0, 3.2, prof)) * uOndas * (1.0 - rio);
  // borda de espuma colada na areia
  float borda = 1.0 - smoothstep(0.05, 0.35 + 0.15 * sin(uTempo * 1.3 + vMundo.x * 0.07), prof);
  cor = mix(cor, uCorEspuma, max(espuma, borda * dentro));

  // ondinhas de quem entrou na água: crista clara, cava um pouco mais escura
  vec2 uvO = (vMundo.xz - uToqueCentro) / uToqueArea + 0.5;
  float ondinha = 0.0;
  if (uvO.x > 0.0 && uvO.x < 1.0 && uvO.y > 0.0 && uvO.y < 1.0) ondinha = texture2D(tOnda, uvO).r;
  // só a crista do anel fica clara (faixa fina), como traço de espuma desenhado
  float crista = smoothstep(0.04, 0.08, ondinha) * (1.0 - smoothstep(0.22, 0.4, ondinha));
  cor = mix(cor, uCorEspuma, crista * 0.85);
  cor *= 1.0 - smoothstep(0.03, 0.14, -ondinha) * 0.18;

  // brilho do sol: traços brancos na direção do sol
  vec3 v = normalize(cameraPosition - vMundo);
  vec3 r = reflect(-v, vec3(0.0, 1.0, 0.0));
  float brilho = pow(max(dot(r, normalize(uSolDir)), 0.0), 60.0);
  float tracos = step(0.55, ruido(vec2(vMundo.x * 0.6, vMundo.z * 0.15 + uTempo * 0.6)));
  float reflexo = step(0.35, brilho) * tracos * (1.0 - uNoite);
  cor += uSolCor * reflexo * 0.9;

  // luz: ambiente + sol
  float luz = max(dot(vec3(0.0, 1.0, 0.0), normalize(uSolDir)), 0.0);
  cor *= uAmbiente * 1.6 + uSolCor * luz * 0.55 * (1.0 - uNoite);

  float dist = length(cameraPosition - vMundo);
  cor = mix(cor, uNevoaCor, smoothstep(uNevoaPerto, uNevoaLonge, dist));
  gl_FragColor = vec4(cor, 1.0);
  // o mar é sempre "iluminado"; os reflexos do sol contam como brilho (viram pontos)
  gLuz = vec4(0.8, reflexo * 1.5 + crista * 0.8, 0.0, 1.0);
}`

export function criarMar(cena, mapaAltura, cfg, toque) {
  const uniformes = {
    tAltura: { value: mapaAltura.textura },
    uMapa: { value: mapaAltura.uMapa },
    uMapaTam: { value: mapaAltura.uMapaTam },
    uTempo: globais.uTempo,
    uCorFundo: { value: new THREE.Color(cfg.mar.corFundo) },
    uCorRaso: { value: new THREE.Color(cfg.mar.corRaso) },
    uCorEspuma: { value: new THREE.Color(cfg.mar.corEspuma) },
    uOndas: { value: cfg.mar.ondas },
    uRio: { value: 1 },
    uCostaRio: { value: linhaCosta(rioX(0)) },
    tOnda: toque.tOnda, uToqueCentro: toque.uToqueCentro, uToqueArea: toque.uToqueArea,
    uSolDir: globais.uSolDir,
    uSolCor: globais.uSolCor,
    uAmbiente: globais.uAmbiente,
    uNoite: globais.uNoite,
    uNevoaCor: globais.uNevoaCor,
    uNevoaPerto: globais.uNevoaPerto,
    uNevoaLonge: globais.uNevoaLonge,
  }
  const geo = new THREE.PlaneGeometry(5000, 5000, 1, 1)
  geo.rotateX(-Math.PI / 2)
  const mar = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: uniformes, vertexShader: vert, fragmentShader: frag }))
  mar.position.y = 0
  mar.name = 'mar'
  cena.add(mar)

  return {
    malha: mar,
    atualizar(centro) {
      mar.position.x = centro.x
      mar.position.z = centro.z
      uniformes.uCorFundo.value.set(cfg.mar.corFundo)
      uniformes.uCorRaso.value.set(cfg.mar.corRaso)
      uniformes.uCorEspuma.value.set(cfg.mar.corEspuma)
      uniformes.uOndas.value = cfg.mar.ondas
    },
  }
}
