import { eq } from "drizzle-orm";
import { z } from "zod";
import { createAuth } from "../../auth";
import { user } from "../../db/auth-schema.generated";
import { getDb } from "../../db/client";
import type { AppBindings } from "../../types";

const PASSWORD_LENGTH_ERROR = "Password must contain between 8 and 128 characters.";

export const adminUserSchema = z.object({
	name: z.string().trim().min(1, "Admin name is required."),
	email: z
		.string()
		.trim()
		.min(1, "Admin email is required.")
		.toLowerCase()
		.pipe(z.email("Admin email is invalid.")),
	password: z.string().min(8, PASSWORD_LENGTH_ERROR).max(128, PASSWORD_LENGTH_ERROR),
});

export type AdminUserInput = z.input<typeof adminUserSchema>;
type AdminUser = z.output<typeof adminUserSchema>;

export type AdminUserResult = {
	email: string;
	userId: string;
};

export type SeedAdminResult = {
	email: string;
	userId: string;
	status: "created" | "exists";
};

type AdminUserEnv = Pick<
	AppBindings,
	"DB" | "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL" | "AUTH_TRUSTED_ORIGINS" | "AUTH_SIGNUP_ENABLED"
>;

export async function hasAnyUser(env: Pick<AppBindings, "DB">): Promise<boolean> {
	const db = getDb(env);
	const existing = await db.select({ id: user.id }).from(user).limit(1);
	return existing.length > 0;
}

export async function findUserByEmail(env: Pick<AppBindings, "DB">, email: string) {
	const normalizedEmail = email.trim().toLowerCase();
	const db = getDb(env);
	const [existingUser] = await db.select().from(user).where(eq(user.email, normalizedEmail)).limit(1);
	return existingUser ?? null;
}

export async function createAdminUser(env: AdminUserEnv, input: AdminUserInput): Promise<AdminUserResult> {
	return createValidatedAdminUser(env, adminUserSchema.parse(input));
}

async function createValidatedAdminUser(env: AdminUserEnv, adminUser: AdminUser): Promise<AdminUserResult> {
	const result = await createAuth(env, { allowSignUp: true }).api.signUpEmail({
		body: {
			name: adminUser.name,
			email: adminUser.email,
			password: adminUser.password,
		},
	});

	return {
		email: adminUser.email,
		userId: result.user.id,
	};
}

export type SeedAdminInput = AdminUserInput;

export async function ensureSeedAdmin(
	env: AdminUserEnv,
	input: SeedAdminInput,
): Promise<SeedAdminResult> {
	const seed = adminUserSchema.parse(input);
	const existingUser = await findUserByEmail(env, seed.email);

	if (existingUser) {
		return {
			email: seed.email,
			userId: existingUser.id,
			status: "exists",
		};
	}

	const createdUser = await createValidatedAdminUser(env, seed);

	return {
		email: seed.email,
		userId: createdUser.userId,
		status: "created",
	};
}
