import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	ALL_FORMS_FILTER,
	buildSubmissionsUrl,
	formatSubmissionValue,
	getSubmissionPreview,
	type AdminSubmission,
} from "../../src/react-app/lib/submissions-admin-model";
import { SubmissionsPanel } from "../../src/react-app/submissions-admin";

const submission: AdminSubmission = {
	id: "5b0d1f5e-4f61-4bde-9d6e-1df2f4c0a001",
	formId: "form_contact",
	formSlug: "contact",
	formName: "Contact",
	payload: {
		email: "visitor@example.com",
		message: "Aș vrea o programare",
		consent: true,
	},
	origin: "https://stomatolog.multiwebsite.org",
	submitterEmail: "visitor@example.com",
	createdAt: "2026-10-11T09:30:00.000Z",
};

describe("SubmissionsPanel", () => {
	it("renders submissions with form, submitter, preview and origin", () => {
		const markup = renderToStaticMarkup(
			<SubmissionsPanel
				forms={[]}
				formFilter={ALL_FORMS_FILTER}
				submissions={[submission]}
				hasMore
			/>,
		);

		expect(markup).toContain("Submissions");
		expect(markup).toContain("Contact");
		expect(markup).toContain("visitor@example.com");
		expect(markup).toContain("Aș vrea o programare · Yes");
		expect(markup).toContain("https://stomatolog.multiwebsite.org");
		expect(markup).toContain("View");
		expect(markup).toContain("Load more");
	});

	it("shows an empty state and errors", () => {
		const markup = renderToStaticMarkup(
			<SubmissionsPanel
				forms={[]}
				formFilter={ALL_FORMS_FILTER}
				submissions={[]}
				hasMore={false}
				error="Submissions could not be loaded."
			/>,
		);

		expect(markup).toContain("No submissions yet.");
		expect(markup).toContain("Submissions could not be loaded.");
		expect(markup).not.toContain("Load more");
	});
});

describe("submissions admin model", () => {
	it("builds list URLs with optional form filter and cursor", () => {
		expect(buildSubmissionsUrl({ form: ALL_FORMS_FILTER })).toBe(
			"/api/admin/forms/submissions?limit=25",
		);
		expect(buildSubmissionsUrl({ form: "contact", cursor: "abc_-", limit: 10 })).toBe(
			"/api/admin/forms/submissions?form=contact&cursor=abc_-&limit=10",
		);
	});

	it("formats payload values for display", () => {
		expect(formatSubmissionValue(true)).toBe("Yes");
		expect(formatSubmissionValue(false)).toBe("No");
		expect(formatSubmissionValue("text")).toBe("text");
		expect(getSubmissionPreview(submission, 10)).toBe("Aș vrea o…");
	});
});
