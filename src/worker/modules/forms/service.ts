import { count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { form, formSubmission } from "../../db/app-schema";
import { getDb } from "../../db/client";
import { sendFormSubmissionEmail } from "../email/service";
import { getSafetySettings } from "../safety/service";
import type { AppBindings } from "../../types";
import {
	formDefinitionSchema,
	type FormDefinition,
	type FormField,
	type FormSubmissionRequest,
	type UpsertFormRequest,
} from "./schema";

type ErrorStatus = 400 | 404 | 429 | 502 | 503;

export class FormsServiceError extends Error {
	constructor(
		public readonly status: ErrorStatus,
		message: string,
	) {
		super(message);
		this.name = "FormsServiceError";
	}
}

export type FormDto = {
	id: string;
	slug: string;
	name: string;
	enabled: boolean;
	schema: FormDefinition;
	notificationEmail?: string;
	turnstileRequired: boolean;
	createdAt: Date;
	updatedAt: Date;
};

export type SubmissionMetadata = {
	origin?: string;
	ipAddress?: string;
	userAgent?: string;
};

type ValidatedSubmission = {
	payload: Record<string, string | boolean>;
	submitterEmail?: string;
};

export async function upsertForm(
	dbBinding: D1Database,
	slug: string,
	input: UpsertFormRequest,
): Promise<FormDto> {
	const db = getDb({ DB: dbBinding });
	const now = new Date();

	await db
		.insert(form)
		.values({
			id: crypto.randomUUID(),
			slug,
			name: input.name,
			enabled: input.enabled,
			schemaJson: JSON.stringify(input.schema),
			notificationEmail: input.notificationEmail,
			turnstileRequired: input.turnstileRequired,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: form.slug,
			set: {
				name: input.name,
				enabled: input.enabled,
				schemaJson: JSON.stringify(input.schema),
				notificationEmail: input.notificationEmail,
				turnstileRequired: input.turnstileRequired,
				updatedAt: now,
			},
		});

	const row = await getFormRowBySlug(dbBinding, slug);
	if (!row) {
		throw new FormsServiceError(404, "Form not found.");
	}

	return toFormDto(row);
}

export async function createFormSubmission(
	env: AppBindings,
	slug: string,
	input: FormSubmissionRequest,
	metadata: SubmissionMetadata,
	waitUntil: (promise: Promise<unknown>) => void,
): Promise<{ id: string }> {
	const db = getDb(env);
	const row = await getFormRowBySlug(env.DB, slug);
	if (!row || !row.enabled) {
		throw new FormsServiceError(404, "Form not found.");
	}

	const safety = await getSafetySettings(env.DB);
	if (safety.status.emergencyStopEnabled || !safety.status.publicApiEnabled) {
		throw new FormsServiceError(503, "Public form submissions are disabled.");
	}

	const formDefinition = parseFormDefinition(row.schemaJson);
	const validated = validateSubmissionPayload(formDefinition, input.payload);
	await enforceDailyPublicWriteLimit(env.DB, safety.settings.daily_public_write_limit);

	if (row.turnstileRequired) {
		await validateTurnstile(env, input.turnstileToken, metadata.ipAddress);
	}

	const id = crypto.randomUUID();
	const createdAt = new Date();
	await db.insert(formSubmission).values({
		id,
		formId: row.id,
		payloadJson: JSON.stringify(validated.payload),
		submitterEmail: validated.submitterEmail,
		origin: metadata.origin,
		ipHash: await hashIpAddress(env.BETTER_AUTH_SECRET, metadata.ipAddress),
		userAgent: metadata.userAgent,
		createdAt,
	});

	if (row.notificationEmail && safety.status.emailNotificationsEnabled) {
		waitUntil(
			sendFormSubmissionEmail(env, {
				to: row.notificationEmail,
				formName: row.name,
				payload: validated.payload,
				origin: metadata.origin,
			}).catch((error) => {
				console.error("Form notification email failed", error);
			}),
		);
	}

	return { id };
}

async function getFormRowBySlug(dbBinding: D1Database, slug: string) {
	const db = getDb({ DB: dbBinding });
	const rows = await db.select().from(form).where(eq(form.slug, slug)).limit(1);
	return rows[0];
}

function toFormDto(row: NonNullable<Awaited<ReturnType<typeof getFormRowBySlug>>>): FormDto {
	return {
		id: row.id,
		slug: row.slug,
		name: row.name,
		enabled: row.enabled,
		schema: parseFormDefinition(row.schemaJson),
		notificationEmail: row.notificationEmail ?? undefined,
		turnstileRequired: row.turnstileRequired,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function parseFormDefinition(schemaJson: string): FormDefinition {
	let raw: unknown;
	try {
		raw = JSON.parse(schemaJson);
	} catch {
		throw new FormsServiceError(503, "Form schema is invalid.");
	}

	const parsed = formDefinitionSchema.safeParse(raw);
	if (!parsed.success) {
		throw new FormsServiceError(503, "Form schema is invalid.");
	}
	return parsed.data;
}

function validateSubmissionPayload(
	formDefinition: FormDefinition,
	payload: Record<string, unknown>,
): ValidatedSubmission {
	const fieldsByName = new Map(formDefinition.fields.map((field) => [field.name, field]));
	for (const key of Object.keys(payload)) {
		if (!fieldsByName.has(key)) {
			throw new FormsServiceError(400, `Unexpected field: ${key}.`);
		}
	}

	const normalized: Record<string, string | boolean> = {};
	let submitterEmail: string | undefined;

	for (const field of formDefinition.fields) {
		const value = payload[field.name];
		if (value === undefined || value === null) {
			if (field.required) {
				throw new FormsServiceError(400, `${field.name} is required.`);
			}
			continue;
		}

		const normalizedValue = normalizeFieldValue(field, value);
		if (normalizedValue === undefined) {
			continue;
		}

		normalized[field.name] = normalizedValue;
		if (field.type === "email" && !submitterEmail) {
			submitterEmail = String(normalizedValue);
		}
	}

	return { payload: normalized, submitterEmail };
}

function normalizeFieldValue(field: FormField, value: unknown): string | boolean | undefined {
	if (field.type === "checkbox") {
		if (typeof value !== "boolean") {
			throw new FormsServiceError(400, `${field.name} must be true or false.`);
		}
		if (field.required && !value) {
			throw new FormsServiceError(400, `${field.name} is required.`);
		}
		return value;
	}

	if (typeof value !== "string") {
		throw new FormsServiceError(400, `${field.name} must be a string.`);
	}

	const normalized = field.type === "email" ? value.trim().toLowerCase() : value.trim();
	if (!normalized) {
		if (field.required) {
			throw new FormsServiceError(400, `${field.name} is required.`);
		}
		return undefined;
	}

	const maxLength = field.maxLength ?? getDefaultMaxLength(field.type);
	if (normalized.length > maxLength) {
		throw new FormsServiceError(
			400,
			`${field.name} must contain at most ${maxLength} characters.`,
		);
	}

	if (field.type === "email" && !formEmailIsValid(normalized)) {
		throw new FormsServiceError(400, `${field.name} must be a valid email address.`);
	}

	return normalized;
}

function getDefaultMaxLength(type: FormField["type"]): number {
	switch (type) {
		case "email":
			return 254;
		case "textarea":
			return 5_000;
		case "text":
			return 500;
		case "checkbox":
			return 0;
	}
}

function formEmailIsValid(email: string): boolean {
	return z.email().safeParse(email).success;
}

async function enforceDailyPublicWriteLimit(
	dbBinding: D1Database,
	configuredLimit: string,
): Promise<void> {
	const limit = Math.max(1, Number.parseInt(configuredLimit, 10) || 100);
	const startOfDay = new Date();
	startOfDay.setUTCHours(0, 0, 0, 0);

	const db = getDb({ DB: dbBinding });
	const rows = await db
		.select({ value: count() })
		.from(formSubmission)
		.where(gte(formSubmission.createdAt, startOfDay));

	if ((rows[0]?.value ?? 0) >= limit) {
		throw new FormsServiceError(429, "Daily public form submission limit reached.");
	}
}

async function validateTurnstile(
	env: AppBindings,
	token: string | undefined,
	remoteIp: string | undefined,
): Promise<void> {
	if (!token) {
		throw new FormsServiceError(400, "Turnstile token is required.");
	}
	if (!env.TURNSTILE_SECRET_KEY) {
		throw new FormsServiceError(503, "Form verification is not configured.");
	}

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 5_000);
	try {
		const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				secret: env.TURNSTILE_SECRET_KEY,
				response: token,
				remoteip: remoteIp,
			}),
			signal: controller.signal,
		});

		if (!response.ok) {
			throw new FormsServiceError(502, "Form verification failed.");
		}

		const result = (await response.json().catch(() => null)) as { success?: boolean } | null;
		if (!result?.success) {
			throw new FormsServiceError(400, "Form verification failed.");
		}
	} catch (error) {
		if (error instanceof FormsServiceError) {
			throw error;
		}
		throw new FormsServiceError(502, "Form verification failed.");
	} finally {
		clearTimeout(timeoutId);
	}
}

async function hashIpAddress(
	secret: string,
	ipAddress: string | undefined,
): Promise<string | undefined> {
	if (!ipAddress) {
		return undefined;
	}

	const input = new TextEncoder().encode(`${secret}:${ipAddress}`);
	const digest = await crypto.subtle.digest("SHA-256", input);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
