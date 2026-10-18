"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { toast } from "sonner";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCESS_LIMIT_PRESET_LABELS,
  ACCESS_LIMIT_PRESETS,
  DEFAULT_QR_BG,
  DEFAULT_QR_FG,
  EXPIRATION_PRESET_LABELS,
  EXPIRATION_PRESETS,
  LIMITS,
  type AccessLimitPreset,
  type ExpirationPreset,
} from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import type { LinkDto } from "@/server/services/dto";
import { createLinkAction, updateLinkAction } from "../actions";
import { createLinkSchema, updateLinkSchema } from "../schemas";
import { QrPreview } from "./qr-preview";

interface LinkFormValues {
  id: string;
  destinationUrl: string;
  customCode: string;
  title: string;
  expiration: ExpirationPreset | "keep";
  expiresAt: string;
  accessLimit: AccessLimitPreset;
  maxClicks: string;
  password: string;
  passwordAction: "keep" | "set" | "remove";
  isEnabled: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  qrFgColor: string;
  qrBgColor: string;
}

/** ISO → value for <input type="datetime-local"> in the browser's timezone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(local: string): string | undefined {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function defaultsFor(link?: LinkDto): LinkFormValues {
  const presetLimit = link?.maxClicks == null ? "unlimited" : String(link.maxClicks);
  const isPreset =
    (ACCESS_LIMIT_PRESETS as readonly string[]).includes(presetLimit) && presetLimit !== "custom";
  return {
    id: link?.id ?? "",
    destinationUrl: link?.destinationUrl ?? "",
    customCode: "",
    title: link?.title ?? "",
    expiration: link ? "keep" : "never",
    expiresAt: toLocalInput(link?.expiresAt ?? null),
    accessLimit: (isPreset ? presetLimit : "custom") as AccessLimitPreset,
    maxClicks: isPreset ? "" : String(link?.maxClicks ?? ""),
    password: "",
    passwordAction: "keep",
    isEnabled: link?.isEnabled ?? true,
    ogTitle: link?.ogTitle ?? "",
    ogDescription: link?.ogDescription ?? "",
    ogImageUrl: link?.ogImageUrl ?? "",
    qrFgColor: link?.qrFgColor ?? DEFAULT_QR_FG,
    qrBgColor: link?.qrBgColor ?? DEFAULT_QR_BG,
  };
}

export function LinkForm({ link, siteUrl }: { link?: LinkDto; siteUrl: string }) {
  const router = useRouter();
  const mode = link ? "edit" : "create";
  const form = useForm<LinkFormValues>({
    resolver: zodResolver(
      mode === "create" ? createLinkSchema : updateLinkSchema,
    ) as unknown as Resolver<LinkFormValues>,
    defaultValues: defaultsFor(link),
  });
  const [expiration, accessLimit, passwordAction, qrFg, qrBg, customCode] = useWatch({
    control: form.control,
    name: ["expiration", "accessLimit", "passwordAction", "qrFgColor", "qrBgColor", "customCode"],
  });

  const onError = ({ error }: { error: { serverError?: string } }) => {
    toast.error(error.serverError ?? "Please check the form for errors");
    if (error.serverError?.toLowerCase().includes("code"))
      form.setError("customCode", { message: error.serverError });
    else if (error.serverError) form.setError("destinationUrl", { message: error.serverError });
  };
  const create = useAction(createLinkAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      toast.success("Link created", { description: data.link.shortUrl });
      router.push(`/dashboard/links/${data.link.id}`);
    },
    onError,
  });
  const update = useAction(updateLinkAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      toast.success("Link updated");
      router.push(`/dashboard/links/${data.link.id}`);
      router.refresh();
    },
    onError,
  });
  const pending = create.isPending || update.isPending;

  function onSubmit(values: LinkFormValues) {
    const shared = {
      destinationUrl: values.destinationUrl,
      title: values.title,
      expiresAt: values.expiration === "custom" ? toIso(values.expiresAt) : undefined,
      accessLimit: values.accessLimit,
      maxClicks: values.maxClicks,
      ogTitle: values.ogTitle,
      ogDescription: values.ogDescription,
      ogImageUrl: values.ogImageUrl,
      qrFgColor: values.qrFgColor,
      qrBgColor: values.qrBgColor,
    };
    if (mode === "create") {
      create.execute({
        ...shared,
        customCode: values.customCode,
        expiration: values.expiration === "keep" ? "never" : values.expiration,
        password: values.password,
      });
    } else {
      update.execute({
        ...shared,
        id: values.id,
        expiration: values.expiration,
        passwordAction: values.passwordAction,
        password: values.password,
        isEnabled: values.isEnabled,
      });
    }
  }

  const previewUrl = link?.shortUrl ?? `${siteUrl}/${customCode || "your-code"}`;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-3" noValidate>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Destination</CardTitle>
              <CardDescription>Where should this link take people?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="destinationUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Long URL</FormLabel>
                    <FormControl>
                      <Input
                        type="url"
                        placeholder="https://example.com/a/very/long/path"
                        autoFocus={!link}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {mode === "create" ? (
                <FormField
                  control={form.control}
                  name="customCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom code (optional)</FormLabel>
                      <div className="flex items-center">
                        <span className="flex h-9 items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">
                          {siteUrl.replace(/^https?:\/\//, "")}/
                        </span>
                        <FormControl>
                          <Input className="rounded-l-none" placeholder="launch-2026" {...field} />
                        </FormControl>
                      </div>
                      <FormDescription>
                        3–50 letters, numbers, - or _. Case-sensitive and permanent.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="text-sm">
                  <span className="text-muted-foreground">Short link: </span>
                  <span className="font-mono">{link?.shortUrl}</span>
                  <span className="text-muted-foreground"> (codes can&apos;t be changed)</span>
                </div>
              )}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title (optional)</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={LIMITS.titleMax}
                        placeholder="Spring campaign landing page"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {mode === "edit" ? (
                <FormField
                  control={form.control}
                  name="isEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <FormLabel>Enabled</FormLabel>
                        <FormDescription>
                          Disabled links show a &quot;link disabled&quot; page.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Limits & protection</CardTitle>
              <CardDescription>Expire the link, cap its visits or require a password.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="expiration"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiration</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {mode === "edit" ? (
                          <SelectItem value="keep">
                            Keep current ({link?.expiresAt ? formatDateTime(link.expiresAt) : "never"})
                          </SelectItem>
                        ) : null}
                        {EXPIRATION_PRESETS.map((preset) => (
                          <SelectItem key={preset} value={preset}>
                            {EXPIRATION_PRESET_LABELS[preset]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {expiration === "custom" ? (
                <FormField
                  control={form.control}
                  name="expiresAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expires at</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormDescription>Your local time. At most 1 year ahead.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="hidden sm:block" />
              )}
              <FormField
                control={form.control}
                name="accessLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access limit</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ACCESS_LIMIT_PRESETS.map((preset) => (
                          <SelectItem key={preset} value={preset}>
                            {ACCESS_LIMIT_PRESET_LABELS[preset]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {link ? <FormDescription>Used so far: {link.clickCount}</FormDescription> : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              {accessLimit === "custom" ? (
                <FormField
                  control={form.control}
                  name="maxClicks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Maximum visits</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          max={LIMITS.maxClicksMax}
                          inputMode="numeric"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="hidden sm:block" />
              )}

              {mode === "edit" ? (
                <FormField
                  control={form.control}
                  name="passwordAction"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="flex flex-wrap gap-4"
                        >
                          {(
                            [
                              ["keep", link?.hasPassword ? "Keep current password" : "No password"],
                              ["set", link?.hasPassword ? "Change password" : "Add a password"],
                              ...(link?.hasPassword ? [["remove", "Remove password"] as const] : []),
                            ] as const
                          ).map(([value, label]) => (
                            <label key={value} className="flex items-center gap-2 text-sm">
                              <RadioGroupItem value={value} /> {label}
                            </label>
                          ))}
                        </RadioGroup>
                      </FormControl>
                    </FormItem>
                  )}
                />
              ) : null}
              {mode === "create" || passwordAction === "set" ? (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>{mode === "create" ? "Password (optional)" : "New password"}</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          maxLength={LIMITS.passwordMax}
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Visitors must enter it before being redirected. Link previews never reveal the
                        destination.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}
            </CardContent>
          </Card>

          <details className="group rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 font-semibold">
              Link preview (Open Graph)
              <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="space-y-4 px-6 pb-6">
              <p className="text-sm text-muted-foreground">
                Controls the card shown when the link is shared in Slack, Discord, X, WhatsApp, …
              </p>
              <FormField
                control={form.control}
                name="ogTitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preview title</FormLabel>
                    <FormControl>
                      <Input maxLength={LIMITS.ogTitleMax} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ogDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preview description</FormLabel>
                    <FormControl>
                      <Textarea rows={3} maxLength={LIMITS.ogDescriptionMax} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ogImageUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preview image URL</FormLabel>
                    <FormControl>
                      <Input type="url" placeholder="https://…/cover.png" {...field} />
                    </FormControl>
                    <FormDescription>Must be an https:// URL (1200×630 recommended).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </details>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>QR code</CardTitle>
              <CardDescription>Default colours for downloads.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-center">
                <QrPreview value={previewUrl} fg={qrFg} bg={qrBg} size={176} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["qrFgColor", "qrBgColor"] as const).map((name) => (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{name === "qrFgColor" ? "Foreground" : "Background"}</FormLabel>
                        <div className="flex gap-2">
                          <input
                            type="color"
                            aria-label={`${name === "qrFgColor" ? "Foreground" : "Background"} colour picker`}
                            value={/^#[0-9a-fA-F]{6}$/.test(field.value) ? field.value : "#000000"}
                            onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                            className="h-9 w-10 cursor-pointer rounded-md border bg-transparent p-1"
                          />
                          <FormControl>
                            <Input className="font-mono" maxLength={7} {...field} />
                          </FormControl>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="flex gap-2 lg:sticky lg:top-32">
            <Button type="submit" className="flex-1" disabled={pending} data-testid="link-submit">
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "create" ? "Create link" : "Save changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
