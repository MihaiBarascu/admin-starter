import type { BetterAuthOptions } from "better-auth";
import { hashPassword, verifyPassword } from "./password";

export const AUTH_PASSWORD_MIN_LENGTH = 12;
export const AUTH_PASSWORD_MAX_LENGTH = 128;

export const authBaseOptions = {
	emailAndPassword: {
		enabled: true,
		autoSignIn: false,
		minPasswordLength: AUTH_PASSWORD_MIN_LENGTH,
		maxPasswordLength: AUTH_PASSWORD_MAX_LENGTH,
		revokeSessionsOnPasswordReset: true,
		password: {
			hash: hashPassword,
			verify: verifyPassword,
		},
	},
	rateLimit: {
		enabled: true,
		window: 60,
		max: 100,
		customRules: {
			"/sign-in/email": {
				window: 10,
				max: 3,
			},
		},
	},
	advanced: {
		ipAddress: {
			ipAddressHeaders: ["cf-connecting-ip"],
			ipv6Subnet: 64,
		},
		database: {
			generateId: () => crypto.randomUUID(),
		},
	},
} satisfies BetterAuthOptions;
