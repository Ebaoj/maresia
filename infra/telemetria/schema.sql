CREATE TABLE IF NOT EXISTS sessoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recebido INTEGER NOT NULL,
  sessao TEXT NOT NULL,
  seq INTEGER NOT NULL,
  motivo TEXT,
  gpu TEXT,
  ua TEXT,
  fps REAL, p50 REAL, p95 REAL, p99 REAL,
  travadas50 INTEGER, travadas100 INTEGER,
  dados TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS i_sessoes_recebido ON sessoes(recebido);
CREATE INDEX IF NOT EXISTS i_sessoes_sessao ON sessoes(sessao);
CREATE TABLE IF NOT EXISTS limite (chave TEXT PRIMARY KEY, janela INTEGER NOT NULL, n INTEGER NOT NULL);
