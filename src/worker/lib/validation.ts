import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { z } from "zod";

type ValidationError = {
	issues: Array<{ path: readonly unknown[]; message: string }>;
};

function getValidationErrorMessage(error: ValidationError): string {
	const firstIssue = error.issues[0];
	if (!firstIssue) {
		return "Invalid request body.";
	}
	if (firstIssue.path.length === 0) {
		return "Body must be a JSON object.";
	}
	return firstIssue.message;
}

export function requestValidator<
	TTarget extends keyof ValidationTargets,
	TSchema extends z.ZodType,
>(target: TTarget, schema: TSchema) {
	return zValidator(target, schema, (result, c) => {
		if (!result.success) {
			return c.json({ error: getValidationErrorMessage(result.error) }, 400);
		}
	});
}

export function jsonValidator<TSchema extends z.ZodType>(schema: TSchema) {
	return requestValidator("json", schema);
}

export function queryValidator<TSchema extends z.ZodType>(schema: TSchema) {
	return requestValidator("query", schema);
}

export function paramValidator<TSchema extends z.ZodType>(schema: TSchema) {
	return requestValidator("param", schema);
}
