import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createSignedInAdmin,
	resetFormsState,
	submitForm,
	trustedOrigin,
	upsertContactForm,
} from "./helpers/forms";
import { readJson, workerFetch } from "./helpers/http";

type SubmissionDto = {
	id: string;
	formSlug: string;
	formName: string;
	payload: Record<string, unknown>;
	origin?: string;
	submitterEmail?: string;
	createdAt: string;
};

type SubmissionPage = {
	submissions: SubmissionDto[];
	nextCursor: string | null;
};

const siteOrigin = "https://imobiliare.multiwebsite.org";

async function submit(slug: string, email: string, origin = siteOrigin): Promise<string> {
	const response = await submitForm(
		slug,
		{ payload: { email, message: `Hello from ${email}` } },
		{ origin },
	);
	expect(response.status).toBe(201);
	return (await readJson<{ id: string }>(response)).id;
}

describe("admin submissions inbox", () => {
	let cookie: string;

	beforeEach(async () => {
		vi.unstubAllGlobals();
		vi.stubGlobal("fetch", async () => Response.json({ id: "stubbed" }));
		await resetFormsState();
		cookie = await createSignedInAdmin();
	});

	it("requires an admin session for list, detail and delete", async () => {
		const id = crypto.randomUUID();
		const responses = [
			await workerFetch("/api/admin/forms/submissions"),
			await workerFetch(`/api/admin/forms/submissions/${id}`),
			await workerFetch(`/api/admin/forms/submissions/${id}`, {
				method: "DELETE",
				headers: { Origin: trustedOrigin },
			}),
		];

		for (const response of responses) {
			expect(response.status).toBe(401);
			await expect(readJson(response)).resolves.toEqual({ error: "Unauthorized." });
		}
	});

	it("lists submissions newest first with form filter and cursor pagination", async () => {
		await upsertContactForm(cookie, "contact", { allowedOrigins: [siteOrigin] });
		await upsertContactForm(cookie, "offer", { name: "Offer", allowedOrigins: [siteOrigin] });
		const contactIds = [
			await submit("contact", "one@example.com"),
			await submit("contact", "two@example.com"),
			await submit("contact", "three@example.com", trustedOrigin),
		];
		const offerId = await submit("offer", "offer@example.com");

		const all = await workerFetch("/api/admin/forms/submissions", { headers: { Cookie: cookie } });
		expect(all.status).toBe(200);
		const allPage = await readJson<SubmissionPage>(all);
		expect(allPage.submissions).toHaveLength(4);
		expect(allPage.nextCursor).toBeNull();
		const timestamps = allPage.submissions.map((item) => Date.parse(item.createdAt));
		expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
		expect(allPage.submissions.find((item) => item.id === offerId)).toMatchObject({
			formSlug: "offer",
			formName: "Offer",
			origin: siteOrigin,
			submitterEmail: "offer@example.com",
			payload: { email: "offer@example.com", message: "Hello from offer@example.com" },
		});
		for (const item of allPage.submissions) {
			expect(item).not.toHaveProperty("ipHash");
			expect(item).not.toHaveProperty("ip_hash");
		}

		const firstPage = await readJson<SubmissionPage>(
			await workerFetch("/api/admin/forms/submissions?form=contact&limit=2", {
				headers: { Cookie: cookie },
			}),
		);
		expect(firstPage.submissions).toHaveLength(2);
		expect(firstPage.nextCursor).toEqual(expect.any(String));

		const secondPage = await readJson<SubmissionPage>(
			await workerFetch(
				`/api/admin/forms/submissions?form=contact&limit=2&cursor=${encodeURIComponent(
					firstPage.nextCursor ?? "",
				)}`,
				{ headers: { Cookie: cookie } },
			),
		);
		expect(secondPage.submissions).toHaveLength(1);
		expect(secondPage.nextCursor).toBeNull();

		const pagedIds = [...firstPage.submissions, ...secondPage.submissions].map((item) => item.id);
		expect(new Set(pagedIds).size).toBe(3);
		expect([...pagedIds].sort()).toEqual([...contactIds].sort());
		expect(
			[...firstPage.submissions, ...secondPage.submissions].every(
				(item) => item.formSlug === "contact",
			),
		).toBe(true);
	});

	it("rejects invalid list queries", async () => {
		for (const query of ["limit=101", "limit=0", "limit=abc", "cursor=not-a-cursor", "form=Bad Slug!"]) {
			const response = await workerFetch(`/api/admin/forms/submissions?${query}`, {
				headers: { Cookie: cookie },
			});
			expect(response.status, query).toBe(400);
			await expect(readJson(response)).resolves.toHaveProperty("error");
		}
	});

	it("returns submission detail and deletes it with a trusted origin", async () => {
		await upsertContactForm(cookie, "contact", { allowedOrigins: [siteOrigin] });
		const id = await submit("contact", "detail@example.com");

		const detail = await workerFetch(`/api/admin/forms/submissions/${id}`, {
			headers: { Cookie: cookie },
		});
		expect(detail.status).toBe(200);
		const detailBody = await readJson<{ submission: SubmissionDto }>(detail);
		expect(detailBody.submission).toMatchObject({
			id,
			formSlug: "contact",
			formName: "Contact",
			origin: siteOrigin,
			submitterEmail: "detail@example.com",
			payload: { email: "detail@example.com", message: "Hello from detail@example.com" },
		});
		expect(detailBody.submission).not.toHaveProperty("ipHash");

		const untrustedDelete = await workerFetch(`/api/admin/forms/submissions/${id}`, {
			method: "DELETE",
			headers: { Cookie: cookie, Origin: siteOrigin },
		});
		expect(untrustedDelete.status).toBe(403);

		const deleted = await workerFetch(`/api/admin/forms/submissions/${id}`, {
			method: "DELETE",
			headers: { Cookie: cookie, Origin: trustedOrigin },
		});
		expect(deleted.status).toBe(200);
		await expect(readJson(deleted)).resolves.toEqual({ deleted: true });

		const afterDelete = await workerFetch(`/api/admin/forms/submissions/${id}`, {
			headers: { Cookie: cookie },
		});
		expect(afterDelete.status).toBe(404);

		const deleteAgain = await workerFetch(`/api/admin/forms/submissions/${id}`, {
			method: "DELETE",
			headers: { Cookie: cookie, Origin: trustedOrigin },
		});
		expect(deleteAgain.status).toBe(404);
		await expect(readJson(deleteAgain)).resolves.toEqual({ error: "Submission not found." });
	});

	it("rejects malformed submission ids", async () => {
		const response = await workerFetch("/api/admin/forms/submissions/not-a-uuid", {
			headers: { Cookie: cookie },
		});

		expect(response.status).toBe(400);
		await expect(readJson(response)).resolves.toEqual({ error: "Submission id is invalid." });
	});
});
