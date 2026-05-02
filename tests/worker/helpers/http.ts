import { exports } from "cloudflare:workers";

export function workerFetch(pathname: string, init?: RequestInit): Promise<Response> {
	const url = new URL(pathname, "http://localhost:5173");
	const headers = new Headers(init?.headers);
	if (!headers.has("cf-connecting-ip")) {
		headers.set("cf-connecting-ip", "203.0.113.10");
	}

	return exports.default.fetch(new Request(url, { ...init, headers }));
}

export async function readJson<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

export function getSessionCookie(response: Response): string {
	const setCookie = response.headers.get("set-cookie");
	if (!setCookie?.includes("better-auth.session_token=")) {
		throw new Error("Expected Better Auth session cookie.");
	}

	return setCookie.split(";")[0];
}
