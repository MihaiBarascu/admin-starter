import { form } from "../db/app-schema";
import { getDb } from "../db/client";
import { upsertForm } from "../modules/forms/service";
import type { UpsertFormRequest } from "../modules/forms/schema";
import type { SeedRunner } from "./types";

type SeedForm = UpsertFormRequest & {
	slug: string;
};

const DEFAULT_FORMS: SeedForm[] = [
	{
		slug: "contact",
		name: "Contact",
		notificationEmail: "admin@example.test",
		enabled: true,
		turnstileRequired: false,
		schema: {
			fields: [
				{
					name: "email",
					type: "email",
					required: true,
					maxLength: 254,
				},
				{
					name: "message",
					type: "textarea",
					required: true,
					maxLength: 5_000,
				},
			],
		},
	},
	{
		slug: "newsletter",
		name: "Newsletter",
		notificationEmail: "admin@example.test",
		enabled: true,
		turnstileRequired: false,
		schema: {
			fields: [
				{
					name: "email",
					type: "email",
					required: true,
					maxLength: 254,
				},
			],
		},
	},
];

export const formsSeed: SeedRunner = async ({ env, vars }) => {
	const db = getDb(env);
	const existingForms = await db.select({ slug: form.slug }).from(form);
	const existingSlugs = new Set(existingForms.map((row) => row.slug));
	const notificationEmail = vars.SEED_FORMS_NOTIFICATION_EMAIL ?? "admin@example.test";
	const result: Array<{ slug: string; status: "created" | "exists" }> = [];

	for (const seedForm of DEFAULT_FORMS) {
		if (existingSlugs.has(seedForm.slug)) {
			result.push({ slug: seedForm.slug, status: "exists" });
			continue;
		}

		await upsertForm(env.DB, seedForm.slug, {
			...seedForm,
			notificationEmail,
		});
		result.push({ slug: seedForm.slug, status: "created" });
	}

	return { forms: result };
};
