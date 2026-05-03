import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { user } from "../../src/worker/db/auth-schema.generated";
import { getDb } from "../../src/worker/db/client";
import { ensureSeedAdmin } from "../../src/worker/modules/admin-users/service";
import type { AppBindings } from "../../src/worker/types";

describe("admin seed", () => {
	it("creates the admin once by email and ignores later runs", async () => {
		const bindings = env as unknown as AppBindings;
		const first = await ensureSeedAdmin(bindings, {
			name: "Seed Admin",
			email: "seed-admin@example.test",
			password: "SeedAdminPassword123!",
		});

		expect(first).toMatchObject({
			email: "seed-admin@example.test",
			status: "created",
		});

		const second = await ensureSeedAdmin(bindings, {
			name: "Renamed Seed Admin",
			email: "seed-admin@example.test",
			password: "DifferentPassword123!",
		});

		expect(second).toMatchObject({
			email: "seed-admin@example.test",
			userId: first.userId,
			status: "exists",
		});

		const db = getDb(bindings);
		const rows = await db
			.select({ id: user.id, name: user.name })
			.from(user)
			.where(eq(user.email, "seed-admin@example.test"));

		expect(rows).toEqual([{ id: first.userId, name: "Seed Admin" }]);
	});
});
