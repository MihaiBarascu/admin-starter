export function redirectToSignInAfterPasswordReset() {
	goToSignIn({ replace: true });
}

export function goToSignIn(options?: { replace?: boolean }) {
	if (typeof window === "undefined") {
		return;
	}

	if (options?.replace) {
		window.location.replace("/");
		return;
	}

	window.location.assign("/");
}
