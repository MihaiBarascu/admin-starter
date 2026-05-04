export interface AppBindings {
	DB: D1Database;
	BETTER_AUTH_SECRET: string;
	BETTER_AUTH_URL?: string;
	AUTH_TRUSTED_ORIGINS?: string;
	AUTH_SIGNUP_ENABLED?: string;
	BOOTSTRAP_ADMIN_TOKEN?: string;
	APP_NAME?: string;
	RESEND_API_KEY?: string;
	RESEND_FROM_EMAIL?: string;
}

export interface AppVariables {
	user: {
		id: string;
		name: string;
		email: string;
		emailVerified: boolean;
		image?: string | null;
		createdAt?: Date;
		updatedAt?: Date;
	} | null;
	session: {
		id: string;
		userId: string;
		token: string;
		expiresAt: Date;
		ipAddress?: string | null;
		userAgent?: string | null;
		createdAt?: Date;
		updatedAt?: Date;
	} | null;
}

export type AppEnv = {
	Bindings: AppBindings;
	Variables: AppVariables;
};
