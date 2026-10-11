import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createSignedInAdmin,
	putForm,
	resetFormsState,
	setSafetySetting,
	submitForm,
	trustedOrigin,
	upsertContactForm,
} from "./helpers/forms";
import { readJson, workerFetch } from "./helpers/http";

const siteOrigin = "https://stomatolog.multiwebsite.org";
const otherSiteOrigin = "https://cafea.multiwebsite.org";
const devOrigin = "http://localhost:4321";
const unlistedOrigin = "https://evil.example";

const validPayload = {
	payload: {
		email: "visitor@example.com",
		message: "Hello from a static site",
	},
};

function preflight(slug: string, origin?: string) {
	const headers: Record<string, string> = {
		"Access-Control-Request-Method": "POST",
		"Access-Control-Request-Headers": "content-type",
	};
	if (origin) {
		headers.Origin = origin;
	}
	return workerFetch(`/api/forms/${slug}/submissions`, { method: "OPTIONS", headers });
}

function expectCorsFor(response: Response, origin: string) {
	expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
	expect(response.headers.get("Vary")).toContain("Origin");
	expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
}

function expectNoCors(response: Response) {
	expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
	expect(response.headers.get("Access-Control-Allow-Methods")).toBeNull();
}

async function countSubmissions(): Promise<number> {
	const row = await env.DB.prepare("select count(*) as count from form_submission").first<{
		count: number;
	}>();
	return row?.count ?? 0;
}

describe("cross-origin form submissions", () => {
	let cookie: string;
	let slug: string;

	beforeEach(async () => {
		vi.unstubAllGlobals();
		// Never reach Resend or Turnstile from tests unless a test overrides this.
		vi.stubGlobal("fetch", async () => Response.json({ id: "stubbed" }));
		await resetFormsState();
		cookie = await createSignedInAdmin();
		slug = `cors-${crypto.randomUUID()}`;
		await upsertContactForm(cookie, slug, {
			allowedOrigins: [siteOrigin, devOrigin],
		});
	});

	it("answers an allowed preflight with exact-origin CORS headers", async () => {
		const response = await preflight(slug, siteOrigin);

		expect(response.status).toBe(204);
		expectCorsFor(response, siteOrigin);
		expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
		expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
		expect(Number(response.headers.get("Access-Control-Max-Age"))).toBeGreaterThan(0);
	});

	it("allows the local dev origin when it is listed on the form", async () => {
		const response = await preflight(slug, devOrigin);

		expect(response.status).toBe(204);
		expectCorsFor(response, devOrigin);
	});

	it("rejects preflights from unlisted, missing or other-form origins without CORS headers", async () => {
		for (const response of [
			await preflight(slug, unlistedOrigin),
			await preflight(slug),
			await preflight(slug, otherSiteOrigin),
			await preflight(`missing-${crypto.randomUUID()}`, siteOrigin),
		]) {
			expect(response.status).toBe(403);
			expectNoCors(response);
			await expect(readJson(response)).resolves.toEqual({ error: "Forbidden origin." });
		}
	});

	it("accepts a POST from an allowed origin and returns CORS headers", async () => {
		const response = await submitForm(slug, validPayload, { origin: siteOrigin });

		expect(response.status).toBe(201);
		expectCorsFor(response, siteOrigin);
		const body = await readJson<{ submitted: boolean; id: string }>(response);
		expect(body).toEqual({ submitted: true, id: expect.any(String) });

		const stored = await env.DB.prepare("select origin from form_submission where id = ?")
			.bind(body.id)
			.first<{ origin: string }>();
		expect(stored?.origin).toBe(siteOrigin);
	});

	it("rejects a POST from an unlisted origin with 403 and stores nothing", async () => {
		const response = await submitForm(slug, validPayload, { origin: unlistedOrigin });

		expect(response.status).toBe(403);
		expectNoCors(response);
		await expect(readJson(response)).resolves.toEqual({ error: "Forbidden origin." });
		expect(await countSubmissions()).toBe(0);
	});

	it("does not treat AUTH_TRUSTED_ORIGINS as a form allowlist and vice versa", async () => {
		// 127.0.0.1:5173 is in AUTH_TRUSTED_ORIGINS but not the app origin or the form list.
		const trustedButUnlisted = await submitForm(slug, validPayload, {
			origin: "http://127.0.0.1:5173",
		});
		expect(trustedButUnlisted.status).toBe(403);

		// A form-allowed site origin must not unlock auth or admin routes.
		const signIn = await workerFetch("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: siteOrigin },
			body: JSON.stringify({ email: "nobody@example.com", password: "irrelevant-password" }),
		});
		expect(signIn.status).toBe(403);

		const adminWrite = await workerFetch(`/api/admin/forms/${slug}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json", Cookie: cookie, Origin: siteOrigin },
			body: JSON.stringify({ name: "Hijacked" }),
		});
		expect(adminWrite.status).toBe(403);
		expectNoCors(adminWrite);
	});

	it("keeps same-origin submissions from the admin app working", async () => {
		const response = await submitForm(slug, validPayload, { origin: trustedOrigin });

		expect(response.status).toBe(201);
	});

	it("adds CORS headers to 400, 404, 429 and 503 responses for allowed origins", async () => {
		const invalid = await submitForm(
			slug,
			{ payload: { ...validPayload.payload, unexpected: "x" } },
			{ origin: siteOrigin },
		);
		expect(invalid.status).toBe(400);
		expectCorsFor(invalid, siteOrigin);
		await expect(readJson(invalid)).resolves.toEqual({ error: "Unexpected field: unexpected." });

		const badBody = await submitForm(slug, { payload: "nope" }, { origin: siteOrigin });
		expect(badBody.status).toBe(400);
		expectCorsFor(badBody, siteOrigin);
		await expect(readJson(badBody)).resolves.toHaveProperty("error");

		const malformed = await submitForm(slug, "{not json", { origin: siteOrigin });
		expect(malformed.status).toBe(400);
		expectCorsFor(malformed, siteOrigin);
		await expect(readJson(malformed)).resolves.toEqual({
			error: "Malformed JSON in request body",
		});

		await setSafetySetting("daily_public_write_limit", "1");
		expect((await submitForm(slug, validPayload, { origin: siteOrigin })).status).toBe(201);
		const limited = await submitForm(slug, validPayload, { origin: siteOrigin });
		expect(limited.status).toBe(429);
		expectCorsFor(limited, siteOrigin);
		await expect(readJson(limited)).resolves.toEqual({
			error: "Daily public form submission limit reached.",
		});

		await setSafetySetting("public_api_enabled", "false");
		const disabled = await submitForm(slug, validPayload, { origin: siteOrigin });
		expect(disabled.status).toBe(503);
		expectCorsFor(disabled, siteOrigin);
		await expect(readJson(disabled)).resolves.toEqual({
			error: "Public form submissions are disabled.",
		});

		await upsertContactForm(cookie, slug, { enabled: false, allowedOrigins: [siteOrigin] });
		const paused = await submitForm(slug, validPayload, { origin: siteOrigin });
		expect(paused.status).toBe(404);
		expectCorsFor(paused, siteOrigin);
		await expect(readJson(paused)).resolves.toEqual({ error: "Form not found." });
	});

	it("adds CORS headers to oversized body responses for allowed origins", async () => {
		const response = await submitForm(
			slug,
			{ payload: { email: "visitor@example.com", message: "x".repeat(40 * 1024) } },
			{ origin: siteOrigin },
		);

		expect(response.status).toBe(413);
		expectCorsFor(response, siteOrigin);
	});

	it("validates and normalizes allowedOrigins on the admin API", async () => {
		const saved = await upsertContactForm(cookie, slug, {
			allowedOrigins: [" https://Stomatolog.multiwebsite.org/ ", siteOrigin, devOrigin],
		});
		expect(saved.form.allowedOrigins).toEqual([siteOrigin, devOrigin]);

		for (const invalidOrigin of [
			"https://stomatolog.multiwebsite.org/contact",
			"https://stomatolog.multiwebsite.org?x=1",
			"ftp://stomatolog.multiwebsite.org",
			"stomatolog.multiwebsite.org",
			"https://user:pass@stomatolog.multiwebsite.org",
			"*",
			"null",
		]) {
			const response = await putForm(cookie, slug, { allowedOrigins: [invalidOrigin] });
			expect(response.status, invalidOrigin).toBe(400);
			await expect(readJson(response)).resolves.toEqual({
				error: "Allowed origins must be http(s) origins without a path.",
			});
		}

		const list = await workerFetch("/api/admin/forms", { headers: { Cookie: cookie } });
		await expect(readJson(list)).resolves.toMatchObject({
			forms: [{ slug, allowedOrigins: [siteOrigin, devOrigin] }],
		});
	});

	it("requires the Turnstile hostname to match an allowed origin of the form", async () => {
		let turnstileHostname = "stomatolog.multiwebsite.org";
		vi.stubGlobal("fetch", async (input: string | URL | Request) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
				return Response.json({ success: true, hostname: turnstileHostname });
			}
			return Response.json({ id: "email_form_submission" });
		});
		await upsertContactForm(cookie, slug, {
			turnstileRequired: true,
			allowedOrigins: [siteOrigin],
		});
		const body = { ...validPayload, turnstileToken: "test-turnstile-token" };

		const accepted = await submitForm(slug, body, { origin: siteOrigin });
		expect(accepted.status).toBe(201);

		turnstileHostname = "cafea.multiwebsite.org";
		const wrongHost = await submitForm(slug, body, { origin: siteOrigin });
		expect(wrongHost.status).toBe(400);
		expectCorsFor(wrongHost, siteOrigin);
		await expect(readJson(wrongHost)).resolves.toEqual({ error: "Form verification failed." });

		const missingToken = await submitForm(slug, validPayload, { origin: siteOrigin });
		expect(missingToken.status).toBe(400);
		await expect(readJson(missingToken)).resolves.toEqual({
			error: "Turnstile token is required.",
		});
	});
});
