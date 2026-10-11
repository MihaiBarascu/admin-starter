import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createSignedInAdmin,
	putForm,
	resetFormsState,
	submitForm,
	trustedOrigin,
	upsertContactForm,
} from "./helpers/forms";
import { readJson } from "./helpers/http";

const appointmentSchema = {
	fields: [
		{ name: "phone", type: "tel", required: true },
		{
			name: "service",
			type: "select",
			required: true,
			options: ["Consultatie", "Detartraj", "Albire"],
		},
		{ name: "altPhone", type: "tel" },
	],
};

describe("form field types", () => {
	let cookie: string;

	beforeEach(async () => {
		vi.unstubAllGlobals();
		vi.stubGlobal("fetch", async () => Response.json({ id: "stubbed" }));
		await resetFormsState();
		cookie = await createSignedInAdmin();
	});

	it("rejects select fields without options and options on other field types", async () => {
		const slug = `types-${crypto.randomUUID()}`;

		const missingOptions = await putForm(cookie, slug, {
			schema: { fields: [{ name: "service", type: "select" }] },
		});
		expect(missingOptions.status).toBe(400);
		await expect(readJson(missingOptions)).resolves.toEqual({
			error: "service needs at least one option.",
		});

		const duplicateOptions = await putForm(cookie, slug, {
			schema: { fields: [{ name: "service", type: "select", options: ["A", "A"] }] },
		});
		expect(duplicateOptions.status).toBe(400);

		const optionsOnText = await putForm(cookie, slug, {
			schema: { fields: [{ name: "name", type: "text", options: ["A"] }] },
		});
		expect(optionsOnText.status).toBe(400);
		await expect(readJson(optionsOnText)).resolves.toEqual({
			error: "name: options are only allowed for select fields.",
		});
	});

	it("stores valid tel and select values", async () => {
		const slug = `types-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug, { schema: appointmentSchema });

		const response = await submitForm(
			slug,
			{ payload: { phone: " +40 (721) 123-456 ", service: "Detartraj" } },
			{ origin: trustedOrigin },
		);

		expect(response.status).toBe(201);
		const { id } = await readJson<{ id: string }>(response);
		const stored = await env.DB.prepare("select payload_json from form_submission where id = ?")
			.bind(id)
			.first<{ payload_json: string }>();
		expect(JSON.parse(stored?.payload_json ?? "{}")).toEqual({
			phone: "+40 (721) 123-456",
			service: "Detartraj",
		});
	});

	const invalidPhone = "phone must be a valid phone number.";
	it.each([
		["too short", "12345", invalidPhone],
		["too long", "1".repeat(31), "phone must contain at most 30 characters."],
		["letters", "0721 ABC 456", invalidPhone],
		["no digits", "+-() .-", invalidPhone],
		["newline", "0721\n123456", invalidPhone],
	])("rejects tel values that are %s", async (_label, phone, error) => {
		const slug = `types-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug, { schema: appointmentSchema });

		const response = await submitForm(
			slug,
			{ payload: { phone, service: "Albire" } },
			{ origin: trustedOrigin },
		);

		expect(response.status).toBe(400);
		await expect(readJson(response)).resolves.toEqual({ error });
	});

	it("rejects select values outside the configured options", async () => {
		const slug = `types-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug, { schema: appointmentSchema });

		for (const service of ["Implant", "consultatie", true]) {
			const response = await submitForm(
				slug,
				{ payload: { phone: "0721 123 456", service } },
				{ origin: trustedOrigin },
			);
			expect(response.status).toBe(400);
		}

		const missing = await submitForm(
			slug,
			{ payload: { phone: "0721 123 456" } },
			{ origin: trustedOrigin },
		);
		expect(missing.status).toBe(400);
		await expect(readJson(missing)).resolves.toEqual({ error: "service is required." });
	});
});
