import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { form } from "../../src/worker/db/app-schema";
import { user } from "../../src/worker/db/auth-schema.generated";
import { getDb } from "../../src/worker/db/client";
import { ensureSeedAdmin } from "../../src/worker/modules/admin-users/service";
import { formsSeed } from "../../src/worker/seeds/forms.seed";
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

describe("forms seed", () => {
	it("creates default forms once and does not overwrite existing forms", async () => {
		const bindings = env as unknown as AppBindings;
		const db = getDb(bindings);
		await db.delete(form);

		const first = await formsSeed({
			env: bindings,
			target: "local",
			vars: {
				SEED_FORMS_NOTIFICATION_EMAIL: "owner@example.test",
			},
		});

		expect(first).toEqual({
			forms: [
				{ slug: "contact", status: "created" },
				{ slug: "newsletter", status: "created" },
			],
		});

		await db
			.update(form)
			.set({ name: "Client Contact" })
			.where(eq(form.slug, "contact"));

		const second = await formsSeed({
			env: bindings,
			target: "local",
			vars: {
				SEED_FORMS_NOTIFICATION_EMAIL: "different@example.test",
			},
		});

		expect(second).toEqual({
			forms: [
				{ slug: "contact", status: "exists" },
				{ slug: "newsletter", status: "exists" },
			],
		});

		const rows = await db
			.select({
				slug: form.slug,
				name: form.name,
				notificationEmail: form.notificationEmail,
			})
			.from(form)
			.orderBy(form.slug);

		expect(rows).toEqual([
			{
				slug: "contact",
				name: "Client Contact",
				notificationEmail: "owner@example.test",
			},
			{
				slug: "newsletter",
				name: "Newsletter",
				notificationEmail: "owner@example.test",
			},
		]);
	});
});
