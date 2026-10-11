export interface AdminSubmission {
	id: string;
	formId: string;
	formSlug: string;
	formName: string;
	payload: Record<string, unknown>;
	origin?: string;
	submitterEmail?: string;
	userAgent?: string;
	createdAt: string;
}

export interface AdminSubmissionPage {
	submissions: AdminSubmission[];
	nextCursor: string | null;
}

/** Select value used for "no form filter" (Radix Select disallows empty values). */
export const ALL_FORMS_FILTER = "all";

export const SUBMISSIONS_PAGE_SIZE = 25;

export function buildSubmissionsUrl(options: {
	form?: string;
	cursor?: string | null;
	limit?: number;
}): string {
	const params = new URLSearchParams();
	if (options.form && options.form !== ALL_FORMS_FILTER) {
		params.set("form", options.form);
	}
	if (options.cursor) {
		params.set("cursor", options.cursor);
	}
	params.set("limit", String(options.limit ?? SUBMISSIONS_PAGE_SIZE));
	return `/api/admin/forms/submissions?${params.toString()}`;
}

export function formatSubmissionValue(value: unknown): string {
	if (typeof value === "boolean") {
		return value ? "Yes" : "No";
	}
	if (value === null || value === undefined) {
		return "";
	}
	return typeof value === "string" ? value : JSON.stringify(value);
}

/** Short one-line preview of the first non-email payload values. */
export function getSubmissionPreview(submission: AdminSubmission, maxLength = 80): string {
	const preview = Object.entries(submission.payload)
		.filter(([, value]) => formatSubmissionValue(value) !== submission.submitterEmail)
		.map(([, value]) => formatSubmissionValue(value))
		.filter(Boolean)
		.join(" · ");
	return preview.length > maxLength ? `${preview.slice(0, maxLength - 1)}…` : preview;
}

export function formatSubmissionDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
}
