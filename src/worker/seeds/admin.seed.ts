import {
	ensureSeedAdmin,
	type SeedAdminInput,
} from "../modules/admin-users/service";
import type { SeedRunner } from "./types";

const DEFAULT_ADMIN_SEED = {
	name: "Local Admin",
	email: "admin@example.test",
	password: "LocalAdminPassword123!",
} satisfies SeedAdminInput;

function readAdminSeed(vars: Record<string, string | undefined>): SeedAdminInput {
	return {
		name: vars.SEED_ADMIN_NAME ?? DEFAULT_ADMIN_SEED.name,
		email: vars.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_SEED.email,
		password: vars.SEED_ADMIN_PASSWORD ?? DEFAULT_ADMIN_SEED.password,
	};
}

export const adminSeed: SeedRunner = async ({ env, vars }) => {
	return ensureSeedAdmin(env, readAdminSeed(vars));
};
