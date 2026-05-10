import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthCardStack, ResetPasswordScreen } from "../../src/react-app/App";
import { redirectToSignInAfterPasswordReset } from "../../src/react-app/lib/navigation";

describe("AuthCardStack", () => {
	it("hides first-admin bootstrap when bootstrap is no longer available", () => {
		const markup = renderToStaticMarkup(
			<AuthCardStack bootstrapAvailable={false} onAuthenticated={() => undefined} />,
		);

		expect(markup).toContain("Sign in");
		expect(markup).not.toContain("Bootstrap first admin");
	});

	it("shows first-admin bootstrap when bootstrap is available", () => {
		const markup = renderToStaticMarkup(
			<AuthCardStack bootstrapAvailable onAuthenticated={() => undefined} />,
		);

		expect(markup).toContain("Sign in");
		expect(markup).toContain("Bootstrap first admin");
	});

	it("offers password reset from the sign-in card", () => {
		const markup = renderToStaticMarkup(
			<AuthCardStack bootstrapAvailable={false} onAuthenticated={() => undefined} />,
		);

		expect(markup).toContain("Forgot password?");
	});
});

describe("ResetPasswordScreen", () => {
	it("renders the password reset form when a token is present", () => {
		const markup = renderToStaticMarkup(<ResetPasswordScreen token="reset-token" />);

		expect(markup).toContain("Reset password");
		expect(markup).toContain("New password");
		expect(markup).toContain("Confirm password");
		expect(markup).toContain("Update password");
	});

	it("shows invalid link feedback without a token", () => {
		const markup = renderToStaticMarkup(<ResetPasswordScreen token="" />);

		expect(markup).toContain("Invalid reset link.");
		expect(markup).toContain("disabled");
	});

	it("redirects to sign in by replacing the reset URL after a successful password reset", () => {
		const replace = vi.fn();
		const assign = vi.fn();
		const originalWindow = globalThis.window;
		vi.stubGlobal("window", {
			location: {
				assign,
				replace,
			},
		});

		try {
			redirectToSignInAfterPasswordReset();

			expect(replace).toHaveBeenCalledWith("/");
			expect(assign).not.toHaveBeenCalled();
		} finally {
			vi.stubGlobal("window", originalWindow);
		}
	});
});
