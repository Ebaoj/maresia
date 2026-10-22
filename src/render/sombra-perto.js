// Sombra em duas janelas (21/10/2026): o mapa de LONGE (o do sol, 346 m, com os parados em cache, F4) e um mapa
// de PERTO, pequeno e denso, em volta do jogador, redesenhado todo quadro e seguindo o sol sem passos.
//
// Por quê: o mapa único de 346 m em 4096 dava 8,5 cm por texel no plano da luz; a 5 m da câmera um pixel da tela
// é 0,8 cm, então cada texel virava um degrau de ~10 pixels ao meio-dia e de 30 a 50 pixels na hora dourada
// (o texel se estica no chão por 1 / seno da altura do sol). O de perto (48 m em 2048) dá 2,3 cm por texel.
//
// Como as duas se juntam, sem uniform novo em material nenhum:
//   - WebGL: a luz de perto é uma DirectionalLight de intensidade 0 na cena, que projeta sombra (o three monta o
//     mapa, a matriz e as coordenadas de sombra de todo material). Um trecho trocado no ShaderChunk faz a luz do
//     sol (índice 0) usar a mistura das duas sombras, e a de perto (índice 1) não iluminar nada. A intensidade da
//     sombra da luz de perto não é intensidade: carrega a largura da faixa de mistura (0 = mapa de perto desligado).
//   - WebGPU: o sol ganha um shadowNode próprio (shadow.shadowNode) que mistura o ShadowNode de longe (o do cache)
//     com o de perto. A luz de perto fica fora da cena (não entra na iluminação); o ShadowNode dela desenha o mapa.
// A mistura: dentro da janela de perto vale ela, e na faixa da borda (cfg.mundo.sombraPertoBorda, fração da
// janela) passa suave para a de longe.
import * as THREE from 'three'
import { alinharAoTexel, viesNormalizado, texelM } from './sombra-luz.js'
import { filtroTsl, raioDoFiltro } from './filtro-sombra.js'

const DIST_LUZ = 250 // a câmera de sombra fica a esta distância do centro, na direção do sol
const PROFUNDIDADE = 160 // além do centro (o chão da janela inclinada pelo sol baixo)

const LINHA_SOL = /directLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap\[ i \][^\n]*\n/
const FUNCAO_MISTURA = /* glsl */ `
#if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF ) && NUM_DIR_LIGHT_SHADOWS == 2
	// Maresia (sombra-perto.js): a luz 0 é o sol (mapa de longe) e a 1 só empresta o mapa de perto
	float sombraSolPertoLonge( DirectionalLightShadow longe, sampler2DShadow mapaLonge, vec4 coordLonge, DirectionalLightShadow perto, sampler2DShadow mapaPerto, vec4 coordPerto ) {
		float borda = perto.shadowIntensity;
		vec2 uvP = coordPerto.xy / coordPerto.w;
		float dentro = min( min( uvP.x, 1.0 - uvP.x ), min( uvP.y, 1.0 - uvP.y ) );
		float peso = borda > 0.0 ? smoothstep( 0.0, borda, dentro ) : 0.0;
		float sL = 1.0;
		float sP = 1.0;
		if ( peso < 0.999 ) sL = getShadow( mapaLonge, longe.shadowMapSize, longe.shadowIntensity, longe.shadowBias, longe.shadowRadius, coordLonge );
		if ( peso > 0.001 ) sP = getShadow( mapaPerto, perto.shadowMapSize, longe.shadowIntensity, perto.shadowBias, perto.shadowRadius, coordPerto );
		return mix( sL, sP, peso );
	}
#endif
`

// Troca os dois trechos do ShaderChunk (uma vez, antes do primeiro desenho). Devolve false se o three mudou o
// trecho do laço das luzes (o teste de unidade avisa).
export function instalarMisturaWebgl(chunks = THREE.ShaderChunk) {
  if (chunks.lights_fragment_begin.includes('sombraSolPertoLonge')) return true
  if (!LINHA_SOL.test(chunks.lights_fragment_begin)) return false
  chunks.lights_fragment_begin = chunks.lights_fragment_begin.replace(LINHA_SOL, (linha) => `#if NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 0
		directLight.color *= ( directLight.visible && receiveShadow ) ? sombraSolPertoLonge( directionalLightShadow, directionalShadowMap[ 0 ], vDirectionalShadowCoord[ 0 ], directionalLightShadows[ 1 ], directionalShadowMap[ 1 ], vDirectionalShadowCoord[ 1 ] ) : 1.0;
		#elif NUM_DIR_LIGHT_SHADOWS == 2 && UNROLLED_LOOP_INDEX == 1
		directLight.color = vec3( 0.0 );
		#else
		${linha}		#endif
`)
  chunks.shadowmap_pars_fragment += FUNCAO_MISTURA
  return true
}

export class SombraPerto {
  // webgpu: W é o módulo three/webgpu + tsl (render/renderizador.js)
  constructor({ cena, sol, cfg, W = null }) {
    this.cfg = cfg
    this.sol = sol
    this.W = W
    const luz = new THREE.DirectionalLight(0xffffff, 0)
    luz.name = 'sol de perto (só sombra)'
    luz.shadow.mapSize.set(cfg.mundo.sombraPertoResolucao ?? 2048, cfg.mundo.sombraPertoResolucao ?? 2048)
    this.luz = luz
    this._centro = new THREE.Vector3()
    this._ancora = null // centro alinhado do quadro anterior: a grade de texels passa por ele
    this._dir = new THREE.Vector3(0, 1, 0)
    this.stats = { texelCm: 0, ligado: false }
    if (W) {
      // fora da cena: não ilumina; o ShadowNode dela é criado aqui e entra na sombra do sol
      luz.castShadow = false
      this.uBorda = W.uniform(0.12)
      const filtro = cfg.mundo.sombraFiltro === 'three' ? undefined : filtroTsl(W)
      sol.shadow.filterNode = filtro
      luz.shadow.filterNode = filtro
      const longe = W.shadow(sol)
      const perto = W.shadow(luz)
      this.noLonge = longe
      this.noPerto = perto
      const { Fn, lightShadowMatrix, positionWorld, vec4, min, smoothstep, mix } = W
      sol.shadow.shadowNode = Fn(() => {
        const p = lightShadowMatrix(luz).mul(vec4(positionWorld, 1))
        const uv = p.xy.div(p.w)
        const dentro = min(min(uv.x, uv.x.oneMinus()), min(uv.y, uv.y.oneMinus()))
        const peso = smoothstep(0, this.uBorda.max(1e-4), dentro).mul(this.uBorda.greaterThan(0).select(1, 0))
        return mix(longe, perto, peso)
      })()
    } else {
      luz.castShadow = true
      // depois do sol na lista: o three põe as luzes que projetam sombra primeiro e, entre elas, na ordem da cena
      cena.add(luz, luz.target)
    }
  }

  get ligado() { return !!(this.cfg.mundo.sombras && this.cfg.mundo.sombraPerto) }

  // dirLuz: a direção do sol sem os passos de cfg.mundo.passoSombraMin (o mapa de perto é refeito todo quadro,
  // então segue o sol contínuo e não dá o salto de 1° a cada 4 s); centro: onde a janela fica (perto do jogador).
  atualizar(dirLuz, centro) {
    const m = this.cfg.mundo
    const luz = this.luz
    const sc = luz.shadow.camera
    const tam = Math.max(8, m.sombraPertoTamanho ?? 48)
    const res = m.sombraPertoResolucao ?? 2048
    if (luz.shadow.mapSize.x !== res) {
      luz.shadow.mapSize.set(res, res)
      if (luz.shadow.map) { luz.shadow.map.dispose(); luz.shadow.map = null }
    }
    if (sc.right !== tam / 2 || sc.far !== DIST_LUZ + PROFUNDIDADE) {
      sc.left = -tam / 2; sc.right = tam / 2; sc.top = tam / 2; sc.bottom = -tam / 2
      sc.near = 1; sc.far = DIST_LUZ + PROFUNDIDADE
      sc.updateProjectionMatrix()
    }
    const texel = texelM(tam, res)
    this._dir.copy(dirLuz).normalize()
    // grade presa ao centro do quadro anterior (sombra-luz.js): o sol girando não faz a borda piscar (pisca 22/10/2026)
    alinharAoTexel(centro, this._dir, texel, this._centro, this._ancora)
    ;(this._ancora ||= new THREE.Vector3()).copy(this._centro)
    luz.position.copy(this._centro).addScaledVector(this._dir, DIST_LUZ)
    luz.target.position.copy(this._centro)
    luz.updateMatrixWorld()
    luz.target.updateMatrixWorld()
    luz.shadow.bias = viesNormalizado(m.sombraVies ?? 0.03, sc.near, sc.far)
    luz.shadow.normalBias = (m.sombraViesNormal ?? 1) * texel
    luz.shadow.radius = raioDoFiltro(this.cfg)
    const ligado = this.ligado
    const borda = ligado ? Math.min(0.5, Math.max(0.01, m.sombraPertoBorda ?? 0.12)) : 0
    if (this.W) {
      this.uBorda.value = borda
      luz.shadow.autoUpdate = ligado // desligado: o mapa de perto não é desenhado
    } else {
      // WebGL: projetar sombra fica ligado junto com a do sol (ligar e desligar recompila todos os materiais);
      // desligado, a faixa vai a 0 (o shader só lê o de longe) e o mapa não é redesenhado
      luz.castShadow = !!m.sombras
      luz.shadow.intensity = borda
      luz.shadow.autoUpdate = ligado
      if (!ligado) luz.shadow.needsUpdate = false
    }
    this.stats.texelCm = +(texel * 100).toFixed(2)
    this.stats.ligado = ligado
  }
}
