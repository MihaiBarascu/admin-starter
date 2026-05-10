import type { FormEvent, MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Activity,
	AlertTriangle,
	BellRing,
	Bot,
	CheckCircle2,
	Database,
	ExternalLink,
	FileText,
	Gauge,
	LayoutDashboard,
	LockKeyhole,
	LogOut,
	Mail,
	Shield,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { FormsPanel } from "./forms-admin";
import { authClient, type AuthSession } from "./lib/auth-client";
import {
	adminPagePaths,
	getCurrentAdminPage,
	type AdminPage,
} from "./lib/admin-routing";
import type { AdminForm, UpsertAdminFormRequest } from "./lib/forms-admin-model";
import { goToSignIn, redirectToSignInAfterPasswordReset } from "./lib/navigation";

type AdminUser = AuthSession["user"];

interface SafetyResponse {
	settings: Record<string, string | null>;
	status: {
		publicApiEnabled: boolean;
		emailNotificationsEnabled: boolean;
		emergencyStopEnabled: boolean;
	};
}

type FormFeedbackState = {
	type: "error" | "success";
	message: string;
} | null;

interface BootstrapStatusResponse {
	available: boolean;
}

const monitoringLinks = [
	{
		title: "Billable Usage",
		href: "https://dash.cloudflare.com/?to=/:account/billing/billable-usage",
		icon: Gauge,
	},
	{
		title: "Budget Alerts",
		href: "https://dash.cloudflare.com/?to=/:account/billing/billable-usage",
		icon: BellRing,
	},
	{
		title: "Worker Observability",
		href: "https://dash.cloudflare.com/?to=/:account/workers/services/view/multiwebsite-admin-starter/production/observability",
		icon: Activity,
	},
	{
		title: "D1 Metrics",
		href: "https://dash.cloudflare.com/?to=/:account/workers/d1",
		icon: Database,
	},
	{
		title: "WAF Rate Limits",
		href: "https://dash.cloudflare.com/?to=/:account/:zone/security/waf/rate-limiting-rules",
		icon: Shield,
	},
	{
		title: "Security Events",
		href: "https://dash.cloudflare.com/?to=/:account/:zone/security/events",
		icon: Shield,
	},
	{
		title: "Turnstile",
		href: "https://dash.cloudflare.com/?to=/:account/turnstile",
		icon: Bot,
	},
	{
		title: "Resend",
		href: "https://resend.com/emails",
		icon: Mail,
	},
];

const jsonHeaders = {
	Accept: "application/json",
};

const jsonBodyHeaders = {
	...jsonHeaders,
	"Content-Type": "application/json",
};

function App() {
	const resetPasswordToken = getResetPasswordToken();
	const session = authClient.useSession();
	const user = session.data?.user ?? null;
	const userId = user?.id;
	const [safety, setSafety] = useState<SafetyResponse | null>(null);
	const [forms, setForms] = useState<AdminForm[]>([]);
	const [adminError, setAdminError] = useState<string | null>(null);
	const [adminPage, setAdminPage] = useState<AdminPage>(getCurrentAdminPage);

	useEffect(() => {
		function handlePopState() {
			setAdminPage(getCurrentAdminPage());
		}

		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, []);

	const loadSafety = useCallback(async () => {
		const response = await fetch("/api/admin/safety", {
			headers: jsonHeaders,
			credentials: "include",
		});
		if (!response.ok) {
			throw new Error("Safety settings could not be loaded.");
		}
		setSafety((await response.json()) as SafetyResponse);
	}, []);

	const loadForms = useCallback(async () => {
		const response = await fetch("/api/admin/forms", {
			headers: jsonHeaders,
			credentials: "include",
		});
		if (!response.ok) {
			throw new Error("Forms could not be loaded.");
		}
		const payload = (await response.json()) as { forms: AdminForm[] };
		setForms(payload.forms);
	}, []);

	const refreshAdminData = useCallback(async () => {
		try {
			await Promise.all([loadSafety(), loadForms()]);
			setAdminError(null);
		} catch (error) {
			setAdminError(error instanceof Error ? error.message : "Could not load admin data.");
		}
	}, [loadForms, loadSafety]);

	useEffect(() => {
		if (userId) {
			// Load protected admin data after Better Auth confirms a session.
			// eslint-disable-next-line react-hooks/set-state-in-effect
			void refreshAdminData();
		}
	}, [refreshAdminData, userId]);

	async function updateSafety(updates: Record<string, boolean | number>) {
		const response = await fetch("/api/admin/safety", {
			method: "PATCH",
			headers: jsonBodyHeaders,
			credentials: "include",
			body: JSON.stringify(updates),
		});
		if (!response.ok) {
			throw new Error("Safety settings could not be updated.");
		}
		await loadSafety();
	}

	async function saveForm(slug: string, input: UpsertAdminFormRequest) {
		const response = await fetch(`/api/admin/forms/${encodeURIComponent(slug)}`, {
			method: "PUT",
			headers: jsonBodyHeaders,
			credentials: "include",
			body: JSON.stringify(input),
		});
		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as { error?: string } | null;
			throw new Error(payload?.error ?? "Form could not be saved.");
		}
		await loadForms();
	}

	async function handleSignOut() {
		await authClient.signOut();
		setSafety(null);
		setForms([]);
		setAdminError(null);
		await session.refetch();
	}

	function navigateAdminPage(page: AdminPage) {
		const path = adminPagePaths[page];
		if (window.location.pathname !== path) {
			window.history.pushState(null, "", path);
		}
		setAdminPage(page);
		window.scrollTo({ top: 0 });
	}

	if (session.isPending) {
		return <LoadingScreen />;
	}

	if (resetPasswordToken !== null) {
		return <ResetPasswordScreen token={resetPasswordToken} />;
	}

	if (!user) {
		return (
			<AuthScreen
				error={session.error?.message ?? null}
				onAuthenticated={() => void session.refetch()}
			/>
		);
	}

	return (
		<div className="min-h-screen bg-muted/40">
			<div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
				<AdminSidebar activePage={adminPage} onNavigate={navigateAdminPage} />

				<div className="flex min-w-0 flex-col">
					<header className="flex h-14 items-center justify-between border-b bg-background px-4 lg:px-6">
						<div>
							<p className="text-sm font-medium">
								{adminPage === "forms" ? "Forms" : "Admin Starter"}
							</p>
							<p className="text-xs text-muted-foreground">
								{adminPage === "forms"
									? "Public form endpoints"
									: "D1 + Drizzle + Better Auth"}
							</p>
						</div>
						<UserMenu user={user} onSignOut={() => void handleSignOut()} />
					</header>

					<main className="flex-1 space-y-6 p-4 lg:p-6">
						{adminError ? (
							<Alert variant="destructive">
								<AlertTriangle className="h-4 w-4" />
								<AlertTitle>Admin data error</AlertTitle>
								<AlertDescription>{adminError}</AlertDescription>
							</Alert>
						) : null}
						{adminPage === "forms" ? (
							<FormsPanel forms={forms} onSave={saveForm} />
						) : (
							<>
								<OverviewCards safety={safety} />
								<SafetyPanel safety={safety} onUpdate={(updates) => void updateSafety(updates)} />
								<MonitoringPanel />
							</>
						)}
					</main>
				</div>
			</div>
		</div>
	);
}

function getResetPasswordToken(): string | null {
	if (typeof window === "undefined" || window.location.pathname !== "/reset-password") {
		return null;
	}

	return new URLSearchParams(window.location.search).get("token") ?? "";
}

export function AdminSidebar(props: {
	activePage?: AdminPage;
	onNavigate?: (page: AdminPage) => void;
}) {
	const activePage = props.activePage ?? "dashboard";

	function handleNavigation(event: MouseEvent<HTMLAnchorElement>, page: AdminPage) {
		if (!props.onNavigate) {
			return;
		}

		event.preventDefault();
		props.onNavigate(page);
	}

	return (
		<aside className="hidden border-r bg-background lg:block">
			<div className="flex h-14 items-center gap-2 border-b px-5">
				<div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
					<LayoutDashboard className="h-4 w-4" />
				</div>
				<div>
					<p className="text-sm font-semibold">Multiwebsite Admin</p>
					<p className="text-xs text-muted-foreground">Cloudflare starter</p>
				</div>
			</div>
			<nav className="grid gap-1 p-3">
				<Button
					asChild
					variant={activePage === "dashboard" ? "secondary" : "ghost"}
					className="justify-start"
				>
					<a
						href={adminPagePaths.dashboard}
						aria-current={activePage === "dashboard" ? "page" : undefined}
						onClick={(event) => handleNavigation(event, "dashboard")}
					>
						<LayoutDashboard className="h-4 w-4" />
						Dashboard
					</a>
				</Button>
				<Button
					asChild
					variant={activePage === "forms" ? "secondary" : "ghost"}
					className="justify-start"
				>
					<a
						href={adminPagePaths.forms}
						aria-current={activePage === "forms" ? "page" : undefined}
						onClick={(event) => handleNavigation(event, "forms")}
					>
						<FileText className="h-4 w-4" />
						Forms
					</a>
				</Button>
			</nav>
		</aside>
	);
}

function AuthScreen(props: { error: string | null; onAuthenticated: () => void }) {
	const [bootstrapAvailable, setBootstrapAvailable] = useState<boolean | null>(null);

	useEffect(() => {
		let active = true;

		async function loadBootstrapStatus() {
			try {
				const response = await fetch("/api/admin/bootstrap", {
					headers: jsonHeaders,
				});
				if (!response.ok) {
					throw new Error("Bootstrap status could not be loaded.");
				}
				const payload = (await response.json()) as BootstrapStatusResponse;
				if (active) {
					setBootstrapAvailable(payload.available);
				}
			} catch {
				if (active) {
					setBootstrapAvailable(false);
				}
			}
		}

		void loadBootstrapStatus();

		return () => {
			active = false;
		};
	}, []);

	return (
		<div className="min-h-screen bg-muted/40 p-4">
			<div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-5xl items-center gap-6 lg:grid-cols-[0.9fr_1.1fr]">
				<div className="space-y-4">
					<Badge variant="secondary">Cloudflare Workers starter</Badge>
					<div className="space-y-3">
						<h1 className="text-3xl font-semibold tracking-tight lg:text-4xl">
							Multiwebsite Admin Starter
						</h1>
						<p className="max-w-md text-sm leading-6 text-muted-foreground">
							A reusable admin foundation with D1, Drizzle, Better Auth, shadcn/ui and usage safety links.
						</p>
					</div>
					{props.error ? (
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertTitle>Session error</AlertTitle>
							<AlertDescription>{props.error}</AlertDescription>
						</Alert>
					) : null}
				</div>

				<AuthCardStack
					bootstrapAvailable={bootstrapAvailable}
					onAuthenticated={props.onAuthenticated}
				/>
			</div>
		</div>
	);
}

export function AuthCardStack(props: {
	bootstrapAvailable: boolean | null;
	onAuthenticated: () => void;
}) {
	return (
		<div className="grid gap-4">
			<LoginCard onAuthenticated={props.onAuthenticated} />
			{props.bootstrapAvailable ? (
				<BootstrapCard onBootstrapped={props.onAuthenticated} />
			) : null}
		</div>
	);
}

function LoginCard(props: { onAuthenticated: () => void }) {
	const [mode, setMode] = useState<"sign-in" | "forgot-password">("sign-in");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [feedback, setFeedback] = useState<FormFeedbackState>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);
		setLoading(true);
		try {
			const { error } = await authClient.signIn.email({
				email,
				password,
				rememberMe: true,
			});
			if (error) {
				throw new Error(error.message ?? "Invalid email or password.");
			}
			props.onAuthenticated();
		} catch (err) {
			setFeedback({
				type: "error",
				message: err instanceof Error ? err.message : "Login failed.",
			});
		} finally {
			setLoading(false);
		}
	}

	async function handlePasswordResetRequest(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);
		setLoading(true);
		try {
			const { error } = await authClient.requestPasswordReset({
				email,
				redirectTo: getPasswordResetRedirectUrl(),
			});
			if (error) {
				throw new Error(error.message ?? "Password reset request failed.");
			}
			setFeedback({
				type: "success",
				message: "If that email exists, a reset link was sent.",
			});
		} catch (err) {
			setFeedback({
				type: "error",
				message: err instanceof Error ? err.message : "Password reset request failed.",
			});
		} finally {
			setLoading(false);
		}
	}

	if (mode === "forgot-password") {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Reset password</CardTitle>
					<CardDescription>Send a reset link to the admin email address.</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="grid gap-4" onSubmit={handlePasswordResetRequest}>
						<div className="grid gap-2">
							<Label htmlFor="reset-email">Email</Label>
							<Input
								id="reset-email"
								type="email"
								autoComplete="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								required
							/>
						</div>
						<FormFeedback feedback={feedback} />
						<div className="grid gap-2 sm:grid-cols-2">
							<Button type="submit" disabled={loading}>
								<Mail className="h-4 w-4" />
								{loading ? "Sending..." : "Send reset link"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => {
									setFeedback(null);
									setMode("sign-in");
								}}
							>
								Sign in
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sign in</CardTitle>
				<CardDescription>Use the admin account created for this project.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="grid gap-4" onSubmit={handleSubmit}>
					<div className="grid gap-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							required
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor="password">Password</Label>
						<Input
							id="password"
							type="password"
							autoComplete="current-password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							required
						/>
					</div>
					<FormFeedback feedback={feedback} />
					<Button type="submit" disabled={loading}>
						<LockKeyhole className="h-4 w-4" />
						{loading ? "Signing in..." : "Sign in"}
					</Button>
					<Button
						type="button"
						variant="link"
						className="h-auto justify-self-start p-0"
						onClick={() => {
							setFeedback(null);
							setMode("forgot-password");
						}}
					>
						Forgot password?
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function getPasswordResetRedirectUrl(): string {
	if (typeof window === "undefined") {
		return "/reset-password";
	}

	return `${window.location.origin}/reset-password`;
}

export function ResetPasswordScreen(props: { token: string }) {
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [feedback, setFeedback] = useState<FormFeedbackState>(
		props.token
			? null
			: {
					type: "error",
					message: "Invalid reset link.",
				},
	);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);

		if (!props.token) {
			setFeedback({ type: "error", message: "Invalid reset link." });
			return;
		}
		if (password.length < 8 || password.length > 128) {
			setFeedback({
				type: "error",
				message: "Password must contain between 8 and 128 characters.",
			});
			return;
		}
		if (password !== confirmPassword) {
			setFeedback({ type: "error", message: "Passwords do not match." });
			return;
		}

		setLoading(true);
		try {
			const { error } = await authClient.resetPassword({
				newPassword: password,
				token: props.token,
			});
			if (error) {
				throw new Error(error.message ?? "Password reset failed.");
			}
			setPassword("");
			setConfirmPassword("");
			setFeedback({
				type: "success",
				message: "Password updated. You can sign in with the new password.",
			});
			redirectToSignInAfterPasswordReset();
		} catch (err) {
			setFeedback({
				type: "error",
				message: err instanceof Error ? err.message : "Password reset failed.",
			});
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Reset password</CardTitle>
					<CardDescription>Choose a new password for the admin account.</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="grid gap-4" onSubmit={handleSubmit}>
						<div className="grid gap-2">
							<Label htmlFor="new-password">New password</Label>
							<Input
								id="new-password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								minLength={8}
								maxLength={128}
								disabled={!props.token}
								required
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="confirm-password">Confirm password</Label>
							<Input
								id="confirm-password"
								type="password"
								autoComplete="new-password"
								value={confirmPassword}
								onChange={(event) => setConfirmPassword(event.target.value)}
								minLength={8}
								maxLength={128}
								disabled={!props.token}
								required
							/>
						</div>
						<FormFeedback feedback={feedback} />
						<Button type="submit" disabled={!props.token || loading}>
							<LockKeyhole className="h-4 w-4" />
							{loading ? "Updating..." : "Update password"}
						</Button>
						<Button type="button" variant="outline" onClick={() => goToSignIn()}>
							Sign in
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}

function BootstrapCard(props: { onBootstrapped: () => void }) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [token, setToken] = useState("");
	const [feedback, setFeedback] = useState<FormFeedbackState>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);
		setLoading(true);
		try {
			const response = await fetch("/api/admin/bootstrap", {
				method: "POST",
				headers: jsonBodyHeaders,
				body: JSON.stringify({ name, email, password, bootstrapToken: token }),
			});
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(payload?.error ?? "Bootstrap failed.");
			}
			setFeedback({
				type: "success",
				message: "Admin account created. Sign in with the new credentials.",
			});
			props.onBootstrapped();
		} catch (err) {
			setFeedback({
				type: "error",
				message: err instanceof Error ? err.message : "Bootstrap failed.",
			});
		} finally {
			setLoading(false);
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Bootstrap first admin</CardTitle>
				<CardDescription>Requires the one-time BOOTSTRAP_ADMIN_TOKEN secret.</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="grid gap-4" onSubmit={handleSubmit}>
					<div className="grid gap-2 md:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="bootstrap-name">Name</Label>
							<Input
								id="bootstrap-name"
								autoComplete="name"
								value={name}
								onChange={(event) => setName(event.target.value)}
								required
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="bootstrap-email">Email</Label>
							<Input
								id="bootstrap-email"
								type="email"
								autoComplete="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								required
							/>
						</div>
					</div>
					<div className="grid gap-2 md:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="bootstrap-password">Password</Label>
							<Input
								id="bootstrap-password"
								type="password"
								autoComplete="new-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								minLength={8}
								maxLength={128}
								required
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="bootstrap-token">Bootstrap token</Label>
							<Input
								id="bootstrap-token"
								type="password"
								autoComplete="one-time-code"
								value={token}
								onChange={(event) => setToken(event.target.value)}
								required
							/>
						</div>
					</div>
					<FormFeedback feedback={feedback} />
					<Button type="submit" variant="outline" disabled={loading}>
						<CheckCircle2 className="h-4 w-4" />
						{loading ? "Creating..." : "Create first admin"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

export function FormFeedback(props: { feedback: FormFeedbackState }) {
	if (!props.feedback) {
		return null;
	}

	if (props.feedback.type === "error") {
		return (
			<Alert variant="destructive">
				<AlertTriangle className="h-4 w-4" />
				<AlertTitle>Request failed</AlertTitle>
				<AlertDescription>{props.feedback.message}</AlertDescription>
			</Alert>
		);
	}

	return (
		<Alert role="status">
			<CheckCircle2 className="h-4 w-4" />
			<AlertTitle>Done</AlertTitle>
			<AlertDescription>{props.feedback.message}</AlertDescription>
		</Alert>
	);
}

function UserMenu(props: { user: AdminUser; onSignOut: () => void }) {
	const initials = useMemo(() => {
		return props.user.name
			.split(" ")
			.map((part) => part[0])
			.join("")
			.slice(0, 2)
			.toUpperCase();
	}, [props.user.name]);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" className="h-10 gap-3 px-2">
					<Avatar className="h-8 w-8">
						<AvatarFallback>{initials || "AD"}</AvatarFallback>
					</Avatar>
					<span className="hidden text-sm md:inline">{props.user.email}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>{props.user.name}</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={props.onSignOut}>
					<LogOut className="h-4 w-4" />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function OverviewCards(props: { safety: SafetyResponse | null }) {
	const emergency = props.safety?.status.emergencyStopEnabled ?? false;
	const publicApi = props.safety?.status.publicApiEnabled ?? true;
	const emails = props.safety?.status.emailNotificationsEnabled ?? true;

	return (
		<div className="grid gap-4 md:grid-cols-3">
			<StatusCard title="Public API" enabled={publicApi} />
			<StatusCard title="Email notifications" enabled={emails} />
			<StatusCard title="Emergency stop" enabled={!emergency} inverted />
		</div>
	);
}

function StatusCard(props: { title: string; enabled: boolean; inverted?: boolean }) {
	const healthy = props.inverted ? props.enabled : props.enabled;
	return (
		<Card>
			<CardHeader className="flex-row items-center justify-between space-y-0">
				<CardTitle className="text-sm font-medium">{props.title}</CardTitle>
				<Badge variant={healthy ? "secondary" : "destructive"}>{healthy ? "Ready" : "Paused"}</Badge>
			</CardHeader>
		</Card>
	);
}

function SafetyPanel(props: {
	safety: SafetyResponse | null;
	onUpdate: (updates: Record<string, boolean | number>) => void;
}) {
	const safety = props.safety;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Safety Controls</CardTitle>
				<CardDescription>Runtime switches stored in D1.</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				<SafetySwitch
					label="Public API"
					checked={safety?.status.publicApiEnabled ?? true}
					onCheckedChange={(checked) => props.onUpdate({ public_api_enabled: checked })}
				/>
				<Separator />
				<SafetySwitch
					label="Email notifications"
					checked={safety?.status.emailNotificationsEnabled ?? true}
					onCheckedChange={(checked) => props.onUpdate({ email_notifications_enabled: checked })}
				/>
				<Separator />
				<SafetySwitch
					label="Emergency stop"
					checked={safety?.status.emergencyStopEnabled ?? false}
					onCheckedChange={(checked) => props.onUpdate({ emergency_stop_enabled: checked })}
				/>
			</CardContent>
		</Card>
	);
}

function SafetySwitch(props: {
	label: string;
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<Label className="text-sm font-medium">{props.label}</Label>
			<Switch checked={props.checked} onCheckedChange={props.onCheckedChange} />
		</div>
	);
}

function MonitoringPanel() {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Monitoring Links</CardTitle>
				<CardDescription>Cloudflare and provider dashboards for live usage review.</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
					{monitoringLinks.map((link) => (
						<Button key={link.title} asChild variant="outline" className="justify-between">
							<a href={link.href} target="_blank" rel="noreferrer">
								<span className="inline-flex items-center gap-2">
									<link.icon className="h-4 w-4" />
									{link.title}
								</span>
								<ExternalLink className="h-4 w-4" />
							</a>
						</Button>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

function LoadingScreen() {
	return (
		<div className="flex min-h-screen items-center justify-center bg-muted/40">
			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<Activity className="h-4 w-4 animate-pulse" />
				Loading admin
			</div>
		</div>
	);
}

export default App;
