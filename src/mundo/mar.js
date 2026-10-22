// Mar (e rio) num plano só, na altura zero.
// A cor vem da profundidade, lida do mapa de alturas: raso = turquesa, fundo = azul.
// Espuma e ondas são faixas chapadas que andam em direção à praia.

import * as THREE from 'three'
import { globais } from '../globais.js'
import { linhaCosta, rioX } from './mapa.js'
import { SAIDA_LUZ } from '../materiais.js'
import { amostraAlvo, funcoes } from '../render/gpu/comum.js'
import { CRISTA } from './toque.js'

const f = (v) => v.toFixed(4) // número para o GLSL

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
uniform float uRio; uniform float uCostaRio; uniform float uRioX;
uniform sampler2D tOnda; uniform vec2 uOndaCentro; uniform float uOndaArea;
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
  float rio = uRio * step(1.0, vMundo.z - uCostaRio) * (1.0 - step(60.0, abs(vMundo.x - uRioX))) * dentro;
  cor = mix(cor, mix(uCorFundo, vec3(0.05, 0.42, 0.36), 0.7), rio * 0.75);

  // linhas de espuma chegando na praia, em traços quebrados como pincel
  float chegando = fract(prof * 0.55 - uTempo * 0.25 + n * 0.4);
  float tracejado = step(0.38, ruido(vMundo.xz * vec2(0.18, 0.5) + vec2(uTempo * 0.1, 0.0)));
  float espuma = step(chegando, 0.05) * tracejado * (1.0 - smoothstep(1.0, 3.2, prof)) * uOndas * (1.0 - rio);
  // borda de espuma colada na areia
  float borda = 1.0 - smoothstep(0.05, 0.35 + 0.15 * sin(uTempo * 1.3 + vMundo.x * 0.07), prof);
  cor = mix(cor, uCorEspuma, max(espuma, borda * dentro));

  // ondinhas de quem entrou na água: crista clara, cava um pouco mais escura
  vec2 uvO = (vMundo.xz - uOndaCentro) / uOndaArea + 0.5;
  float ondinha = 0.0;
  if (uvO.x > 0.0 && uvO.x < 1.0 && uvO.y > 0.0 && uvO.y < 1.0) ondinha = texture2D(tOnda, uvO).r;
  // só a crista do anel fica clara (faixa fina), como traço de espuma desenhado (CRISTA, toque.js)
  float crista = smoothstep(${f(CRISTA.de)}, ${f(CRISTA.cheia)}, ondinha) * (1.0 - smoothstep(${f(CRISTA.some)}, ${f(CRISTA.fim)}, ondinha));
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

// O mar em TSL, para o modo webgpu (motor F2, KAN-68): as mesmas contas de frag
function marTsl({ W, ref }, u) {
  const { vec2, vec3, vec4, float, max, mix, step, smoothstep, fract, sin, pow, dot, normalize, reflect, length, abs,
    texture, positionWorld, cameraPosition } = W
  const { ruido } = funcoes()
  const U = {}
  for (const k in u) if (!k.startsWith('t')) U[k] = ref(u[k])
  const vMundo = positionWorld
  const uv = vMundo.xz.sub(U.uMapa.xy).div(U.uMapa.z).add(0.5).div(U.uMapaTam)
  const dentro = step(0.0, uv.x).mul(step(uv.x, 1.0)).mul(step(0.0, uv.y)).mul(step(uv.y, 1.0))
  const alt = mix(-14.0, texture(u.tAltura.value, uv).x, dentro)
  const prof = max(0.0, alt.negate())
  const raso = float(1.0).sub(smoothstep(0.0, 7.0, prof))
  let cor = mix(U.uCorFundo, U.uCorRaso, raso)
  // ondas chapadas (duas manchas de ruído andando)
  const t = U.uTempo
  const n = ruido(vMundo.xz.mul(0.045).add(vec2(t.mul(0.05), t.mul(0.03))))
  const n2 = ruido(vMundo.xz.mul(0.11).sub(vec2(t.mul(0.08), 0.0)))
  const faixa = step(0.62, fract(n.mul(2.0).add(n2.mul(0.6)).add(t.mul(0.04))))
  cor = mix(cor, cor.mul(1.18).add(0.03), faixa.mul(0.6).mul(U.uOndas))
  // rio
  const rio = U.uRio.mul(step(1.0, vMundo.z.sub(U.uCostaRio))).mul(float(1.0).sub(step(60.0, abs(vMundo.x.sub(U.uRioX))))).mul(dentro)
  cor = mix(cor, mix(U.uCorFundo, vec3(0.05, 0.42, 0.36), 0.7), rio.mul(0.75))
  // linhas de espuma chegando na praia
  const chegando = fract(prof.mul(0.55).sub(t.mul(0.25)).add(n.mul(0.4)))
  const tracejado = step(0.38, ruido(vMundo.xz.mul(vec2(0.18, 0.5)).add(vec2(t.mul(0.1), 0.0))))
  const espuma = step(chegando, 0.05).mul(tracejado).mul(float(1.0).sub(smoothstep(1.0, 3.2, prof))).mul(U.uOndas).mul(float(1.0).sub(rio))
  const borda = float(1.0).sub(smoothstep(0.05, sin(t.mul(1.3).add(vMundo.x.mul(0.07))).mul(0.15).add(0.35), prof))
  cor = mix(cor, U.uCorEspuma, max(espuma, borda.mul(dentro)))
  // ondinhas de quem entrou na água
  const uvO = vMundo.xz.sub(U.uOndaCentro).div(U.uOndaArea).add(0.5)
  const dentroO = uvO.x.greaterThan(0.0).and(uvO.x.lessThan(1.0)).and(uvO.y.greaterThan(0.0)).and(uvO.y.lessThan(1.0))
  const ondinha = dentroO.select(amostraAlvo(u.tOnda, uvO).x, float(0.0))
  const crista = smoothstep(CRISTA.de, CRISTA.cheia, ondinha).mul(float(1.0).sub(smoothstep(CRISTA.some, CRISTA.fim, ondinha)))
  cor = mix(cor, U.uCorEspuma, crista.mul(0.85))
  cor = cor.mul(float(1.0).sub(smoothstep(0.03, 0.14, ondinha.negate()).mul(0.18)))
  // brilho do sol
  const v = normalize(cameraPosition.sub(vMundo))
  const r = reflect(v.negate(), vec3(0.0, 1.0, 0.0))
  const brilho = pow(max(dot(r, normalize(U.uSolDir)), 0.0), 60.0)
  const tracos = step(0.55, ruido(vec2(vMundo.x.mul(0.6), vMundo.z.mul(0.15).add(t.mul(0.6)))))
  const reflexo = step(0.35, brilho).mul(tracos).mul(float(1.0).sub(U.uNoite))
  cor = cor.add(U.uSolCor.mul(reflexo).mul(0.9))
  // luz: ambiente + sol
  const luz = max(dot(vec3(0.0, 1.0, 0.0), normalize(U.uSolDir)), 0.0)
  cor = cor.mul(U.uAmbiente.mul(1.6).add(U.uSolCor.mul(luz).mul(0.55).mul(float(1.0).sub(U.uNoite))))
  const dist = length(cameraPosition.sub(vMundo))
  cor = mix(cor, U.uNevoaCor, smoothstep(U.uNevoaPerto, U.uNevoaLonge, dist))
  const m = new W.MeshBasicNodeMaterial({ fog: false })
  m.colorNode = cor
  // o mar é sempre "iluminado"; os reflexos do sol contam como brilho (viram pontos)
  m.mrtNode = W.mrt({ gLuz: vec4(0.8, reflexo.mul(1.5).add(crista.mul(0.8)), 0.0, 1.0) })
  return m
}

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
    uRioX: { value: rioX(300) },
    tOnda: toque.tOnda, uOndaCentro: toque.uOndaCentro, uOndaArea: toque.uOndaArea,
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
  mar.material.userData.tsl = { nome: 'mar', material: (ctx) => marTsl(ctx, uniformes) }
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
