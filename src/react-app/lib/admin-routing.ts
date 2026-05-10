export type AdminPage = "dashboard" | "forms";

export const adminPagePaths: Record<AdminPage, string> = {
	dashboard: "/",
	forms: "/forms",
};

export function getAdminPageFromPath(pathname: string): AdminPage {
	const normalizedPath = pathname.replace(/\/+$/, "") || "/";
	return normalizedPath === adminPagePaths.forms ? "forms" : "dashboard";
}

export function getCurrentAdminPage(): AdminPage {
	if (typeof window === "undefined") {
		return "dashboard";
	}

	return getAdminPageFromPath(window.location.pathname);
}
