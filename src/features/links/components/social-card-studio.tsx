"use client";

import { ChevronDown, Download, Wand2 } from "lucide-react";
import { useState } from "react";
import { useWatch, type UseFormReturn } from "react-hook-form";
import { PalettePicker } from "@/components/palette-picker";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { APP_NAME, LIMITS } from "@/lib/constants";
import {
  CARD_HEADLINE_MAX,
  CARD_SUBLINE_MAX,
  CARD_TEMPLATE_LABELS,
  CARD_TEMPLATES,
  composeCardSvg,
  DEFAULT_CARD_DESIGN,
  type CardDesign,
} from "@/lib/social-card";
import { cn } from "@/lib/utils";
import type { LinkDto } from "@/server/services/dto";
import type { LinkFormValues } from "./link-form";
import { SocialPreviews } from "./social-previews";

type ImageMode = "none" | "card" | "url";

const MODES: { value: ImageMode; label: string; hint: string }[] = [
  { value: "none", label: "No image", hint: "Just the title and description" },
  { value: "card", label: "Designed card", hint: "Made here, no upload needed" },
  { value: "url", label: "Image link", hint: "An image that is already online" },
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * The link's social preview: the text crawlers read, an optional designed card (drawn by Vialb, so
 * nothing to upload) or an image link, and mock-ups of how the result looks in WhatsApp, iMessage,
 * Slack and X. Lives inside the link form and edits its `ogTitle`, `ogDescription`, `ogImageUrl`
 * and `cardDesign` values.
 */
export function SocialCardStudio({
  form,
  siteUrl,
  link,
}: {
  form: UseFormReturn<LinkFormValues>;
  siteUrl: string;
  link?: LinkDto;
}) {
  const [ogTitle, ogDescription, ogImageUrl, cardDesign, title, destinationUrl, customCode] = useWatch({
    control: form.control,
    name: ["ogTitle", "ogDescription", "ogImageUrl", "cardDesign", "title", "destinationUrl", "customCode"],
  });
  const [mode, setMode] = useState<ImageMode>(cardDesign ? "card" : ogImageUrl ? "url" : "none");
  const [dark, setDark] = useState(false);

  const siteHost = hostOf(siteUrl) || siteUrl;
  const previewTitle = ogTitle.trim() || title.trim() || hostOf(destinationUrl) || "Untitled link";
  const headlineSeed = (ogTitle.trim() || title.trim()).slice(0, CARD_HEADLINE_MAX);

  function chooseMode(next: ImageMode) {
    setMode(next);
    // No `shouldDirty`: react-hook-form throws when it diffs a saved card object against `null`, and
    // nothing in this form reads the dirty state anyway.
    const touch = { shouldValidate: true } as const;
    if (next === "card") {
      form.setValue("cardDesign", cardDesign ?? { ...DEFAULT_CARD_DESIGN, headline: headlineSeed }, touch);
      form.setValue("ogImageUrl", "", touch);
    } else {
      form.setValue("cardDesign", null, touch);
      if (next === "none") form.setValue("ogImageUrl", "", touch);
    }
  }

  function updateCard(patch: Partial<CardDesign>) {
    form.setValue(
      "cardDesign",
      { ...(cardDesign ?? DEFAULT_CARD_DESIGN), ...patch },
      { shouldValidate: true },
    );
  }

  const cardErrors = form.formState.errors.cardDesign;
  const design = mode === "card" ? cardDesign : null;
  const imageSrc =
    design !== null && design !== undefined
      ? svgDataUri(
          composeCardSvg({ ...design, headline: design.headline.trim() || "Your headline" }, siteHost),
        )
      : mode === "url" && ogImageUrl.startsWith("https://")
        ? ogImageUrl
        : null;

  return (
    <details className="group rounded-2xl border bg-card shadow-paper" open={mode !== "none" || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-6 py-5 font-display text-xl outline-none focus-visible:ring-4 focus-visible:ring-ring/25">
        Social preview
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-6 px-6 pb-6">
        <p className="text-sm text-muted-foreground">
          What people see when this link is shared in WhatsApp, iMessage, Slack, X and other apps.
        </p>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="ogTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preview title</FormLabel>
                <FormControl>
                  <Input
                    maxLength={LIMITS.ogTitleMax}
                    placeholder={title || "Defaults to the link title"}
                    {...field}
                  />
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
                  <Textarea rows={2} maxLength={LIMITS.ogDescriptionMax} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm leading-none font-medium">Preview image</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((option) => (
              <label key={option.value} className="relative cursor-pointer">
                <input
                  type="radio"
                  name="social-image-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => chooseMode(option.value)}
                  className="peer sr-only"
                />
                <span className="block rounded-lg border bg-background px-3 py-2.5 peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {mode === "card" && cardDesign ? (
          <div className="space-y-5 rounded-xl border bg-background/60 p-4" data-testid="card-controls">
            <fieldset>
              <legend className="mb-2 text-sm leading-none font-medium">Layout</legend>
              <div className="grid grid-cols-3 gap-2">
                {CARD_TEMPLATES.map((template) => (
                  <label key={template} className="relative cursor-pointer">
                    <input
                      type="radio"
                      name="card-template"
                      value={template}
                      checked={cardDesign.template === template}
                      onChange={() => updateCard({ template })}
                      className="peer sr-only"
                    />
                    <span className="block rounded-lg border bg-card py-2 text-center text-sm peer-checked:border-primary peer-checked:ring-1 peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                      {CARD_TEMPLATE_LABELS[template]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <PalettePicker
              name="card-palette"
              legend="Colours"
              value={cardDesign.palette}
              onChange={(palette) => updateCard({ palette })}
            />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="card-headline">Headline</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!headlineSeed || headlineSeed === cardDesign.headline}
                  onClick={() => updateCard({ headline: headlineSeed })}
                >
                  <Wand2 className="size-3.5" aria-hidden /> Use the title
                </Button>
              </div>
              <Input
                id="card-headline"
                value={cardDesign.headline}
                placeholder="The big text on the card"
                autoComplete="off"
                aria-invalid={Boolean(cardErrors?.headline)}
                onChange={(event) => updateCard({ headline: event.target.value })}
              />
              <p className="flex justify-between text-xs text-muted-foreground">
                <span
                  role={cardErrors?.headline ? "alert" : undefined}
                  className={cn(cardErrors?.headline && "text-destructive")}
                >
                  {cardErrors?.headline?.message}
                </span>
                <span>
                  {[...cardDesign.headline].length}/{CARD_HEADLINE_MAX}
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="card-subline">Subtitle (optional)</Label>
              <Input
                id="card-subline"
                value={cardDesign.subline}
                placeholder="A line of detail underneath"
                autoComplete="off"
                aria-invalid={Boolean(cardErrors?.subline)}
                onChange={(event) => updateCard({ subline: event.target.value })}
              />
              <p className="flex justify-between text-xs text-muted-foreground">
                <span
                  role={cardErrors?.subline ? "alert" : undefined}
                  className={cn(cardErrors?.subline && "text-destructive")}
                >
                  {cardErrors?.subline?.message}
                </span>
                <span>
                  {[...cardDesign.subline].length}/{CARD_SUBLINE_MAX}
                </span>
              </p>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="card-host">Show the link&apos;s address</Label>
                <p className="text-xs text-muted-foreground">{siteHost} in the corner of the card.</p>
              </div>
              <Switch
                id="card-host"
                checked={cardDesign.showHost}
                onCheckedChange={(showHost) => updateCard({ showHost })}
              />
            </div>

            {link?.cardDesign ? (
              <Button variant="outline" size="sm" asChild>
                <a href={`/${encodeURIComponent(link.code)}/card?download=1`} download>
                  <Download className="size-4" aria-hidden /> Download the saved card (PNG)
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        {mode === "url" ? (
          <FormField
            control={form.control}
            name="ogImageUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Image link</FormLabel>
                <FormControl>
                  <Input type="url" placeholder="https://…/cover.png" {...field} />
                </FormControl>
                <FormDescription>Must be an https:// link to an image (1200×630 works best).</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg">How it will look</h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="preview-dark" className="text-xs text-muted-foreground">
                Dark mode
              </Label>
              <Switch id="preview-dark" checked={dark} onCheckedChange={setDark} />
            </div>
          </div>
          <SocialPreviews
            title={previewTitle}
            description={ogDescription.trim()}
            host={siteHost}
            shortUrl={link?.shortUrl ?? `${siteUrl}/${customCode || "your-code"}`}
            siteName={APP_NAME}
            imageSrc={imageSrc}
            dark={dark}
          />
          <p className="text-xs text-muted-foreground">
            Approximate: each app changes its look from time to time, and some cache a link&apos;s preview for
            a while.
          </p>
        </div>
      </div>
    </details>
  );
}
