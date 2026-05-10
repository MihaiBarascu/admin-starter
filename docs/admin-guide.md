# Admin Guide

This guide documents how the starter is built, how to run it, and which official references were used.

## Purpose

`multiwebsite-admin-starter` is a reusable Cloudflare-first admin foundation. It is not tied to one client domain or database. Each future project should copy or fork it, then replace project-specific names, D1 IDs, secrets, domains, and modules.

## Official Sources Used

- Cloudflare Hono + React/Vite Workers template: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
- Cloudflare React/Vite Workers guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- Cloudflare D1 Wrangler commands: https://developers.cloudflare.com/d1/wrangler-commands/
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/
- Hono best practices: https://hono.dev/docs/guides/best-practices
- Hono middleware: https://hono.dev/docs/guides/middleware
- Drizzle D1 connection: https://orm.drizzle.team/docs/connect-cloudflare-d1
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- Drizzle Kit generate: https://orm.drizzle.team/docs/drizzle-kit-generate
- Drizzle seed overview: https://orm.drizzle.team/docs/seed-overview
- Better Auth Hono integration: https://better-auth.com/docs/integrations/hono
- Better Auth CLI: https://better-auth.com/docs/concepts/cli
- Better Auth email/password: https://better-auth.com/docs/authentication/email-password
- Better Auth rate limit: https://better-auth.com/docs/concepts/rate-limit
- Better Auth Drizzle adapter: https://better-auth.com/docs/adapters/drizzle
- Resend Email API: https://resend.com/docs/api-reference/emails/send-email
- Cloudflare Workers Resend tutorial: https://developers.cloudflare.com/workers/tutorials/send-emails-with-resend/
- Resend Cloudflare Workers guide: https://resend.com/docs/send-with-cloudflare-workers
- shadcn/ui Vite installation: https://ui.shadcn.com/docs/installation/vite
- shadcn/ui components: https://ui.shadcn.com/docs/components
- Cloudflare Workers testing: https://developers.cloudflare.com/workers/testing/
- Cloudflare Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/
- Cloudflare Workers GitHub Actions: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
- Cloudflare Workers Builds configuration: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/
- Cloudflare WAF rate limiting best practices: https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/
- Cloudflare Budget Alerts: https://developers.cloudflare.com/billing/manage/budget-alerts/
- Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- Cloudflare Workers Logs pricing: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Hono body limit middleware: https://hono.dev/docs/middleware/builtin/body-limit
- Vitest guide: https://vitest.dev/guide/

## Architecture

The Worker follows Hono's recommended larger-app structure:

```text
src/worker/
  index.ts
  types.ts
  auth.ts
  auth/
    middleware.ts
  db/
    app-schema.ts
    auth-schema.generated.ts
    client.ts
    schema.ts
  lib/
    env.ts
    security.ts
  modules/
    bootstrap/routes.ts
    forms/routes.ts
    forms/schema.ts
    forms/service.ts
    health/routes.ts
    me/routes.ts
    safety/defaults.ts
    safety/routes.ts
    safety/service.ts
```

`index.ts` composes the app with `app.route()`. Feature modules own their own `routes.ts`. Shared business logic goes in `service.ts`. Services receive explicit dependencies, such as `D1Database`, not a Hono `Context`.

## Database Rules

Better Auth-owned tables are generated from the official Better Auth CLI into
`src/worker/db/auth-schema.generated.ts`. Do not edit that file manually.

Application-owned tables live in `src/worker/db/app-schema.ts`.

`src/worker/db/schema.ts` combines both schemas and is the file Drizzle uses for
migration generation.

When Better Auth options or plugins change, regenerate the auth schema first:

```bash
npm run auth:schema:generate
```

Then generate a Drizzle migration:

```bash
npm run db:generate
```

The generated SQL goes into `drizzle/migrations/`. Do not hand-write normal
schema migrations. Custom SQL is allowed only for data transformations Drizzle
cannot infer, such as converting existing Better Auth timestamps when changing
schema representation.

Seed/demo data should not live in standard generated migrations. Use explicit seed scripts when needed. Runtime defaults should be handled in code where possible, as the safety module does.

## Seed Scripts

Seed scripts are explicit commands, not migrations. They use Wrangler's platform
proxy and application services, so seed logic stays close to the runtime code.

```bash
npm run db:seed:local -- admin
npm run db:seed:remote -- admin
```

The admin seed calls the application service in
`src/worker/modules/admin-users/service.ts`. It creates the configured email only
when that email is missing. If the email already exists, the seed is a no-op and
does not update the name or password. This keeps seed behavior predictable and
avoids silently changing an existing account.

Local defaults can be overridden in `.dev.vars`:

```text
SEED_ADMIN_NAME="Local Admin"
SEED_ADMIN_EMAIL="admin@example.test"
SEED_ADMIN_PASSWORD="LocalAdminPassword123!"
```

Remote seeds act on the configured remote D1 database. Before running a remote
seed, confirm the production `database_name` and `database_id` in `wrangler.jsonc`,
apply remote migrations, and verify that the seed email is intended for that
environment.

## Local Development

The project uses a simple deployment model:

- `wrangler.jsonc` is the production/deploy configuration.
- `.dev.vars` provides local secrets and localhost auth values while developing.
- Local D1 commands use `--local`; remote D1 commands use `--remote`.
- The default `wrangler.jsonc` is compatible with Workers Free. Workers Paid
  projects should uncomment the documented `limits` block in `wrangler.jsonc`
  or copy the same values from `docs/examples/wrangler-paid-limits.json`.

Create local secrets:

```bash
cp .dev.vars.example .dev.vars
```

Use a strong `BETTER_AUTH_SECRET` and a one-time `BOOTSTRAP_ADMIN_TOKEN`.

Apply D1 migrations locally:

```bash
npm run db:migrate:local
```

Start local development:

```bash
npm run dev
```

Open `http://localhost:5173`.

## API Tests

The starter uses Cloudflare's official Workers Vitest integration for API tests:

```bash
npm run test:api
```

For watch mode while developing API routes:

```bash
npm run test:api:watch
```

The test config is `vitest.worker.config.ts`. Test files live in:

```text
tests/worker/
  setup.ts
  helpers/http.ts
  api.spec.ts
```

The tests run inside the Workers runtime, not plain Node.js. This matters because Hono routes, Better Auth, D1, Drizzle, cookies, request headers, and future Workers bindings should be exercised in an environment close to production.

`tests/worker/setup.ts` applies the generated Drizzle migrations to an isolated D1 database using Cloudflare's D1 test helpers. Each test run is local and does not touch production D1.

Current API coverage:

- public metadata and health endpoints
- JSON 404 responses
- protected admin route authentication
- oversized JSON request rejection
- missing/invalid bootstrap token rejection
- first-admin bootstrap
- rejected auth mutation without a trusted Origin
- Better Auth email/password sign-in
- Better Auth password reset email through Resend
- authenticated safety settings read/update
- invalid safety payload rejection
- same-origin public form submissions
- form schema allowlist validation
- form safety checks before D1 writes, Turnstile validation, and Resend email
- Turnstile server-side validation for forms that require it

For every new API route, add tests for:

- unauthenticated access when the route is protected
- the valid request path
- invalid request payloads
- safety checks before billable work when the route can consume paid resources

## First Admin User

The first admin is created from the bootstrap panel. The request requires `BOOTSTRAP_ADMIN_TOKEN`.

After the first admin is created:

1. Remove `BOOTSTRAP_ADMIN_TOKEN` from production secrets, or rotate it to a new value.
2. Keep `AUTH_SIGNUP_ENABLED=false` unless the project intentionally supports open signups.

## Auth

Better Auth is mounted according to the official Hono integration:

```text
GET/POST /api/auth/*
```

Admin API routes are protected by `requireAdminSession`, which calls Better Auth's `getSession` with request headers and stores `user` and `session` in Hono context variables.

The runtime auth configuration lives in `src/worker/auth.ts`. Shared Better Auth
options live in `src/worker/auth/options.ts`, and `better-auth.config.ts` exists
only for the Better Auth CLI schema generator. The CLI config must stay free of
real Cloudflare bindings and production secrets.

Better Auth rate limiting is enabled with Cloudflare's `cf-connecting-ip` header and a stricter rule for `/sign-in/email`. This is a baseline auth protection. For production public endpoints, still configure Cloudflare WAF/rate limiting in front of the Worker.

Password reset uses Better Auth's official `sendResetPassword` hook and client
methods: `authClient.requestPasswordReset()` and `authClient.resetPassword()`.
The hook sends the email through Resend's official `POST /emails` API from
`src/worker/modules/email/service.ts`. The email send is passed to
`ctx.waitUntil()` so the auth response does not wait on the email provider.

Required email configuration:

- `RESEND_API_KEY` is a Cloudflare secret.
- `RESEND_FROM_EMAIL` is a Wrangler variable and must use a domain verified in
  Resend.
- Local development can define both values in `.dev.vars`.

Unsafe `/api/auth/*` requests also require a trusted `Origin` header. This keeps browser-based auth mutations tied to the configured `AUTH_TRUSTED_ORIGINS` and avoids depending only on library defaults.

All `/api/*` requests are capped at 32 KB by Hono's body limit middleware. The current admin/auth JSON payloads are small, so larger bodies are treated as abuse or misconfiguration and return `413`.

## Safety Module

The starter includes runtime safety switches:

- `public_api_enabled`
- `email_notifications_enabled`
- `emergency_stop_enabled`
- `daily_public_write_limit`

The current starter stores only changed values in D1. Defaults live in `src/worker/modules/safety/defaults.ts`.

Future public write endpoints should check the safety module before doing expensive work such as Turnstile validation, D1 writes, R2 writes, Queues publishes, or third-party API calls.

## Forms API

The starter includes a same-origin public form ingestion API:

```text
POST /api/forms/:slug/submissions
```

Forms are configured by an authenticated admin route:

```text
PUT /api/admin/forms/:slug
```

Each form stores a server-side field allowlist in D1. Public submissions are
accepted only when the request `Origin` is trusted by `AUTH_TRUSTED_ORIGINS`,
the form is enabled, the global public API safety switch is enabled, emergency
stop is off, and the daily public write limit has not been reached.

The submission payload shape is:

```json
{
  "payload": {
    "email": "visitor@example.com",
    "message": "Hello"
  },
  "turnstileToken": "optional-token"
}
```

The form schema decides which fields are accepted. Unknown fields are rejected
instead of stored. Supported field types are `text`, `email`, `textarea`, and
`checkbox`.

If a form has `turnstileRequired=true`, the Worker validates the token on the
server through Cloudflare Turnstile Siteverify before writing the submission.
Set the production secret before enabling that option:

```bash
npx wrangler secret put TURNSTILE_SECRET_KEY
```

After a successful D1 write, the Worker sends the Resend notification with
`ctx.waitUntil()`. This keeps the user-facing response fast and avoids losing
the stored submission if the email provider is temporarily unavailable.

## UI Rules

UI uses shadcn/ui generated components. Add new primitives through the official CLI:

```bash
npm exec shadcn@latest -- add <component>
```

Do not create custom replacements for shadcn primitives unless a component does not exist or the project needs a domain-specific composition.

## Monitoring

The admin dashboard includes external monitoring links for:

- Cloudflare Billable Usage
- Budget Alerts
- Worker Observability
- D1 Metrics
- WAF Rate Limits
- Security Events
- Turnstile
- Resend

These links are intentionally external. Cloudflare billing and product usage data can lag and should not be treated as a real-time kill switch.

The Worker keeps observability enabled but samples logs and traces at 1% in `wrangler.jsonc`. This preserves some operational visibility while reducing the chance that a traffic spike creates a secondary logs bill. Do not add `console.log` on every request. Log only exceptional or security-relevant events, and prefer structured JSON when logging is needed.

## Production Cost Controls

Cloudflare Workers Paid does not impose a daily request cap, so cost control must combine Cloudflare edge rules, billing alerts, and code-level limits.
When moving this starter to Workers Paid, start by enabling conservative Worker
limits in `wrangler.jsonc`: `cpu_ms: 1000` and `subrequests: 50`. These keep
runaway requests bounded while leaving enough room for Better Auth, D1, and the
occasional Resend call. Do not add KV, R2, Queues, Durable Objects, Workers AI,
Vectorize, Browser Rendering, or Analytics Engine bindings until the code has a
clear need, product-specific limits, tests, and monitoring notes.

Before production deploy, configure Cloudflare dashboard controls:

1. Create Budget Alerts at low thresholds, for example `$1`, `$5`, and `$10`.
2. Create usage notifications for Workers requests and D1 rows read/written if available on the account plan.
3. Add WAF Rate Limiting rules for auth and bootstrap endpoints.
4. Review Billable Usage and D1 Metrics after deploy and after every public launch.

Recommended WAF Rate Limiting rules:

```text
Rule: Auth mutations
Expression:
(http.request.uri.path wildcard "/api/auth/*" and http.request.method in {"POST"})
Suggested action: Managed Challenge or Block after threshold
Suggested threshold: start conservative, then tune from real traffic
```

```text
Rule: Bootstrap first admin
Expression:
(http.request.uri.path eq "/api/admin/bootstrap" and http.request.method eq "POST")
Suggested action: Block after a very low threshold
Suggested threshold: 5 requests / 10 minutes / IP
```

```text
Rule: Future public write endpoints
Expression:
(http.request.uri.path wildcard "/api/forms/*" and http.request.method eq "POST")
Suggested action: Managed Challenge or Block after threshold
Suggested threshold: start around 20 requests / 10 minutes / IP, then tune from real traffic
```

For production, prefer a custom domain protected by Cloudflare WAF and keep `workers.dev` exposure disabled once routes/domains are configured. Do not add R2, KV, Queues, Durable Objects, Workers AI, Vectorize, Browser Rendering, or Analytics Engine without adding product-specific limits, tests, and monitoring notes.

## Production Deploy Checklist

Use this checklist before every first production deploy for a project created
from this starter.

### Local verification

1. Confirm the working tree contains only intentional changes.
2. Run the local verification commands:

```bash
npm run test:api
npm run test:react
npm run lint
npm run build
```

3. Run a deploy dry-run:

```bash
npm run check
```

Wrangler may print local log-file warnings in restricted environments. Treat
TypeScript, Vite, Wrangler config, bundle size, and binding output as the
important deploy signals.

### Cloudflare resources

1. Create a Cloudflare D1 database for the production project.
2. Set the production D1 `database_name` and `database_id` in `wrangler.jsonc`.
3. Set production `BETTER_AUTH_URL` to the final HTTPS origin.
4. Set production `AUTH_TRUSTED_ORIGINS` to the exact allowed browser origins.
5. Configure a custom domain for production traffic with `routes[].pattern` and
   `custom_domain: true`. The default `workers.dev` route and Preview URLs are
   disabled in `wrangler.jsonc`.
6. Keep `AUTH_SIGNUP_ENABLED=false` unless the project intentionally allows
   public signups.
7. Set production secrets:

```bash
npm run secrets:production
```

`BETTER_AUTH_SECRET` is permanent and required for every production deploy.
`RESEND_API_KEY` is permanent and required for password reset emails.
`TURNSTILE_SECRET_KEY` is required only for forms configured with
`turnstileRequired=true`.
`BOOTSTRAP_ADMIN_TOKEN` is only needed while creating the first admin. After an
admin exists, it can be rotated or deleted; when it is missing, the bootstrap UI
is disabled.

Before relying on password reset in production, verify the sending domain in
Resend and make sure `RESEND_FROM_EMAIL` in `wrangler.jsonc` uses that domain.

### Cost controls

Configure these in the Cloudflare dashboard before making the app public:

1. Budget Alerts at small thresholds, for example `$1`, `$5`, and `$10`.
2. Usage notifications for Workers requests and D1 rows read/written when
   available on the account plan.
3. WAF Rate Limiting for `POST /api/auth/*`.
4. WAF Rate Limiting for `POST /api/admin/bootstrap`.
5. Optional WAF rule for all future public write endpoints.
6. Confirm the app is served from the intended custom domain and disable
   unnecessary `workers.dev` exposure once the custom route is active.

Budget alerts and usage notifications are informational only. They do not stop
usage. WAF/rate limiting is the practical edge-level control for request spikes,
credential stuffing, and bot traffic.

### Deploy

The recommended production path is GitHub Actions. The workflow in
`.github/workflows/deploy.yml` runs:

1. `npm ci`
2. `npm run test:api`
3. `npm run test:react`
4. `npm run lint`
5. `npm run build`
6. `wrangler d1 migrations apply ... --remote`
7. `wrangler deploy`

Configure these GitHub repository secrets:

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

The API token must be scoped to the production Cloudflare account and must allow
Workers deploys and D1 migrations. In GitHub, use the `production` environment
for the deploy job so approvals can be added later without changing the
workflow.

Do not leave Cloudflare Workers Builds doing production deploys at the same
time as GitHub Actions. Use one deploy system for production. If this repository
is connected in Cloudflare Workers Builds, disable production deploys there or
leave it only for non-production preview experiments.

For manual deploys from a trusted local machine, use:

```bash
npm run deploy:production
```

That guided command runs verification, remote migrations, and deploy in order,
and checks that `BETTER_AUTH_SECRET` exists in Cloudflare.

The lower-level manual commands are:

1. Apply remote migrations:

```bash
npm run db:migrate:remote
```

2. Deploy:

```bash
npm run deploy
```

3. Create the first admin from the bootstrap UI or by intentionally running the
   remote admin seed:

```bash
npm run db:seed:remote -- admin
```

4. Remove or rotate `BOOTSTRAP_ADMIN_TOKEN` immediately after the first admin
   exists.
5. Confirm `GET /api/admin/bootstrap` returns `{ "available": false }`.
6. Sign in and verify protected admin routes work.
7. Review Billable Usage, Workers metrics, D1 metrics, WAF events, and Security
   Events after deploy.

### Post-deploy monitoring

For the first public release window, check Cloudflare metrics more frequently:

1. Billable Usage for unexpected product spend.
2. Workers request volume, error rate, CPU time, and subrequest behavior.
3. D1 rows read/written.
4. WAF rate-limit matches and blocked requests.
5. Workers Logs sample for unexpected 500s or auth abuse.

## Future Products

Before adding KV, R2, Durable Objects, Queues, Workers AI, Vectorize, or Agents, read the current official docs plus the product limits and pricing pages. Document why the product is needed and which endpoint can consume billable usage.
