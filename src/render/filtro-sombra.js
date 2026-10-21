// Filtro da borda da sombra (21/10/2026, "a sombra é mal definida, pisca, pixelada").
//
// O PCF do three 0.186 tira 5 amostras num disco girado por um ruído de TELA (interleavedGradientNoise de
// gl_FragCoord): a borda vira um pontilhado que fica parado na tela enquanto o mundo anda, e o pintor de luz
// (materiais.js, faixa de sombra por smoothstep) transforma esse pontilhado em serrilhado que ferve a cada passo.
// Aqui a borda é uma grade 3 × 3 fixa no mapa de sombra, com pesos de tenda (1 2 1): cada amostra já é o PCF
// bilinear de 2 × 2 do hardware, então a borda sai contínua e lisa (contorno sem degrau) e presa ao mundo.
//
// shadow.radius é o espaçamento da grade em texels do mapa (cfg.mundo.sombraSuave). Raio NEGATIVO volta ao
// filtro do three (o de antes, para comparar e medir na mesma rodada): no WebGL vale ao vivo (é um uniform).
// No WebGPU o filtro é escolhido ao montar o shader (cfg.mundo.sombraFiltro, pede recarregar).
import * as THREE from 'three'

// o trecho do getShadow (PCF) do three 0.186, com ou sem os comentários (o build tira os comentários)
const ORIGINAL_PCF = /vec2 texelSize = vec2\( 1\.0 \) \/ shadowMapSize;\s*float radius = shadowRadius \* texelSize\.x;/

const NOVO_PCF = /* glsl */ `vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				if ( shadowRadius >= 0.0 ) {
					// Maresia: grade 3 x 3 com pesos de tenda (1 2 1), presa ao mapa: borda lisa, sem ruído de tela
					vec2 dG = texelSize * shadowRadius;
					vec3 cG = vec3( shadowCoord.xy, shadowCoord.z );
					shadow = (
						texture( shadowMap, cG + vec3( - dG.x, - dG.y, 0.0 ) ) + texture( shadowMap, cG + vec3( dG.x, - dG.y, 0.0 ) ) +
						texture( shadowMap, cG + vec3( - dG.x, dG.y, 0.0 ) ) + texture( shadowMap, cG + vec3( dG.x, dG.y, 0.0 ) ) +
						2.0 * ( texture( shadowMap, cG + vec3( 0.0, - dG.y, 0.0 ) ) + texture( shadowMap, cG + vec3( 0.0, dG.y, 0.0 ) ) +
						texture( shadowMap, cG + vec3( - dG.x, 0.0, 0.0 ) ) + texture( shadowMap, cG + vec3( dG.x, 0.0, 0.0 ) ) ) +
						4.0 * texture( shadowMap, cG )
					) * ( 1.0 / 16.0 );
					return mix( 1.0, shadow, shadowIntensity );
				}
				// raio negativo: o filtro do three, o de antes
				float radius = - shadowRadius * texelSize.x;`

// Troca o corpo do getShadow (PCF, usado pela luz direcional e pelo spot) no ShaderChunk. Vale para todo
// material compilado depois; chamar uma vez, antes do primeiro desenho. Devolve false se o three mudou o trecho
// (aí o filtro antigo segue e o teste de unidade avisa).
export function instalarFiltroWebgl(chunks = THREE.ShaderChunk) {
  const s = chunks.shadowmap_pars_fragment
  if (s.includes('Maresia: grade 3 x 3')) return true
  if (!ORIGINAL_PCF.test(s)) return false
  chunks.shadowmap_pars_fragment = s.replace(ORIGINAL_PCF, NOVO_PCF)
  return true
}

// A mesma grade em TSL, para shadow.filterNode no WebGPU (ShadowNode chama filterFn({ depthTexture, shadowCoord,
// shadow, depthLayer })). Sem ruído de tela e sem ramo: o raio vem do shadow.radius (uniform do grupo de render).
export function filtroTsl(W) {
  const { Fn, texture, vec2, reference, renderGroup } = W
  return Fn(({ depthTexture, shadowCoord, shadow, depthLayer }) => {
    const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup)
    const radius = reference('radius', 'float', shadow).setGroup(renderGroup)
    const d = vec2(1).div(mapSize).mul(radius.max(0))
    const amostra = (dx, dy) => {
      let t = texture(depthTexture, shadowCoord.xy.add(vec2(dx, dy).mul(d)))
      if (depthTexture.isArrayTexture) t = t.depth(depthLayer)
      return t.compare(shadowCoord.z)
    }
    const cantos = amostra(-1, -1).add(amostra(1, -1)).add(amostra(-1, 1)).add(amostra(1, 1))
    const lados = amostra(0, -1).add(amostra(0, 1)).add(amostra(-1, 0)).add(amostra(1, 0))
    return cantos.add(lados.mul(2)).add(amostra(0, 0).mul(4)).mul(1 / 16)
  })
}

// Raio que vai para shadow.radius: o espaçamento em texels, ou negativo para o filtro do three.
export function raioDoFiltro(cfg) {
  const r = Math.max(0, cfg.mundo.sombraSuave ?? 1)
  return cfg.mundo.sombraFiltro === 'three' ? -Math.max(r, 1e-3) : r
}
