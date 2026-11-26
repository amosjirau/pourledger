#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/release-common.sh"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
sleep() { :; }
count=0
flaky() { count=$((count+1)); ((count==2)); }
retry_read 3 fixture flaky
[[ $count == 2 ]]
count=0
always_bad() { count=$((count+1)); return 1; }
if retry_read 2 fixture always_bad; then exit 1; fi
[[ $count == 2 ]]
npm() {
  printf '%s\n' "$POURLEDGER_MAINNET_READ_RPC" >> "$tmp/calls"
  if [[ $POURLEDGER_MAINNET_READ_RPC == https://rpc2mainnet.qie.digital/ && ${MODE:-} != fail ]]; then
    printf '%s\n' '{"registryCheck":{"status":"verified","observedChainId":1990}}'
  else
    printf '%s\n' '{"registryCheck":{"status":"unverified","reason":"fixture unavailable"}}'; return 1
  fi
}
select_verified_rpc https://rpc1mainnet.qie.digital/ "$tmp/proof.json"
[[ $POURLEDGER_RPC_URL == https://rpc2mainnet.qie.digital/ ]]
[[ $(wc -l < "$tmp/calls") == 3 ]]
[[ -f $tmp/proof.json.endpoint-1-attempt-2 ]]
: > "$tmp/calls"
export MODE=fail
if select_verified_rpc https://rpc2mainnet.qie.digital/ "$tmp/proof.json"; then exit 1; fi
[[ $(wc -l < "$tmp/calls") == 10 ]]
printf 'PASS: bounded retry, fallback, deduplication, fail-closed, failed proof retention\n'
