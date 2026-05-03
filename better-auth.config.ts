import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { authBaseOptions } from "./src/worker/auth/options";

export const auth = betterAuth({
	...authBaseOptions,
	baseURL: "http://localhost:5173",
	secret: "better-auth-cli-schema-generation-secret",
	database: drizzleAdapter({} as never, {
		provider: "sqlite",
		transaction: false,
	}),
	emailAndPassword: {
		...authBaseOptions.emailAndPassword,
		disableSignUp: true,
	},
});
