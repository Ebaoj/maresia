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
        const pasta = path.resolve(import.meta.dirname, 'docs/capturas/video', nome)
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
        // relativo a este arquivo, não à pasta de onde o Vite foi aberto (o worktree do KAN-70 roda de ~/Projetos)
        const pasta = path.resolve(import.meta.dirname, 'infra/modal-jogo/testes/fotos-justas', rotulo)
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

// Os modelos da arte (GLB) são carregados por '/arte/finais/...' e ficam fora do git (ver .gitignore): no
// servidor de desenvolvimento o Vite já serve a pasta da raiz, mas no build eles não iam para o dist e o jogo
// publicado ficava sem avô, sem neto e sem as esculturas. Este plugin copia para dist/arte/finais só os
// arquivos que o src realmente cita (varredura das strings '/arte/finais/...').
function arteFinal() {
  return {
    name: 'arte-final',
    apply: 'build',
    writeBundle(options) {
      const raiz = path.resolve(import.meta.dirname)
      const pastaArte = path.join(raiz, 'arte', 'finais')
      if (!fs.existsSync(pastaArte)) return
      const usados = arteUsada(path.join(raiz, 'src'))
      let copiados = 0
      for (const rel of usados) {
        const de = path.join(pastaArte, rel)
        // o arquivo pode não estar aqui (a arte não vem no git): o jogo usa o boneco de reserva
        if (!fs.existsSync(de)) continue
        const para = path.join(options.dir, 'arte', 'finais', rel)
        fs.mkdirSync(path.dirname(para), { recursive: true })
        fs.copyFileSync(de, para)
        copiados++
      }
      if (copiados) console.log(`arte-final: ${copiados} arquivo(s) de arte/finais para o dist`)
    },
  }
}

// Os caminhos '/arte/finais/...' citados no src (relativos a arte/finais)
function arteUsada(pastaSrc) {
  const achados = new Set()
  const padrao = /\/arte\/finais\/[^\s'"`)]+/g
  const varre = (dir) => {
    for (const nome of fs.readdirSync(dir)) {
      const p = path.join(dir, nome)
      if (fs.statSync(p).isDirectory()) { varre(p); continue }
      if (!/\.(js|mjs|json|html)$/.test(nome)) continue
      const txt = fs.readFileSync(p, 'utf8')
      let m
      while ((m = padrao.exec(txt))) achados.add(m[0].replace(/^\/arte\/finais\//, ''))
    }
  }
  if (fs.existsSync(pastaSrc)) varre(pastaSrc)
  return achados
}

export default defineConfig({
  plugins: [gravadorDeQuadros(), arteFinal()],
  server: { host: 'localhost' },
  // uma cópia só do three na página: a three-virtual-geometry (bancada do motor, KAN-71) importa three/webgpu e
  // three/tsl; duas cópias misturam nós do TSL e quebram os shaders
  resolve: { dedupe: ['three'] },
})
