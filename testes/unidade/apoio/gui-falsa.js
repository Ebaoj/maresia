// Um lil-gui de mentira para os testes no Node: grava cada controle (objeto, chave, faixa, nome) e cada pasta,
// sem DOM, com os mesmos nomes de campo do lil-gui (_title, _name, controllers, folders, parent, _closed),
// para a busca (src/ui/painel/busca.js) rodar sobre ela como roda sobre o painel de verdade.

function controleFalso(pasta, object, property, extra) {
  const c = {
    object, property, extra, _name: property, parent: pasta, aoMudar: null, ouvindo: false,
    name(n) { c._name = n; return c },
    onChange(f) { c.aoMudar = f; return c },
    onFinishChange() { return c },
    listen() { c.ouvindo = true; return c },
    updateDisplay() { return c },
    show() { return c },
    hide() { return c },
  }
  return c
}

export function guiFalsa(titulo = 'raiz', pai = null) {
  const g = {
    _title: titulo, parent: pai, controllers: [], folders: [], _closed: false,
    add(objeto, chave, ...extra) { const c = controleFalso(g, objeto, chave, extra); g.controllers.push(c); return c },
    addColor(objeto, chave) { const c = controleFalso(g, objeto, chave, ['cor']); g.controllers.push(c); return c },
    addFolder(t) { const f = guiFalsa(t, g); g.folders.push(f); return f },
    close() { g._closed = true; return g },
    open(v = true) { g._closed = !v; return g },
    title(t) { g._title = t; return g },
    onFinishChange() { return g },
    onOpenClose() { return g },
    show() { return g },
    hide() { return g },
    controllersRecursive() { return [...g.controllers, ...g.folders.flatMap((f) => f.controllersRecursive())] },
    foldersRecursive() { return g.folders.flatMap((f) => [f, ...f.foldersRecursive()]) },
  }
  return g
}

// "estilo.arcSombra" para cada controle ligado ao cfg; "botao:noite" para os botões de atalho
export function ligacao(controle, cfg) {
  const achar = (o, cam) => {
    if (o === controle.object) return cam
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') { const r = achar(v, cam ? `${cam}.${k}` : k); if (r !== null) return r }
    }
    return null
  }
  const base = achar(cfg, '')
  return base === null ? `botao:${controle.property}` : `${base}.${controle.property}`
}

// a ficha de cada controle: a chave ligada, a faixa ou as opções, se escuta e se tem onChange
export function fichas(gui, cfg) {
  return gui.controllersRecursive().map((c) => ({
    ligacao: ligacao(c, cfg),
    extra: JSON.stringify(c.extra),
    ouvindo: c.ouvindo,
    aoMudar: !!c.aoMudar,
    nome: c._name,
  }))
}
