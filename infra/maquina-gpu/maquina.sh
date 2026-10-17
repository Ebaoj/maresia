#!/bin/zsh
# Máquina com placa de vídeo na AWS (São Paulo) para rodar o Maresia e ver a imagem no Mac (DCV).
# Uso:
#   ./maquina.sh ligar     cria na primeira vez (CloudFormation) ou liga; libera o IP atual de casa no SSH
#   ./maquina.sh enviar    copia o jogo do Mac para a máquina (só nesse sentido) e sobe o Vite lá
#   ./maquina.sh abrir     túnel SSH para o DCV e abre o vídeo no navegador do Mac
#   ./maquina.sh desligar  desliga (para de cobrar a hora; o disco segue, ~US$ 5/mês)
#   ./maquina.sh estado    mostra se está ligada e quanto tempo
#   ./maquina.sh apagar    apaga tudo (máquina, disco, regra de SSH)
# Custo: US$ 0,894 por hora ligada (g4dn.xlarge, sa-east-1, preço de 17/10/2026). Desliga sozinha
# depois de 30 min parada (alarme no CloudWatch).
set -euo pipefail

PERFIL=joabe_aws
REGIAO=sa-east-1
PILHA=maresia-gpu
CHAVE=maresia-gpu
PEM=~/.ssh/maresia-gpu.pem
DIR=${0:A:h}
JOGO=${DIR:h:h}
aws_() { aws --profile $PERFIL --region $REGIAO "$@"; }

instancia() { aws_ cloudformation describe-stacks --stack-name $PILHA --query "Stacks[0].Outputs[?OutputKey=='Maquina'].OutputValue" --output text 2>/dev/null; }
ip_maquina() { aws_ ec2 describe-instances --instance-ids $(instancia) --query 'Reservations[0].Instances[0].PublicIpAddress' --output text; }
ssh_() { ssh -i $PEM -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 ubuntu@$(ip_maquina) "$@"; }

case "${1:-}" in
  ligar)
    IP=$(curl -s --max-time 5 https://checkip.amazonaws.com)/32
    if [[ ! -f $PEM ]]; then
      # chave SSH só desta máquina; a parte privada fica no Mac (~/.ssh), nunca vai para o chat nem para o git
      aws_ ec2 create-key-pair --key-name $CHAVE --key-type ed25519 --query KeyMaterial --output text > $PEM
      chmod 600 $PEM
    fi
    aws_ cloudformation deploy --stack-name $PILHA --template-file $DIR/maquina.yaml \
      --parameter-overrides IpDeCasa=$IP ChaveSsh=$CHAVE --no-fail-on-empty-changeset
    aws_ ec2 start-instances --instance-ids $(instancia) >/dev/null
    aws_ ec2 wait instance-running --instance-ids $(instancia)
    echo "ligada: $(ip_maquina) (SSH liberado só para $IP)"
    ;;
  enviar)
    # o projeto vai do Mac para a máquina; nada volta (acesso só de ida)
    rsync -az --delete -e "ssh -i $PEM -o StrictHostKeyChecking=accept-new" \
      --exclude node_modules --exclude .git --exclude docs/capturas --exclude 'arte/saida' --exclude 'arte/entradas' \
      --exclude 'arte/.venv' --exclude 'arte/blender' \
      $JOGO/ ubuntu@$(ip_maquina):maresia/
    ssh_ 'cd maresia && npm ci --silent && (pkill -f "vite --port 5195" || true) && nohup npm run dev > vite.log 2>&1 &'
    echo "jogo enviado; no Chrome da máquina: http://localhost:5195"
    ;;
  abrir)
    # o DCV escuta só dentro da máquina; o túnel traz para o Mac em https://localhost:8443
    (ssh -i $PEM -o StrictHostKeyChecking=accept-new -N -L 8443:127.0.0.1:8443 ubuntu@$(ip_maquina) &)
    sleep 2
    open https://localhost:8443
    ;;
  desligar)
    aws_ ec2 stop-instances --instance-ids $(instancia) >/dev/null && echo "desligando"
    ;;
  estado)
    aws_ ec2 describe-instances --instance-ids $(instancia) --query 'Reservations[0].Instances[0].[State.Name,LaunchTime,PublicIpAddress]' --output text
    ;;
  apagar)
    aws_ cloudformation delete-stack --stack-name $PILHA && echo "apagando a pilha $PILHA"
    ;;
  *) sed -n 2,12p $0 ;;
esac
