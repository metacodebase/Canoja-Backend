#!/usr/bin/env bash

set -euo pipefail

SSH_KEY="/Users/test/Downloads/canoja-new.pem"
REMOTE_HOST="ubuntu@54.227.140.191"
REMOTE_DIR="/home/ubuntu/workspace/server"
SSH_OPTIONS=(-i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10)

if [[ ! -f "$SSH_KEY" ]]; then
  echo "SSH key not found: $SSH_KEY" >&2
  exit 1
fi

echo "Uploading backend to $REMOTE_HOST:$REMOTE_DIR..."
rsync -az \
  --exclude='.env' \
  --exclude='.git/' \
  --exclude='node_modules/' \
  --exclude='.DS_Store' \
  -e "ssh -i $SSH_KEY -o BatchMode=yes -o ConnectTimeout=10" \
  ./ "$REMOTE_HOST:$REMOTE_DIR/"

echo "Installing dependencies and restarting API..."
ssh "${SSH_OPTIONS[@]}" "$REMOTE_HOST" <<'REMOTE_SCRIPT'
set -euo pipefail

source /home/ubuntu/.nvm/nvm.sh
cd /home/ubuntu/workspace/server

corepack yarn install --production=true --ignore-scripts --no-lockfile --non-interactive
node --check index.js
pm2 restart index --update-env

for attempt in {1..10}; do
  if curl -fsS http://127.0.0.1:5000/health; then
    echo
    echo "Backend deployed successfully."
    exit 0
  fi

  sleep 2
done

echo "Deployment finished, but the health check failed." >&2
pm2 logs index --lines 30 --nostream >&2
exit 1
REMOTE_SCRIPT
