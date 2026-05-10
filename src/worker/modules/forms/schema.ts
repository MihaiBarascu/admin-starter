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

export const formFieldSchema = z.object({
	name: fieldNameSchema,
	type: z.enum(["text", "email", "textarea", "checkbox"]),
	label: z.string().trim().min(1).max(120).optional(),
	required: z.boolean().optional().default(false),
	maxLength: z.number().int().min(1).max(5_000).optional(),
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
		}
	});

export const formSlugParamSchema = z.object({
	slug: slugSchema,
});

export const upsertFormRequestSchema = z.object({
	name: z.string().trim().min(1, "Form name is required.").max(120),
	enabled: z.boolean().optional().default(true),
	notificationEmail: optionalEmailSchema,
	turnstileRequired: z.boolean().optional().default(false),
	schema: formDefinitionSchema,
});

export const formSubmissionRequestSchema = z.object({
	payload: z.record(z.string(), z.unknown()),
	turnstileToken: z.string().min(1).max(2048).optional(),
});

export type FormDefinition = z.infer<typeof formDefinitionSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type UpsertFormRequest = z.infer<typeof upsertFormRequestSchema>;
export type FormSubmissionRequest = z.infer<typeof formSubmissionRequestSchema>;
