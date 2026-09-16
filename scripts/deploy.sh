#!/usr/bin/env bash
# Deploys the calculator to Deno Deploy from a clean staging folder, so nothing but
# deno.json, deno.lock, engine/ and server/ is ever uploaded (never .env).
# Needs DENO_DEPLOY_TOKEN and DENO_DEPLOY_ORG in .env.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${DENO_DEPLOY_TOKEN:?missing in .env}" "${DENO_DEPLOY_ORG:?missing in .env}"
stage="$(mktemp -d)"
trap 'rm -rf "$stage"' EXIT
cp -R deno.json deno.lock engine server "$stage/"
deno task test
(cd "$stage" && deno deploy . --json --non-interactive --org "$DENO_DEPLOY_ORG" --app hesba-calculator --prod)
curl -fsS https://hesba-calculator.hesba.deno.net/health && echo
