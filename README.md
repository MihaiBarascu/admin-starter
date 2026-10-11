# Multiwebsite Admin Starter

Cloudflare Workers starter for reusable admin applications.

## Stack

- Cloudflare Workers + Workers Assets
- Hono for Worker API routing
- React + Vite for the admin app
- shadcn/ui generated components
- D1 + Drizzle ORM
- Better Auth for email/password auth

## Local Setup

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

The local app runs at `http://localhost:5173`.

## Configuration Model

`wrangler.jsonc` is the deploy configuration. For production, set the real
`BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, `routes[].pattern`, D1
`database_name`, and `database_id` there before connecting the repo to
Cloudflare Builds.

Local development uses `.dev.vars` for local secrets and localhost auth values.
Do not commit `.dev.vars`.

The default `wrangler.jsonc` is compatible with Workers Free. If a project moves
to Workers Paid, optional CPU/subrequest limits can be copied from
`docs/examples/wrangler-paid-limits.json`.

## Required Secrets

Local secrets live in `.dev.vars`. Production secrets must be set with Wrangler.

```bash
npm run secrets:production
```

`BETTER_AUTH_SECRET` and `RESEND_API_KEY` are permanent production secrets.
`BOOTSTRAP_ADMIN_TOKEN` is only needed to create the first admin user. Remove or
rotate it after bootstrap.

## Database

Better Auth tables are generated from the official Better Auth CLI. Regenerate
them after changing Better Auth options or plugins:

```bash
npm run auth:schema:generate
```

Application-owned tables live outside the generated auth schema. Drizzle reads
the combined schema and generates migrations:

```bash
npm run db:generate
```

Apply migrations locally:

```bash
npm run db:migrate:local
```

Seed the local development admin:

```bash
npm run db:seed:local -- admin
```

The admin seed creates the configured email only when it is missing. If that email
already exists, the seed is a no-op and does not update the name or password.
Override the defaults with `SEED_ADMIN_NAME`, `SEED_ADMIN_EMAIL`, and
`SEED_ADMIN_PASSWORD` in `.dev.vars`.

Apply migrations remotely:

```bash
npm run db:migrate:remote
```

Seed a remote admin only when you intentionally want to create that account in
the configured remote D1 database:

```bash
npm run db:seed:remote -- admin
```

Seed/demo data must be kept outside normal schema migrations.

## Public Forms From Other Sites

Static sites on other origins can post to a form:

```http
POST https://admin-starter.multiwebsite.org/api/forms/<slug>/submissions
Content-Type: application/json

{"payload": {"<fieldName>": "string or boolean"}, "turnstileToken": "<optional>"}
```

It returns `201 {"submitted": true, "id": "<uuid>"}` or `{"error": "<message>"}`
with `400/403/404/429/502/503`. Unknown payload keys are rejected with `400`.

Each site origin must be listed in that form's **Allowed origins** (admin UI:
Forms -> Edit, one exact origin per line, e.g. `https://example.com` or
`http://localhost:4321`). Other origins get `403` without CORS headers. Do not
add site origins to `AUTH_TRUSTED_ORIGINS`; that list is only for auth/admin.
Received messages are in the admin **Submissions** page. Details are in
[docs/admin-guide.md](docs/admin-guide.md#forms-api).

## Verification

```bash
npm run test:api
npm run test:react
npm run lint
npm run build
```

`npm run test:api` runs Worker/API tests locally in the Cloudflare Workers runtime through `@cloudflare/vitest-pool-workers`. It applies D1 migrations in an isolated test database.
`npm run test:react` runs focused React UI regression tests without the Cloudflare Worker plugin.

## Deploy

1. Create a real D1 database.
2. Set the production D1 `database_name` and `database_id` in `wrangler.jsonc`.
3. Verify the Resend sending domain and set `RESEND_FROM_EMAIL` in `wrangler.jsonc`.
4. Set production secrets with `npm run secrets:production`.
5. Run remote migrations.
6. Deploy.

```bash
npm run db:migrate:remote
npm run deploy
```

For an interactive manual production deploy:

```bash
npm run deploy:production
```

The production deploy script runs tests, lint, build, remote migrations, and
deploy. It also checks that the permanent `BETTER_AUTH_SECRET` exists in
Cloudflare before deploying. `RESEND_API_KEY` is required for forgot-password
emails. `BOOTSTRAP_ADMIN_TOKEN` is intentionally optional after the first admin
exists.

Read [docs/admin-guide.md](docs/admin-guide.md) before deploying a project created from this starter.
