import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	plugins: [
		cloudflareTest(async () => {
			const migrations = await readD1Migrations(
				path.join(projectRoot, "drizzle/migrations"),
			);

			return {
				main: "./src/worker/index.ts",
				wrangler: {
					configPath: "./wrangler.jsonc",
				},
				miniflare: {
					bindings: {
						APP_NAME: "Multiwebsite Admin Starter",
						BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-characters",
						BETTER_AUTH_URL: "http://localhost:5173",
						AUTH_TRUSTED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
						AUTH_SIGNUP_ENABLED: "false",
						BOOTSTRAP_ADMIN_TOKEN: "test-bootstrap-token",
						RESEND_API_KEY: "test-resend-api-key",
						RESEND_FROM_EMAIL: "Multiwebsite Admin <no-reply@example.test>",
						TURNSTILE_SECRET_KEY: "test-turnstile-secret",
						TEST_MIGRATIONS: migrations,
					},
				},
			};
		}),
	],
	test: {
		include: ["tests/worker/**/*.spec.ts"],
		setupFiles: ["./tests/worker/setup.ts"],
		testTimeout: 15_000,
	},
});
