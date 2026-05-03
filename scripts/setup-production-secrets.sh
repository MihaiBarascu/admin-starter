#!/usr/bin/env bash
set -euo pipefail

echo "This writes production secrets to the Cloudflare Worker configured by wrangler.json."
echo "Use strong unique values. Do not paste local development secrets."
echo

npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN

echo
echo "Production secrets were submitted."
echo "After the first admin exists, rotate or delete BOOTSTRAP_ADMIN_TOKEN."
echo "If BOOTSTRAP_ADMIN_TOKEN is deleted, the bootstrap UI stays disabled and deploy checks still pass."
