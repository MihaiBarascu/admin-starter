import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormFeedback } from "../../src/react-app/App";

describe("FormFeedback", () => {
	it("renders errors as visible destructive alerts", () => {
		const markup = renderToStaticMarkup(
			<FormFeedback
				feedback={{
					type: "error",
					message: "Password must contain between 12 and 128 characters.",
				}}
			/>,
		);

		expect(markup).toContain('role="alert"');
		expect(markup).toContain("text-destructive");
		expect(markup).toContain("Password must contain between 12 and 128 characters.");
	});

	it("renders success feedback without destructive styling", () => {
		const markup = renderToStaticMarkup(
			<FormFeedback
				feedback={{
					type: "success",
					message: "Admin account created.",
				}}
			/>,
		);

		expect(markup).not.toContain("text-destructive");
		expect(markup).toContain("Admin account created.");
	});
});
