const HASH_PREFIX = "pbkdf2-sha256";
const HASH_VERSION = "v1";
const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DERIVED_KEY_BITS = 256;

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const key = await derivePasswordKey(password, salt, PBKDF2_ITERATIONS);

	return [
		HASH_PREFIX,
		HASH_VERSION,
		String(PBKDF2_ITERATIONS),
		encodeBase64Url(salt),
		encodeBase64Url(key),
	].join(":");
}

export async function verifyPassword(input: {
	hash: string;
	password: string;
}): Promise<boolean> {
	if (!input.hash.startsWith(`${HASH_PREFIX}:`)) {
		return false;
	}

	const [, version, iterationsText, saltText, keyText] = input.hash.split(":");
	if (version !== HASH_VERSION || !iterationsText || !saltText || !keyText) {
		return false;
	}

	const iterations = Number.parseInt(iterationsText, 10);
	if (!Number.isSafeInteger(iterations) || iterations <= 0) {
		return false;
	}

	const salt = decodeBase64Url(saltText);
	const expectedKey = decodeBase64Url(keyText);
	const actualKey = await derivePasswordKey(input.password, salt, iterations);

	return constantTimeEqual(actualKey, expectedKey);
}

async function derivePasswordKey(
	password: string,
	salt: Uint8Array,
	iterations: number,
): Promise<Uint8Array> {
	const baseKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password.normalize("NFKC")),
		"PBKDF2",
		false,
		["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt,
			iterations,
		},
		baseKey,
		DERIVED_KEY_BITS,
	);

	return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}

	let diff = 0;
	for (let index = 0; index < a.length; index += 1) {
		diff |= a[index] ^ b[index];
	}
	return diff === 0;
}

function encodeBase64Url(bytes: Uint8Array): string {
	const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): Uint8Array {
	const base64 = value
		.replaceAll("-", "+")
		.replaceAll("_", "/")
		.padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(base64);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
