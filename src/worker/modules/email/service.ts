import type { AppBindings } from "../../types";

type EmailEnv = Pick<AppBindings, "RESEND_API_KEY" | "RESEND_FROM_EMAIL" | "APP_NAME">;

type PasswordResetEmail = {
	to: string;
	resetUrl: string;
};

export async function sendPasswordResetEmail(
	env: EmailEnv,
	email: PasswordResetEmail,
): Promise<void> {
	const apiKey = env.RESEND_API_KEY;
	const from = env.RESEND_FROM_EMAIL;

	if (!apiKey) {
		throw new Error("Missing RESEND_API_KEY.");
	}
	if (!from) {
		throw new Error("Missing RESEND_FROM_EMAIL.");
	}

	const appName = env.APP_NAME ?? "Multiwebsite Admin";
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			from,
			to: [email.to],
			subject: `Reset your ${appName} password`,
			html: renderPasswordResetEmail({
				appName,
				resetUrl: email.resetUrl,
			}),
			text: `Use this link to reset your ${appName} password: ${email.resetUrl}`,
		}),
	});

	if (!response.ok) {
		throw new Error(await getResendErrorMessage(response));
	}
}

async function getResendErrorMessage(response: Response): Promise<string> {
	const payload = (await response.json().catch(() => null)) as
		| { message?: string; error?: string | { message?: string } }
		| null;

	if (typeof payload?.error === "string") {
		return payload.error;
	}
	if (payload?.error?.message) {
		return payload.error.message;
	}
	if (payload?.message) {
		return payload.message;
	}

	return `Resend request failed with status ${response.status}.`;
}

function renderPasswordResetEmail(input: { appName: string; resetUrl: string }): string {
	const appName = escapeHtml(input.appName);
	const resetUrl = escapeHtml(input.resetUrl);

	return `<!doctype html>
<html lang="en">
	<body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
		<h1 style="font-size: 20px;">Reset your ${appName} password</h1>
		<p>Use the link below to reset your password.</p>
		<p>
			<a href="${resetUrl}" style="color: #2563eb;">Reset password</a>
		</p>
		<p>If you did not request this, you can ignore this email.</p>
	</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}
