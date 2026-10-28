"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { InstanceSettings, InstanceSettingsOverride } from "@/server/domain/types";
import { previewRetentionAction, updateInstanceSettingsAction } from "../actions";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

type Tri = "default" | "on" | "off";
const tri = (v: boolean | null): Tri => (v === null ? "default" : v ? "on" : "off");

export function InstanceSettingsForm({
  overrides,
  defaults,
  effective,
}: {
  overrides: InstanceSettingsOverride;
  defaults: InstanceSettings;
  effective: InstanceSettings;
}) {
  const router = useRouter();
  const [anon, setAnon] = useState<Tri>(tri(overrides.allowAnonymousLinks));
  const [signups, setSignups] = useState<Tri>(tri(overrides.allowSignups));
  const [pixels, setPixels] = useState<Tri>(tri(overrides.pixelsEnabled));
  const [health, setHealth] = useState<Tri>(tri(overrides.healthMonitorEnabled));
  const [reports, setReports] = useState<Tri>(tri(overrides.weeklyReportEnabled));
  const [reportDay, setReportDay] = useState(overrides.reportSendDay?.toString() ?? "");
  const [reportHour, setReportHour] = useState(overrides.reportSendHourUtc?.toString() ?? "");
  const [twoFactor, setTwoFactor] = useState<Tri>(tri(overrides.requireAdmin2fa));
  const [branding, setBranding] = useState({
    brandName: overrides.branding?.brandName ?? "",
    accentColor: overrides.branding?.accentColor ?? "",
    logoUrl: overrides.branding?.logoUrl ?? "",
    notFoundMessage: overrides.branding?.notFoundMessage ?? "",
    goneMessage: overrides.branding?.goneMessage ?? "",
    homeLabel: overrides.branding?.homeLabel ?? "",
    homeUrl: overrides.branding?.homeUrl ?? "",
  });
  const setBrand = (key: keyof typeof branding) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setBranding((current) => ({ ...current, [key]: e.target.value }));
  const [retention, setRetention] = useState(overrides.clickRetentionDays?.toString() ?? "");
  const preview = useAction(previewRetentionAction);
  useEffect(() => {
    const days = Number(retention);
    if (retention === "" || !Number.isInteger(days) || days < 1) return;
    const handle = setTimeout(() => preview.execute({ days }), 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `preview.execute` is stable
  }, [retention]);
  const checked = preview.result.data;
  const retentionNote =
    checked && checked.days === Number(retention)
      ? checked.wouldDelete === 0
        ? "Nothing is older than this today."
        : `${checked.wouldDelete.toLocaleString("en")} of ${checked.total.toLocaleString("en")} stored clicks are older than this and would be deleted by the next daily run.`
      : null;
  const [ttl, setTtl] = useState(overrides.anonLinkTtlHours?.toString() ?? "");
  const [domainsMode, setDomainsMode] = useState<"default" | "custom">(
    overrides.blockedDomains ? "custom" : "default",
  );
  const [domains, setDomains] = useState((overrides.blockedDomains ?? []).join("\n"));

  const save = useAction(updateInstanceSettingsAction, {
    onSuccess: () => {
      toast.success("Instance settings saved");
      router.refresh();
    },
    onError: ({ error }) => toast.error(error.serverError ?? "Please check the values"),
  });

  const onOff = (value: boolean) => (value ? "on" : "off");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-xl">Instance settings</CardTitle>
        <CardDescription>
          Environment variables provide the defaults; values saved here override them until reset to
          “Default”.
        </CardDescription>
      </CardHeader>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.execute({
            allowAnonymousLinks: anon,
            allowSignups: signups,
            pixelsEnabled: pixels,
            healthMonitorEnabled: health,
            weeklyReportEnabled: reports,
            reportSendDay: reportDay === "" ? "" : Number(reportDay),
            reportSendHourUtc: reportHour === "" ? "" : Number(reportHour),
            clickRetentionDays: retention === "" ? "" : Number(retention),
            requireAdmin2fa: twoFactor,
            branding,
            anonLinkTtlHours: ttl === "" ? "" : Number(ttl),
            blockedDomains: domains,
            blockedDomainsMode: domainsMode,
          });
        }}
      >
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="anon">Anonymous link creation</Label>
            <Select value={anon} onValueChange={(v) => setAnon(v as Tri)}>
              <SelectTrigger id="anon" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default ({onOff(defaults.allowAnonymousLinks)})</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Currently: {onOff(effective.allowAnonymousLinks)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signups">New sign-ups</Label>
            <Select value={signups} onValueChange={(v) => setSignups(v as Tri)}>
              <SelectTrigger id="signups" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default ({onOff(defaults.allowSignups)})</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Currently: {onOff(effective.allowSignups)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pixels">Retargeting pixels</Label>
            <Select value={pixels} onValueChange={(v) => setPixels(v as Tri)}>
              <SelectTrigger id="pixels" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default ({onOff(defaults.pixelsEnabled)})</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Currently: {onOff(effective.pixelsEnabled)}. When on, links with Meta or Google tags show a
              consent page first. Update your privacy policy before enabling.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="health">Link health monitor</Label>
            <Select value={health} onValueChange={(v) => setHealth(v as Tri)}>
              <SelectTrigger id="health" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default ({onOff(defaults.healthMonitorEnabled)})</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Currently: {onOff(effective.healthMonitorEnabled)}. When on, the server periodically requests
              each link&apos;s destination and flags broken ones in the dashboard.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reports">Weekly report emails</Label>
            <Select value={reports} onValueChange={(v) => setReports(v as Tri)}>
              <SelectTrigger id="reports" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default ({onOff(defaults.weeklyReportEnabled)})</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Currently: {onOff(effective.weeklyReportEnabled)}. Workspace owners and admins get a summary of
              the past week (and a list of broken links when the health monitor is on). Needs SMTP; each
              person can opt out in their settings.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-day">Report day and hour (UTC)</Label>
            <div className="flex gap-2">
              <Select
                value={reportDay === "" ? "default" : reportDay}
                onValueChange={(v) => setReportDay(v === "default" ? "" : v)}
              >
                <SelectTrigger id="report-day" className="w-full" aria-label="Report day">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default ({WEEKDAYS[defaults.reportSendDay]})</SelectItem>
                  {WEEKDAYS.map((name, index) => (
                    <SelectItem key={name} value={String(index)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                min={0}
                max={23}
                aria-label="Report hour (UTC)"
                className="w-24"
                placeholder={String(defaults.reportSendHourUtc)}
                value={reportHour}
                onChange={(e) => setReportHour(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Currently: {WEEKDAYS[effective.reportSendDay]} at{" "}
              {String(effective.reportSendHourUtc).padStart(2, "0")}:00 UTC.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="retention">Keep click data for (days)</Label>
            <Input
              id="retention"
              type="number"
              min={0}
              max={3650}
              placeholder={`Default: ${defaults.clickRetentionDays === 0 ? "forever" : defaults.clickRetentionDays}`}
              value={retention}
              onChange={(e) => setRetention(e.target.value)}
            />
            <p className="text-xs text-muted-foreground" data-testid="retention-note">
              {retentionNote ??
                `Currently: ${effective.clickRetentionDays === 0 ? "kept forever" : `${effective.clickRetentionDays} days`}. 0 keeps everything. Older clicks are deleted for good (totals on links stay).`}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-2fa">Require two-factor for administrators</Label>
            <Select value={twoFactor} onValueChange={(v) => setTwoFactor(v as Tri)}>
              <SelectTrigger id="admin-2fa" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default ({onOff(defaults.requireAdmin2fa)})</SelectItem>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Currently: {onOff(effective.requireAdmin2fa)}. Administrators without it are sent to their
              settings to set it up before they can use this area. You need it on your own account to switch
              this on. If someone is locked out, set{" "}
              <span className="font-mono">ADMIN_2FA_EMERGENCY_OFF=true</span> and restart. Administrators who
              sign in only with GitHub or Google (no password) are not affected.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ttl">Anonymous link lifetime (hours)</Label>
            <Input
              id="ttl"
              type="number"
              min={1}
              max={8760}
              placeholder={`Default: ${defaults.anonLinkTtlHours}`}
              value={ttl}
              onChange={(e) => setTtl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Leave empty to use the default.</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="domains-mode">Blocked domains</Label>
            <Select value={domainsMode} onValueChange={(v) => setDomainsMode(v as "default" | "custom")}>
              <SelectTrigger id="domains-mode" className="w-full sm:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default (none)</SelectItem>
                <SelectItem value="custom">Custom list</SelectItem>
              </SelectContent>
            </Select>
            {domainsMode === "custom" ? (
              <Textarea
                aria-label="Blocked domains, one per line"
                rows={8}
                className="font-mono text-sm"
                placeholder={"evil.example\nphishing.test"}
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
              />
            ) : null}
            <p className="text-xs text-muted-foreground">
              One domain per line. Subdomains are blocked too. Applies to new links and destination edits.
            </p>
          </div>
        </CardContent>
        <CardContent className="mt-2 border-t pt-6" data-testid="branding-section">
          <h3 className="font-display text-lg">Not-found and gone pages</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Make the pages visitors see for missing, expired and disabled links match your brand. Leave
            everything empty for the default look.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Name</Label>
              <Input
                id="brand-name"
                maxLength={40}
                value={branding.brandName}
                onChange={setBrand("brandName")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-accent">Accent colour</Label>
              <div className="flex gap-2">
                <Input
                  id="brand-accent"
                  placeholder="#1A7F5A"
                  maxLength={7}
                  value={branding.accentColor}
                  onChange={setBrand("accentColor")}
                />
                <span
                  aria-hidden
                  className="size-9 shrink-0 rounded-md border"
                  style={{
                    backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(branding.accentColor)
                      ? branding.accentColor
                      : "transparent",
                  }}
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="brand-logo">Logo address (https)</Label>
              <Input
                id="brand-logo"
                type="url"
                placeholder="https://example.com/logo.png"
                value={branding.logoUrl}
                onChange={setBrand("logoUrl")}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="brand-404">Message on the not-found page</Label>
              <Input
                id="brand-404"
                maxLength={200}
                value={branding.notFoundMessage}
                onChange={setBrand("notFoundMessage")}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="brand-gone">Message on the gone page</Label>
              <Input
                id="brand-gone"
                maxLength={200}
                value={branding.goneMessage}
                onChange={setBrand("goneMessage")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-home-label">Button label</Label>
              <Input
                id="brand-home-label"
                maxLength={30}
                value={branding.homeLabel}
                onChange={setBrand("homeLabel")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand-home-url">Button link</Label>
              <Input
                id="brand-home-url"
                placeholder="/ or https://example.com"
                value={branding.homeUrl}
                onChange={setBrand("homeUrl")}
              />
            </div>
          </div>
          <div
            className="mt-5 rounded-xl border bg-muted/40 p-6 text-center"
            data-testid="branding-preview"
            aria-label="Preview of the not-found page"
          >
            <p
              className="text-5xl font-bold"
              style={{
                color: /^#[0-9A-Fa-f]{6}$/.test(branding.accentColor) ? branding.accentColor : undefined,
              }}
            >
              404
            </p>
            <p className="mt-2 font-medium">{branding.brandName || "Your product"}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {branding.notFoundMessage || "No link matches /example. It may have been mistyped or deleted."}
            </p>
            <span
              className="mt-3 inline-block rounded-md px-3 py-1.5 text-sm text-white"
              style={{
                backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(branding.accentColor)
                  ? branding.accentColor
                  : "#1a1814",
              }}
            >
              {branding.homeLabel || `Go to ${branding.brandName || "your product"}`}
            </span>
          </div>
        </CardContent>
        <CardFooter className="mt-2">
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save settings
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
