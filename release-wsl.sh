#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_url=https://github.com/amosjirau/pourledger.git
base=698a3a3ee1229a63227c9267f897a62b5cabcc65
work_dir=${POURLEDGER_WSL_WORKDIR:-"$HOME/pourledger-hackathon-release"}
operator=http://127.0.0.1:7341/operator/demo

usage() {
  printf '%s\n' 'Usage: bash release-wsl.sh FULL_GITHUB_MAIN_SHA [--publish] [--journal PATH]' \
    'Node.js 24, Git, curl and an approved Rabby browser profile are required.' \
    'Supply --publish to authorize a production build of the pinned commit in the existing Vercel project if needed.' \
    'Use --journal to collect after resuming a completed Rabby run. The default starts the loopback operator.'
}
fail() { printf '%s\n' "$*" >&2; exit 1; }
if [[ ${1:-} == --help ]]; then usage; exit 0; fi
revision=${1:-}
[[ $revision =~ ^[0-9a-f]{40}$ ]] || { usage >&2; exit 2; }
shift
publish=()
journal=
while (( $# )); do
  case $1 in
    --publish) publish=(--publish); shift ;;
    --journal) (( $# >= 2 )) || fail 'Supply a journal path.'; journal=$(realpath -e -- "$2"); shift 2 ;;
    *) usage >&2; exit 2 ;;
  esac
done
for tool in git node npm curl tar realpath; do command -v "$tool" >/dev/null || fail "Install $tool in this WSL distribution."; done
[[ $(node -p 'process.versions.node.split(".")[0]') == 24 ]] || fail 'Use Node.js 24.'
vercel_token=${VERCEL_TOKEN:-}
unset VERCEL_TOKEN
if (( ${#publish[@]} )); then
  if [[ -z $vercel_token ]]; then read -r -s -p 'Authorized Vercel token: ' vercel_token; printf '\n'; fi
  [[ -n $vercel_token ]] || fail 'Vercel project permission is required to publish a revision.'
  if [[ -z ${POURLEDGER_VERCEL_TEAM:-} ]]; then read -r -p 'Vercel team ID or slug (empty for personal scope): ' POURLEDGER_VERCEL_TEAM; fi
  export POURLEDGER_VERCEL_TEAM
fi

production_proof() {
  if (( ${#publish[@]} )); then
    VERCEL_TOKEN="$vercel_token" node --use-env-proxy scripts/vercel-release.mjs "$revision" "$@"
  else
    npm run --silent release:public -- "$revision"
  fi
}

mkdir -p -- "$work_dir"
work_dir=$(realpath -e -- "$work_dir")
checkout=$work_dir/source
if [[ ! -e $checkout ]]; then git clone --single-branch --branch main -- "$repo_url" "$checkout"; fi
[[ $(git -C "$checkout" config --get remote.origin.url) == "$repo_url" ]] || fail 'Use a separate WSL working directory for the reviewed checkout.'
[[ -z $(git -C "$checkout" status --porcelain) ]] || fail 'Preserve these checkout changes. Point POURLEDGER_WSL_WORKDIR at a separate directory.'
git -C "$checkout" fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
[[ $(git -C "$checkout" rev-parse refs/remotes/origin/main) == "$revision" ]] || fail 'GitHub main does not match the requested reviewed release.'
git -C "$checkout" merge-base --is-ancestor "$base" "$revision" || fail 'The release is outside the approved PourLedger history.'
git -C "$checkout" switch --detach "$revision"
cd "$checkout/apps/web"

output=$(mktemp -d "$work_dir/release.XXXXXXXX")
printf 'Release evidence directory %s\n' "$output"
npm ci
production_proof "${publish[@]}" > "$output/vercel-before.json"
if [[ -z ${POURLEDGER_RPC_URL:-} ]]; then read -r -s -p 'Approved QIE Mainnet HTTPS read RPC: ' POURLEDGER_RPC_URL; printf '\n'; fi
if [[ -z ${POURLEDGER_CONFIRMATIONS:-} ]]; then read -r -p 'Reviewed QIE confirmation depth: ' POURLEDGER_CONFIRMATIONS; fi
[[ -n $POURLEDGER_RPC_URL && $POURLEDGER_CONFIRMATIONS =~ ^[1-9][0-9]{0,4}$ ]] && (( POURLEDGER_CONFIRMATIONS <= 10000 )) ||
  fail 'Supply the approved read RPC and a positive confirmation depth up to 10000.'
export POURLEDGER_RPC_URL POURLEDGER_CONFIRMATIONS
export POURLEDGER_DEMO_OPERATOR=mainnet POURLEDGER_CHAIN_ID=1990
export POURLEDGER_REGISTRY=0xf99C353f1B73aA2DeCa2cb7bbe580eEAa6472e63 POURLEDGER_DEPLOYMENT_BLOCK=12148098
export POURLEDGER_PUBLIC_ORIGIN=https://pourledger-one.vercel.app POURLEDGER_MAINNET_EXPLORER_ORIGIN=https://mainnet.qie.digital

POURLEDGER_MAINNET_READ_RPC="$POURLEDGER_RPC_URL" npm run --silent release:mainnet -- --verify > "$output/mainnet-read.json"
node --input-type=module - "$output/mainnet-read.json" <<'JS'
import { readFileSync } from 'node:fs';
import { maxPassportHistoryBlocks } from './lib/passport.ts';
const proof = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (proof.registryCheck.status !== 'verified' || BigInt(proof.registryCheck.snapshotBlock) - BigInt(proof.ownerDeploymentRecord.deploymentBlock) + 1n > maxPassportHistoryBlocks) {
  console.error('The pinned Mainnet registry or its direct passport history could not be verified.');
  process.exitCode = 1;
}
JS
if [[ -z ${PLAYWRIGHT_CHROMIUM_PATH:-} ]]; then
  if command -v chromium >/dev/null; then export PLAYWRIGHT_CHROMIUM_PATH; PLAYWRIGHT_CHROMIUM_PATH=$(command -v chromium)
  else npx --no-install playwright install chromium; fi
fi
node --use-env-proxy scripts/release-public-smoke.mjs "$output"

if [[ -z $journal ]]; then
  npm run build
  node --use-env-proxy node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 7341 > "$output/loopback.log" 2>&1 &
  operator_pid=$!
  trap 'kill "$operator_pid" 2>/dev/null || true' EXIT
  trap 'exit 130' INT TERM
  for attempt in {1..25}; do
    kill -0 "$operator_pid" 2>/dev/null || fail 'The loopback operator stopped during startup. Check loopback.log.'
    if curl -fsS --max-time 2 -o /dev/null "$operator"; then break; fi
    [[ $attempt -lt 25 ]] || fail 'The loopback operator did not become ready. Check loopback.log.'
    sleep 1
  done
  printf '\nOpen %s in the Windows browser with Rabby.\n' "$operator"
  printf 'Approve each synthetic step in Rabby. Download the completed journal from the operator.\n'
  read -r -p 'Paste the WSL path to the completed journal (Enter to stop and resume later): ' journal
  if [[ -z $journal ]]; then printf 'Reopen with the same browser profile and URL to resume the journal.\n'; exit 0; fi
  journal=$(realpath -e -- "$journal")
fi
npm run --silent demo:collect -- "$journal" "$output/mainnet-demo"
production_proof > "$output/vercel-after.json"
unset vercel_token
node scripts/release-packet.mjs "$output"
tar -czf "$output/submission.tar.gz" -C "$output" SUBMISSION.md mainnet-read.json vercel-before.json vercel-after.json \
  public-workspace-desktop.png public-workspace-mobile.png mainnet-demo
printf 'Verified submission packet %s\n' "$output/submission.tar.gz"
