import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthCardStack } from "../../src/react-app/App";

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
});
