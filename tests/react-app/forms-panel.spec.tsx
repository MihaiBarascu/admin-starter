import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminSidebar, FormsPanel } from "../../src/react-app/App";

describe("AdminSidebar", () => {
	it("links to the dashboard forms and monitoring sections", () => {
		const markup = renderToStaticMarkup(<AdminSidebar />);

		expect(markup).toContain('href="#dashboard"');
		expect(markup).toContain('href="#forms"');
		expect(markup).toContain('href="#monitoring"');
		expect(markup).toContain("Forms");
	});
});

describe("FormsPanel", () => {
	it("renders dynamic forms from the admin API response", () => {
		const markup = renderToStaticMarkup(
			<FormsPanel
				forms={[
					{
						id: "form_contact",
						name: "Contact",
						slug: "contact",
						enabled: true,
						notificationEmail: "owner@example.test",
						turnstileRequired: false,
						schema: {
							fields: [
								{ name: "email", type: "email", required: true, maxLength: 254 },
								{ name: "message", type: "textarea", required: true, maxLength: 5000 },
							],
						},
					},
				]}
			/>,
		);

		expect(markup).toContain("Forms");
		expect(markup).toContain("1 configured");
		expect(markup).toContain("Contact");
		expect(markup).toContain("/api/forms/contact/submissions");
		expect(markup).toContain("email, message");
		expect(markup).toContain("owner@example.test");
	});

	it("shows manual seed guidance when no forms exist", () => {
		const markup = renderToStaticMarkup(<FormsPanel forms={[]} />);

		expect(markup).toContain("0 configured");
		expect(markup).toContain("Run the forms seed from GitHub Actions");
	});
});
