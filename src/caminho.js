// Caminho de arquivo servido pela raiz do site ('/arte/...', '/animacoes/...') com o base do Vite na frente.
// No dev e no build normal o base é '/', e nada muda; no GitHub Pages (vite build --base=/maresia/) o
// '/arte/finais/x.glb' vira '/maresia/arte/finais/x.glb'. Os caminhos continuam escritos com a barra na
// frente no src porque o plugin arte-final (vite.config.js) acha os GLB pela string '/arte/finais/...'.
export function daBase(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return url
  const base = import.meta.env?.BASE_URL ?? '/'
  if (base === '/' || url.startsWith(base)) return url
  return base.replace(/\/$/, '') + url
}
