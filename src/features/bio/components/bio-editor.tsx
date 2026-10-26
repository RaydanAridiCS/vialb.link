"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useMemo, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
import { CopyButton } from "@/components/copy-button";
import { PalettePicker } from "@/components/palette-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  handleProblem,
  normalizeHandle,
  normalizeSocialUrl,
  SOCIAL_PLATFORMS,
  SOCIAL_RULES,
  type SocialLink,
  type SocialPlatform,
} from "@/lib/bio";
import { LIMITS } from "@/lib/constants";
import { formatNumber } from "@/lib/format";
import type { PaletteKey } from "@/lib/palettes";
import { cn } from "@/lib/utils";
import type {
  BioButtonDto,
  BioEditorDto,
  BioPageDto,
  BioProfileDto,
  HandleCheck,
} from "@/server/services/bio.service";
import {
  addBioButtonAction,
  checkBioHandleAction,
  deleteBioPageAction,
  removeBioButtonAction,
  reorderBioButtonsAction,
  saveBioProfileAction,
  updateBioButtonAction,
} from "../actions";
import { addBioButtonSchema, saveBioProfileSchema, updateBioButtonSchema } from "../schemas";
import { BioPageView } from "./bio-page-view";

interface BioFormValues {
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  theme: PaletteKey;
  socials: { platform: SocialPlatform; value: string }[];
  showBadge: boolean;
  isPublished: boolean;
}

interface Suggestion {
  handle: string;
  displayName: string;
}

/** Saved socials are stored as URLs; show an email without its mailto: prefix. */
function socialValue(social: SocialLink): string {
  return social.platform === "email" ? social.url.replace(/^mailto:/, "") : social.url;
}

function valuesFrom(profile: BioProfileDto | null, suggestion: Suggestion): BioFormValues {
  return {
    handle: profile?.handle ?? suggestion.handle,
    displayName: profile ? (profile.displayName ?? "") : suggestion.displayName,
    bio: profile?.bio ?? "",
    avatarUrl: profile?.avatarUrl ?? "",
    theme: profile?.theme ?? "paper",
    socials: profile?.socials.map((s) => ({ platform: s.platform, value: socialValue(s) })) ?? [],
    showBadge: profile?.showBadge ?? true,
    isPublished: profile?.isPublished ?? false,
  };
}

const STATUS_LABELS: Record<BioButtonDto["link"]["status"], string> = {
  active: "Live",
  disabled: "Disabled",
  expired: "Expired",
  limit_reached: "Visit limit reached",
};

export function BioEditor({
  initial,
  siteUrl,
  suggestion,
}: {
  initial: BioEditorDto;
  siteUrl: string;
  suggestion: Suggestion;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial.profile);
  const [buttons, setButtons] = useState(initial.buttons);
  const [handleStatus, setHandleStatus] = useState<HandleCheck | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const form = useForm<BioFormValues>({
    resolver: zodResolver(saveBioProfileSchema) as unknown as Resolver<BioFormValues>,
    defaultValues: valuesFrom(profile, suggestion),
  });
  const socialRows = useFieldArray({ control: form.control, name: "socials" });
  const values = useWatch({ control: form.control });

  const save = useAction(saveBioProfileAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      setProfile(data.profile);
      form.reset(valuesFrom(data.profile, suggestion));
      setHandleStatus(null);
      toast.success(data.profile.isPublished ? "Page saved and live" : "Page saved");
      router.refresh();
    },
    onError: ({ error }) => {
      toast.error(error.serverError ?? "Please check the form for errors");
      if (error.serverError?.toLowerCase().includes("handle")) {
        form.setError("handle", { message: error.serverError });
      }
    },
  });
  const check = useAction(checkBioHandleAction, { onSuccess: ({ data }) => setHandleStatus(data ?? null) });
  const removePage = useAction(deleteBioPageAction, {
    onSuccess: () => {
      toast.success("Bio page deleted");
      setProfile(null);
      setButtons([]);
      form.reset(valuesFrom(null, suggestion));
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Could not delete the page"),
  });

  function checkHandle(raw: string) {
    const handle = normalizeHandle(raw);
    if (!handle || handle === profile?.handle || handleProblem(handle)) {
      setHandleStatus(null);
      return;
    }
    check.execute({ handle });
  }

  // The preview follows the form as you type; only buttons come from the saved state.
  const preview = useMemo<BioPageDto>(() => {
    const socials: SocialLink[] = [];
    for (const row of values.socials ?? []) {
      if (!row?.platform || !row.value) continue;
      const result = normalizeSocialUrl(row.platform, row.value);
      if (result.ok) socials.push({ platform: row.platform, url: result.url });
    }
    const avatar = values.avatarUrl?.trim() ?? "";
    return {
      handle: normalizeHandle(values.handle ?? "") || "yourname",
      displayName: values.displayName?.trim() || null,
      bio: values.bio?.trim() || null,
      avatarUrl: avatar.startsWith("https://") ? avatar : null,
      theme: values.theme ?? "paper",
      socials,
      showBadge: values.showBadge ?? true,
      buttons: buttons.filter((b) => b.isVisible).map((b) => ({ id: b.id, label: b.label, href: "#" })),
    };
  }, [values, buttons]);

  function onSubmit(next: BioFormValues) {
    save.execute({ ...next, socials: next.socials.filter((row) => row.value.trim().length > 0) });
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl">Your page</CardTitle>
                <CardDescription>
                  {profile
                    ? "Changes appear on your public page as soon as you save."
                    : "Pick a handle and fill in a few details. You can publish when you are ready."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <FormField
                  control={form.control}
                  name="handle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Handle</FormLabel>
                      <div className="flex items-center">
                        <span className="flex h-9 items-center rounded-l-lg border border-r-0 border-input bg-muted px-3 font-mono text-sm text-muted-foreground">
                          {siteUrl.replace(/^https?:\/\//, "")}/@
                        </span>
                        <FormControl>
                          <Input
                            className="rounded-l-none font-mono"
                            autoComplete="off"
                            autoCapitalize="none"
                            spellCheck={false}
                            {...field}
                            onBlur={(event) => {
                              field.onBlur();
                              checkHandle(event.target.value);
                            }}
                          />
                        </FormControl>
                      </div>
                      <p
                        aria-live="polite"
                        className={cn(
                          "min-h-4 text-xs",
                          handleStatus?.available ? "text-success" : "text-destructive",
                        )}
                        data-testid="handle-status"
                      >
                        {check.isPending
                          ? "Checking…"
                          : handleStatus
                            ? handleStatus.available
                              ? "Available"
                              : handleStatus.reason
                            : ""}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="displayName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Alice Example" autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="avatarUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Picture link (optional)</FormLabel>
                        <FormControl>
                          <Input type="url" placeholder="https://…/me.jpg" autoComplete="off" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea rows={3} placeholder="A line or two about you" {...field} />
                      </FormControl>
                      <FormDescription>
                        {[...field.value].length}/{LIMITS.bioTextMax}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="theme"
                  render={({ field }) => (
                    <FormItem>
                      <PalettePicker
                        name="theme"
                        legend="Look"
                        value={field.value}
                        onChange={field.onChange}
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="font-display text-xl">Social links</CardTitle>
                <CardDescription>
                  Shown as round icons under your bio. Use a profile link, or just a handle for most networks.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {socialRows.fields.map((row, index) => (
                  <div key={row.id} className="flex items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`socials.${index}.platform`}
                      render={({ field }) => (
                        <FormItem className="w-32 shrink-0 sm:w-40">
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger aria-label={`Network for link ${index + 1}`}>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {SOCIAL_PLATFORMS.map((platform) => (
                                <SelectItem key={platform} value={platform}>
                                  {SOCIAL_RULES[platform].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`socials.${index}.value`}
                      render={({ field }) => (
                        <FormItem className="min-w-0 flex-1">
                          <FormControl>
                            <Input
                              aria-label={`Link ${index + 1}`}
                              placeholder="@handle or https://…"
                              autoComplete="off"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => socialRows.remove(index)}
                      aria-label={`Remove link ${index + 1}`}
                    >
                      <X className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={socialRows.fields.length >= LIMITS.bioSocialsMax}
                  onClick={() => socialRows.append({ platform: "instagram", value: "" })}
                >
                  <Plus className="size-4" aria-hidden /> Add a social link
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-5 pt-6">
                <FormField
                  control={form.control}
                  name="isPublished"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <FormLabel>Published</FormLabel>
                        <FormDescription>
                          {field.value
                            ? "Anyone with the link can see your page."
                            : "Only you can see this draft."}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="showBadge"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <FormLabel>Show &ldquo;Powered by&rdquo; badge</FormLabel>
                        <FormDescription>
                          A small credit at the bottom of your page. Totally optional.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={save.isPending} data-testid="bio-save">
                    {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    {profile ? "Save changes" : "Create page"}
                  </Button>
                  {profile ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 className="size-4" aria-hidden /> Delete page
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </form>
        </Form>

        <ButtonsCard enabled={profile !== null} buttons={buttons} onChange={setButtons} />
      </div>

      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start" aria-label="Preview">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">Preview</h2>
          {profile ? (
            <Badge variant={profile.isPublished ? "default" : "secondary"}>
              {profile.isPublished ? "Published" : "Draft"}
            </Badge>
          ) : null}
        </div>
        <div
          className="h-[34rem] overflow-y-auto overscroll-contain rounded-[2rem] border-4 border-foreground/80 shadow-sm"
          data-testid="bio-preview"
        >
          <BioPageView page={preview} preview />
        </div>
        {profile ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
              {profile.pageUrl}
            </code>
            <CopyButton value={profile.pageUrl} label="Copy link" />
            {profile.isPublished ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/@${profile.handle}`} target="_blank">
                  <ExternalLink className="size-4" aria-hidden /> Open
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </aside>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your bio page?</AlertDialogTitle>
            <AlertDialogDescription>
              The page and all its buttons stop working right away, and the links behind the buttons are
              removed. Your handle becomes available to others.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => removePage.execute({})}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ButtonsCard({
  enabled,
  buttons,
  onChange,
}: {
  enabled: boolean;
  buttons: BioButtonDto[];
  onChange: (buttons: BioButtonDto[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ label: "", url: "" });
  const [draftError, setDraftError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<BioButtonDto | null>(null);
  const previous = useRef<BioButtonDto[]>(buttons);

  const add = useAction(addBioButtonAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      onChange([...buttons, data.button]);
      setLabel("");
      setUrl("");
      setError(null);
      toast.success("Button added");
    },
    onError: ({ error: e }) => setError(e.serverError ?? "Could not add the button"),
  });
  const update = useAction(updateBioButtonAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      onChange(buttons.map((b) => (b.id === data.button.id ? data.button : b)));
      setEditingId(null);
      setDraftError(null);
    },
    onError: ({ error: e }) => {
      if (editingId) setDraftError(e.serverError ?? "Could not save the button");
      else toast.error(e.serverError ?? "Could not update the button");
    },
  });
  const remove = useAction(removeBioButtonAction, {
    onSuccess: ({ input }) => {
      onChange(buttons.filter((b) => b.id !== input.id));
      toast.success("Button removed");
    },
    onError: ({ error: e }) => toast.error(e.serverError ?? "Could not remove the button"),
  });
  const reorder = useAction(reorderBioButtonsAction, {
    onError: ({ error: e }) => {
      onChange(previous.current);
      toast.error(e.serverError ?? "Could not change the order");
    },
  });

  function submitAdd(event: React.FormEvent) {
    event.preventDefault();
    const parsed = addBioButtonSchema.safeParse({ label, url });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the button");
      return;
    }
    setError(null);
    add.execute(parsed.data);
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= buttons.length) return;
    previous.current = buttons;
    const next = [...buttons];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onChange(next.map((b, position) => ({ ...b, position })));
    reorder.execute({ ids: next.map((b) => b.id) });
  }

  function startEdit(button: BioButtonDto) {
    setEditingId(button.id);
    setDraft({ label: button.label, url: button.link.destinationUrl });
    setDraftError(null);
  }

  function saveEdit(button: BioButtonDto) {
    const parsed = updateBioButtonSchema.safeParse({
      id: button.id,
      label: draft.label,
      url: draft.url,
    });
    if (!parsed.success) {
      setDraftError(parsed.error.issues[0]?.message ?? "Check the button");
      return;
    }
    update.execute(parsed.data);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">Buttons</CardTitle>
        <CardDescription>
          {enabled
            ? `Up to ${LIMITS.bioButtonsMax} buttons. Each one is a short link, so you see how often it is clicked.`
            : "Create your page first, then add buttons here."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          onSubmit={submitAdd}
          noValidate
          className="grid gap-3 sm:grid-cols-[1fr_1.4fr_auto]"
          aria-label="Add a button"
        >
          <Input
            aria-label="Button label"
            placeholder="Label, e.g. My shop"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={!enabled}
            autoComplete="off"
          />
          <Input
            aria-label="Button link"
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!enabled}
            autoComplete="off"
          />
          <Button
            type="submit"
            disabled={!enabled || add.isPending || buttons.length >= LIMITS.bioButtonsMax}
            data-testid="bio-add-button"
          >
            {add.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="size-4" aria-hidden />
            )}
            Add
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-3">
              {error}
            </p>
          ) : null}
        </form>

        {buttons.length > 0 ? (
          <ul className="divide-y rounded-lg border" data-testid="bio-buttons">
            {buttons.map((button, index) => (
              <li key={button.id} className="space-y-3 p-3">
                {editingId === button.id ? (
                  <div className="space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        aria-label={`Label for ${button.label}`}
                        value={draft.label}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                      />
                      <Input
                        aria-label={`Link for ${button.label}`}
                        type="url"
                        value={draft.url}
                        onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                      />
                    </div>
                    {draftError ? (
                      <p role="alert" className="text-sm text-destructive">
                        {draftError}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(button)} disabled={update.isPending}>
                        <Check className="size-4" aria-hidden /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn("truncate font-medium", !button.isVisible && "text-muted-foreground")}>
                        {button.label}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{button.link.destinationUrl}</p>
                    </div>
                    <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                      <p>
                        <span className="font-medium text-foreground">
                          {formatNumber(button.link.clickCount)}
                        </span>{" "}
                        clicks
                      </p>
                      {button.link.status !== "active" ? (
                        <p className="text-warning">{STATUS_LABELS[button.link.status]}</p>
                      ) : !button.isVisible ? (
                        <p>Hidden</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${button.label} up`}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${button.label} down`}
                        disabled={index === buttons.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${button.isVisible ? "Hide" : "Show"} ${button.label}`}
                        aria-pressed={!button.isVisible}
                        onClick={() => update.execute({ id: button.id, isVisible: !button.isVisible })}
                      >
                        {button.isVisible ? (
                          <Eye className="size-4" aria-hidden />
                        ) : (
                          <EyeOff className="size-4" aria-hidden />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${button.label}`}
                        onClick={() => startEdit(button)}
                      >
                        <Pencil className="size-4" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${button.label}`}
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRemoving(button)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : enabled ? (
          <p className="text-sm text-muted-foreground">No buttons yet. Add your first one above.</p>
        ) : null}
      </CardContent>

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove &ldquo;{removing?.label}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The button disappears from your page and its short link stops working. Its click history is
              kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (removing) remove.execute({ id: removing.id });
                setRemoving(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
