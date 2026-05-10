import { AlertTriangle, Pencil, Plus, Trash2, FileText } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useState, type FormEvent } from "react";
import {
	createEmptyFormDraft,
	draftToUpsertRequest,
	formToDraft,
	type AdminForm,
	type AdminFormField,
	type AdminFormFieldType,
	type FormDraft,
	type UpsertAdminFormRequest,
} from "./lib/forms-admin-model";

type FormsPanelProps = {
	forms: AdminForm[];
	onSave?: (slug: string, request: UpsertAdminFormRequest) => Promise<void> | void;
};

const fieldTypeOptions: Array<{ value: AdminFormFieldType; label: string }> = [
	{ value: "text", label: "Text" },
	{ value: "email", label: "Email" },
	{ value: "textarea", label: "Textarea" },
	{ value: "checkbox", label: "Checkbox" },
];

export function FormsPanel(props: FormsPanelProps) {
	const [draft, setDraft] = useState<FormDraft | null>(null);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	function openCreateDialog() {
		setFeedback(null);
		setDraft(createEmptyFormDraft());
	}

	function openEditDialog(form: AdminForm) {
		setFeedback(null);
		setDraft(formToDraft(form));
	}

	function closeDialog() {
		if (saving) {
			return;
		}
		setDraft(null);
		setFeedback(null);
	}

	async function handleSave(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!draft) {
			return;
		}

		try {
			setSaving(true);
			setFeedback(null);
			const payload = draftToUpsertRequest(draft);
			await props.onSave?.(payload.slug, payload.request);
			setDraft(null);
		} catch (error) {
			setFeedback(error instanceof Error ? error.message : "Form could not be saved.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<Card>
				<CardHeader>
					<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle>Forms</CardTitle>
							<CardDescription>
								Dynamic forms stored in D1 and submitted through the public API.
							</CardDescription>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="secondary">{props.forms.length} configured</Badge>
							<Button type="button" onClick={openCreateDialog}>
								<Plus className="h-4 w-4" />
								New form
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					{props.forms.length === 0 ? (
						<div className="flex min-h-28 items-center justify-center rounded-md border border-dashed px-4 text-center text-sm text-muted-foreground">
							Create the first form from this page or run the forms seed from GitHub Actions.
						</div>
					) : (
						<div className="overflow-x-auto">
							<Table className="min-w-[860px]">
								<TableHeader>
									<TableRow>
										<TableHead>Name</TableHead>
										<TableHead>Endpoint</TableHead>
										<TableHead>Fields</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Notification</TableHead>
										<TableHead className="text-right">Actions</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{props.forms.map((form) => (
										<TableRow key={form.id}>
											<TableCell className="font-medium">
												<span className="inline-flex items-center gap-2">
													<FileText className="h-4 w-4 text-muted-foreground" />
													{form.name}
												</span>
											</TableCell>
											<TableCell>
												<code className="rounded bg-muted px-2 py-1 text-xs">
													/api/forms/{form.slug}/submissions
												</code>
											</TableCell>
											<TableCell>
												<span className="text-sm text-muted-foreground">
													{form.schema.fields.map((field) => field.name).join(", ")}
												</span>
											</TableCell>
											<TableCell>
												<div className="flex gap-2">
													<Badge variant={form.enabled ? "secondary" : "destructive"}>
														{form.enabled ? "Enabled" : "Paused"}
													</Badge>
													{form.turnstileRequired ? (
														<Badge variant="outline">Turnstile</Badge>
													) : null}
												</div>
											</TableCell>
											<TableCell>
												<span className="text-sm text-muted-foreground">
													{form.notificationEmail ?? "Not set"}
												</span>
											</TableCell>
											<TableCell className="text-right">
												<Button
													type="button"
													variant="outline"
													size="sm"
													onClick={() => openEditDialog(form)}
												>
													<Pencil className="h-4 w-4" />
													Edit
												</Button>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			<FormEditorDialog
				draft={draft}
				feedback={feedback}
				saving={saving}
				onClose={closeDialog}
				onSave={handleSave}
				onDraftChange={setDraft}
			/>
		</>
	);
}

function FormEditorDialog(props: {
	draft: FormDraft | null;
	feedback: string | null;
	saving: boolean;
	onClose: () => void;
	onSave: (event: FormEvent<HTMLFormElement>) => void;
	onDraftChange: (draft: FormDraft) => void;
}) {
	const draft = props.draft;

	function updateDraft(patch: Partial<FormDraft>) {
		if (!draft) {
			return;
		}
		props.onDraftChange({ ...draft, ...patch });
	}

	function updateField(index: number, patch: Partial<AdminFormField>) {
		if (!draft) {
			return;
		}
		props.onDraftChange({
			...draft,
			fields: draft.fields.map((field, fieldIndex) =>
				fieldIndex === index ? { ...field, ...patch } : field,
			),
		});
	}

	function addField() {
		if (!draft) {
			return;
		}
		props.onDraftChange({
			...draft,
			fields: [
				...draft.fields,
				{
					name: `field_${draft.fields.length + 1}`,
					label: `Field ${draft.fields.length + 1}`,
					type: "text",
					required: false,
					maxLength: 500,
				},
			],
		});
	}

	function removeField(index: number) {
		if (!draft || draft.fields.length <= 1) {
			return;
		}
		props.onDraftChange({
			...draft,
			fields: draft.fields.filter((_, fieldIndex) => fieldIndex !== index),
		});
	}

	return (
		<Dialog open={draft !== null} onOpenChange={(open) => (open ? undefined : props.onClose())}>
			<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{draft?.existingSlug ? "Edit form" : "New form"}</DialogTitle>
					<DialogDescription>
						Configure the public endpoint, notification target and allowed fields.
					</DialogDescription>
				</DialogHeader>

				{draft ? (
					<form className="grid gap-5" onSubmit={props.onSave}>
						{props.feedback ? (
							<Alert variant="destructive">
								<AlertTriangle className="h-4 w-4" />
								<AlertTitle>Form error</AlertTitle>
								<AlertDescription>{props.feedback}</AlertDescription>
							</Alert>
						) : null}

						<div className="grid gap-4 md:grid-cols-2">
							<div className="grid gap-2">
								<Label htmlFor="form-slug">Slug</Label>
								<Input
									id="form-slug"
									value={draft.slug}
									disabled={Boolean(draft.existingSlug)}
									onChange={(event) => updateDraft({ slug: event.target.value })}
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="form-name">Name</Label>
								<Input
									id="form-name"
									value={draft.name}
									onChange={(event) => updateDraft({ name: event.target.value })}
								/>
							</div>
							<div className="grid gap-2 md:col-span-2">
								<Label htmlFor="form-notification-email">Notification email</Label>
								<Input
									id="form-notification-email"
									type="email"
									value={draft.notificationEmail}
									onChange={(event) =>
										updateDraft({ notificationEmail: event.target.value })
									}
								/>
							</div>
						</div>

						<div className="grid gap-3 rounded-md border p-3">
							<FormToggle
								label="Enabled"
								checked={draft.enabled}
								onCheckedChange={(checked) => updateDraft({ enabled: checked })}
							/>
							<FormToggle
								label="Require Turnstile"
								checked={draft.turnstileRequired}
								onCheckedChange={(checked) =>
									updateDraft({ turnstileRequired: checked })
								}
							/>
						</div>

						<div className="grid gap-3">
							<div className="flex items-center justify-between gap-3">
								<Label>Fields</Label>
								<Button type="button" variant="outline" size="sm" onClick={addField}>
									<Plus className="h-4 w-4" />
									Add field
								</Button>
							</div>

							<div className="grid gap-3">
								{draft.fields.map((field, index) => (
									<div key={index} className="grid gap-3 rounded-md border p-3">
										<div className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto]">
											<div className="grid gap-2">
												<Label htmlFor={`field-name-${index}`}>Name</Label>
												<Input
													id={`field-name-${index}`}
													value={field.name}
													onChange={(event) =>
														updateField(index, { name: event.target.value })
													}
												/>
											</div>
											<div className="grid gap-2">
												<Label htmlFor={`field-label-${index}`}>Label</Label>
												<Input
													id={`field-label-${index}`}
													value={field.label ?? ""}
													onChange={(event) =>
														updateField(index, { label: event.target.value })
													}
												/>
											</div>
											<div className="grid gap-2">
												<Label>Type</Label>
												<Select
													value={field.type}
													onValueChange={(value) =>
														updateField(index, {
															type: value as AdminFormFieldType,
														})
													}
												>
													<SelectTrigger className="w-full">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{fieldTypeOptions.map((option) => (
															<SelectItem key={option.value} value={option.value}>
																{option.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											</div>
											<div className="flex items-end justify-end">
												<Button
													type="button"
													variant="ghost"
													size="icon"
													disabled={draft.fields.length <= 1}
													onClick={() => removeField(index)}
												>
													<Trash2 className="h-4 w-4" />
													<span className="sr-only">Remove field</span>
												</Button>
											</div>
										</div>

										<div className="grid gap-3 md:grid-cols-[1fr_160px]">
											<div className="flex items-center gap-2">
												<Checkbox
													id={`field-required-${index}`}
													checked={field.required ?? false}
													onCheckedChange={(checked) =>
														updateField(index, { required: checked === true })
													}
												/>
												<Label htmlFor={`field-required-${index}`}>Required</Label>
											</div>
											<div className="grid gap-2">
												<Label htmlFor={`field-max-length-${index}`}>Max length</Label>
												<Input
													id={`field-max-length-${index}`}
													type="number"
													min={1}
													max={5000}
													value={field.maxLength ?? ""}
													onChange={(event) =>
														updateField(index, {
															maxLength: event.target.value
																? Number(event.target.value)
																: undefined,
														})
													}
												/>
											</div>
										</div>
									</div>
								))}
							</div>
						</div>

						<DialogFooter>
							<Button type="button" variant="outline" onClick={props.onClose}>
								Cancel
							</Button>
							<Button type="submit" disabled={props.saving}>
								{props.saving ? "Saving" : "Save form"}
							</Button>
						</DialogFooter>
					</form>
				) : null}
			</DialogContent>
		</Dialog>
	);
}

function FormToggle(props: {
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
