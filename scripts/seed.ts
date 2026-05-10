import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { seedRegistry } from "../src/worker/seeds";
import type { SeedTarget } from "../src/worker/seeds/types";
import type { AppBindings } from "../src/worker/types";
import type {
	getPlatformProxy as getPlatformProxyType,
	unstable_readConfig as readWranglerConfigType,
} from "wrangler";

const WRANGLER_CONFIG_PATH = "./wrangler.jsonc";
const REMOTE_SEED_CONFIG_PATH = "./.wrangler/seed-remote.wrangler.jsonc";

type WranglerApi = {
	getPlatformProxy: typeof getPlatformProxyType;
	unstable_readConfig: typeof readWranglerConfigType;
};

function readOption(name: string): string | undefined {
	const args = process.argv.slice(2);
	const prefix = `${name}=`;
	const inline = args.find((arg) => arg.startsWith(prefix));
	if (inline) {
		return inline.slice(prefix.length);
	}

	const index = args.indexOf(name);
	if (index >= 0) {
		return args[index + 1];
	}

	return undefined;
}

function readTarget(): SeedTarget {
	const rawTarget = readOption("--target") ?? "local";
	if (rawTarget === "local" || rawTarget === "remote") {
		return rawTarget;
	}
	throw new Error(`Unknown seed target "${rawTarget}". Use "local" or "remote".`);
}

function readSeedName(): keyof typeof seedRegistry {
	const args = process.argv.slice(2);
	const targetOptionIndex = args.indexOf("--target");
	const ignoredIndexes = new Set<number>([
		targetOptionIndex,
		targetOptionIndex >= 0 ? targetOptionIndex + 1 : -1,
	]);
	const normalizedSeedName = args.find((arg, index) => {
		return !ignoredIndexes.has(index) && !arg.startsWith("--");
	});

	if (normalizedSeedName && normalizedSeedName in seedRegistry) {
		return normalizedSeedName as keyof typeof seedRegistry;
	}

	const availableSeeds = Object.keys(seedRegistry).join(", ");
	throw new Error(`Choose a seed to run. Available seeds: ${availableSeeds}.`);
}

function loadWranglerApi(): WranglerApi {
	const require = createRequire(import.meta.url);
	const wranglerPackagePath = require.resolve("wrangler/package.json");
	const wranglerCliPath = path.join(path.dirname(wranglerPackagePath), "wrangler-dist/cli.js");
	return require(wranglerCliPath) as WranglerApi;
}

async function getSeedConfigPath(target: SeedTarget, wranglerApi: WranglerApi): Promise<string> {
	if (target === "local") {
		return WRANGLER_CONFIG_PATH;
	}

	const config = wranglerApi.unstable_readConfig({ config: WRANGLER_CONFIG_PATH });
	const d1Databases = config.d1_databases?.map((database) => {
		if (database.binding !== "DB") {
			return database;
		}
		return { ...database, remote: true };
	});

	if (!d1Databases?.some((database) => database.binding === "DB")) {
		throw new Error("Remote seed requires a DB binding in wrangler.jsonc.");
	}

	await fs.mkdir(path.dirname(REMOTE_SEED_CONFIG_PATH), { recursive: true });
	await fs.writeFile(
		REMOTE_SEED_CONFIG_PATH,
		`${JSON.stringify(
			{
				name: config.name,
				main: config.main,
				compatibility_date: config.compatibility_date,
				compatibility_flags: config.compatibility_flags,
				vars: config.vars,
				d1_databases: d1Databases,
			},
			null,
			2,
		)}\n`,
	);

	return REMOTE_SEED_CONFIG_PATH;
}

async function main() {
	const target = readTarget();
	const seedName = readSeedName();
	const wranglerApi = loadWranglerApi();
	const configPath = await getSeedConfigPath(target, wranglerApi);
	const platform = await wranglerApi.getPlatformProxy({
		configPath,
		remoteBindings: target === "remote",
	});

	try {
		const result = await seedRegistry[seedName]({
			env: platform.env as unknown as AppBindings,
			target,
			vars: process.env,
		});
		console.log(
			JSON.stringify(
				{
					seed: seedName,
					target,
					result,
				},
				null,
				2,
			),
		);
	} finally {
		await platform.dispose();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
