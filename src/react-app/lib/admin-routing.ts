export type AdminPage = "dashboard" | "forms" | "submissions";

export const adminPagePaths: Record<AdminPage, string> = {
	dashboard: "/",
	forms: "/forms",
	submissions: "/submissions",
};

export function getAdminPageFromPath(pathname: string): AdminPage {
	const normalizedPath = pathname.replace(/\/+$/, "") || "/";
	if (normalizedPath === adminPagePaths.forms) {
		return "forms";
	}
	if (normalizedPath === adminPagePaths.submissions) {
		return "submissions";
	}
	return "dashboard";
}

export function getCurrentAdminPage(): AdminPage {
	if (typeof window === "undefined") {
		return "dashboard";
	}

	return getAdminPageFromPath(window.location.pathname);
}
