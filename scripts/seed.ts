import { createRequire } from "node:module";
import path from "node:path";
import { seedRegistry } from "../src/worker/seeds";
import type { SeedTarget } from "../src/worker/seeds/types";
import type { AppBindings } from "../src/worker/types";
import type { getPlatformProxy as getPlatformProxyType } from "wrangler";

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

function loadGetPlatformProxy(): typeof getPlatformProxyType {
	const require = createRequire(import.meta.url);
	const wranglerPackagePath = require.resolve("wrangler/package.json");
	const wranglerCliPath = path.join(path.dirname(wranglerPackagePath), "wrangler-dist/cli.js");
	const wranglerApi = require(wranglerCliPath) as {
		getPlatformProxy: typeof getPlatformProxyType;
	};
	return wranglerApi.getPlatformProxy;
}

async function main() {
	const target = readTarget();
	const seedName = readSeedName();
	const getPlatformProxy = loadGetPlatformProxy();
	const platform = await getPlatformProxy({
		configPath: "./wrangler.json",
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
