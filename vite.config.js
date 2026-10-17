import { defineConfig } from 'vite'
import fs from 'node:fs'
import path from 'node:path'

// Só no servidor de desenvolvimento: recebe quadros do gravador e salva em disco.
function gravadorDeQuadros() {
  return {
    name: 'gravador-de-quadros',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__quadro', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        const url = new URL(req.url, 'http://local')
        const nome = (url.searchParams.get('nome') || 'gravacao').replace(/[^a-z0-9-]/gi, '')
        const n = parseInt(url.searchParams.get('n') || '0', 10)
        const pasta = path.resolve('docs/capturas/video', nome)
        fs.mkdirSync(pasta, { recursive: true })
        let corpo = ''
        req.on('data', (c) => { corpo += c })
        req.on('end', () => {
          const b64 = corpo.replace(/^data:image\/jpeg;base64,/, '')
          fs.writeFileSync(path.join(pasta, `q${String(n).padStart(4, '0')}.jpg`), Buffer.from(b64, 'base64'))
          res.end('ok')
        })
      })
      // foto justa (src/debug/foto-justa.js): PNG por lugar, numa pasta por rótulo
      server.middlewares.use('/__foto', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end() }
        const url = new URL(req.url, 'http://local')
        const rotulo = (url.searchParams.get('rotulo') || 'teste').replace(/[^a-z0-9-]/gi, '')
        const nome = (url.searchParams.get('nome') || 'foto').replace(/[^a-z0-9-]/gi, '')
        const pasta = path.resolve('infra/modal-jogo/testes/fotos-justas', rotulo)
        fs.mkdirSync(pasta, { recursive: true })
        let corpo = ''
        req.on('data', (c) => { corpo += c })
        req.on('end', () => {
          fs.writeFileSync(path.join(pasta, `${nome}.png`), Buffer.from(corpo.replace(/^data:image\/png;base64,/, ''), 'base64'))
          res.end('ok')
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [gravadorDeQuadros()],
  server: { host: 'localhost' },
})
