#!/bin/zsh
# Roda o cliente do Modal com as chaves do cofre, sem gravar token em arquivo (~/.modal.toml).
# Uso: ./modal.sh app list | ./modal.sh deploy comfy.py
source ~/.config/talvium-vault/api.sh
DIR=${0:A:h}
MODAL_TOKEN_ID=$(secret-get modal_token_id) \
MODAL_TOKEN_SECRET=$(secret-get modal_secret) \
exec "$DIR/.venv/bin/modal" "$@"
