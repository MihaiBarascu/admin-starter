import { z } from "zod";

const PASSWORD_LENGTH_ERROR = "Password must contain between 12 and 128 characters.";

export const bootstrapRequestSchema = z.object({
	name: z.string().trim().min(1, "Name is required."),
	email: z
		.string()
		.trim()
		.min(1, "Email is required.")
		.toLowerCase()
		.pipe(z.email("Email is invalid.")),
	password: z.string().min(12, PASSWORD_LENGTH_ERROR).max(128, PASSWORD_LENGTH_ERROR),
	bootstrapToken: z.string().min(1, "Bootstrap token is required."),
});
