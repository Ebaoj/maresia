#!/bin/zsh
# Roda o Tripo pela API com a chave tripo_api_key do cofre, sem gravar a chave em arquivo.
# Uso: ./tripo.sh saldo | ./tripo.sh gerar IMAGEM PASTA [--partes] | ./tripo.sh baixar TASK_ID PASTA
source ~/.config/talvium-vault/api.sh
DIR=${0:A:h}
TRIPO_API_KEY=$(secret-get tripo_api_key) \
exec "$DIR/.venv/bin/python" "$DIR/tripo.py" "$@"
