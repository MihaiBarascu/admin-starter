import { and, asc, count, desc, eq, gte, lt, or, type SQL } from "drizzle-orm";
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
	type ListSubmissionsQuery,
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
	allowedOrigins: string[];
	createdAt: Date;
	updatedAt: Date;
};

export type SubmissionMetadata = {
	origin?: string;
	ipAddress?: string;
	userAgent?: string;
	/** Origins of this admin app itself (always allowed, never need CORS). */
	appOrigins: string[];
};

export type FormSubmissionDto = {
	id: string;
	formId: string;
	formSlug: string;
	formName: string;
	payload: Record<string, unknown>;
	origin?: string;
	submitterEmail?: string;
	userAgent?: string;
	createdAt: Date;
};

export type FormSubmissionPage = {
	submissions: FormSubmissionDto[];
	nextCursor: string | null;
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
			allowedOriginsJson: JSON.stringify(input.allowedOrigins),
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
				allowedOriginsJson: JSON.stringify(input.allowedOrigins),
				updatedAt: now,
			},
		});

	const row = await getFormRowBySlug(dbBinding, slug);
	if (!row) {
		throw new FormsServiceError(404, "Form not found.");
	}

	return toFormDto(row);
}

export async function listForms(dbBinding: D1Database): Promise<FormDto[]> {
	const db = getDb({ DB: dbBinding });
	const rows = await db.select().from(form).orderBy(asc(form.slug));
	return rows.map(toFormDto);
}

/**
 * Origins of the admin app itself: the configured BETTER_AUTH_URL and the
 * origin the Worker is actually serving the request on.
 */
export function getAppOrigins(env: Pick<AppBindings, "BETTER_AUTH_URL">, requestUrl: string): string[] {
	const origins = new Set<string>([new URL(requestUrl).origin]);
	if (env.BETTER_AUTH_URL) {
		try {
			origins.add(new URL(env.BETTER_AUTH_URL).origin);
		} catch {
			// Ignore a malformed BETTER_AUTH_URL; the request origin still applies.
		}
	}
	return [...origins];
}

/**
 * Returns true when `origin` may call the public submission endpoint of `slug`:
 * either the admin app's own origin or an exact entry of the form's
 * allowedOrigins. Unknown slugs only allow the app's own origin, so the
 * response does not reveal which forms exist to arbitrary sites.
 */
export async function isSubmissionOriginAllowed(
	dbBinding: D1Database,
	slug: string,
	origin: string | undefined,
	appOrigins: string[],
): Promise<boolean> {
	if (!origin) {
		return false;
	}
	if (appOrigins.includes(origin)) {
		return true;
	}

	const db = getDb({ DB: dbBinding });
	const rows = await db
		.select({ allowedOriginsJson: form.allowedOriginsJson })
		.from(form)
		.where(eq(form.slug, slug))
		.limit(1);
	const row = rows[0];
	return row ? parseAllowedOrigins(row.allowedOriginsJson).includes(origin) : false;
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
		const allowedHostnames = new Set(
			[...metadata.appOrigins, ...parseAllowedOrigins(row.allowedOriginsJson)].map(
				(origin) => new URL(origin).hostname,
			),
		);
		await validateTurnstile(env, input.turnstileToken, metadata.ipAddress, allowedHostnames);
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
		allowedOrigins: parseAllowedOrigins(row.allowedOriginsJson),
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function parseAllowedOrigins(json: string): string[] {
	try {
		const parsed: unknown = JSON.parse(json);
		return Array.isArray(parsed)
			? parsed.filter((value): value is string => typeof value === "string")
			: [];
	} catch {
		return [];
	}
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

	if (field.type === "select") {
		if (!field.options?.includes(normalized)) {
			throw new FormsServiceError(400, `${field.name} must be one of the allowed options.`);
		}
		return normalized;
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

	if (field.type === "tel" && !TEL_PATTERN.test(normalized)) {
		throw new FormsServiceError(400, `${field.name} must be a valid phone number.`);
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
		case "tel":
			return 30;
		case "select":
			return 200;
		case "checkbox":
			return 0;
	}
}

// Light phone validation: 6-30 characters of digits, spaces, + - ( ) . and at
// least one digit. Country-specific rules are left to the frontend.
const TEL_PATTERN = /^(?=.*\d)[\d +\-().]{6,30}$/;

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
	allowedHostnames: Set<string>,
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

		const result = (await response.json().catch(() => null)) as {
			success?: boolean;
			hostname?: string;
		} | null;
		if (!result?.success) {
			throw new FormsServiceError(400, "Form verification failed.");
		}
		// A valid token solved on a different site must not be replayable here.
		if (!result.hostname || !allowedHostnames.has(result.hostname.toLowerCase())) {
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

export async function listFormSubmissions(
	dbBinding: D1Database,
	query: ListSubmissionsQuery,
): Promise<FormSubmissionPage> {
	const db = getDb({ DB: dbBinding });
	const conditions: SQL[] = [];
	if (query.form) {
		conditions.push(eq(form.slug, query.form));
	}
	if (query.cursor) {
		const cursor = decodeSubmissionCursor(query.cursor);
		const cursorCondition = or(
			lt(formSubmission.createdAt, cursor.createdAt),
			and(eq(formSubmission.createdAt, cursor.createdAt), lt(formSubmission.id, cursor.id)),
		);
		if (cursorCondition) {
			conditions.push(cursorCondition);
		}
	}

	const rows = await selectSubmissionRows(db)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(formSubmission.createdAt), desc(formSubmission.id))
		.limit(query.limit + 1);

	const page = rows.slice(0, query.limit);
	const last = page.at(-1);
	return {
		submissions: page.map(toSubmissionDto),
		nextCursor:
			rows.length > query.limit && last ? encodeSubmissionCursor(last.createdAt, last.id) : null,
	};
}

export async function getFormSubmission(
	dbBinding: D1Database,
	id: string,
): Promise<FormSubmissionDto> {
	const db = getDb({ DB: dbBinding });
	const rows = await selectSubmissionRows(db).where(eq(formSubmission.id, id)).limit(1);
	const row = rows[0];
	if (!row) {
		throw new FormsServiceError(404, "Submission not found.");
	}
	return toSubmissionDto(row);
}

export async function deleteFormSubmission(dbBinding: D1Database, id: string): Promise<void> {
	const db = getDb({ DB: dbBinding });
	const deleted = await db
		.delete(formSubmission)
		.where(eq(formSubmission.id, id))
		.returning({ id: formSubmission.id });
	if (deleted.length === 0) {
		throw new FormsServiceError(404, "Submission not found.");
	}
}

// ipHash is intentionally never selected for admin responses.
function selectSubmissionRows(db: ReturnType<typeof getDb>) {
	return db
		.select({
			id: formSubmission.id,
			formId: formSubmission.formId,
			formSlug: form.slug,
			formName: form.name,
			payloadJson: formSubmission.payloadJson,
			origin: formSubmission.origin,
			submitterEmail: formSubmission.submitterEmail,
			userAgent: formSubmission.userAgent,
			createdAt: formSubmission.createdAt,
		})
		.from(formSubmission)
		.innerJoin(form, eq(formSubmission.formId, form.id));
}

type SubmissionRow = Awaited<ReturnType<ReturnType<typeof selectSubmissionRows>["all"]>>[number];

function toSubmissionDto(row: SubmissionRow): FormSubmissionDto {
	return {
		id: row.id,
		formId: row.formId,
		formSlug: row.formSlug,
		formName: row.formName,
		payload: parseSubmissionPayload(row.payloadJson),
		origin: row.origin ?? undefined,
		submitterEmail: row.submitterEmail ?? undefined,
		userAgent: row.userAgent ?? undefined,
		createdAt: row.createdAt,
	};
}

function parseSubmissionPayload(json: string): Record<string, unknown> {
	try {
		const parsed: unknown = JSON.parse(json);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

function encodeSubmissionCursor(createdAt: Date, id: string): string {
	return btoa(`${createdAt.getTime()}:${id}`)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function decodeSubmissionCursor(cursor: string): { createdAt: Date; id: string } {
	try {
		const decoded = atob(cursor.replace(/-/g, "+").replace(/_/g, "/"));
		const separator = decoded.indexOf(":");
		const timestamp = Number(decoded.slice(0, separator));
		const id = decoded.slice(separator + 1);
		if (separator > 0 && Number.isSafeInteger(timestamp) && id) {
			return { createdAt: new Date(timestamp), id };
		}
	} catch {
		// Fall through to the validation error below.
	}
	throw new FormsServiceError(400, "Cursor is invalid.");
}
