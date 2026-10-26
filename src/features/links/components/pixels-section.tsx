"use client";

import { ChevronDown } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import type { LinkFormValues } from "./link-form";

/**
 * Retargeting pixels: visitors see a short consent page, then the Meta Pixel and/or Google tag run
 * before they are forwarded. Collapsed unless the link already has some.
 */
export function PixelsSection({
  form,
  enabled,
}: {
  form: UseFormReturn<LinkFormValues>;
  /** Whether the instance lets links use pixels; when off the fields are explained, not hidden. */
  enabled: boolean;
}) {
  const { meta, google } = form.getValues("pixels");
  const rootError = (form.formState.errors.pixels as { message?: string } | undefined)?.message;

  return (
    <details
      className="group rounded-2xl border bg-card shadow-paper"
      open={Boolean(meta || google || rootError)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl px-6 py-5 font-display text-xl outline-none focus-visible:ring-4 focus-visible:ring-ring/25">
        Retargeting pixels
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-4 px-6 pb-6">
        <p className="text-sm text-muted-foreground">
          Build an audience from people who click this link, even when it points to someone else&apos;s page.
          Visitors see a short page asking before the tags run, and anyone sending a Global Privacy Control or
          Do Not Track signal goes straight through. Not available on password-protected links.
        </p>
        {enabled ? null : (
          <p className="rounded-md bg-muted px-3 py-2 text-sm" data-testid="pixels-disabled">
            Pixels are switched off on this instance, so they are saved but not used. An administrator can
            turn them on in the admin settings.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="pixels.meta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Meta Pixel ID</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" placeholder="123456789012345" autoComplete="off" {...field} />
                </FormControl>
                <FormDescription>Digits only, from Meta Events Manager.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="pixels.google"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Google tag ID</FormLabel>
                <FormControl>
                  <Input placeholder="G-ABCD1234" autoComplete="off" className="font-mono" {...field} />
                </FormControl>
                <FormDescription>GA4 (G-), Google Ads (AW-) or Tag Manager (GTM-).</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        {rootError ? (
          <p className="text-sm text-destructive" role="alert">
            {rootError}
          </p>
        ) : null}
      </div>
    </details>
  );
}
