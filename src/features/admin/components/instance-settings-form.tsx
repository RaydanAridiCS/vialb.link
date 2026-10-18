"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { InstanceSettings, InstanceSettingsOverride } from "@/server/domain/types";
import { updateInstanceSettingsAction } from "../actions";

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
