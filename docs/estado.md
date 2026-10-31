# Estado do repo maresia

> Fonte da verdade entre sessões. Bot dono atualiza ao começar e ao terminar cada sessão.

- **Bot dono:** a definir · **Atualizado em:** 2026-10-31 12:45 (UTC-3) por Grok Bot (instalação do padrão)
- **main @** `99aa937` (Revert do merge three-r187) · **CI de main:** só havia o deploy do Pages (verde: https://github.com/Ebaoj/maresia/actions/runs/41210771078); `ci.yml` de verificação entra com este PR
- **Fase/plano atual:** protótipo de cosy game (Fortaleza 1932/1881), ver `CLAUDE.md`, `docs/conceito.md`, `docs/ideias-e-pendencias.md`

## Em andamento
| Ticket | Worker | Branch / worktree | Escopo (pastas travadas) | Desde | Status |
|---|---|---|---|---|---|
| — | Claude Code | /workspace/maresia (cópia local) | depuração; upgrade three r187 revertido em main | 2026-10-31 | em depuração |

## Aguardando Joabe
| Item | Pergunta / decisão | Desde | Padrão proposto |
|---|---|---|---|

## Bloqueios
- Upgrade three 0.186.1 → 0.187.0 (r187) foi mergeado e revertido (`99aa937`); causa em investigação.

## Próximo passo
1. Definir o bot dono e ativar o hook: `git config core.hooksPath scripts/hooks`.

## Últimos merges
| Data | PR | Ticket | Report (docs/handoff/...) |
|---|---|---|---|
| 2026-10-31 | (direto em main) | — | Revert "Merge branch 'three-r187'" |

Decisões duráveis: `docs/decisoes.md`. Histórico de workers: `docs/handoff/`.
