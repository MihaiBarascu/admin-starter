import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	Activity,
	AlertTriangle,
	BellRing,
	Bot,
	CheckCircle2,
	Database,
	ExternalLink,
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

interface AdminUser {
	id: string;
	name: string;
	email: string;
}

interface SafetyResponse {
	settings: Record<string, string | null>;
	status: {
		publicApiEnabled: boolean;
		emailNotificationsEnabled: boolean;
		emergencyStopEnabled: boolean;
	};
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

function App() {
	const [user, setUser] = useState<AdminUser | null>(null);
	const [safety, setSafety] = useState<SafetyResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [authError, setAuthError] = useState<string | null>(null);

	const loadSafety = useCallback(async () => {
		const response = await fetch("/api/admin/safety", { credentials: "include" });
		if (!response.ok) {
			throw new Error("Safety settings could not be loaded.");
		}
		setSafety((await response.json()) as SafetyResponse);
	}, []);

	const refreshSession = useCallback(async () => {
		setLoading(true);
		setAuthError(null);
		try {
			const response = await fetch("/api/auth/get-session", { credentials: "include" });
			if (!response.ok) {
				throw new Error("Session check failed.");
			}
			const payload = (await response.json()) as { user?: AdminUser } | null;
			if (!payload?.user) {
				setUser(null);
				return;
			}
			setUser(payload.user);
			await loadSafety();
		} catch (error) {
			setAuthError(error instanceof Error ? error.message : "Could not load session.");
		} finally {
			setLoading(false);
		}
	}, [loadSafety]);

	useEffect(() => {
		void refreshSession();
	}, [refreshSession]);

	async function updateSafety(updates: Record<string, boolean | number>) {
		const response = await fetch("/api/admin/safety", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify(updates),
		});
		if (!response.ok) {
			throw new Error("Safety settings could not be updated.");
		}
		await loadSafety();
	}

	async function handleSignOut() {
		await fetch("/api/auth/sign-out", {
			method: "POST",
			credentials: "include",
		});
		setUser(null);
		setSafety(null);
	}

	if (loading) {
		return <LoadingScreen />;
	}

	if (!user) {
		return <AuthScreen error={authError} onAuthenticated={() => void refreshSession()} />;
	}

	return (
		<div className="min-h-screen bg-muted/40">
			<div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
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
						<Button variant="secondary" className="justify-start">
							<LayoutDashboard className="h-4 w-4" />
							Dashboard
						</Button>
						<Button variant="ghost" className="justify-start">
							<Shield className="h-4 w-4" />
							Safety
						</Button>
						<Button variant="ghost" className="justify-start">
							<Activity className="h-4 w-4" />
							Monitoring
						</Button>
					</nav>
				</aside>

				<div className="flex min-w-0 flex-col">
					<header className="flex h-14 items-center justify-between border-b bg-background px-4 lg:px-6">
						<div>
							<p className="text-sm font-medium">Admin Starter</p>
							<p className="text-xs text-muted-foreground">D1 + Drizzle + Better Auth</p>
						</div>
						<UserMenu user={user} onSignOut={() => void handleSignOut()} />
					</header>

					<main className="flex-1 space-y-6 p-4 lg:p-6">
						<OverviewCards safety={safety} />
						<SafetyPanel safety={safety} onUpdate={(updates) => void updateSafety(updates)} />
						<MonitoringPanel />
					</main>
				</div>
			</div>
		</div>
	);
}

function AuthScreen(props: { error: string | null; onAuthenticated: () => void }) {
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

				<div className="grid gap-4">
					<LoginCard onAuthenticated={props.onAuthenticated} />
					<BootstrapCard onBootstrapped={props.onAuthenticated} />
				</div>
			</div>
		</div>
	);
}

function LoginCard(props: { onAuthenticated: () => void }) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const response = await fetch("/api/auth/sign-in/email", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ email, password, rememberMe: true }),
			});
			if (!response.ok) {
				throw new Error("Invalid email or password.");
			}
			props.onAuthenticated();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed.");
		} finally {
			setLoading(false);
		}
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
					{error ? <p className="text-sm text-destructive">{error}</p> : null}
					<Button type="submit" disabled={loading}>
						<LockKeyhole className="h-4 w-4" />
						{loading ? "Signing in..." : "Sign in"}
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}

function BootstrapCard(props: { onBootstrapped: () => void }) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [token, setToken] = useState("");
	const [feedback, setFeedback] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setFeedback(null);
		setLoading(true);
		try {
			const response = await fetch("/api/admin/bootstrap", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, email, password, bootstrapToken: token }),
			});
			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as { error?: string } | null;
				throw new Error(payload?.error ?? "Bootstrap failed.");
			}
			setFeedback("Admin account created. Sign in with the new credentials.");
			props.onBootstrapped();
		} catch (err) {
			setFeedback(err instanceof Error ? err.message : "Bootstrap failed.");
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
							/>
						</div>
					</div>
					{feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
					<Button type="submit" variant="outline" disabled={loading}>
						<CheckCircle2 className="h-4 w-4" />
						{loading ? "Creating..." : "Create first admin"}
					</Button>
				</form>
			</CardContent>
		</Card>
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
