import type { AppBindings } from "../types";

export type SeedTarget = "local" | "remote";

export type SeedContext = {
	env: AppBindings;
	target: SeedTarget;
	vars: Record<string, string | undefined>;
};

export type SeedResult = Record<string, unknown>;

export type SeedRunner = (context: SeedContext) => Promise<SeedResult>;
