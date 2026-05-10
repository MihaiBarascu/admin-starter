import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/worker";
import { createAuth } from "../../src/worker/auth";
import { createAdminUser } from "../../src/worker/modules/admin-users/service";
import type { AppBindings } from "../../src/worker/types";
import { getSessionCookie, readJson, workerFetch } from "./helpers/http";

const admin = {
	name: "API Test Admin",
	email: "api-admin@example.com",
	password: "TestStrongPassword123!",
	bootstrapToken: "test-bootstrap-token",
};
const trustedOrigin = "http://localhost:5173";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("public API", () => {
	it("returns app metadata and health", async () => {
		const root = await workerFetch("/api/");
		expect(root.status).toBe(200);
		expect(root.headers.get("content-security-policy")).toContain("default-src 'self'");
		await expect(readJson(root)).resolves.toMatchObject({
			name: "Multiwebsite Admin Starter",
			runtime: "Cloudflare Workers",
		});

		const health = await workerFetch("/api/health");
		expect(health.status).toBe(200);
		await expect(readJson(health)).resolves.toMatchObject({
			status: "ok",
		});
	});

	it("returns JSON 404 responses", async () => {
		const response = await workerFetch("/api/missing");

		expect(response.status).toBe(404);
		await expect(readJson(response)).resolves.toEqual({ error: "Not found." });
	});

	it("returns null for missing auth sessions as JSON", async () => {
		const response = await workerFetch("/api/auth/get-session", {
			headers: { Accept: "*/*" },
		});

		expect(response.status).toBe(200);
		await expect(readJson(response)).resolves.toBeNull();
	});
});

describe("admin API", () => {
	it("reports bootstrap unavailable without querying D1 when bootstrap is disabled", async () => {
		const response = await app.fetch(
			new Request("http://localhost:5173/api/admin/bootstrap"),
			{
				BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-characters",
				BETTER_AUTH_URL: "http://localhost:5173",
				AUTH_TRUSTED_ORIGINS: "http://localhost:5173",
				AUTH_SIGNUP_ENABLED: "false",
			},
		);

		expect(response.status).toBe(200);
		await expect(readJson(response)).resolves.toEqual({ available: false });
	});

	it("requires authentication for protected admin endpoints", async () => {
		const response = await workerFetch("/api/admin/me");

		expect(response.status).toBe(401);
		await expect(readJson(response)).resolves.toEqual({ error: "Unauthorized." });
	});

	it("rejects oversized JSON bodies before route handlers run", async () => {
		const response = await workerFetch("/api/admin/bootstrap", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ payload: "x".repeat(33 * 1024) }),
		});

		expect(response.status).toBe(413);
		await expect(readJson(response)).resolves.toEqual({
			error: "Request body too large.",
		});
	});

	it("bootstraps an admin, signs in, and updates safety settings", async () => {
		const beforeBootstrap = await workerFetch("/api/admin/bootstrap");
		expect(beforeBootstrap.status).toBe(200);
		await expect(readJson(beforeBootstrap)).resolves.toEqual({
			available: true,
		});

		const missingBootstrapToken = await workerFetch("/api/admin/bootstrap", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: trustedOrigin },
			body: JSON.stringify({ ...admin, bootstrapToken: "" }),
		});
		expect(missingBootstrapToken.status).toBe(400);

		const missingBootstrapOrigin = await workerFetch("/api/admin/bootstrap", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...admin, bootstrapToken: "" }),
		});
		expect(missingBootstrapOrigin.status).toBe(403);

		const invalidBootstrap = await workerFetch("/api/admin/bootstrap", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: trustedOrigin },
			body: JSON.stringify({ ...admin, bootstrapToken: "wrong-token" }),
		});
		expect(invalidBootstrap.status).toBe(401);

		const invalidEmail = await workerFetch("/api/admin/bootstrap", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: trustedOrigin },
			body: JSON.stringify({ ...admin, email: "not-an-email" }),
		});
		expect(invalidEmail.status).toBe(400);
		await expect(readJson(invalidEmail)).resolves.toEqual({
			error: "Email is invalid.",
		});

		const bootstrap = await workerFetch("/api/admin/bootstrap", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: trustedOrigin },
			body: JSON.stringify(admin),
		});
		expect(bootstrap.status).toBe(201);
		await expect(readJson(bootstrap)).resolves.toEqual({ bootstrapped: true });

		const afterBootstrap = await workerFetch("/api/admin/bootstrap");
		expect(afterBootstrap.status).toBe(200);
		await expect(readJson(afterBootstrap)).resolves.toEqual({
			available: false,
		});

		const duplicateBootstrap = await workerFetch("/api/admin/bootstrap", {
			method: "POST",
			headers: { "Content-Type": "application/json", Origin: trustedOrigin },
			body: JSON.stringify(admin),
		});
		expect(duplicateBootstrap.status).toBe(409);

		const signInWithoutOrigin = await workerFetch("/api/auth/sign-in/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				email: admin.email,
				password: admin.password,
				rememberMe: true,
			}),
		});
		expect(signInWithoutOrigin.status).toBe(403);

		const signIn = await workerFetch("/api/auth/sign-in/email", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				email: admin.email,
				password: admin.password,
				rememberMe: true,
			}),
		});
		expect(signIn.status).toBe(200);
		const cookie = getSessionCookie(signIn);

		const me = await workerFetch("/api/admin/me", {
			headers: { Cookie: cookie },
		});
		expect(me.status).toBe(200);
		const mePayload = await readJson(me);
		expect(mePayload).toMatchObject({
			user: {
				email: admin.email,
			},
			session: {
				userId: expect.any(String),
			},
		});
		expect(mePayload).not.toHaveProperty("session.token");

		const initialSafety = await workerFetch("/api/admin/safety", {
			headers: { Cookie: cookie },
		});
		expect(initialSafety.status).toBe(200);
		await expect(readJson(initialSafety)).resolves.toMatchObject({
			settings: {
				public_api_enabled: "true",
				email_notifications_enabled: "true",
				emergency_stop_enabled: "false",
				daily_public_write_limit: "100",
			},
			status: {
				publicApiEnabled: true,
				emailNotificationsEnabled: true,
				emergencyStopEnabled: false,
			},
		});

		const updateSafetyWithoutOrigin = await workerFetch("/api/admin/safety", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookie,
			},
			body: JSON.stringify({ unknown: true }),
		});
		expect(updateSafetyWithoutOrigin.status).toBe(403);

		const updateSafety = await workerFetch("/api/admin/safety", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookie,
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				publicApiEnabled: false,
				emergencyStopEnabled: true,
				dailyPublicWriteLimit: 25,
			}),
		});
		expect(updateSafety.status).toBe(200);
		await expect(readJson(updateSafety)).resolves.toMatchObject({
			updated: true,
			safety: {
				settings: {
					public_api_enabled: "false",
					emergency_stop_enabled: "true",
					daily_public_write_limit: "25",
				},
				status: {
					publicApiEnabled: false,
					emergencyStopEnabled: true,
				},
			},
		});

		const invalidSafety = await workerFetch("/api/admin/safety", {
			method: "PATCH",
			headers: {
				"Content-Type": "application/json",
				Cookie: cookie,
				Origin: trustedOrigin,
			},
			body: JSON.stringify({ unknown: true }),
		});
		expect(invalidSafety.status).toBe(400);
		await expect(readJson(invalidSafety)).resolves.toEqual({
			error: "No valid safety settings were provided.",
		});
	});

	it("rejects authenticated users that are not admins", async () => {
		const nonAdmin = {
			name: "Regular User",
			email: `regular-${crypto.randomUUID()}@example.com`,
			password: "RegularUserPassword123!",
		};
		await createAuth(env as unknown as AppBindings, { allowSignUp: true }).api.signUpEmail({
			body: nonAdmin,
		});

		const signIn = await workerFetch("/api/auth/sign-in/email", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: trustedOrigin,
			},
			body: JSON.stringify({
				email: nonAdmin.email,
				password: nonAdmin.password,
			}),
		});
		expect(signIn.status).toBe(200);

		const response = await workerFetch("/api/admin/safety", {
			headers: { Cookie: getSessionCookie(signIn) },
		});

		expect(response.status).toBe(403);
		await expect(readJson(response)).resolves.toEqual({ error: "Forbidden." });
	});

	it("sends password reset emails through the configured email provider", async () => {
		const resetAdmin = {
			...admin,
			email: "reset-admin@example.com",
		};
		const emailRequests: Array<{ url: string; init?: RequestInit }> = [];
		vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
			emailRequests.push({
				url: input instanceof Request ? input.url : String(input),
				init,
			});

			return Response.json({ id: "email_test_reset" });
		});

		await createAdminUser(env as unknown as AppBindings, resetAdmin);

		const resetRequest = await workerFetch("/api/auth/request-password-reset", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:5173",
			},
			body: JSON.stringify({
				email: resetAdmin.email,
				redirectTo: "http://localhost:5173/reset-password",
			}),
		});

		expect(resetRequest.status).toBe(200);
		await vi.waitFor(() => expect(emailRequests).toHaveLength(1));

		const [emailRequest] = emailRequests;
		expect(emailRequest.url).toBe("https://api.resend.com/emails");
		expect(new Headers(emailRequest.init?.headers).get("authorization")).toBe(
			"Bearer test-resend-api-key",
		);

		const body = JSON.parse(String(emailRequest.init?.body)) as {
			from: string;
			to: string[];
			subject: string;
			html: string;
		};
		expect(body.from).toBe("Multiwebsite Admin <no-reply@example.test>");
		expect(body.to).toEqual([resetAdmin.email]);
		expect(body.subject).toBe("Reset your Multiwebsite Admin Starter password");
		expect(decodeURIComponent(body.html)).toContain("http://localhost:5173/reset-password");
		expect(body.html).toContain("/api/auth/reset-password/");

		const token = body.html.match(/\/api\/auth\/reset-password\/([^?"]+)/)?.[1];
		expect(token).toBeTruthy();

		const resetPassword = await workerFetch("/api/auth/reset-password", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:5173",
			},
			body: JSON.stringify({
				newPassword: "NewResetPassword123!",
				token,
			}),
		});
		expect(resetPassword.status).toBe(200);

		const signIn = await workerFetch("/api/auth/sign-in/email", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost:5173",
			},
			body: JSON.stringify({
				email: resetAdmin.email,
				password: "NewResetPassword123!",
			}),
		});
		expect(signIn.status).toBe(200);
	});
});
