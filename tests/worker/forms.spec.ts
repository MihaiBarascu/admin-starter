import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminUser } from "../../src/worker/modules/admin-users/service";
import type { AppBindings } from "../../src/worker/types";
import { getSessionCookie, readJson, workerFetch } from "./helpers/http";

const trustedOrigin = "http://localhost:5173";
const adminPassword = "TestStrongPassword123!";

async function createSignedInAdmin(): Promise<string> {
	const email = `forms-admin-${crypto.randomUUID()}@example.com`;
	const testIp = `203.0.113.${Math.floor(Math.random() * 200) + 20}`;
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

async function upsertContactForm(cookie: string, slug: string, overrides = {}) {
	const response = await workerFetch(`/api/admin/forms/${slug}`, {
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

	expect(response.status).toBe(200);
	return readJson<{ form: { id: string; slug: string } }>(response);
}

async function setSafetySetting(key: string, value: string) {
	await env.DB.prepare(
		"insert into app_setting (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at",
	)
		.bind(key, value, Date.now())
		.run();
}

describe("forms API", () => {
	beforeEach(async () => {
		vi.unstubAllGlobals();
		await env.DB.prepare("delete from form_submission").run();
		await env.DB.prepare("delete from form").run();
		await setSafetySetting("public_api_enabled", "true");
		await setSafetySetting("email_notifications_enabled", "true");
		await setSafetySetting("emergency_stop_enabled", "false");
		await setSafetySetting("daily_public_write_limit", "100");
	});

	it("stores a valid same-origin submission and sends the notification after persistence", async () => {
		const emailRequests: Array<{ url: string; init?: RequestInit }> = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
			emailRequests.push({
				url: input instanceof Request ? input.url : String(input),
				init,
			});
			return Response.json({ id: "email_form_submission" });
		});

		const cookie = await createSignedInAdmin();
		const slug = `contact-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug);

		const response = await workerFetch(`/api/forms/${slug}/submissions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				payload: {
					email: " Visitor@Example.COM ",
					message: "Hello from the frontend",
				},
			}),
		});

		expect(response.status).toBe(201);
		const payload = await readJson<{ submitted: true; id: string }>(response);
		expect(payload).toMatchObject({ submitted: true, id: expect.any(String) });

		const stored = await env.DB.prepare(
			"select payload_json, submitter_email, origin from form_submission where id = ?",
		)
			.bind(payload.id)
			.first<{
				payload_json: string;
				submitter_email: string;
				origin: string;
			}>();

		expect(stored).toMatchObject({
			submitter_email: "visitor@example.com",
			origin: trustedOrigin,
		});
		expect(JSON.parse(stored?.payload_json ?? "{}")).toEqual({
			email: "visitor@example.com",
			message: "Hello from the frontend",
		});

		await vi.waitFor(() => expect(emailRequests).toHaveLength(1));
		const [emailRequest] = emailRequests;
		expect(emailRequest.url).toBe("https://api.resend.com/emails");
		const emailBody = JSON.parse(String(emailRequest.init?.body)) as {
			to: string[];
			subject: string;
			html: string;
		};
		expect(emailBody.to).toEqual(["owner@example.test"]);
		expect(emailBody.subject).toContain("Contact");
		expect(emailBody.html).toContain("visitor@example.com");
		expect(emailBody.html).toContain("Hello from the frontend");
	});

	it("lists configured forms for authenticated admins", async () => {
		const cookie = await createSignedInAdmin();
		await upsertContactForm(cookie, "contact");
		await upsertContactForm(cookie, "newsletter", {
			name: "Newsletter",
			notificationEmail: "newsletter@example.test",
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
		});

		const response = await workerFetch("/api/admin/forms", {
			headers: { Cookie: cookie },
		});

		expect(response.status).toBe(200);
		await expect(readJson(response)).resolves.toMatchObject({
			forms: [
				{
					name: "Contact",
					slug: "contact",
					notificationEmail: "owner@example.test",
					schema: {
						fields: [
							{ name: "email", type: "email" },
							{ name: "message", type: "textarea" },
						],
					},
				},
				{
					name: "Newsletter",
					slug: "newsletter",
					notificationEmail: "newsletter@example.test",
					schema: {
						fields: [{ name: "email", type: "email" }],
					},
				},
			],
		});
	});

	it("rejects submissions without a trusted same-origin request", async () => {
		const cookie = await createSignedInAdmin();
		const slug = `origin-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug);

		const response = await workerFetch(`/api/forms/${slug}/submissions`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				payload: {
					email: "visitor@example.com",
					message: "Hello",
				},
			}),
		});

		expect(response.status).toBe(403);
		await expect(readJson(response)).resolves.toEqual({ error: "Forbidden origin." });
	});

	it("validates submissions against the configured allowlist schema", async () => {
		const cookie = await createSignedInAdmin();
		const slug = `invalid-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug);

		const response = await workerFetch(`/api/forms/${slug}/submissions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				payload: {
					email: "not-an-email",
					message: "Hello",
					unexpected: "not allowed",
				},
			}),
		});

		expect(response.status).toBe(400);
		await expect(readJson(response)).resolves.toEqual({
			error: "Unexpected field: unexpected.",
		});
	});

	it("blocks public submissions before writes and email when safety settings disable them", async () => {
		const emailRequests: Array<{ url: string; init?: RequestInit }> = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
			emailRequests.push({
				url: input instanceof Request ? input.url : String(input),
				init,
			});
			return Response.json({ id: "email_should_not_send" });
		});

		const cookie = await createSignedInAdmin();
		const slug = `safety-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug);
		await setSafetySetting("public_api_enabled", "false");

		const response = await workerFetch(`/api/forms/${slug}/submissions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				payload: {
					email: "visitor@example.com",
					message: "Hello",
				},
			}),
		});

		expect(response.status).toBe(503);
		await expect(readJson(response)).resolves.toEqual({
			error: "Public form submissions are disabled.",
		});
		expect(emailRequests).toHaveLength(0);

		const stored = await env.DB.prepare(
			"select count(*) as count from form_submission where origin = ?",
		)
			.bind(trustedOrigin)
			.first<{ count: number }>();
		expect(stored?.count).toBe(0);

	});

	it("enforces the daily public write limit before sending email", async () => {
		const emailRequests: Array<{ url: string; init?: RequestInit }> = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
			emailRequests.push({
				url: input instanceof Request ? input.url : String(input),
				init,
			});
			return Response.json({ id: "email_form_submission" });
		});

		const cookie = await createSignedInAdmin();
		const slug = `limit-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug);
		await setSafetySetting("daily_public_write_limit", "1");

		const first = await workerFetch(`/api/forms/${slug}/submissions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				payload: {
					email: "first@example.com",
					message: "First",
				},
			}),
		});
		expect(first.status).toBe(201);

		const second = await workerFetch(`/api/forms/${slug}/submissions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				payload: {
					email: "second@example.com",
					message: "Second",
				},
			}),
		});

		expect(second.status).toBe(429);
		await expect(readJson(second)).resolves.toEqual({
			error: "Daily public form submission limit reached.",
		});
		await vi.waitFor(() => expect(emailRequests).toHaveLength(1));
	});

	it("validates Turnstile server-side when a form requires it", async () => {
		const fetchRequests: Array<{ url: string; init?: RequestInit }> = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
			const url = input instanceof Request ? input.url : String(input);
			fetchRequests.push({ url, init });

			if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
				return Response.json({ success: true, hostname: "localhost" });
			}

			return Response.json({ id: "email_form_submission" });
		});

		const cookie = await createSignedInAdmin();
		const slug = `turnstile-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug, { turnstileRequired: true });

		const response = await workerFetch(`/api/forms/${slug}/submissions`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				turnstileToken: "test-turnstile-token",
				payload: {
					email: "visitor@example.com",
					message: "Hello",
				},
			}),
		});

		expect(response.status).toBe(201);
		await vi.waitFor(() =>
			expect(fetchRequests.map((request) => request.url)).toEqual([
				"https://challenges.cloudflare.com/turnstile/v0/siteverify",
				"https://api.resend.com/emails",
			]),
		);

		const turnstileBody = JSON.parse(String(fetchRequests[0]?.init?.body)) as {
			secret: string;
			response: string;
			remoteip: string;
		};
		expect(turnstileBody).toMatchObject({
			secret: "test-turnstile-secret",
			response: "test-turnstile-token",
			remoteip: "203.0.113.10",
		});
	});
});
