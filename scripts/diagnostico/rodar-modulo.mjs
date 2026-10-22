// Roda um módulo do jogo no Node pelo Vite (o import de .json e de .png funciona como no navegador), e chama o
// export default dele com os argumentos que sobram. É o lugar do `npx vite-node` que os diagnósticos antigos
// citam (o vite-node não está nas dependências).
//
//   node scripts/diagnostico/rodar-modulo.mjs scripts/diagnostico/escala-centro.mjs [args]
//   RAIZ=/outro/worktree node scripts/diagnostico/rodar-modulo.mjs ...   (roda o mesmo módulo no código de lá)
import { createServer } from 'vite'
import { resolve } from 'node:path'
const raiz = process.env.RAIZ || process.cwd()
const s = await createServer({ root: raiz, configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } })
try {
  const m = await s.ssrLoadModule(resolve(process.argv[2]))
  if (m.default) await m.default(process.argv.slice(3))
} catch (e) { console.error(e) } finally { await s.close() }
