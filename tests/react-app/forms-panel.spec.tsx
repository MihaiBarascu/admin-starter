import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AdminSidebar } from "../../src/react-app/App";
import { FormsPanel } from "../../src/react-app/forms-admin";
import {
	createEmptyFormDraft,
	draftToUpsertRequest,
	formToDraft,
} from "../../src/react-app/lib/forms-admin-model";
import { getAdminPageFromPath } from "../../src/react-app/lib/admin-routing";

describe("AdminSidebar", () => {
	it("links to the dashboard and forms pages", () => {
		const markup = renderToStaticMarkup(<AdminSidebar />);

		expect(markup).toContain('href="/"');
		expect(markup).toContain('href="/forms"');
		expect(markup).toContain('href="/submissions"');
		expect(markup).toContain("Forms");
		expect(markup).toContain("Submissions");
		expect(markup).not.toContain('href="#forms"');
		expect(markup).not.toContain("Monitoring</a>");
	});
});

describe("getAdminPageFromPath", () => {
	it("routes forms and submissions to their own admin pages", () => {
		expect(getAdminPageFromPath("/")).toBe("dashboard");
		expect(getAdminPageFromPath("/forms")).toBe("forms");
		expect(getAdminPageFromPath("/forms/")).toBe("forms");
		expect(getAdminPageFromPath("/submissions")).toBe("submissions");
		expect(getAdminPageFromPath("/unknown")).toBe("dashboard");
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
						allowedOrigins: ["https://stomatolog.multiwebsite.org"],
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
		expect(markup).toContain("New form");
		expect(markup).toContain("Edit");
		expect(markup).toContain("Contact");
		expect(markup).toContain("/api/forms/contact/submissions");
		expect(markup).toContain("email, message");
		expect(markup).toContain("owner@example.test");
		expect(markup).toContain("https://stomatolog.multiwebsite.org");
	});

	it("shows manual seed guidance when no forms exist", () => {
		const markup = renderToStaticMarkup(<FormsPanel forms={[]} />);

		expect(markup).toContain("0 configured");
		expect(markup).toContain("Create the first form from this page or run the forms seed");
		expect(markup).toContain("New form");
	});

	it("creates a usable empty form draft", () => {
		const draft = createEmptyFormDraft();

		expect(draft.slug).toBe("");
		expect(draft.enabled).toBe(true);
		expect(draft.fields).toEqual([
			{
				name: "email",
				label: "Email",
				type: "email",
				required: true,
				maxLength: 254,
			},
		]);
	});

	it("maps saved forms to editable drafts", () => {
		const draft = formToDraft({
			id: "form_contact",
			name: "Contact",
			slug: "contact",
			enabled: false,
			notificationEmail: " Owner@Example.COM ",
			turnstileRequired: true,
			allowedOrigins: ["https://stomatolog.multiwebsite.org", "http://localhost:4321"],
			schema: {
				fields: [
					{ name: "email", type: "email", required: true, maxLength: 254 },
					{ name: "message", label: "Message", type: "textarea", required: true },
					{ name: "service", type: "select", options: ["A", "B"] },
				],
			},
		});

		expect(draft).toMatchObject({
			slug: "contact",
			name: "Contact",
			enabled: false,
			notificationEmail: " Owner@Example.COM ",
			turnstileRequired: true,
			allowedOrigins: "https://stomatolog.multiwebsite.org\nhttp://localhost:4321",
			fields: [
				{ name: "email", label: "Email", type: "email", required: true, maxLength: 254 },
				{ name: "message", label: "Message", type: "textarea", required: true },
				{ name: "service", label: "Service", type: "select", options: ["A", "B"] },
			],
		});
	});

	it("normalizes drafts for the admin upsert API", () => {
		const payload = draftToUpsertRequest({
			slug: " Contact ",
			name: " Contact form ",
			enabled: true,
			notificationEmail: " Owner@Example.COM ",
			turnstileRequired: false,
			allowedOrigins:
				" https://stomatolog.multiwebsite.org/ \n\nhttp://localhost:4321\nhttps://stomatolog.multiwebsite.org",
			fields: [
				{
					name: " phone ",
					type: "tel",
					required: false,
					options: ["ignored for non-select fields"],
				},
				{
					name: "service",
					type: "select",
					options: [" Consultatie ", "", "Albire", "Albire"],
				},
				{
					name: " email ",
					label: " Email address ",
					type: "email",
					required: true,
					maxLength: 254,
				},
			],
		});

		expect(payload).toEqual({
			slug: "contact",
			request: {
				name: "Contact form",
				enabled: true,
				notificationEmail: "owner@example.com",
				turnstileRequired: false,
				allowedOrigins: ["https://stomatolog.multiwebsite.org", "http://localhost:4321"],
				schema: {
					fields: [
						{ name: "phone", label: undefined, type: "tel", required: false, maxLength: undefined },
						{
							name: "service",
							label: undefined,
							type: "select",
							required: false,
							maxLength: undefined,
							options: ["Consultatie", "Albire"],
						},
						{
							name: "email",
							label: "Email address",
							type: "email",
							required: true,
							maxLength: 254,
						},
					],
				},
			},
		});
	});

	it("requires options for select fields", () => {
		expect(() =>
			draftToUpsertRequest({
				...createEmptyFormDraft(),
				slug: "booking",
				name: "Booking",
				fields: [{ name: "service", type: "select", options: ["", "  "] }],
			}),
		).toThrow("Field service needs at least one option.");
	});
});
