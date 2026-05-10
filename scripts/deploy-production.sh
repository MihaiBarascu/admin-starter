#!/usr/bin/env bash
set -euo pipefail

echo "Production deploy checklist:"
echo "- wrangler.jsonc contains the production BETTER_AUTH_URL and AUTH_TRUSTED_ORIGINS."
echo "- wrangler.jsonc contains the production D1 database_name and database_id."
echo "- Resend sending domain is verified and RESEND_FROM_EMAIL matches that domain."
echo "- TURNSTILE_SECRET_KEY is set if any public form has turnstileRequired=true."
echo "- Confirm manually that Cloudflare WAF/rate limiting and Budget Alerts are configured."
echo "- Production secrets were submitted with scripts/setup-production-secrets.sh."
echo
read -r -p "Continue with production migration and deploy? [y/N] " confirm
case "$confirm" in
	y|Y|yes|YES) ;;
	*) echo "Aborted."; exit 1 ;;
esac

echo
echo "Checking production secrets..."
secret_list_json="$(npx wrangler secret list --format json)"

SECRET_LIST_JSON="$secret_list_json" node - <<'NODE'
const secrets = JSON.parse(process.env.SECRET_LIST_JSON ?? "[]");
const names = new Set(secrets.map((secret) => secret.name));

if (!names.has("BETTER_AUTH_SECRET")) {
	console.error("Missing required production secret BETTER_AUTH_SECRET.");
	console.error("Run: npx wrangler secret put BETTER_AUTH_SECRET");
	process.exit(1);
}

console.log("- BETTER_AUTH_SECRET is configured.");

if (!names.has("RESEND_API_KEY")) {
	console.error("Missing required production secret RESEND_API_KEY.");
	console.error("Run: npx wrangler secret put RESEND_API_KEY");
	process.exit(1);
}

console.log("- RESEND_API_KEY is configured.");

if (names.has("BOOTSTRAP_ADMIN_TOKEN")) {
	console.log("- BOOTSTRAP_ADMIN_TOKEN is configured.");
} else {
	console.log(
		"- BOOTSTRAP_ADMIN_TOKEN is not configured. Bootstrap UI will be disabled; this is OK after the first admin exists.",
	);
}
NODE

npm run test:api
npm run test:react
npm run lint
npm run build
npm run db:migrate:remote
npm run deploy

echo
echo "Deploy completed."
echo "Next: create the first admin if it does not exist, then rotate or delete BOOTSTRAP_ADMIN_TOKEN."
