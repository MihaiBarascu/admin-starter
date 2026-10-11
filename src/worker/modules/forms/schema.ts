import { z } from "zod";

const fieldNameSchema = z
	.string()
	.trim()
	.regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/, "Field names must be alphanumeric.");

const slugSchema = z
	.string()
	.trim()
	.toLowerCase()
	.regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "Form slug is invalid.");

const optionalEmailSchema = z.preprocess(
	(value) => {
		if (typeof value === "string" && value.trim() === "") {
			return undefined;
		}
		return value;
	},
	z
		.string()
		.trim()
		.toLowerCase()
		.pipe(z.email("Notification email is invalid."))
		.optional(),
);

export const formFieldTypes = [
	"text",
	"email",
	"textarea",
	"checkbox",
	"tel",
	"select",
] as const;

const selectOptionSchema = z
	.string()
	.trim()
	.min(1, "Select options cannot be empty.")
	.max(200, "Select options must contain at most 200 characters.");

export const formFieldSchema = z.object({
	name: fieldNameSchema,
	type: z.enum(formFieldTypes),
	label: z.string().trim().min(1).max(120).optional(),
	required: z.boolean().optional().default(false),
	maxLength: z.number().int().min(1).max(5_000).optional(),
	options: z.array(selectOptionSchema).max(100).optional(),
});

export const formDefinitionSchema = z
	.object({
		fields: z.array(formFieldSchema).min(1).max(50),
	})
	.superRefine((value, ctx) => {
		const names = new Set<string>();
		for (const [index, field] of value.fields.entries()) {
			if (names.has(field.name)) {
				ctx.addIssue({
					code: "custom",
					path: ["fields", index, "name"],
					message: `Duplicate field: ${field.name}.`,
				});
			}
			names.add(field.name);

			if (field.type === "select") {
				if (!field.options || field.options.length === 0) {
					ctx.addIssue({
						code: "custom",
						path: ["fields", index, "options"],
						message: `${field.name} needs at least one option.`,
					});
				} else if (new Set(field.options).size !== field.options.length) {
					ctx.addIssue({
						code: "custom",
						path: ["fields", index, "options"],
						message: `${field.name} has duplicate options.`,
					});
				}
			} else if (field.options !== undefined) {
				ctx.addIssue({
					code: "custom",
					path: ["fields", index, "options"],
					message: `${field.name}: options are only allowed for select fields.`,
				});
			}
		}
	});

/**
 * Exact browser origin such as `https://example.com` or `http://localhost:4321`.
 * Paths, query strings, credentials and non-http(s) schemes are rejected.
 * A single trailing slash is tolerated and normalized away.
 */
export const allowedOriginSchema = z
	.string()
	.trim()
	.max(200, "Allowed origins must contain at most 200 characters.")
	.transform((value) => value.replace(/\/$/, "").toLowerCase())
	.refine(isHttpOrigin, "Allowed origins must be http(s) origins without a path.");

function isHttpOrigin(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return (
		(url.protocol === "https:" || url.protocol === "http:") &&
		!url.username &&
		!url.password &&
		url.origin === value
	);
}

export const formSlugParamSchema = z.object({
	slug: slugSchema,
});

export const upsertFormRequestSchema = z.object({
	name: z.string().trim().min(1, "Form name is required.").max(120),
	enabled: z.boolean().optional().default(true),
	notificationEmail: optionalEmailSchema,
	turnstileRequired: z.boolean().optional().default(false),
	allowedOrigins: z
		.array(allowedOriginSchema)
		.max(20, "At most 20 allowed origins are supported.")
		.optional()
		.default([])
		.transform((origins) => [...new Set(origins)]),
	schema: formDefinitionSchema,
});

export const submissionIdParamSchema = z.object({
	id: z.uuid("Submission id is invalid."),
});

export const listSubmissionsQuerySchema = z.object({
	form: slugSchema.optional(),
	cursor: z.string().trim().min(1).max(200).optional(),
	limit: z.coerce
		.number()
		.int("Limit must be an integer.")
		.min(1, "Limit must be between 1 and 100.")
		.max(100, "Limit must be between 1 and 100.")
		.optional()
		.default(25),
});

export const formSubmissionRequestSchema = z.object({
	payload: z.record(z.string(), z.unknown()),
	turnstileToken: z.string().min(1).max(2048).optional(),
});

export type FormDefinition = z.infer<typeof formDefinitionSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type UpsertFormRequest = z.infer<typeof upsertFormRequestSchema>;
export type FormSubmissionRequest = z.infer<typeof formSubmissionRequestSchema>;
export type ListSubmissionsQuery = z.infer<typeof listSubmissionsQuerySchema>;
