import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { getDb } from "./db/client";
import { schema } from "./db/schema";
import { isEnabled, parseCsv } from "./lib/env";
import { authBaseOptions } from "./auth/options";
import type { AppBindings } from "./types";

export function createAuth(env: AppBindings, options?: { allowSignUp?: boolean }) {
	if (!env.BETTER_AUTH_SECRET) {
		throw new Error("Missing BETTER_AUTH_SECRET.");
	}

	const baseUrl = env.BETTER_AUTH_URL ?? "http://localhost:5173";
	const secureCookies = baseUrl.startsWith("https://");
	const signUpEnabled = options?.allowSignUp ?? isEnabled(env.AUTH_SIGNUP_ENABLED, false);

	return betterAuth({
		...authBaseOptions,
		baseURL: baseUrl,
		secret: env.BETTER_AUTH_SECRET,
		trustedOrigins: parseCsv(env.AUTH_TRUSTED_ORIGINS),
		database: drizzleAdapter(getDb(env), {
			provider: "sqlite",
			schema,
			transaction: false,
		}),
		emailAndPassword: {
			...authBaseOptions.emailAndPassword,
			disableSignUp: !signUpEnabled,
		},
		advanced: {
			...authBaseOptions.advanced,
			defaultCookieAttributes: {
				httpOnly: true,
				sameSite: "lax",
				secure: secureCookies,
			},
		},
	});
}
