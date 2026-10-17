// Testes rápidos (lógica pura, no Node): npm test. Os testes do jogo rodando ficam em testes/jogo e rodam
// num navegador de verdade (infra/modal-jogo/testar_jogo.py).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['testes/unidade/**/*.test.js'],
    environment: 'node',
  },
})
