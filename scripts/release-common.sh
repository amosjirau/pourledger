#!/usr/bin/env bash
# Read-only release helpers. Never use retry_read for writes or deployments.
release_stage() { stage=$1; printf '\n==> %s\n' "$stage" >&2; }
retry_read() {
  local attempts=$1 label=$2 attempt; shift 2
  for ((attempt=1; attempt<=attempts; attempt++)); do
    printf '%s (attempt %s/%s)\n' "$label" "$attempt" "$attempts" >&2
    if "$@"; then return 0; fi
    if (( attempt < attempts )); then sleep 2; fi
  done
  return 1
}
select_verified_rpc() {
  local preferred=$1 proof=$2 rpc attempt prior candidate duplicate label
  local -a candidates=() seen=()
  if [[ -n $preferred ]]; then candidates+=("$preferred"); fi
  for candidate in 2 1 3 4 5; do candidates+=("https://rpc${candidate}mainnet.qie.digital/"); done
  for rpc in "${candidates[@]}"; do
    if [[ $rpc =~ ^https://rpc[1-5]mainnet\.qie\.digital/?$ ]]; then rpc=${rpc%/}/; fi
    duplicate=0
    for prior in "${seen[@]}"; do [[ $prior != "$rpc" ]] || duplicate=1; done
    (( duplicate == 0 )) || continue
    seen+=("$rpc")
    label='configured endpoint'
    if [[ $rpc =~ ^https://(rpc[1-5]mainnet\.qie\.digital)/$ ]]; then label=${BASH_REMATCH[1]}; fi
    for attempt in 1 2; do
      printf 'Full registry verification: %s (endpoint %s, attempt %s/2)\n' "$label" "${#seen[@]}" "$attempt" >&2
      if POURLEDGER_MAINNET_READ_RPC="$rpc" npm run --silent release:mainnet -- --verify > "$proof"; then
        if node -e 'const p=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));if(p.registryCheck?.status!=="verified"||p.registryCheck.observedChainId!==1990)process.exit(1)' "$proof"; then
          POURLEDGER_RPC_URL=$rpc; export POURLEDGER_RPC_URL
          printf 'Full registry verification passed on %s.\n' "$label" >&2
          return 0
        fi
      fi
      node -e 'try {const p=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));console.error(p.registryCheck?.reason??"Missing verified registry proof.")} catch {console.error("No readable registry proof.")}' "$proof" >&2 || true
      cp -- "$proof" "$proof.endpoint-${#seen[@]}-attempt-$attempt" || return 1
      if (( attempt < 2 )); then sleep 2; fi
    done
  done
  return 1
}
