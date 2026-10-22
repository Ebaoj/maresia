// Maresia - grava o corpo do jogador de perto, em dois angulos por movimento, para comparar
// modelos (o v6 novo contra o antigo).
//
// O video sai do gravador do jogo (maresia.gravar, CLAUDE.md): cada quadro vai para o servidor do
// Vite, que salva em docs/capturas/video/<nome>/. No fim o script junta os quadros em mp4.
//
// A camera fica perto (3,2 m) e baixa, para o corpo caber grande na tela. Cada movimento e
// gravado duas vezes: de tres quartos de frente (o corpo vem para a camera) e de lado (o corpo
// atravessa a tela). Os dois modelos usam o mesmo lugar, a mesma hora e a mesma camera.
//
// uso:
//   node scripts/gravar-corpo.mjs --modelo neto-v6 --nome neto-v6-depois
//   node scripts/gravar-corpo.mjs --modelo neto-vestido --nome neto-v6-antes
//   node scripts/gravar-corpo.mjs --montar     (junta os dois: lado a lado e as folhas de quadros)
//
// variaveis de ambiente:
//   URL        endereco do jogo (padrao http://localhost:5205/)
//   PORTA_EXTRA  soma na porta do CDP (para rodar dois ao mesmo tempo)

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = resolve(RAIZ, 'docs/capturas/neto-v6')
const FPS = 30
const DISTANCIA_CAMERA = 3.2 // perto: o corpo tem que caber grande na tela
const PITCH_CAMERA = 0.12 // baixo: quase na altura do olhar
const HORA = 10 // a mesma luz nos dois modelos

// como os arquivos de cada modelo se chamam na pasta de capturas
const MODELOS = { antes: 'neto-v6-antes', depois: 'neto-v6-depois' }
// de que modelo cada um e
const MODELO_DE = { antes: 'neto-vestido', depois: 'neto-v6' }

// ---------- movimentos ----------
// janelas: [de, ate, teclas] - o que fica apertado dentro do tempo do clipe
// acoes: [quando, codigo] - o que fazer na pagina (sentar no banco, levantar)
// frente: o corpo vem para a camera (o jogo vira o corpo para o lado do movimento)
// lado: o corpo atravessa a tela, de perfil
const ALTERNADO = (de, ate, passo) => {
  const j = []
  for (let t = de; t < ate; t += passo * 2) j.push([t, t + passo, ['frente']])
  for (let t = de + passo; t < ate; t += passo * 2) j.push([t, t + passo, ['tras']])
  return j.sort((a, b) => a[0] - b[0])
}
const MOVIMENTOS = [
  {
    nome: 'andar', segundos: 6,
    frente: [[1.6, 4.6, ['tras', 'esquerda']]],
    lado: [[1.6, 4.6, ['esquerda']]],
    medir: [2.6, 3.6, 4.4],
  },
  {
    nome: 'correr', segundos: 6,
    frente: [[1.6, 4.6, ['tras', 'esquerda', 'correr']]],
    lado: [[1.6, 4.6, ['esquerda', 'correr']]],
    medir: [2.6, 3.6, 4.4],
  },
  {
    nome: 'virar', segundos: 7,
    frente: ALTERNADO(1.2, 6.4, 0.4),
    lado: ALTERNADO(1.2, 6.4, 0.4),
    medir: [2.4, 3.2, 4.0, 4.8, 5.6],
  },
  {
    nome: 'sentar', segundos: 9, quadros: [100, 140, 200],
    frente: [], lado: [],
    acoes: [[0.5, 'm.jogador.sentar(BANCO)'], [5.0, 'm.jogador.levantar()']],
    medir: [4.0, 7.0],
  },
  {
    // nadando, o corpo fica debaixo da agua (o crawl e submerso): a camera precisa olhar de cima
    // e de perto (a 2 m; a 3,2 m so aparece uma cabecinha no meio do circulo da ondulacao)
    nome: 'nadar', segundos: 7, pitch: 0.45, distancia: 2.0,
    frente: [[1.4, 6.0, ['tras', 'esquerda']]],
    lado: [[1.4, 6.0, ['esquerda']]],
    medir: [2.6, 3.8, 5.0],
  },
]

function arg(nome, padrao) {
  const i = process.argv.indexOf('--' + nome)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}

// ---------- montar: junta os dois modelos lado a lado ----------
if (process.argv.includes('--montar')) {
  mkdirSync(SAIDA, { recursive: true })
  const SO_FOLHAS = process.argv.includes('--folhas')
  for (const mov of MOVIMENTOS) {
    for (const ang of ['frente', 'lado']) {
      if (SO_FOLHAS) break
      const antes = join(SAIDA, `${mov.nome}-${ang}-${MODELOS.antes}.mp4`)
      const depois = join(SAIDA, `${mov.nome}-${ang}-${MODELOS.depois}.mp4`)
      if (!existsSync(antes) || !existsSync(depois)) {
        console.log(`aviso: falta ${mov.nome}-${ang} (${existsSync(antes) ? 'so o depois' : 'so o antes'})`)
        continue
      }
      const junto = join(SAIDA, `${mov.nome}-${ang}-antes-depois.mp4`)
      const ff = spawn('ffmpeg', ['-y', '-i', antes, '-i', depois,
        '-filter_complex', '[0:v][1:v]hstack=inputs=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-crf', '23', '-movflags', '+faststart', junto], { stdio: 'ignore' })
      await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${mov.nome}-${ang} saiu com ${c}`)))))
      console.log(`--- ${junto} ---`)
      continue
    }
  }
  // as folhas de quadros: depois que todos os videos lado a lado existem
  // 6 paineis por movimento: os tres instantes do angulo de frente numa fileira e os tres
  // do angulo de lado na outra. Cada painel ja vem com o antes a esquerda e o depois a
  // direita (o video ja vem grudado)
  for (const mov of MOVIMENTOS) {
    const folha = join(SAIDA, `${mov.nome}-quadros.jpg`)
    const frente = join(SAIDA, `${mov.nome}-frente-antes-depois.mp4`)
    const lado = join(SAIDA, `${mov.nome}-lado-antes-depois.mp4`)
    // uma condicao por quadro: select=eq(n\,20)+eq(n\,70)+eq(n\,120)
    const momentos = mov.quadros || [20, 70, 120]
    const cond = momentos.map((n) => `eq(n\\,${n})`).join('+')
    const ff2 = spawn('ffmpeg', ['-y',
      '-i', frente, '-i', lado,
      '-filter_complex', `[0:v]select=${cond},scale=1280:-1,setpts=N/FRAME_RATE/TB[a];[1:v]select=${cond},scale=1280:-1,setpts=N/FRAME_RATE/TB[b];[a]tile=3x1[ta];[b]tile=3x1[tb];[ta][tb]vstack=inputs=2`,
      '-frames:v', '1', '-update', '1', folha], { stdio: 'ignore' })
    await new Promise((res, rej) => ff2.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg folha ${mov.nome} saiu com ${c}`)))))
    // o ffmpeg sai com 0 mesmo quando nao escreve nada (filtro sem quadro nenhum): confere
    if (!existsSync(folha)) throw new Error(`a folha ${folha} nao foi escrita`)
    console.log(`--- ${folha} ---`)
  }
  process.exit(0)
}

const MODELO = arg('modelo', 'neto-v6')
const NOME = arg('nome', MODELO)
const URL = process.env.URL || 'http://localhost:5205/'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORTA = 9223 + (Number(process.env.PORTA_EXTRA) || 0)

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- navegador ----------
const perfil = mkdtempSync(join(tmpdir(), 'maresia-corpo-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox',
  '--enable-unsafe-webgpu', '--use-angle=metal',
  '--enable-features=Vulkan,UseSkiaRenderer',
  `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
  '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore', detached: true })

let ws = null
try {
  async function alvo() {
    for (let i = 0; i < 120; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${PORTA}/json/list`)
        const lista = await r.json()
        const p = lista.find((t) => t.type === 'page')
        if (p) return p
      } catch { /* o chrome ainda subindo */ }
      await dormir(500)
    }
    throw new Error('chrome nao respondeu')
  }

  const pagina = await alvo()
  ws = new WebSocket(pagina.webSocketDebuggerUrl)
  let seq = 0
  const esperando = new Map()
  const avisos = []
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && esperando.has(m.id)) { esperando.get(m.id)(m); esperando.delete(m.id) }
    if (m.method === 'Runtime.consoleAPICalled') {
      const txt = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ')
      avisos.push(`[${m.params.type}] ${txt}`)
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails
      avisos.push(`[exceção] ${d.exception?.description || d.text}`)
    }
  })
  await new Promise((r) => ws.addEventListener('open', r))
  const cmd = (method, params = {}) => new Promise((r) => {
    const id = ++seq
    esperando.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
  const avaliar = async (expression, comPromessa = true) => {
    const r = await cmd('Runtime.evaluate', { expression, awaitPromise: comPromessa, returnByValue: true })
    if (r.result?.exceptionDetails) return { erro: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text }
    return { valor: r.result?.result?.value }
  }

  await cmd('Runtime.enable')
  await cmd('Log.enable')
  await cmd('Page.enable')
  // o modelo do corpo, o renderizador e a distancia da camera sao escolhidos pelo config salvo no
  // navegador: escreve antes de a pagina carregar, para o jogo ja nascer do jeito pedido
  await cmd('Page.addScriptToEvaluateOnNewDocument', {
    source: `(() => {
      try {
        const chave = 'maresia.config.v8'
        const atual = JSON.parse(localStorage.getItem(chave) || '{}')
        atual.personagem = { ...(atual.personagem || {}), modeloJogador: ${JSON.stringify(MODELO)} }
        atual.desempenho = { ...(atual.desempenho || {}), renderizador: 'webgpu' }
        atual.camera = { ...(atual.camera || {}), distancia: ${DISTANCIA_CAMERA} }
        localStorage.setItem(chave, JSON.stringify(atual))
      } catch (e) { console.error('nao deu para gravar o modelo:', e) }
    })()`,
  })
  await cmd('Page.navigate', { url: URL })

  console.log(`--- abrindo ${URL} com o corpo "${MODELO}" (camera a ${DISTANCIA_CAMERA} m) ---`)
  let pronto = false
  const t0 = Date.now()
  while (Date.now() - t0 < 420000) {
    await dormir(3000)
    const v = await avaliar('!!window.maresia?.cena')
    if (v.valor) { pronto = true; break }
  }
  if (!pronto) throw new Error('o jogo nao montou')
  await avaliar('Promise.race([window.maresia.pronto, new Promise((r) => setTimeout(r, 240000))]).then(() => true)')
  await dormir(2500)

  // ---------- lugares: praia, banco e mar fundo ----------
  const lugares = (await avaliar(`(async () => {
    const m = window.maresia
    const col = await import('/src/mundo/colisao.js')
    const mapa = await import('/src/mundo/mapa.js')
    const fat = await import('/src/mundo/fatia.js')
    const F = fat.FATIA
    const CX = Math.round((F.x0 + F.x1) / 2)
    const zCosta = mapa.linhaCosta(CX)
    const dc = (mapa.linhaCosta(CX + 0.5) - mapa.linhaCosta(CX - 0.5))
    let zPraia = zCosta
    for (let z = zCosta + 0.5; z < zCosta + 30; z += 0.5) {
      if (col.alturaChao(CX, z) > 0.8) { zPraia = z; break }
    }
    const xPasseio = Math.max(F.x0 + 6, CX - 14)
    const passeio = { x: xPasseio, z: zPraia, yaw: Math.atan2(1, dc), altura: +col.alturaChao(xPasseio, zPraia).toFixed(2) }
    let mar = null
    for (let z = zCosta - 4; z > Math.max(F.z0 + 1, zCosta - 21); z -= 1) {
      const h = col.alturaChao(CX, z)
      if (!mar || h < mar.fundo) mar = { x: CX, z, fundo: +h.toFixed(2) }
      if (h < -2.2) break
    }
    let banco = null, melhor = Infinity
    for (const b of (m.lugares.bancos || [])) {
      if (b.x < F.x0 + 5 || b.x > F.x1 - 5) continue
      if (col.alturaChao(b.x, b.z) < 0.2) continue
      const d = Math.abs(b.x - CX)
      if (d < melhor) { melhor = d; banco = b }
    }
    return JSON.stringify({ passeio, mar, banco, fatia: F })
  })()`)).valor
  const L = JSON.parse(lugares)
  if (!L.mar || !L.banco) throw new Error('faltou o mar fundo ou o banco')
  console.log(`--- lugares: passeio ${JSON.stringify(L.passeio)} | mar ${JSON.stringify(L.mar)} | banco ${JSON.stringify(L.banco)} ---`)

  // ---------- diagnostico do corpo ----------
  const diag = (await avaliar(`(() => {
    const m = window.maresia
    const a = m.jogador && m.jogador.animador
    const raiz = a && a.corpo && a.corpo.raiz
    const malhas = []
    if (raiz) raiz.traverse((o) => { if (o.isSkinnedMesh) malhas.push(o) })
    const ossos = a ? [...a.ossos.keys()] : []
    const dedos = ossos.filter((n) => /Hand(Thumb|Index|Middle|Ring|Pinky)[1-4]$/.test(n))
    return JSON.stringify({
      modelo: m.cfg.personagem.modeloJogador,
      renderizador: m.cfg.desempenho.renderizador,
      webgpu: m.webgpu,
      temAnimador: !!a,
      temRosto: !!(a && a.rosto),
      temMolas: !!(a && a.molas),
      temDobras: !!(a && a.dobras),
      temBanco: !!(a && a.banco),
      raizesMultiplos: (m.jogador.multiplos && m.jogador.multiplos.raizes ? m.jogador.multiplos.raizes.length : 0),
      clipes: a ? Object.keys(a.acoes || {}) : [],
      ossos: ossos.length,
      dedos: dedos.length,
      cameraDistancia: m.cfg.camera.distancia,
      malhas: malhas.map((x) => ({
        nome: x.name,
        luzMRT: !!(x.material && x.material.userData && x.material.userData.luzMRT),
        mapa: !!(x.material && x.material.map),
        coresVertice: !!(x.geometry.attributes.color),
        lado: x.material && x.material.side,
        sombra: [!!x.castShadow, !!x.receiveShadow],
        vertices: x.geometry.attributes.position.count,
        ossos: x.skeleton ? x.skeleton.bones.length : 0,
      })),
    })
  })()`, false)).valor
  const D = JSON.parse(diag)
  console.log(`--- corpo: ${D.modelo} | webgpu ${D.webgpu} | ossos ${D.ossos} (${D.dedos} de dedo) | multiplos ${D.raizesMultiplos} | molas ${D.temMolas} | dobras ${D.temDobras} | camera ${D.cameraDistancia} m ---`)

  // ---------- gravacao ----------
  mkdirSync(SAIDA, { recursive: true })
  const medidas = []

  const SO = arg('so', '') // so alguns movimentos (para teste): "sentar,nadar"
  const SO_UM = SO ? new Set(SO.split(',').map((s) => s.trim()).filter(Boolean)) : null
  for (const mov of MOVIMENTOS) {
    if (SO_UM && !SO_UM.has(mov.nome)) continue
    for (const ang of ['frente', 'lado']) {
      // onde o corpo fica e para onde a camera olha, em cada movimento
      let pos
      let yaw
      if (mov.nome === 'sentar') {
        // de tres quartos de frente (o corpo do banco vem para a camera, de frente virada) e de
        // lado (de perfil). Os dois yaws olham para o mar: de frente (o yaw do banco) o fundo era
        // a faixa preta das casas e o corpo nao se lia
        yaw = ang === 'frente' ? L.banco.yaw - Math.PI / 2 : L.banco.yaw + Math.PI / 2
        pos = { x: L.banco.x + Math.sin(L.banco.yaw) * 1.2, z: L.banco.z + Math.cos(L.banco.yaw) * 1.2 }
      } else if (mov.nome === 'nadar') {
        yaw = ang === 'frente' ? 0 : Math.PI / 2
        pos = { x: L.mar.x, z: L.mar.z }
      } else {
        // o virar no lugar: a camera fica atras (o corpo gira e a gente ve a frente do corpo)
        // ou de lado (a gente ve o corpo girar de perfil)
        yaw = mov.nome === 'virar' && ang === 'lado' ? L.passeio.yaw + Math.PI / 2 : L.passeio.yaw
        pos = { x: L.passeio.x, z: L.passeio.z }
      }
      const pitch = mov.pitch ?? PITCH_CAMERA
      // cada movimento tem sua distancia: o nado precisa de perto (o corpo fica submerso)
      const dist = mov.distancia ?? DISTANCIA_CAMERA
      await avaliar(`(() => {
        const m = window.maresia
        m.irPara(${pos.x}, ${pos.z}, ${yaw}, ${HORA})
        m.cfg.camera.distancia = ${dist}
        m.cam.dist = ${dist}
        m.cam.yaw = ${yaw}
        m.cam.pitch = ${pitch}
        return 'ok'
      })()`, false)
      await dormir(2200)

      const pasta = `${mov.nome}-${ang}-${NOME}`
      // limpa os quadros da gravacao anterior (o servidor do Vite nao apaga a pasta: um quadro
      // velho sobrando entraria no video novo)
      try { rmSync(join(RAIZ, 'docs/capturas/video', pasta), { recursive: true, force: true }) } catch { /* sem pasta antiga */ }
      const r = await avaliar(`(async () => {
        const m = window.maresia
        const t = m.teclas
        const BANCO = ${JSON.stringify(L.banco)}
        const janelas = ${JSON.stringify(mov[ang])}
        const acoes = ${JSON.stringify(mov.acoes || [])}
        const medir = ${JSON.stringify(mov.medir)}
        const feitas = {}
        const feitasMedida = {}
        window.__medidasRoupa = window.__medidasRoupa || []
        await m.gravar({
          nome: ${JSON.stringify(pasta)},
          segundos: ${mov.segundos},
          fps: ${FPS},
          roteiro: (tt, m) => {
            for (const k in t) t[k] = false
            for (const [a, b, ks] of janelas) {
              if (tt >= a && tt <= b) for (const k of ks) t[k] = true
            }
            for (const [quando, codigo] of acoes) {
              if (tt >= quando && !feitas[quando]) { feitas[quando] = true; eval(codigo) }
            }
            // a roupa contra a pele, com o corpo na pose do movimento
            for (const nome of medir) {
              if (Math.abs(tt - nome) < 0.02 && !feitasMedida[nome]) {
                feitasMedida[nome] = true
                try { window.__medidasRoupa.push(m.checarRoupaPele({ rotulo: nome })) }
                catch (e) { window.__medidasRoupa.push({ rotulo: nome, erro: String(e) }) }
              }
            }
          },
        })
        return 'ok'
      })()`)
      if (r.erro) throw new Error(`gravação ${mov.nome}-${ang}: ${r.erro}`)
      console.log(`--- gravado ${mov.nome}-${ang} ---`)

      // a medida da roupa contra a pele saiu de dentro da gravacao (com o corpo na pose)
      const med = (await avaliar('JSON.stringify(window.__medidasRoupa || [])')).valor
      const novas = med ? JSON.parse(med) : []
      for (const x of novas) medidas.push({ movimento: mov.nome, angulo: ang, ...x })
      const validas = novas.filter((x) => x.minimo != null)
      if (validas.length) {
        const pior = validas.reduce((a, b) => (b.minimo < a.minimo ? b : a))
        console.log(`    roupa x pele: pior ${pior.penetracaoCm} cm (${pior.pior.osso || '?'} / ${pior.pior.peca || '?'})`)
      }
      await avaliar('window.__medidasRoupa = []', false)
    }
  }

  // ---------- frames e mp4 ----------
  for (const mov of MOVIMENTOS) {
    if (SO_UM && !SO_UM.has(mov.nome)) continue
    for (const ang of ['frente', 'lado']) {
      const pasta = join(RAIZ, 'docs/capturas/video', `${mov.nome}-${ang}-${NOME}`)
      if (!existsSync(pasta)) continue
      const quadros = readdirSync(pasta).filter((f) => f.endsWith('.jpg')).sort()
      if (!quadros.length) continue
      const saida = join(SAIDA, `${mov.nome}-${ang}-${NOME}.mp4`)
      const ff = spawn('ffmpeg', ['-y', '-framerate', String(FPS), '-i', join(pasta, 'q%04d.jpg'),
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', saida], { stdio: 'ignore' })
      await new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${mov.nome}-${ang} saiu com ${c}`)))))
      console.log(`--- ${saida} (${quadros.length} quadros) ---`)
    }
  }

  // o diagnostico junta com o que ja estava (uma gravacao so de um movimento nao apaga os outros)
  const arquivoDiag = join(SAIDA, `${NOME}-diagnostico.json`)
  let anterior = null
  try { anterior = JSON.parse(readFileSync(arquivoDiag, 'utf8')) } catch { /* primeira gravacao */ }
  // a gravacao nova substitui a do mesmo movimento e angulo
  const chaveM = (x) => `${x.movimento}|${x.angulo}`
  const antigas = (anterior?.medidas || []).filter((x) => !medidas.some((y) => chaveM(y) === chaveM(x)))
  const todas = [...antigas, ...medidas]
  writeFileSync(arquivoDiag, JSON.stringify({ modelo: MODELO, diagnostico: D, medidas: todas, lugares: L }, null, 1))

  const reprovam = avisos.filter((a) => !/favicon|fonts\.g|localStorage/.test(a))
    .filter((a) => a.startsWith(('[error]', '[exceção]', '[log error]')))
  console.log(`--- console: ${reprovam.length ? 'ERROS' : 'limpo'} ---`)
  for (const a of reprovam.slice(0, 15)) console.log('   ' + a)
} finally {
  try { ws?.close() } catch { /* ja fechado */ }
  try { process.kill(-chrome.pid, 'SIGKILL') } catch { try { chrome.kill('SIGKILL') } catch { /* ja morreu */ } }
  await dormir(300)
  try { rmSync(perfil, { recursive: true, force: true }) } catch { /* perfil temporario */ }
}
