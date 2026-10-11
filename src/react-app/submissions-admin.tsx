import { AlertTriangle, Eye, Inbox, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { AdminForm } from "./lib/forms-admin-model";
import {
	ALL_FORMS_FILTER,
	buildSubmissionsUrl,
	formatSubmissionDate,
	formatSubmissionValue,
	getSubmissionPreview,
	type AdminSubmission,
	type AdminSubmissionPage,
} from "./lib/submissions-admin-model";

const jsonHeaders = { Accept: "application/json" };

async function readError(response: Response, fallback: string): Promise<Error> {
	const payload = (await response.json().catch(() => null)) as { error?: string } | null;
	return new Error(payload?.error ?? fallback);
}

/** Data-loading container for the Submissions admin page. */
export function SubmissionsPage(props: { forms: AdminForm[] }) {
	const [formFilter, setFormFilter] = useState(ALL_FORMS_FILTER);
	const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
	const [nextCursor, setNextCursor] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const loadPage = useCallback(
		async (cursor: string | null): Promise<AdminSubmissionPage> => {
			const response = await fetch(buildSubmissionsUrl({ form: formFilter, cursor }), {
				headers: jsonHeaders,
				credentials: "include",
			});
			if (!response.ok) {
				throw await readError(response, "Submissions could not be loaded.");
			}
			return (await response.json()) as AdminSubmissionPage;
		},
		[formFilter],
	);

	const reload = useCallback(async () => {
		setLoading(true);
		try {
			const page = await loadPage(null);
			setSubmissions(page.submissions);
			setNextCursor(page.nextCursor);
			setError(null);
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : "Submissions could not be loaded.");
		} finally {
			setLoading(false);
		}
	}, [loadPage]);

	useEffect(() => {
		// Reload the first page whenever the form filter changes.
		void reload();
	}, [reload]);

	async function loadMore() {
		if (!nextCursor) {
			return;
		}
		setLoading(true);
		try {
			const page = await loadPage(nextCursor);
			setSubmissions((current) => [...current, ...page.submissions]);
			setNextCursor(page.nextCursor);
			setError(null);
		} catch (loadError) {
			setError(loadError instanceof Error ? loadError.message : "Submissions could not be loaded.");
		} finally {
			setLoading(false);
		}
	}

	async function deleteSubmission(id: string) {
		const response = await fetch(`/api/admin/forms/submissions/${encodeURIComponent(id)}`, {
			method: "DELETE",
			headers: jsonHeaders,
			credentials: "include",
		});
		if (!response.ok) {
			throw await readError(response, "Submission could not be deleted.");
		}
		setSubmissions((current) => current.filter((submission) => submission.id !== id));
	}

	return (
		<SubmissionsPanel
			forms={props.forms}
			formFilter={formFilter}
			submissions={submissions}
			hasMore={nextCursor !== null}
			loading={loading}
			error={error}
			onFormFilterChange={setFormFilter}
			onLoadMore={() => void loadMore()}
			onRefresh={() => void reload()}
			onDelete={deleteSubmission}
		/>
	);
}

type SubmissionsPanelProps = {
	forms: AdminForm[];
	formFilter: string;
	submissions: AdminSubmission[];
	hasMore: boolean;
	loading?: boolean;
	error?: string | null;
	onFormFilterChange?: (form: string) => void;
	onLoadMore?: () => void;
	onRefresh?: () => void;
	onDelete?: (id: string) => Promise<void>;
};

export function SubmissionsPanel(props: SubmissionsPanelProps) {
	const [selected, setSelected] = useState<AdminSubmission | null>(null);

	return (
		<>
			<Card>
				<CardHeader>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
						<div>
							<CardTitle>Submissions</CardTitle>
							<CardDescription>
								Messages received through the public form endpoints, newest first.
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-end gap-2">
							<div className="grid gap-2">
								<Label className="text-xs text-muted-foreground">Form</Label>
								<Select value={props.formFilter} onValueChange={props.onFormFilterChange}>
									<SelectTrigger className="w-48" aria-label="Filter by form">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ALL_FORMS_FILTER}>All forms</SelectItem>
										{props.forms.map((form) => (
											<SelectItem key={form.id} value={form.slug}>
												{form.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<Button
								type="button"
								variant="outline"
								disabled={props.loading}
								onClick={props.onRefresh}
							>
								<RefreshCw className="h-4 w-4" />
								Refresh
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent className="grid gap-4">
					{props.error ? (
						<Alert variant="destructive">
							<AlertTriangle className="h-4 w-4" />
							<AlertTitle>Submissions error</AlertTitle>
							<AlertDescription>{props.error}</AlertDescription>
						</Alert>
					) : null}

					{props.submissions.length === 0 ? (
						<div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
							<Inbox className="h-5 w-5" />
							{props.loading ? "Loading submissions" : "No submissions yet."}
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table className="min-w-[860px]">
								<TableHeader>
									<TableRow>
										<TableHead>Received</TableHead>
										<TableHead>Form</TableHead>
										<TableHead>Submitter</TableHead>
										<TableHead>Message</TableHead>
										<TableHead>Origin</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{props.submissions.map((submission) => (
										<TableRow key={submission.id}>
											<TableCell className="whitespace-nowrap text-sm">
												{formatSubmissionDate(submission.createdAt)}
											</TableCell>
											<TableCell>
												<Badge variant="secondary">{submission.formName}</Badge>
											</TableCell>
											<TableCell className="text-sm">
												{submission.submitterEmail ?? (
													<span className="text-muted-foreground">Unknown</span>
												)}
											</TableCell>
											<TableCell className="max-w-72 truncate text-sm text-muted-foreground">
												{getSubmissionPreview(submission)}
											</TableCell>
											<TableCell className="text-xs text-muted-foreground">
												{submission.origin ?? "Unknown"}
											</TableCell>
											<TableCell className="text-right">
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => setSelected(submission)}
												>
													<Eye className="h-4 w-4" />
													View
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}

					{props.hasMore ? (
						<div className="flex justify-center">
							<Button
								type="button"
								variant="outline"
								disabled={props.loading}
								onClick={props.onLoadMore}
							>
								{props.loading ? "Loading" : "Load more"}
							</Button>
						</div>
					) : null}
				</CardContent>
			</Card>

			<SubmissionDetailDialog
				submission={selected}
				onClose={() => setSelected(null)}
				onDelete={async (id) => {
					await props.onDelete?.(id);
					setSelected(null);
				}}
			/>
		</>
	);
}

function SubmissionDetailDialog(props: {
	submission: AdminSubmission | null;
	onClose: () => void;
	onDelete: (id: string) => Promise<void>;
}) {
	const [confirming, setConfirming] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState<string | null>(null);
	const submission = props.submission;

	function close() {
		if (deleting) {
			return;
		}
		setConfirming(false);
		setDeleteError(null);
		props.onClose();
	}

	async function confirmDelete() {
		if (!submission) {
			return;
		}
		try {
			setDeleting(true);
			setDeleteError(null);
			await props.onDelete(submission.id);
			setConfirming(false);
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : "Submission could not be deleted.");
			// Return to the detail view, which shows the error.
			setConfirming(false);
		} finally {
			setDeleting(false);
		}
	}

	return (
		<>
			<Dialog
				open={submission !== null && !confirming}
				onOpenChange={(open) => (open ? undefined : close())}
			>
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>{submission?.formName ?? "Submission"}</DialogTitle>
						<DialogDescription>
							{submission ? `Received ${formatSubmissionDate(submission.createdAt)}` : null}
						</DialogDescription>
					</DialogHeader>

					{submission ? (
						<div className="grid gap-4">
							{deleteError ? (
								<Alert variant="destructive">
									<AlertTriangle className="h-4 w-4" />
									<AlertTitle>Delete failed</AlertTitle>
									<AlertDescription>{deleteError}</AlertDescription>
								</Alert>
							) : null}

							<dl className="grid gap-3">
								{Object.entries(submission.payload).map(([name, value]) => (
									<div key={name} className="grid gap-1">
										<dt className="text-xs font-medium text-muted-foreground">{name}</dt>
										<dd className="whitespace-pre-wrap break-words text-sm">
											{formatSubmissionValue(value)}
										</dd>
									</div>
								))}
							</dl>

							<Separator />

							<dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-[120px_1fr]">
								<dt>Form</dt>
								<dd className="break-all">/api/forms/{submission.formSlug}/submissions</dd>
								<dt>Origin</dt>
								<dd className="break-all">{submission.origin ?? "Unknown"}</dd>
								<dt>Submitter</dt>
								<dd className="break-all">{submission.submitterEmail ?? "Unknown"}</dd>
								<dt>User agent</dt>
								<dd className="break-all">{submission.userAgent ?? "Unknown"}</dd>
								<dt>ID</dt>
								<dd className="break-all font-mono">{submission.id}</dd>
							</dl>
						</div>
					) : null}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={close}>
							Close
						</Button>
						<Button type="button" variant="destructive" onClick={() => setConfirming(true)}>
							<Trash2 className="h-4 w-4" />
							Delete
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={submission !== null && confirming}
				onOpenChange={(open) => (open || deleting ? undefined : setConfirming(false))}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Delete submission?</DialogTitle>
						<DialogDescription>
							This permanently removes the submission from D1. It cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							disabled={deleting}
							onClick={() => setConfirming(false)}
						>
							Cancel
						</Button>
						<Button
							type="button"
							variant="destructive"
							disabled={deleting}
							onClick={() => void confirmDelete()}
						>
							{deleting ? "Deleting" : "Delete submission"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
