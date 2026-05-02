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
					configPath: "./wrangler.json",
				},
				miniflare: {
					bindings: {
						BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-characters",
						BOOTSTRAP_ADMIN_TOKEN: "test-bootstrap-token",
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
