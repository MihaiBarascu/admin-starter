import { env } from "cloudflare:workers";
import { expect } from "vitest";
import { createAdminUser } from "../../../src/worker/modules/admin-users/service";
import type { AppBindings } from "../../../src/worker/types";
import { getSessionCookie, readJson, workerFetch } from "./http";

export const trustedOrigin = "http://localhost:5173";
const adminPassword = "TestStrongPassword123!";

export async function createSignedInAdmin(): Promise<string> {
	const email = `forms-admin-${crypto.randomUUID()}@example.com`;
	// Better Auth limits sign-in per IP; spread test sign-ins over many IPs.
	const testIp = `10.${randomOctet()}.${randomOctet()}.${randomOctet()}`;
	await createAdminUser(env as unknown as AppBindings, {
		name: "Forms Admin",
		email,
		password: adminPassword,
	});

	const signIn = await workerFetch("/api/auth/sign-in/email", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"cf-connecting-ip": testIp,
			Origin: trustedOrigin,
		},
		body: JSON.stringify({
			email,
			password: adminPassword,
		}),
	});

	expect(signIn.status).toBe(200);
	return getSessionCookie(signIn);
}

export async function upsertContactForm(
	cookie: string,
	slug: string,
	overrides: Record<string, unknown> = {},
) {
	const response = await putForm(cookie, slug, overrides);
	expect(response.status).toBe(200);
	return readJson<{ form: { id: string; slug: string; allowedOrigins: string[] } }>(response);
}

export function putForm(cookie: string, slug: string, overrides: Record<string, unknown> = {}) {
	return workerFetch(`/api/admin/forms/${slug}`, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
			Cookie: cookie,
			Origin: trustedOrigin,
		},
		body: JSON.stringify({
			name: "Contact",
			enabled: true,
			notificationEmail: "owner@example.test",
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
						maxLength: 1_000,
					},
				],
			},
			...overrides,
		}),
	});
}

export function submitForm(
	slug: string,
	body: unknown,
	options: { origin?: string; headers?: Record<string, string> } = {},
) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		...options.headers,
	};
	if (options.origin) {
		headers.Origin = options.origin;
	}
	return workerFetch(`/api/forms/${slug}/submissions`, {
		method: "POST",
		headers,
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

export async function setSafetySetting(key: string, value: string) {
	await env.DB.prepare(
		"insert into app_setting (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
	)
		.bind(key, value, Date.now())
		.run();
}

export async function resetFormsState() {
	await env.DB.prepare("delete from form_submission").run();
	await env.DB.prepare("delete from form").run();
	await setSafetySetting("public_api_enabled", "true");
	await setSafetySetting("email_notifications_enabled", "true");
	await setSafetySetting("emergency_stop_enabled", "false");
	await setSafetySetting("daily_public_write_limit", "100");
}

function randomOctet(): number {
	return Math.floor(Math.random() * 254) + 1;
}
