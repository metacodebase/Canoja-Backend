#!/usr/bin/env bash

set -euo pipefail

region="${1:-}"
mode="${2:-}"
ssh_key="${CANOJA_SSH_KEY:-/Users/test/Downloads/canoja-new.pem}"
remote_host="${CANOJA_REMOTE_HOST:-ubuntu@54.227.140.191}"
remote_dir="${CANOJA_REMOTE_DIR:-/home/ubuntu/workspace/server}"

if [[ -z "${region}" ]]; then
  echo "Region is required." >&2
  exit 1
fi

if [[ ! "${region}" =~ ^[a-z0-9-]+$ ]]; then
  echo "Invalid region: ${region}" >&2
  exit 1
fi

if [[ ! "${remote_dir}" =~ ^/[a-zA-Z0-9._/-]+$ ]]; then
  echo "Invalid remote directory." >&2
  exit 1
fi

if [[ "${mode}" != "" && "${mode}" != "--apply" ]]; then
  echo "Unsupported mode: ${mode}" >&2
  exit 1
fi

if [[ ! -f "${ssh_key}" ]]; then
  echo "SSH key not found: ${ssh_key}" >&2
  exit 1
fi

remote_command="set -e; export LANG=C LC_ALL=C; source /home/ubuntu/.nvm/nvm.sh; cd '${remote_dir}'; node scripts/refreshGovernmentData.js --region '${region}' ${mode}"

if [[ "${region}" == "michigan" ]]; then
  source_file="$(mktemp -t canoja-michigan-source.XXXXXX.json)"
  remote_source="/tmp/canoja-michigan-source-$$.json"
  cleanup() {
    rm -f "${source_file}"
    ssh -i "${ssh_key}" -o BatchMode=yes "${remote_host}" "rm -f '${remote_source}'" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
  node scripts/fetchGovernmentSource.js --region michigan --output "${source_file}"
  scp -i "${ssh_key}" -o BatchMode=yes "${source_file}" "${remote_host}:${remote_source}"
  remote_command="set -e; export LANG=C LC_ALL=C MICHIGAN_SOURCE_FILE='${remote_source}'; source /home/ubuntu/.nvm/nvm.sh; cd '${remote_dir}'; node scripts/refreshGovernmentData.js --region '${region}' ${mode}"
fi

ssh -i "${ssh_key}" \
  -o BatchMode=yes \
  -o ConnectTimeout=10 \
  "${remote_host}" \
  "${remote_command}"
