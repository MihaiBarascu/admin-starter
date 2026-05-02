export function parseCsv(value: string | undefined): string[] {
	if (!value) {
		return [];
	}

	return value
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
}

export function isEnabled(value: string | undefined, fallback = false): boolean {
	if (!value) {
		return fallback;
	}
	return value === "1" || value.toLowerCase() === "true";
}
