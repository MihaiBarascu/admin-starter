#!/usr/bin/env bash
set -euo pipefail

echo "This writes production secrets to the Cloudflare Worker configured by wrangler.jsonc."
echo "Use strong unique values. Do not paste local development secrets."
echo

npx wrangler secret put BETTER_AUTH_SECRET
npx wrangler secret put BOOTSTRAP_ADMIN_TOKEN
npx wrangler secret put RESEND_API_KEY

echo
echo "Production secrets were submitted."
echo "After the first admin exists, rotate or delete BOOTSTRAP_ADMIN_TOKEN."
echo "If BOOTSTRAP_ADMIN_TOKEN is deleted, the bootstrap UI stays disabled and deploy checks still pass."
echo "RESEND_FROM_EMAIL is configured in wrangler.jsonc. Make sure that sending domain is verified in Resend."
