export type AdminFormFieldType = "text" | "email" | "textarea" | "checkbox" | "tel" | "select";

export interface AdminFormField {
	name: string;
	type: AdminFormFieldType;
	label?: string;
	required?: boolean;
	maxLength?: number;
	/** Allowed values; only used by `select` fields. */
	options?: string[];
}

export interface AdminForm {
	id: string;
	slug: string;
	name: string;
	enabled: boolean;
	notificationEmail?: string;
	turnstileRequired: boolean;
	allowedOrigins?: string[];
	schema: {
		fields: AdminFormField[];
	};
}

export interface UpsertAdminFormRequest {
	name: string;
	enabled: boolean;
	notificationEmail?: string;
	turnstileRequired: boolean;
	allowedOrigins: string[];
	schema: {
		fields: AdminFormField[];
	};
}

export interface FormDraft {
	slug: string;
	name: string;
	enabled: boolean;
	notificationEmail: string;
	turnstileRequired: boolean;
	/** One origin per line, e.g. `https://example.com`. */
	allowedOrigins: string;
	fields: AdminFormField[];
	existingSlug?: string;
}

export function createEmptyFormDraft(): FormDraft {
	return {
		slug: "",
		name: "",
		enabled: true,
		notificationEmail: "",
		turnstileRequired: false,
		allowedOrigins: "",
		fields: [
			{
				name: "email",
				label: "Email",
				type: "email",
				required: true,
				maxLength: 254,
			},
		],
	};
}

export function formToDraft(form: AdminForm): FormDraft {
	return {
		slug: form.slug,
		existingSlug: form.slug,
		name: form.name,
		enabled: form.enabled,
		notificationEmail: form.notificationEmail ?? "",
		turnstileRequired: form.turnstileRequired,
		allowedOrigins: (form.allowedOrigins ?? []).join("\n"),
		fields: form.schema.fields.map((field) => ({
			...field,
			label: field.label ?? getDefaultFieldLabel(field.name),
			required: field.required ?? false,
		})),
	};
}

export function draftToUpsertRequest(draft: FormDraft): {
	slug: string;
	request: UpsertAdminFormRequest;
} {
	const slug = draft.slug.trim().toLowerCase();
	const name = draft.name.trim();
	if (!slug) {
		throw new Error("Form slug is required.");
	}
	if (!name) {
		throw new Error("Form name is required.");
	}
	if (draft.fields.length < 1) {
		throw new Error("At least one field is required.");
	}

	const fields = draft.fields.map((field) => {
		const normalizedName = field.name.trim();
		if (!normalizedName) {
			throw new Error("Field name is required.");
		}

		const normalizedField: AdminFormField = {
			name: normalizedName,
			label: normalizeOptionalString(field.label),
			type: field.type,
			required: field.required ?? false,
			maxLength:
				typeof field.maxLength === "number" && field.maxLength > 0
					? field.maxLength
					: undefined,
		};

		if (field.type === "select") {
			const options = uniqueNonEmptyLines(field.options ?? []);
			if (options.length === 0) {
				throw new Error(`Field ${normalizedName} needs at least one option.`);
			}
			normalizedField.options = options;
		}

		return normalizedField;
	});

	return {
		slug,
		request: {
			name,
			enabled: draft.enabled,
			notificationEmail: normalizeOptionalString(draft.notificationEmail)?.toLowerCase(),
			turnstileRequired: draft.turnstileRequired,
			allowedOrigins: parseAllowedOrigins(draft.allowedOrigins),
			schema: { fields },
		},
	};
}

/** Splits a one-per-line textarea value into trimmed, unique origins. */
export function parseAllowedOrigins(value: string): string[] {
	return uniqueNonEmptyLines(
		value.split(/[\n,]/).map((origin) => origin.trim().replace(/\/$/, "")),
	);
}

function uniqueNonEmptyLines(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeOptionalString(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

function getDefaultFieldLabel(name: string): string {
	return name
		.replace(/_/g, " ")
		.replace(/\b\w/g, (character) => character.toUpperCase());
}
